/**
 * Assemble les deux cibles à partir des mêmes sources.
 *
 *   dist/talawa-studio.html  — publication en Artifact. Un FRAGMENT (ni doctype
 *     ni <html>) que la plateforme enveloppe dans sa propre coquille, avec
 *     polices et corpus intégrés : sa politique de sécurité interdit toute
 *     requête sortante.
 *
 *   public/                  — le site. Un document complet, dont les actifs
 *     lourds portent un nom empreinté sur leur contenu et se servent avec un
 *     cache immuable. Une visite de retour ne retélécharge que le HTML.
 *
 * Le corpus et les polices sont les deux seuls éléments qui changent de forme
 * entre les cibles ; la feuille de style et l'application restent intégrées,
 * elles pèsent peu et évitent deux allers-retours au premier rendu.
 */
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFile(join(ROOT, p), 'utf8');
const exists = (p) => stat(join(ROOT, p)).then(() => true, () => false);

const CORE = ['audio', 'segments', 'edit', 'divisions'];

const [html, css, js, data, fontsInline, fontsLinked, ...coreSources] = await Promise.all([
  read('src/index.html'), read('src/styles.css'), read('src/app.js'),
  read('data/quran.data.json'), read('data/fonts.css'), read('data/fonts/fonts.css'),
  ...CORE.map((n) => read(`core/${n}.mjs`)),
]);

/**
 * Le web n'embarque pas de chargeur de modules : chaque fichier de `core/`
 * devient une fonction immédiate rangée sous `Core.<nom>`, ses exports remontés
 * dans l'objet renvoyé. Le natif importe les MÊMES fichiers tels quels ; il n'y a
 * donc qu'une seule implémentation à vérifier, jamais deux à tenir en phase.
 *
 * La transformation n'est valable que pour des exports nommés en tête de
 * déclaration et sans import : toute autre forme fait échouer la compilation
 * plutôt que de produire un paquet silencieusement amputé.
 */
