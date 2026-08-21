/**
 * Normalise et VERIFIE le corpus telecharge, puis émet data/quran.data.json.
 *
 * Contrainte n.1 du cahier des charges : "Exactitude du texte coranique.
 * Aucune tolérance sur le texte, la vocalisation (tashkeel) ou la numérotation."
 * Ce script ne réécrit jamais le texte : il retire uniquement des artefacts de
 * transport (BOM) et corrige un defaut connu de la source (voir plus bas).
 * Toute anomalie fait echouer le build plutôt que de produire un corpus douteux.
 *
 * Defaut de source corrige
 * ------------------------
 * L'edition `quran-uthmani` d'AlQuran.cloud concatène la basmala au VERSET 1 de
 * chaque sourate qui en porte une (ex. 2:1 est servi comme
 * "<basmala> alif-lam-mim" alors que le verset 2:1 est "alif-lam-mim" seul).
 * La basmala d'ouverture n'est un verset numéroté que dans Al-Fatiha (1:1).
 * On la détaché donc pour toutes les sourates sauf 1 (ou elle EST le verset 1)
 * et 9 (qui n'en a pas), en s'appuyant sur le drapeau `bismillah_pre` de
 * Quran.com, et on la stocke séparément comme ligne d'ouverture.
 *
 * La chaîne de la basmala n'est jamais écrite en dur ici : elle est dérivée de
 * 1:1, ce qui garantit une correspondance exacte octet pour octet avec la source.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data', 'raw');

let failures = 0;
function check(condition, message) {
  if (!condition) {
    console.error(`  ECHEC  ${message}`);
    failures++;
  }
  return condition;
}

async function load(name) {
  const buf = await readFile(join(RAW, name));
  return {
    json: JSON.parse(buf.toString('utf8')),
    sha256: createHash('sha256').update(buf).digest('hex'),
    bytes: buf.length,
  };
}

/** Retire le BOM (artefact de transport) et les espaces de bord. Rien d'autre. */
const clean = (s) => s.replace(/﻿/g, '').trim();

/**
 * Longueur du préfixe basmala en tete de `text`, ou -1 s'il est absent.
 *
 * L'édition amont sert la basmala de 95:1 et 97:1 avec une SHADDA parasite sur
 * le ba initial (U+0628 U+0651 U+0650 au lieu de U+0628 U+0650), soit "bbismi"
 * au lieu de "bismi". C'est un defaut de la source, circonscrit au préfixe que
 * l'on retire ; le verset lui-même n'est pas touché. On tolère donc un écart
 * portant UNIQUEMENT sur des shadda surnuméraires, et on journalise le cas.
 */
function basmalaPrefixLength(text, basmala) {
  if (text.startsWith(basmala)) return basmala.length;
  const withoutShadda = (x) => x.replace(/\u0651/g, '');
  const target = withoutShadda(basmala);
  for (let extra = 1; extra <= 3; extra++) {
    const len = basmala.length + extra;
    if (len > text.length) break;
    if (withoutShadda(text.slice(0, len)) === target) return len;
  }
  return -1;
}

const anomalies = [];

const uthmani = await load('quran-uthmani.json');
const french = await load('fr.hamidullah.json');
const english = await load('en.sahih.json');
const chaptersFr = await load('chapters_fr.json');
const chaptersEn = await load('chapters_en.json');

const AR = uthmani.json.data.surahs;
const FR = french.json.data.surahs;
const EN = english.json.data.surahs;
const CFR = chaptersFr.json.chapters;
const CEN = chaptersEn.json.chapters;

console.log('Verification structurelle');
check(AR.length === 114, `arabe : ${AR.length} sourates au lieu de 114`);
check(FR.length === 114, `francais : ${FR.length} sourates au lieu de 114`);
check(EN.length === 114, `anglais : ${EN.length} sourates au lieu de 114`);
check(CFR.length === 114 && CEN.length === 114, 'metadonnees : 114 sourates attendues');

// --- basmala dérivée de 1:1, jamais écrite en dur -------------------------
const BASMALA_AR = clean(AR[0].ayahs[0].text);
const BASMALA_FR = clean(FR[0].ayahs[0].text);
const BASMALA_EN = clean(EN[0].ayahs[0].text);
check(BASMALA_AR.length > 20, 'basmala arabe derivee de 1:1 : longueur inattendue');

console.log('Normalisation et detachement de la basmala');
const surahs = [];
const arTexts = [];
const frTexts = [];
const enTexts = [];
const sajdas = [];
const juzStarts = new Map();
const hizbStarts = new Map();     // rub' al-hizb : 240 quarts
const pageStarts = new Map();     // pages du mushaf de Madinah : 604
const rubMarks = [];              // versets portant le signe ۞ dans le texte
let total = 0;
let detached = 0;

