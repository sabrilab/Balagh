/**
 * Assemble dist/talawa-studio.html : une page autonome, sans dépendance
 * externe hors Google Fonts.
 *
 * Le fichier produit est volontairement un FRAGMENT (pas de doctype, pas de
 * <html>) : les navigateurs l'ouvrent tel quel, et la plateforme Artifact
 * l'enveloppe dans sa propre coquille au moment de la publication.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFile(join(ROOT, p), 'utf8');

const [html, css, js, data, fonts] = await Promise.all([
  read('src/index.html'), read('src/styles.css'), read('src/app.js'),
  read('data/quran.data.json'), read('data/fonts.css'),
]);

for (const token of ['/*%%FONTS%%*/', '/*%%CSS%%*/', '/*%%DATA%%*/null', '/*%%JS%%*/']) {
  if (!html.includes(token)) { console.error(`Marqueur absent de src/index.html : ${token}`); process.exit(1); }
}

// `<` n'apparaît dans du JSON qu'à l'intérieur d'une chaîne : l'échapper est sûr
// et empêche un `</script>` du contenu de fermer la balise prématurément.
const safeData = data.replace(/</g, '\\u003c');
const safeJs = js.replace(/<\/script/gi, '<\\/script');

const out = html
  .replace('/*%%FONTS%%*/', () => fonts)
  .replace('/*%%CSS%%*/', () => css)
  .replace('/*%%DATA%%*/null', () => safeData)
  .replace('/*%%JS%%*/', () => safeJs);

// L encodage doit etre déclaré dans la fenêtre de détection du navigateur
// (1024 premiers octets) : sinon Chromium retombe sur du latin-1 dès que le
// bloc de polices en base64 la remplit, et tous les littéraux arabes cassent.
const head = out.slice(0, 1024).toLowerCase();
if (!head.includes('<meta charset="utf-8">')) {
  console.error('La declaration <meta charset="utf-8"> doit figurer dans les 1024 premiers octets.');
  process.exit(1);
}

await mkdir(join(ROOT, 'dist'), { recursive: true });
const target = join(ROOT, 'dist', 'talawa-studio.html');
await writeFile(target, out);

const mb = (out.length / 1024 / 1024).toFixed(2);
console.log(`dist/talawa-studio.html — ${mb} Mo`);
if (out.length > 16 * 1024 * 1024) {
  console.error('Depassement de la limite Artifact de 16 Mo.');
  process.exit(1);
}
