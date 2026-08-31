import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifestName = 'MANIFEST.sha256';
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd:root, encoding:'utf8' }
)
  .split('\0')
  .filter(Boolean)
  .map(relative => relative.replaceAll('\\', '/'))
  .filter(relative => relative !== manifestName)
  .sort();

// Les attributs explicites évitent de deviner si une ressource est textuelle.
// Comme le clean Git, seules les séquences CRLF des fichiers text=set deviennent LF.
// Les autres fichiers restent byte-for-byte identiques (notamment les captures PNG).
const attributeFields = execFileSync(
  'git',
  ['check-attr', '-z', '--stdin', 'text'],
  { cwd:root, encoding:'utf8', input:files.join('\0') + '\0' }
).split('\0');
const textAttributes = new Map();
for (let index = 0; index + 2 < attributeFields.length; index += 3) {
  textAttributes.set(attributeFields[index], attributeFields[index + 2]);
}

const lines = files.map(relative => {
  const textAttribute = textAttributes.get(relative);
  if (textAttribute !== 'set' && textAttribute !== 'unset') {
    throw new Error('Attribut text non explicite pour ' + relative + ' : vérifier .gitattributes.');
  }
  const content = fs.readFileSync(path.join(root, relative));
  const canonical = textAttribute === 'set'
    ? Buffer.from(content.toString('latin1').replace(/\r\n/g, '\n'), 'latin1')
    : content;
  const digest = crypto.createHash('sha256').update(canonical).digest('hex');
  return digest + '  ./' + relative;
});

const manifestPath = path.join(root, manifestName);
const output = lines.join('\n') + '\n';
if (process.argv.includes('--check')) {
  const current = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, 'utf8') : '';
  if (current !== output) {
    console.error('Manifeste SHA-256 obsolète : exécutez npm run manifest après les dernières preuves QA.');
    process.exit(1);
  }
  console.log('Manifeste SHA-256 des contenus Git canoniques vérifié : ' + lines.length + ' fichiers.');
} else {
  fs.writeFileSync(manifestPath, output);
  console.log('Manifeste SHA-256 des contenus Git canoniques régénéré : ' + lines.length + ' fichiers.');
}
