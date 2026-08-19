/**
 * Assemble l'outil en un fichier unique : `dist/five-league.html`.
 *
 * Les sources sont des modules ES ordinaires — un éditeur les comprend, les
 * imports documentent les dépendances. Le montage les concatène dans l'ordre
 * ci-dessous en retirant `import` et `export` : le résultat est un script
 * classique, qui s'ouvre depuis un double-clic sur le fichier, sans serveur
 * et sans que `file://` bloque le chargement des modules.
 *
 * Conséquence à connaître avant d'ajouter un fichier : tout partage une même
 * portée. Deux constantes de même nom dans deux modules se marcheraient
 * dessus — le montage refuse de produire un fichier si le cas se présente.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Ordre de montage : un module ne peut dépendre que de ceux qui le précèdent. */
const MODULES = [
  'format.js', 'dom.js', 'schema.js', 'demo.js', 'store.js', 'stats.js',
  'graphes.js', 'echange.js', 'composants.js',
  'vue-module.js', 'vue-hub.js', 'vue-rapport.js', 'vue-reglages.js', 'app.js',
];

const lire = (chemin) => readFile(join(RACINE, chemin), 'utf8');

const [html, css] = await Promise.all([lire('src/index.html'), lire('src/styles.css')]);
const sources = await Promise.all(MODULES.map((f) => lire(join('src/app', f))));

const echecs = [];

/** Déclarations de premier niveau, pour détecter les collisions de noms. */
function declarations(source) {
  const noms = new Set();
  const motif = /^(?:export\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm;
  for (const trouve of source.matchAll(motif)) noms.add(trouve[1]);
  return noms;
}

const vues = new Map();
const morceaux = sources.map((source, i) => {
  const fichier = MODULES[i];
  for (const nom of declarations(source)) {
    if (vues.has(nom)) echecs.push(`Nom déclaré deux fois : « ${nom} » dans ${vues.get(nom)} puis ${fichier}.`);
    else vues.set(nom, fichier);
  }
  const sansImports = source.replace(/^import[\s\S]*?from\s+'[^']+';\s*$/gm, '');
  const sansExports = sansImports.replace(/^export\s+(?=(?:const|let|var|function|async|class)\b)/gm, '');
  const restant = sansExports.match(/^(?:import|export)\b.*$/m);
  if (restant) echecs.push(`${fichier} : forme d'import ou d'export non gérée par le montage — ${restant[0].trim()}`);
  return `\n/* ================================================== ${fichier} */\n${sansExports.trim()}\n`;
});

if (echecs.length) {
  for (const e of echecs) console.error(`  ✗ ${e}`);
  process.exit(1);
}

const application = `(() => {\n'use strict';\n${morceaux.join('')}\n
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrerApplication);
else demarrerApplication();
})();`;

const MARQUEURS = ['/*%%CSS%%*/', '/*%%JS%%*/'];
for (const m of MARQUEURS) {
  if (!html.includes(m)) { console.error(`Marqueur absent de src/index.html : ${m}`); process.exit(1); }
}

// `</script>` ne peut apparaître qu'à l'intérieur d'une chaîne du code ;
// l'échapper empêche la balise de se fermer trop tôt.
const jsSur = application.replace(/<\/script/gi, '<\\/script');

const sortie = html.replace('/*%%CSS%%*/', () => css.trim()).replace('/*%%JS%%*/', () => jsSur);

await mkdir(join(RACINE, 'dist'), { recursive: true });
await writeFile(join(RACINE, 'dist', 'five-league.html'), sortie);

const ko = (texte) => `${(Buffer.byteLength(texte, 'utf8') / 1024).toFixed(0)} Ko`;
console.log(`dist/five-league.html — ${ko(sortie)} (style ${ko(css)}, application ${ko(application)})`);
