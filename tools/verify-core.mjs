/**
 * Prouve que le noyau extrait est équivalent, verset par verset, à
 * l'implémentation web en place. Une extraction qui change un classement
 * tajwid serait une régression invisible : on la refuse.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tajwidSegments, plainSegments } from '../core/tajwid.mjs';
import { makeCorpus } from '../core/corpus.mjs';
import { makeSearch, THEMES } from '../core/search.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const D = JSON.parse(await readFile(join(ROOT, 'data', 'quran.data.json'), 'utf8'));

const MAP = { madd: 'tj-madd', ghunna: 'tj-ghunna', qalqala: 'tj-qalqala', ikhfa: 'tj-ikhfa', iqlab: 'tj-iqlab', silent: 'tj-silent', mark: 'ayah-mark' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toHTML = (segs) => segs.map((s) => (s.c ? `<span class="${MAP[s.c]}">${esc(s.t)}</span>` : esc(s.t))).join('');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('file://' + join(ROOT, 'dist', 'talawa-studio.html'), { waitUntil: 'load' });
await page.waitForFunction(() => window.TalawaStudio, null, { timeout: 20000 });

const REQUETES = ['patience', 'lumiere des cieux', 'La prière accomplissez prosternez invoquez', 'orphelins', 'nuit du destin'];
const oldSearch = await page.evaluate((qs) => qs.map((q) => window.TalawaStudio.search(q, 30).map((r) => `${r.s}:${r.a}`)), REQUETES);

const oldAll = await page.evaluate(() => {
  const T = window.TalawaStudio, D = T.data;
  const out = [];
  for (let s = 1; s <= 114; s++) for (const a of D.ar[s - 1].split('\n')) out.push(T.tajwidHTML(a));
  return out;
});
await browser.close();

let i = 0, diffs = 0, texte = 0;
const samples = [];
for (let s = 1; s <= 114; s++) {
  const list = D.ar[s - 1].split('\n');
  for (let a = 0; a < list.length; a++, i++) {
    const neuf = toHTML(tajwidSegments(list[a]));
    if (neuf !== oldAll[i]) { diffs++; if (samples.length < 3) samples.push({ ref: `${s}:${a + 1}`, neuf: neuf.slice(0, 120), ancien: oldAll[i].slice(0, 120) }); }
    // le texte brut doit rester intact dans les deux modes
    const brut = tajwidSegments(list[a]).map((x) => x.t).join('');
    const nu = plainSegments(list[a]).map((x) => x.t).join('');
    if (brut !== list[a] || nu !== list[a]) texte++;
  }
}

// --- recherche
const corpus = makeCorpus(D);
const { search } = makeSearch(corpus);
let sDiffs = 0;
REQUETES.forEach((q, k) => {
  const neuf = search(q, 30).map((r) => `${r.s}:${r.a}`);
  if (JSON.stringify(neuf) !== JSON.stringify(oldSearch[k])) {
    sDiffs++;
    console.error(`  requête « ${q} » diverge\n   neuf   ${neuf.slice(0, 6).join(" ")}\n   ancien ${oldSearch[k].slice(0, 6).join(" ")}`);
  }
});

// Chaque thème doit ramener des versets : un thème vide serait une impasse.
let themesVides = 0;
for (const [nom, q] of THEMES) if (!search(`${nom} ${q}`, 5).length) { themesVides++; console.error(`  thème « ${nom} » ne ramène rien`); }

console.log(`versets comparés      : ${i}`);
console.log(`classements divergents: ${diffs}`);
console.log(`textes altérés        : ${texte}`);
if (samples.length) { console.log('\nexemples :'); samples.forEach((x) => console.log(`  ${x.ref}\n   neuf   ${x.neuf}\n   ancien ${x.ancien}`)); }
console.log(`requêtes comparées    : ${REQUETES.length}, divergentes : ${sDiffs}`);
console.log(`thèmes sans résultat  : ${themesVides} / ${THEMES.length}`);
if (diffs || texte || sDiffs || themesVides) { console.error('\nLe noyau extrait N EST PAS équivalent.'); process.exit(1); }
console.log('\nNoyau équivalent à l implémentation en place, sur les 6 236 versets.');
