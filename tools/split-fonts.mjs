/**
 * Éclate data/fonts.css (data: URI) en fichiers woff2 séparés dans data/fonts/.
 *
 * Pourquoi les deux formes coexistent : la publication en Artifact interdit
 * toute requête sortante, donc les polices doivent y être intégrées. Le site,
 * lui, a tout intérêt à les servir séparément — les règles @font-face portent
 * un `unicode-range`, et le navigateur ne télécharge alors que les
 * sous-ensembles qu'il doit réellement dessiner. Sur cette page, l'arabe et le
 * latin suffisent : le cyrillique, le grec et le vietnamien ne partent jamais.
 *
 * Les noms sont empreintés sur le contenu, ce qui autorise un cache immuable.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'fonts');

const css = await readFile(join(ROOT, 'data', 'fonts.css'), 'utf8');
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

/** Nom lisible tiré du bloc @font-face qui précède, pour un répertoire clair. */
function familyAt(source, index) {
  const before = source.slice(0, index);
  const start = before.lastIndexOf('@font-face');
  const block = source.slice(start, index);
  const family = /font-family:\s*'([^']+)'/.exec(block);
  const style = /font-style:\s*(\w+)/.exec(block);
  const weight = /font-weight:\s*(\d+)/.exec(block);
  return [
    (family ? family[1] : 'font').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    weight ? weight[1] : '400',
    style && style[1] === 'italic' ? 'italic' : 'normal',
  ].join('-');
}

const RE = /url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\)/g;
let out = '';
let last = 0;
let n = 0;
let bytes = 0;
const seen = new Map();

for (const m of css.matchAll(RE)) {
  const buf = Buffer.from(m[1], 'base64');
  const hash = createHash('sha256').update(buf).digest('hex').slice(0, 10);
  let name = seen.get(hash);
  if (!name) {
    name = `${familyAt(css, m.index)}-${hash}.woff2`;
    seen.set(hash, name);
    await writeFile(join(OUT, name), buf);
    n++;
    bytes += buf.length;
  }
  out += css.slice(last, m.index) + `url(./${name})`;
  last = m.index + m[0].length;
}
out += css.slice(last);

if (/data:font/.test(out)) { console.error('Une data: URI subsiste dans la feuille éclatée.'); process.exit(1); }

await writeFile(join(OUT, 'fonts.css'), out);
console.log(`${n} fichiers woff2 écrits — ${(bytes / 1024).toFixed(0)} Ko`);
console.log(`data/fonts/fonts.css — ${(out.length / 1024).toFixed(1)} Ko`);