function inlineCore(name, source) {
  const refuse = (raison) => {
    console.error(`core/${name}.mjs : ${raison}`);
    process.exit(1);
  };
  if (/^\s*import[\s{*]/m.test(source)) refuse('les imports ne sont pas transposables — gardez les modules autonomes.');
  if (/^\s*export\s+(default|\{|\*)/m.test(source)) refuse('seuls les exports nommés en tête de déclaration sont transposables.');

  const noms = [...source.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  if (!noms.length) refuse('aucun export détecté.');

  const corps = source.replace(/^export\s+/gm, '');
  return `Core.${name} = (function () {\n'use strict';\n${corps}\nreturn { ${noms.join(', ')} };\n})();`;
}

const coreBundle = [
  '/* Noyau partagé avec l’application native — voir core/*.mjs */',
  'var Core = {};',
  ...CORE.map((n, i) => inlineCore(n, coreSources[i])),
].join('\n');

const MARKERS = ['<!--%%HEAD%%-->', '<!--%%FONTS%%-->', '/*%%CSS%%*/', '<!--%%BODY%%-->', '<!--%%DATA%%-->', '/*%%JS%%*/'];
for (const m of MARKERS) {
  if (!html.includes(m)) { console.error(`Marqueur absent de src/index.html : ${m}`); process.exit(1); }
}

// `<` n'apparaît dans du JSON qu'à l'intérieur d'une chaîne : l'échapper est sûr
// et empêche un `</script>` du contenu de fermer la balise prématurément.
const safeData = data.replace(/</g, '\\u003c');
const safeJs = `${coreBundle}\n${js}`.replace(/<\/script/gi, '<\\/script');
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 10);
const size = (s) => `${(Buffer.byteLength(s, 'utf8') / 1024 / 1024).toFixed(2)} Mo`;

/** L'encodage doit être déclaré dans la fenêtre de détection du navigateur
 *  (1 024 premiers octets) : sinon Chromium retombe sur du latin-1 dès que le
 *  bloc de polices en base64 la remplit, et tous les littéraux arabes cassent. */
function assertCharset(out, target) {
  if (!out.slice(0, 1024).toLowerCase().includes('<meta charset="utf-8">')) {
    console.error(`${target} : <meta charset="utf-8"> doit figurer dans les 1 024 premiers octets.`);
    process.exit(1);
  }
}

const fill = (source, values) => {
  let out = source;
  for (const [marker, value] of values) out = out.replace(marker, () => value);
  return out;
};

/* ---------------------------------------------------------------- Artifact */

const artifact = fill(html, [
  ['<!--%%HEAD%%-->', ''],
  ['<!--%%FONTS%%-->', `<style>${fontsInline}</style>`],
  ['/*%%CSS%%*/', css],
  ['<!--%%BODY%%-->', ''],
  ['<!--%%DATA%%-->', `<script>window.__QURAN__=${safeData};</script>`],
  ['/*%%JS%%*/', safeJs],
]);
assertCharset(artifact, 'dist/talawa-studio.html');

const artifactBytes = Buffer.byteLength(artifact, 'utf8');
if (artifactBytes > 16 * 1024 * 1024) {
  console.error('Dépassement de la limite Artifact de 16 Mo.');
  process.exit(1);
}
await mkdir(join(ROOT, 'dist'), { recursive: true });
await writeFile(join(ROOT, 'dist', 'talawa-studio.html'), artifact);
console.log(`dist/talawa-studio.html — ${size(artifact)} (fragment, tout intégré)`);

/* -------------------------------------------------------------------- Site */

const dataName = `quran-${hash(data)}.json`;
const fontsCss = fontsLinked.replace(/url\(\.\//g, 'url(/assets/fonts/');
const fontsName = `fonts-${hash(fontsCss)}.css`;

const headExtra = [
  '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
  '<link rel="manifest" href="/manifest.webmanifest">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="Talawa">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
  // La feuille de polices est prioritaire : le texte coranique attend son dessin.
  `<link rel="preload" as="style" href="/assets/${fontsName}">`,
  `<link rel="preload" as="fetch" type="application/json" crossorigin href="/assets/${dataName}">`,
].join('\n');

const web = fill(html, [
  ['<!--%%HEAD%%-->', headExtra],
  ['<!--%%FONTS%%-->', `<link rel="stylesheet" href="/assets/${fontsName}">`],
  ['/*%%CSS%%*/', css],
  ['<!--%%DATA%%-->', `<script>window.__QURAN_URL__=${JSON.stringify('/assets/' + dataName)};</script>`],
  ['/*%%JS%%*/', safeJs],
]);

const [headPart, bodyPart] = web.split('<!--%%BODY%%-->');
const doc = `<!doctype html>\n<html lang="fr">\n<head>\n${headPart.trim()}\n</head>\n<body>\n${bodyPart.trim()}\n</body>\n</html>\n`;
assertCharset(doc.slice(doc.indexOf('<head>')), 'public/index.html');

const PUB = join(ROOT, 'public');
await rm(PUB, { recursive: true, force: true });
await mkdir(join(PUB, 'assets', 'fonts'), { recursive: true });

await writeFile(join(PUB, 'index.html'), doc);
await writeFile(join(PUB, 'assets', dataName), data);
await writeFile(join(PUB, 'assets', fontsName), fontsCss);
await cp(join(ROOT, 'data', 'fonts'), join(PUB, 'assets', 'fonts'), {
  recursive: true,
  filter: (src) => !src.endsWith('fonts.css'),
});

await writeFile(join(PUB, 'manifest.webmanifest'), JSON.stringify({
  name: 'Talawa Studio',
  short_name: 'Talawa',
  description: 'Studio de récitation coranique personnelle.',
  lang: 'fr',
  dir: 'ltr',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#0E1414',
  theme_color: '#0E1414',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2));

if (await exists('data/icons')) {
  await cp(join(ROOT, 'data', 'icons'), PUB, { recursive: true });
} else {
  console.warn('  ! data/icons absent — lancez `npm run icons` pour les générer.');
}

console.log(`public/index.html — ${size(doc)} (document complet)`);
console.log(`public/assets/${dataName} — ${size(data)}`);
console.log(`public/assets/${fontsName} + 23 woff2 servis par sous-ensemble`);
