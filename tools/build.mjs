import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const output = path.join(root, 'dist');
const files = [
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'sw.js',
  'version.json',
  'LICENSE',
];
const directories = ['src', 'icons'];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

let copied = 0;
let bytes = 0;
for (const relative of [...files, ...directories]) {
  const source = path.join(root, relative);
  const target = path.join(output, relative);
  const info = await stat(source);
  await cp(source, target, { recursive: info.isDirectory() });
  copied++;
  if (info.isFile()) bytes += info.size;
}

console.log(`Build statique prêt : ${copied} entrées copiées dans dist (${bytes} octets de fichiers racine).`);
