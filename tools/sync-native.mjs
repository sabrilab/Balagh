/**
 * Recopie le noyau partagé et le corpus dans l'application native.
 *
 * Pourquoi copier plutôt que pointer vers ../core : EAS Build n'envoie que le
 * dossier du projet. Un chemin remontant hors de ce dossier marche en local et
 * casse au moment du build — le genre de piège qu'on ne découvre qu'en CI.
 * Les copies sont versionnées, et `npm run verify:sync` refuse toute dérive.
 */
import { copyFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

const PAIRS = [];
for (const f of await readdir(join(ROOT, 'core'))) {
  if (f.endsWith('.mjs')) PAIRS.push([join('core', f), join('native', 'src', 'core', f)]);
}
PAIRS.push([join('data', 'quran.data.json'), join('native', 'assets', 'quran.data.json')]);

const sha = async (p) => createHash('sha256').update(await readFile(p)).digest('hex');

await mkdir(join(ROOT, 'native', 'src', 'core'), { recursive: true });
await mkdir(join(ROOT, 'native', 'assets'), { recursive: true });

let drift = 0;
for (const [src, dst] of PAIRS) {
  const a = join(ROOT, src), b = join(ROOT, dst);
  if (CHECK) {
    let same = false;
    try { same = (await sha(a)) === (await sha(b)); } catch { same = false; }
    if (!same) { console.error(`  dérive : ${dst} ne correspond pas à ${src}`); drift++; }
  } else {
    await copyFile(a, b);
    console.log(`  ${src} → ${dst}`);
  }
}

if (CHECK) {
  if (drift) { console.error(`\n${drift} fichier(s) désynchronisé(s). Lancez \`npm run sync\`.`); process.exit(1); }
  console.log(`Noyau et corpus synchronisés (${PAIRS.length} fichiers).`);
} else {
  console.log(`\n${PAIRS.length} fichiers copiés vers native/.`);
}
