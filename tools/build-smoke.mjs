import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build, canonicalFileBytes, readBuildFiles, shellRevision } from './build.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceBefore = await readFile(path.join(root, 'sw.js'));
let passed = 0;
function pass(label) { passed++; console.log(`OK  ${label}`); }
function revisionInputs(outputEntries) {
  return outputEntries.map(entry => entry.relative === 'sw.js' ? { ...entry, bytes:sourceBefore } : entry);
}
function changed(entries, relative, mutate) {
  assert.ok(entries.some(entry => entry.relative === relative), 'Missing mutation target: ' + relative);
  return entries.map(entry => entry.relative === relative ? { ...entry, bytes:mutate(Buffer.from(entry.bytes)) } : entry);
}

const first = await build();
const firstFiles = await readBuildFiles(first.output);
const inputs = revisionInputs(firstFiles);
assert.match(first.revision, /^[a-f0-9]{64}$/);
assert.equal(shellRevision(inputs), first.revision);
assert.equal(shellRevision([...inputs].reverse()), first.revision);
pass('SHA-256 déterministe quel que soit l’ordre d’énumération');

// Independently reconstruct the framed hash contract, including source sw.js.
const verifier = createHash('sha256');
for (const entry of [...inputs].sort((a, b) => a.relative < b.relative ? -1 : a.relative > b.relative ? 1 : 0)) {
  const text = entry.relative === 'LICENSE' || /\.(?:html|css|m?js|json|webmanifest|svg|md|txt|ya?ml|sh|bat)$/i.test(entry.relative);
  const bytes = text ? Buffer.from(entry.bytes.toString('utf8').replace(/\r\n?/g, '\n')) : entry.bytes;
  verifier.update(entry.relative + '\0' + bytes.length + '\0');
  verifier.update(bytes);
}
assert.equal(verifier.digest('hex'), first.revision);
const builtSW = await readFile(path.join(first.output, 'sw.js'), 'utf8');
assert.ok(builtSW.includes("const CACHE_VERSION = '" + first.cacheVersion + "';"));
assert.equal(first.cacheVersion, 'nexus-of-torment-build-' + first.revision);
pass('Révision recalculée indépendamment et injectée dans dist/sw.js');

const crlfInputs = inputs.map(entry => {
  const canonical = canonicalFileBytes(entry.relative, entry.bytes);
  const isText = entry.relative === 'LICENSE' || /\.(?:html|css|m?js|json|webmanifest|svg|md|txt|ya?ml|sh|bat)$/i.test(entry.relative);
  return isText ? { ...entry, bytes:Buffer.from(canonical.toString('utf8').replace(/\n/g, '\r\n')) } : entry;
});
assert.equal(shellRevision(crlfInputs), first.revision);
for (const entry of firstFiles) assert.deepEqual(canonicalFileBytes(entry.relative, entry.bytes), entry.bytes);
pass('LF et CRLF donnent la même révision ; textes publiés canoniques en LF');

const binary = Buffer.from([0, 13, 10, 255, 13, 42]);
assert.deepEqual(canonicalFileBytes('assets/probe.png', binary), binary);
assert.ok(inputs.some(entry => entry.relative === 'assets/nexus-keyart-v1.png' && entry.bytes.length > 0));
assert.notEqual(shellRevision(changed(inputs, 'assets/nexus-keyart-v1.png', bytes => { bytes[0] ^= 1; return bytes; })), first.revision);
pass('Bitmap inclus dans le digest et octets binaires jamais normalisés');

assert.notEqual(shellRevision(changed(inputs, 'src/game/game.js', bytes => Buffer.concat([bytes, Buffer.from('\n// changed game\n')]))), first.revision);
assert.notEqual(shellRevision(changed(inputs, 'sw.js', bytes => Buffer.concat([bytes, Buffer.from('\n// changed worker\n')]))), first.revision);
pass('Changement du gameplay ou du SW source renouvelle le cache');

assert.notEqual(shellRevision([...inputs, { relative:'assets/addition.bin', bytes:Buffer.from([1]) }]), first.revision);
assert.notEqual(shellRevision(inputs.map(entry => entry.relative === 'styles.css' ? { ...entry, relative:'renamed.css' } : entry)), first.revision);
pass('Ajout ou renommage d’un fichier renouvelle le cache');

const workerContext = { URL, self:{ location:{ href:'https://nexus.example/sw.js', origin:'https://nexus.example' }, addEventListener:()=>{} } };
vm.runInNewContext(builtSW + '\n;globalThis.shellForTest = APP_SHELL;', workerContext, { filename:'dist/sw.js' });
for (const relative of workerContext.shellForTest) {
  const target = relative === './' ? 'index.html' : relative.replace(/^\.\//, '');
  const resolved = path.resolve(first.output, target);
  assert.ok(!path.relative(first.output, resolved).startsWith('..'), 'Shell entry escapes dist: ' + relative);
  const bytes = await readFile(resolved);
  assert.ok(bytes.length > 0, 'Empty shell file: ' + relative);
}
pass('Toutes les ressources APP_SHELL du SW produit existent dans dist');

const second = await build();
const secondFiles = await readBuildFiles(second.output);
assert.equal(second.revision, first.revision);
assert.equal(second.cacheVersion, first.cacheVersion);
assert.deepEqual(secondFiles, firstFiles);
pass('Deux builds successifs produisent exactement les mêmes fichiers et octets');

assert.deepEqual(await readFile(path.join(root, 'sw.js')), sourceBefore);
pass('Le SW source reste strictement inchangé après les deux builds');

console.log(`\nBuild smoke : ${passed}/${passed} contrôles réussis.`);
