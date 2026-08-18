/**
 * Télécharge les éditions de référence dans data/raw/ (non versionné).
 *
 * Sources retenues (cf. docs/architecture.md, section "Donnees"):
 *  - Texte arabe : edition `quran-uthmani` d'AlQuran.cloud, qui redistribue le
 *    texte Uthmani de Tanzil.net (Hafs 'an 'Asim, riwaya de Madinah).
 *  - Traduction française : Muhammad Hamidullah (exigée par le cahier des charges).
 *  - Traduction anglaise : Saheeh International.
 *  - Métadonnées des sourates : Quran.com API v4 (noms traduits, lieu de
 *    révélation, ordre de révélation, drapeau bismillah_pre).
 *
 * Aucune de ces données n'est produite par un modèle : elles sont téléchargées
 * telles quelles, puis vérifiées par tools/build-data.mjs.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data', 'raw');

const SOURCES = [
  ['quran-uthmani.json', 'https://api.alquran.cloud/v1/quran/quran-uthmani'],
  ['fr.hamidullah.json', 'https://api.alquran.cloud/v1/quran/fr.hamidullah'],
  ['en.sahih.json', 'https://api.alquran.cloud/v1/quran/en.sahih'],
  ['chapters_fr.json', 'https://api.quran.com/api/v4/chapters?language=fr'],
  ['chapters_en.json', 'https://api.quran.com/api/v4/chapters?language=en'],
];

async function get(url, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(300_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (i === tries) throw err;
      const wait = 2 ** i * 1000;
      console.warn(`  ! ${url} -> ${err.message}, nouvel essai dans ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

await mkdir(RAW, { recursive: true });
for (const [name, url] of SOURCES) {
  process.stdout.write(`- ${name} ... `);
  const body = await get(url);
  await writeFile(join(RAW, name), body);
  console.log(`${(body.length / 1024).toFixed(0)} Ko`);
}
console.log('\nTelechargement termine dans data/raw/.');
