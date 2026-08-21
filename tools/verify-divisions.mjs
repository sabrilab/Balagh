/**
 * Prouve les découpes du mushaf et le tirage au sort.
 *
 * Les divisions ne sont pas calculées par l'application : elles viennent des
 * métadonnées de l'édition, elles-mêmes confrontées au texte à la compilation.
 * Ce banc vérifie qu'elles pavent le Coran sans trou ni recouvrement, qu'elles
 * retombent sur des repères connus, et que le tirage au sort ne sort jamais
 * d'une sourate.
 */
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeCorpus } from '../core/corpus.mjs';
import { makeDivisions, KINDS, SIZES } from '../core/divisions.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const D = JSON.parse(await readFile(join(ROOT, 'data', 'quran.data.json'), 'utf8'));
const corpus = makeCorpus(D);
const DIV = makeDivisions(corpus);

const ok = [], bad = [];
const t = (nom, cond, detail) => (cond ? ok : bad).push(nom + (detail ? ` — ${detail}` : ''));

/* --- comptes ------------------------------------------------------------- */
const ATTENDU = { sourate: 114, juz: 30, hizb: 60, rub: 240, page: 604 };
for (const [kind, n] of Object.entries(ATTENDU)) t(`${kind} : ${n} divisions`, DIV.count(kind) === n, String(DIV.count(kind)));

/* --- pavage : chaque famille couvre les 6 236 versets, sans trou ---------- */
for (const kind of KINDS) {
  let couvert = 0, trous = 0, fin = 0;
  for (let i = 1; i <= DIV.count(kind); i++) {
    const b = DIV.bounds(kind, i);
    if (b.from !== fin) trous++;
    couvert += b.to - b.from;
    fin = b.to;
  }
  t(`${kind} : pavage complet`, couvert === 6236 && trous === 0 && fin === 6236,
    `${couvert} versets, ${trous} trou(s), fin ${fin}`);
}

/* --- repères connus du mushaf de Madinah ---------------------------------- */
const juz1 = DIV.describe('juz', 1);
t('juz 1 va de 1:1 a 2:141', juz1.from.s === 1 && juz1.from.a === 1 && juz1.to.s === 2 && juz1.to.a === 141,
  `${juz1.from.s}:${juz1.from.a} → ${juz1.to.s}:${juz1.to.a}`);
const juz30 = DIV.describe('juz', 30);
t('juz 30 commence a 78:1 et finit le Coran', juz30.from.s === 78 && juz30.from.a === 1 && juz30.to.s === 114 && juz30.to.a === 6);

const kursi = DIV.locate(2, 255);
t('2:255 est au juz 3, page 42', kursi.juz === 3 && kursi.page === 42, `juz ${kursi.juz}, page ${kursi.page}`);
const yasin = DIV.locate(36, 1);
t('36:1 ouvre la page 440', yasin.page === 440, `page ${yasin.page}`);
const fin = DIV.locate(114, 6);
t('114:6 ferme le juz 30, le hizb 60, le rub 240 et la page 604',
  fin.juz === 30 && fin.hizb === 60 && fin.rub === 240 && fin.page === 604);

/* --- un hizb fait exactement quatre rub' ---------------------------------- */
let hizbOk = true;
for (let h = 1; h <= 60; h++) {
  const b = DIV.bounds('hizb', h);
  const q1 = DIV.bounds('rub', (h - 1) * 4 + 1);
  const q4 = DIV.bounds('rub', h * 4);
  if (b.from !== q1.from || b.to !== q4.to) hizbOk = false;
}
t('chaque hizb couvre exactement ses quatre rub’', hizbOk);

