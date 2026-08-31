import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const files = [
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'sw.js',
  'version.json',
  'LICENSE',
];
const directories = ['src', 'icons', 'assets'];
const textExtensions = new Set(['.html','.css','.js','.mjs','.json','.webmanifest','.svg','.md','.txt','.yml','.yaml','.sh','.bat']);

export function canonicalFileBytes(relative, bytes) {
  if (relative === 'LICENSE' || textExtensions.has(path.extname(relative).toLowerCase())) {
    return Buffer.from(bytes.toString('utf8').replace(/\r\n?/g, '\n'), 'utf8');
  }
  return bytes;
}

export function shellRevision(entries) {
  const hash = createHash('sha256');
  for (const entry of [...entries].sort((a, b) => a.relative < b.relative ? -1 : a.relative > b.relative ? 1 : 0)) {
    const bytes = canonicalFileBytes(entry.relative, entry.bytes);
    // File paths and lengths delimit inputs, so renames and additions also
    // produce a new revision. Source sw.js participates before token injection.
    hash.update(entry.relative).update('\0').update(String(bytes.length)).update('\0').update(bytes);
  }
  return hash.digest('hex');
}

export function shellIntegrity(entries) {
  const integrity = {};
  for (const entry of [...entries].sort((a, b) => a.relative < b.relative ? -1 : a.relative > b.relative ? 1 : 0)) {
    if (entry.relative === 'sw.js') continue; // Le worker contient ce mapping : pas d’auto-référence.
    const digest = createHash('sha256').update(canonicalFileBytes(entry.relative, entry.bytes)).digest('base64');
    integrity['./' + entry.relative] = 'sha256-' + digest;
  }
  if (!integrity['./index.html']) throw new Error('Index absent du mapping d’intégrité.');
  integrity['./'] = integrity['./index.html'];
  return integrity;
}

export function stampServiceWorker(source, cacheVersion, integrity) {
  const declaration = /^const CACHE_VERSION = ['"][^'"]+['"];[ \t]*$/m;
  const integrityDeclaration = /^const SHELL_INTEGRITY = null;[ \t]*$/m;
  if (!declaration.test(source)) throw new Error('Déclaration CACHE_VERSION absente du service worker.');
  if (!integrityDeclaration.test(source)) throw new Error('Déclaration SHELL_INTEGRITY absente du service worker.');
  return source.replace(declaration, "const CACHE_VERSION = '" + cacheVersion + "';")
    .replace(integrityDeclaration, 'const SHELL_INTEGRITY = ' + JSON.stringify(integrity) + ';');
}

export async function readBuildFiles(directory, prefix = '') {
  const entries = [];
  for (const item of await readdir(path.join(directory, prefix), { withFileTypes:true })) {
    const relative = prefix ? prefix + '/' + item.name : item.name;
    if (item.isSymbolicLink()) throw new Error('Lien symbolique interdit dans le shell : ' + relative);
    if (item.isDirectory()) entries.push(...await readBuildFiles(directory, relative));
    else if (item.isFile()) entries.push({ relative, bytes:await readFile(path.join(directory, relative)) });
  }
  return entries.sort((a, b) => a.relative < b.relative ? -1 : a.relative > b.relative ? 1 : 0);
}

export async function build() {
  const output = path.resolve(root, 'dist');
  // The only disposable tree is this repository's dist, never the caller's cwd.
  if (path.relative(root, output) !== 'dist') throw new Error('Répertoire de build non sûr.');
  await rm(output, { recursive:true, force:true });
  await mkdir(output, { recursive:true });
  for (const relative of [...files, ...directories]) {
    const source = path.join(root, relative);
    const info = await stat(source);
    await cp(source, path.join(output, relative), { recursive:info.isDirectory() });
  }

  const entries = await readBuildFiles(output);
  const revision = shellRevision(entries);
  const cacheVersion = 'nexus-of-torment-build-' + revision;
  const integrity = shellIntegrity(entries);
  let bytes = 0;
  for (const entry of entries) {
    let content = canonicalFileBytes(entry.relative, entry.bytes);
    if (entry.relative === 'sw.js') {
      content = Buffer.from(stampServiceWorker(content.toString('utf8'), cacheVersion, integrity), 'utf8');
    }
    if (!content.equals(entry.bytes)) await writeFile(path.join(output, entry.relative), content);
    bytes += content.length;
  }
  console.log(`Build statique prêt : ${entries.length} fichiers dans dist (${bytes} octets), révision ${revision}.`);
  return { output, revision, cacheVersion, files:entries.map(entry => entry.relative), bytes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await build();
