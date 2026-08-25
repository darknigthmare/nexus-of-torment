import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const root = path.dirname(fileURLToPath(import.meta.url));
const requestedPort = Number(process.env.PORT || 8080);
let port = Number.isFinite(requestedPort) ? requestedPort : 8080;
const mayFallback = !process.env.PORT;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  let urlPath = '/';
  try { urlPath = decodeURIComponent((req.url || '/').split('?')[0]); }
  catch { res.writeHead(400).end('Bad request'); return; }
  const relative = urlPath === '/' ? 'index.html' : `.${urlPath}`;
  let filePath = path.resolve(root, relative);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    res.writeHead(403, { 'Content-Type':'text/plain; charset=utf-8' }).end('Forbidden');
    return;
  }
  fs.stat(filePath, (statError, stat) => {
    if (!statError && stat.isDirectory()) filePath = path.join(filePath, 'index.html');
    fs.readFile(filePath, (readError, data) => {
      if (readError) {
        res.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' }).end('Not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': types[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      res.end(data);
    });
  });
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE' && mayFallback && port < requestedPort + 20) {
    port += 1;
    console.warn(`Port occupé, nouvel essai sur ${port}…`);
    setTimeout(() => server.listen(port, '127.0.0.1'), 80);
    return;
  }
  console.error(error);
  process.exitCode = 1;
});

server.on('listening', () => {
  const url = `http://127.0.0.1:${port}`;
  console.log(`NEXUS OF TORMENT disponible sur ${url}`);
  console.log('Fermez cette fenêtre ou utilisez Ctrl+C pour arrêter le serveur.');
  if (process.env.NO_OPEN !== '1') {
    const command = process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;
    exec(command, () => {});
  }
});

server.listen(port, '127.0.0.1');
