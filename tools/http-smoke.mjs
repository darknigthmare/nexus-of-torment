import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

const port = await freePort();
const child = spawn(process.execPath, ['server.mjs'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), NO_OPEN: '1' },
  stdio: ['ignore', 'pipe', 'pipe']
});
let logs = '';
child.stdout.on('data', chunk => { logs += chunk; });
child.stderr.on('data', chunk => { logs += chunk; });

async function waitForServer(timeout = 5000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 60));
  }
  throw new Error(`Serveur non disponible. Journal : ${logs}`);
}

try {
  await waitForServer();
  const home = await fetch(`http://127.0.0.1:${port}/`);
  const html = await home.text();
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-type') || '', /text\/html/);
  assert.match(html, /NEXUS OF TORMENT/);
  console.log('OK  HTTP : page principale servie');

  const script = await fetch(`http://127.0.0.1:${port}/src/game/data.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get('content-type') || '', /javascript/);
  assert.match(await script.text(), /chainlance/);
  console.log('OK  HTTP : scripts JavaScript servis avec le bon MIME');

  const style = await fetch(`http://127.0.0.1:${port}/styles.css`);
  assert.equal(style.status, 200);
  assert.match(style.headers.get('content-type') || '', /text\/css/);
  console.log('OK  HTTP : feuille de style servie');

  const missing = await fetch(`http://127.0.0.1:${port}/ce-fichier-n-existe-pas`);
  assert.equal(missing.status, 404);
  console.log('OK  HTTP : ressources absentes rejetées en 404');

  const traversal = await fetch(`http://127.0.0.1:${port}/%2e%2e%2fpackage.json`);
  assert.ok([403, 404].includes(traversal.status));
  console.log('OK  HTTP : traversée de répertoire bloquée');

  assert.match(logs, new RegExp(`127\\.0\\.0\\.1:${port}`));
  console.log('\nHTTP smoke réussi : 5 comportements validés.');
} finally {
  child.kill('SIGTERM');
  await new Promise(resolve => {
    child.once('exit', resolve);
    setTimeout(resolve, 500);
  });
}