/* --- locate retrouve la division qui contient le verset -------------------- */
let localiseOk = 0, localiseKo = 0;
for (let s = 1; s <= 114; s++) {
  for (const a of [1, Math.ceil(corpus.surahMeta(s).n / 2), corpus.surahMeta(s).n]) {
    const idx = corpus.toIndex(s, a);
    const l = DIV.locate(s, a);
    let bon = true;
    for (const kind of KINDS) {
      const b = DIV.bounds(kind, l[kind]);
      if (!(idx >= b.from && idx < b.to)) bon = false;
    }
    bon ? localiseOk++ : localiseKo++;
  }
}
t('localisation exacte sur 342 temoins', localiseKo === 0, `${localiseOk} bons, ${localiseKo} faux`);

/* --- tirage au sort -------------------------------------------------------- */
// Générateur reproductible : un banc ne doit pas dependre de la chance.
let graine = 0x2F6E2B1;
const rnd = () => {
  graine ^= graine << 13; graine |= 0;
  graine ^= graine >>> 17;
  graine ^= graine << 5; graine |= 0;
  return (graine >>> 0) / 4294967296;
};

for (const taille of SIZES) {
  let horsSourate = 0, malDimensionne = 0, horsBornes = 0, contigu = 0;
  const sourates = new Set();
  for (let i = 0; i < 4000; i++) {
    const p = DIV.randomPassage(rnd, taille.versets);
    const s = p[0].s;
    const n = corpus.surahMeta(s).n;
    sourates.add(s);
    if (!p.every((v) => v.s === s)) horsSourate++;
    if (p.length !== Math.min(taille.versets, n)) malDimensionne++;
    if (p[0].a < 1 || p[p.length - 1].a > n) horsBornes++;
    if (p.every((v, k) => v.a === p[0].a + k)) contigu++;
  }
  t(`tirage « ${taille.nom} » reste dans une sourate`, horsSourate === 0, `${horsSourate} debordements`);
  t(`tirage « ${taille.nom} » donne la longueur voulue`, malDimensionne === 0, `${malDimensionne} ecarts`);
  t(`tirage « ${taille.nom} » reste dans les bornes`, horsBornes === 0, `${horsBornes} hors bornes`);
  t(`tirage « ${taille.nom} » donne une suite continue`, contigu === 4000);
  t(`tirage « ${taille.nom} » atteint tout le Coran`, sourates.size > 100, `${sourates.size} sourates sur 114`);
}

// Uniformite : aucune sourate ne doit capter une part sans rapport avec sa
// taille. On compare la part tiree a la part attendue (versets / 6236).
const tirages = new Map();
for (let i = 0; i < 60000; i++) {
  const s = DIV.randomPassage(rnd, 1)[0].s;
  tirages.set(s, (tirages.get(s) || 0) + 1);
}
let pireEcart = 0, pireSourate = 0;
for (let s = 1; s <= 114; s++) {
  const attendu = (corpus.surahMeta(s).n / 6236) * 60000;
  const obtenu = tirages.get(s) || 0;
  const ecart = Math.abs(obtenu - attendu) / Math.max(30, attendu);
  if (ecart > pireEcart) { pireEcart = ecart; pireSourate = s; }
}
t('tirage uniforme sur les versets', pireEcart < 0.35,
  `pire ecart ${(pireEcart * 100).toFixed(0)} % (sourate ${pireSourate})`);

/* --- les portions donnent des selections utilisables ---------------------- */
const juz30v = DIV.verses('juz', 30);
t('juz 30 rend 564 versets contigus', juz30v.length === 564 && juz30v[0].s === 78 && juz30v[563].s === 114,
  `${juz30v.length} versets`);
t('une portion hors bornes ne rend rien', DIV.verses('juz', 31).length === 0 && DIV.verses('page', 0).length === 0);

console.log('\nRéussis :');
for (const x of ok) console.log('  ok   ' + x);
if (bad.length) { console.log('\nÉchecs :'); for (const x of bad) console.log('  KO   ' + x); }
console.log(`\n${ok.length} ok, ${bad.length} échec(s)`);
process.exit(bad.length ? 1 : 0);