for (let i = 0; i < 114; i++) {
  const num = i + 1;
  const sa = AR[i];
  const sf = FR[i];
  const se = EN[i];
  const cf = CFR[i];
  const ce = CEN[i];

  check(sa.number === num && cf.id === num && ce.id === num, `sourate ${num} : numerotation desalignee`);

  const n = sa.ayahs.length;
  check(sf.ayahs.length === n, `sourate ${num} : ${sf.ayahs.length} versets en francais contre ${n} en arabe`);
  check(se.ayahs.length === n, `sourate ${num} : ${se.ayahs.length} versets en anglais contre ${n} en arabe`);
  check(cf.verses_count === n, `sourate ${num} : Quran.com annonce ${cf.verses_count} versets, la source arabe en donne ${n}`);

  const ar = sa.ayahs.map((a) => clean(a.text));
  const fr = sf.ayahs.map((a) => clean(a.text));
  const en = se.ayahs.map((a) => clean(a.text));

  // Détachement de la basmala : jamais pour 1 (elle EST 1:1) ni pour 9 (absente).
  const hasOpening = cf.bismillah_pre === true;
  check(
    hasOpening === (num !== 1 && num !== 9),
    `sourate ${num} : drapeau bismillah_pre=${cf.bismillah_pre} inattendu`,
  );
  if (hasOpening) {
    const cut = basmalaPrefixLength(ar[0], BASMALA_AR);
    if (check(cut > 0, `sourate ${num} : le verset 1 ne commence pas par la basmala attendue`)) {
      if (cut !== BASMALA_AR.length) {
        anomalies.push(
          `sourate ${num} : basmala amont vocalisee de facon non standard ` +
            `(${cut - BASMALA_AR.length} shadda surnumeraire(s)) — prefixe retire tel quel`,
        );
      }
      const rest = ar[0].slice(cut);
      check(/^\s/.test(rest), `sourate ${num} : pas de separateur apres la basmala`);
      ar[0] = rest.trim();
      detached++;
    }
    check(ar[0].length > 0, `sourate ${num} : verset 1 vide apres detachement de la basmala`);
    // Les traductions ne portent pas la basmala : on le vérifié.
    check(!fr[0].startsWith(BASMALA_FR), `sourate ${num} : la traduction francaise du verset 1 porte la basmala`);
    check(!en[0].startsWith(BASMALA_EN), `sourate ${num} : la traduction anglaise du verset 1 porte la basmala`);
  } else if (num === 9) {
    check(!ar[0].startsWith(BASMALA_AR), 'sourate 9 : At-Tawba ne doit porter aucune basmala');
  }

  for (let k = 0; k < n; k++) {
    check(ar[k].length > 0, `${num}:${k + 1} : verset arabe vide`);
    check(fr[k].length > 0, `${num}:${k + 1} : traduction francaise vide`);
    check(en[k].length > 0, `${num}:${k + 1} : traduction anglaise vide`);
    // Le séparateur de stockage est le saut de ligne : il ne doit exister nulle part.
    check(!/[\n\r]/.test(ar[k] + fr[k] + en[k]), `${num}:${k + 1} : saut de ligne dans le texte`);
    const a = sa.ayahs[k];
    if (a.sajda) sajdas.push([num, k + 1]);
    if (!juzStarts.has(a.juz)) juzStarts.set(a.juz, [a.juz, num, k + 1]);
    if (!hizbStarts.has(a.hizbQuarter)) hizbStarts.set(a.hizbQuarter, [a.hizbQuarter, num, k + 1]);
    if (!pageStarts.has(a.page)) pageStarts.set(a.page, [a.page, num, k + 1]);
    if (ar[k].includes('\u06DE')) rubMarks.push([num, k + 1, a.hizbQuarter]);
  }
  total += n;

  arTexts.push(ar.join('\n'));
  frTexts.push(fr.join('\n'));
  enTexts.push(en.join('\n'));
  surahs.push({
    i: num,
    ar: cf.name_arabic,
    tr: cf.name_simple,
    fr: cf.translated_name.name,
    en: ce.translated_name.name,
    n,
    place: cf.revelation_place === 'makkah' ? 'M' : 'D',
    order: cf.revelation_order,
    pre: hasOpening ? 1 : 0,
    page: cf.pages[0],
  });
}

