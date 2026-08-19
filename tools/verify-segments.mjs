/**
 * Vérifie la segmentation sur les 6 236 versets.
 *
 * Trois propriétés doivent tenir, et deux d'entre elles ont un poids qui
 * dépasse la mise en page : le texte ne doit pas être altéré, et aucune coupe
 * ne doit tomber sur une marque qui interdit l'arrêt.
 */
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { segmentVerse, waqfPoints, WAQF } from '../core/segments.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const D = JSON.parse(await readFile(join(ROOT, 'data', 'quran.data.json'), 'utf8'));

const BUDGET = 160;                    // ~4 lignes, pour l'épreuve
const fits = (t) => t.length <= BUDGET;

let total = 0, segmentes = 0, segTotal = 0;
let texteAltere = 0, coupeInterdite = 0, muanaqahDouble = 0, tropLong = 0, techniques = 0;
const exemples = [];

// Normalise pour comparer : la coupe retire la marque de pause et les espaces.
const nu = (s) => s.replace(/[ۖ-ۜ۞]/g, '').replace(/\s+/g, '');

for (let s = 1; s <= 114; s++) {
  const list = D.ar[s - 1].split('\n');
  for (let a = 0; a < list.length; a++) {
    const texte = list[a];
    total++;
    const segs = segmentVerse(texte, fits);
    segTotal += segs.length;
    if (segs.length > 1) segmentes++;

    // 1. le texte doit survivre intact
    if (nu(segs.map((x) => x.text).join('')) !== nu(texte)) {
      texteAltere++;
      if (exemples.length < 3) exemples.push(`${s}:${a + 1} texte altéré`);
    }

    // 2. aucune coupe sur une marque interdisant l'arrêt
    for (const seg of segs) {
      if (seg.mark && !Object.values(WAQF).some((w) => w.code === seg.mark && w.coupe)) {
        coupeInterdite++;
        if (exemples.length < 6) exemples.push(`${s}:${a + 1} coupe sur « ${seg.mark} »`);
      }
      if (seg.technique) techniques++;
      if (!fits(seg.text) && segs.length > 1) tropLong++;
    }

    // 3. mu'anaqah : au plus une coupe sur la paire
    const mu = waqfPoints(texte).filter((p) => p.char === 'ۛ');
    if (mu.length && mu.filter((p) => p.coupable).length > 1) muanaqahDouble++;
  }
}

console.log(`versets                : ${total}`);
console.log(`segmentés (> 1 part)   : ${segmentes} (${(segmentes / total * 100).toFixed(1)} %)`);
console.log(`segments au total      : ${segTotal} (${(segTotal / total).toFixed(2)} par verset)`);
console.log(`coupes techniques      : ${techniques}`);
console.log('');
console.log(`texte altéré           : ${texteAltere}`);
console.log(`coupes interdites (لا) : ${coupeInterdite}`);
console.log(`mu’anaqah coupée 2×    : ${muanaqahDouble}`);
console.log(`segments hors budget   : ${tropLong}`);
if (exemples.length) { console.log('\nexemples :'); exemples.forEach((e) => console.log('  ' + e)); }

if (texteAltere || coupeInterdite || muanaqahDouble) {
  console.error('\nLa segmentation viole une règle du texte.');
  process.exit(1);
}
console.log('\nSegmentation conforme : texte intact, aucune coupe interdite.');
