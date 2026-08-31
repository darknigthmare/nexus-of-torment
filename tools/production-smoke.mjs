import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBuildFiles } from './build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'https://nexus-of-torment.vercel.app/';
const report = { product:'NEXUS OF TORMENT', executedAt:new Date().toISOString(), origin, checks:[] };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function check(name, action) {
  try {
    const details = await action();
    report.checks.push({ name, passed:true, details });
    console.log('OK  ' + name);
  } catch (error) {
    report.checks.push({ name, passed:false, error:error.message });
    console.error('ERR ' + name + ' : ' + error.message);
  }
}
const entries = await readBuildFiles(path.join(root, 'dist'));
for (const entry of entries) {
  await check('Production identique au build : ' + entry.relative, async () => {
    const response = await fetch(new URL(entry.relative === 'index.html' ? './' : entry.relative, origin), { signal:AbortSignal.timeout(15000), cache:'no-store' });
    assert.equal(response.status, 200);
    const actual = Buffer.from(await response.arrayBuffer());
    assert.equal(digest(actual), digest(entry.bytes), 'Empreinte différente de dist');
    const expectedTypes = { '.html':/text\/html/, '.js':/javascript/, '.css':/text\/css/, '.json':/json/, '.webmanifest':/json/, '.png':/image\/png/, '.svg':/image\/svg\+xml/ };
    const type = expectedTypes[path.extname(entry.relative)];
    if (type) assert.match(response.headers.get('content-type') || '', type);
    return { status:response.status, bytes:actual.length, sha256:digest(actual), mime:response.headers.get('content-type') };
  });
}
const home = await fetch(origin, { signal:AbortSignal.timeout(15000) });
for (const [header, expected] of [
  ['x-content-type-options', 'nosniff'],
  ['x-frame-options', 'DENY'],
  ['cross-origin-opener-policy', 'same-origin'],
  ['referrer-policy', 'strict-origin-when-cross-origin']
]) await check('En-tête production : ' + header, () => { assert.equal(home.headers.get(header), expected); return expected; });
await check('CSP sans scripts ni cadres externes', () => {
  const csp = home.headers.get('content-security-policy') || '';
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.ok(!/unsafe-inline|unsafe-eval/.test(csp));
  return csp;
});
await check('Version de production attendue', async () => {
  const expected = JSON.parse(await readFile(path.join(root, 'version.json'), 'utf8'));
  const response = await fetch(new URL('version.json', origin), { signal:AbortSignal.timeout(15000) });
  const actual = await response.json();
  assert.equal(actual.version, expected.version);
  return actual.version;
});
await check('Service worker actualisable', async () => {
  const response = await fetch(new URL('sw.js', origin), { signal:AbortSignal.timeout(15000) });
  assert.match(response.headers.get('cache-control') || '', /max-age=0/);
  assert.match(await response.text(), /nexus-of-torment-build-[a-f0-9]{64}/);
  return response.headers.get('cache-control');
});
for (const name of ['qa-missing-resource.txt', 'src/not-present.js', '.env.production.local']) {
  await check('Ressource absente non exposée : ' + name, async () => {
    const response = await fetch(new URL(name, origin), { signal:AbortSignal.timeout(15000) });
    assert.equal(response.status, 404);
    return response.status;
  });
}
report.summary = { passed:report.checks.filter(x => x.passed).length, failed:report.checks.filter(x => !x.passed).length };
await mkdir(path.join(root, '.qa/production'), { recursive:true });
await writeFile(path.join(root, '.qa/production/HTTP_REPORT.json'), JSON.stringify(report, null, 2) + '\n');
console.log('HTTP production :', report.summary);
if (report.summary.failed) process.exitCode = 1;