console.log('Verification globale');
check(total === 6236, `total : ${total} versets au lieu de 6236`);
check(detached === 112, `basmala detachee sur ${detached} sourates au lieu de 112`);
check(sajdas.length === 15, `${sajdas.length} versets de prosternation au lieu de 15`);
check(juzStarts.size === 30, `${juzStarts.size} juz au lieu de 30`);
check(hizbStarts.size === 240, `${hizbStarts.size} quarts de hizb au lieu de 240`);
check(pageStarts.size === 604, `${pageStarts.size} pages au lieu de 604`);

// Les divisions viennent des metadonnees ; le signe ۞ vient du TEXTE. Les
// confronter verifie l'une par l'autre : chaque signe doit tomber sur un debut
// de rub'. Les debuts sans signe sont normaux — au premier verset d'une
// sourate, le titre tient ce role.
const rubHorsDebut = rubMarks.filter(([s2, a2, q]) => {
  const start = hizbStarts.get(q);
  return !(start && start[1] === s2 && start[2] === a2);
});
if (rubHorsDebut.length) {
  for (const [s2, a2, q] of rubHorsDebut) {
    const start = hizbStarts.get(q);
    anomalies.push(
      `${s2}:${a2} porte le signe ۞ mais le rub' ${q + 1} est tabule a ` +
        `${hizbStarts.get(q + 1) ? hizbStarts.get(q + 1)[1] + ':' + hizbStarts.get(q + 1)[2] : '?'} ` +
        `(rub' ${q} commence a ${start ? start[1] + ':' + start[2] : '?'}) — division tabulee retenue`,
    );
  }
}
// Un ecart isole est connu et trace ; au-dela, c'est la source qui a change.
check(rubHorsDebut.length <= 1, `${rubHorsDebut.length} signes ۞ hors d'un debut de rub'`);
check(rubMarks.length === 199, `${rubMarks.length} signes ۞ dans le texte au lieu de 199`);
check(surahs[0].n === 7 && surahs[1].n === 286 && surahs[113].n === 6, 'temoins 1/2/114 : nombre de versets inattendu');

// Inventaire des points de code arabes : détecte toute contamination latine.
const inventory = new Set();
for (const s of arTexts) {
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c !== 10) inventory.add(c); // 10 = separateur de versets ajoute par ce script
  }
}
const foreign = [...inventory].filter((c) => !(c === 32 || (c >= 0x0600 && c <= 0x06ff) || (c >= 0xfd50 && c <= 0xfdff)));
check(foreign.length === 0, `caracteres non arabes dans le texte : ${foreign.map((c) => 'U+' + c.toString(16)).join(', ')}`);

if (anomalies.length) {
  console.log(`\n${anomalies.length} anomalie(s) amont toleree(s) et tracee(s) :`);
  for (const a of anomalies) console.log(`  - ${a}`);
}

if (failures > 0) {
  console.error(`\n${failures} verification(s) en echec — aucun fichier ecrit.`);
  process.exit(1);
}

const out = {
  meta: {
    generated: 'tools/build-data.mjs',
    verses: total,
    surahs: 114,
    script: 'Uthmani (Hafs an Asim)',
    sources: {
      arabic: { edition: 'quran-uthmani', provider: 'api.alquran.cloud', upstream: 'Tanzil.net', sha256: uthmani.sha256 },
      fr: { edition: 'fr.hamidullah', translator: 'Muhammad Hamidullah', provider: 'api.alquran.cloud', sha256: french.sha256 },
      en: { edition: 'en.sahih', translator: 'Saheeh International', provider: 'api.alquran.cloud', sha256: english.sha256 },
      chapters: { provider: 'api.quran.com v4', sha256: chaptersFr.sha256 },
    },
    corrections: ['basmala d ouverture detachee du verset 1 sur 112 sourates (1 et 9 exclues)'],
    upstreamAnomalies: anomalies,
  },
  basmala: { ar: BASMALA_AR, fr: BASMALA_FR, en: BASMALA_EN },
  surahs,
  ar: arTexts,
  fr: frTexts,
  en: enTexts,
  sajda: sajdas,
  juz: [...juzStarts.values()].sort((a, b) => a[0] - b[0]),
  hizb: [...hizbStarts.values()].sort((a, b) => a[0] - b[0]),
  page: [...pageStarts.values()].sort((a, b) => a[0] - b[0]),
};

const target = join(ROOT, 'data', 'quran.data.json');
const payload = JSON.stringify(out);
await writeFile(target, payload);
console.log(`\nToutes les verifications passent.`);
console.log(`data/quran.data.json ecrit — ${(payload.length / 1024 / 1024).toFixed(2)} Mo, ${total} versets.`);
