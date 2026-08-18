/**
 * Récupère les polices Google Fonts et les intègre en data: URI dans
 * data/fonts.css.
 *
 * Pourquoi embarquer plutôt que pointer vers fonts.googleapis.com : la valeur
 * de l'application tient au rendu exact de l'othmanien entièrement vocalisé.
 * Une police de repli qui avale les petits ronds suscrits ou déplace les
 * signes de madd dégrade précisément ce qui ne doit pas l'etre. On paie donc
 * environ 500 Ko pour que le rendu ne dépende d'aucun réseau.
 *
 * Les trois familles sont sous licence SIL Open Font, qui autorise
 * explicitement l'incorporation.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// UA d'un navigateur récent : Google Fonts sert du woff2 uniquement s'il le voit.
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const CSS_URL =
  'https://fonts.googleapis.com/css2?family=Amiri+Quran&family=IBM+Plex+Sans:wght@400;500;600&family=Spectral:ital,wght@0,400;0,500;1,400&display=swap';

async function get(url, asBuffer) {
  for (let i = 1; i <= 4; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return asBuffer ? Buffer.from(await res.arrayBuffer()) : await res.text();
    } catch (err) {
      if (i === 4) throw err;
      await new Promise((r) => setTimeout(r, 2 ** i * 1000));
    }
  }
}

let css = await get(CSS_URL, false);
const urls = [...new Set(css.match(/https:\/\/fonts\.gstatic\.com\/[^)]+/g) || [])];
console.log(`${css.match(/@font-face/g).length} faces, ${urls.length} fichiers a integrer`);

let bytes = 0;
for (const [i, url] of urls.entries()) {
  const buf = await get(url, true);
  bytes += buf.length;
  css = css.split(url).join(`data:font/woff2;base64,${buf.toString('base64')}`);
  process.stdout.write(`\r  ${i + 1}/${urls.length}`);
}
console.log(`\n${(bytes / 1024).toFixed(0)} Ko de woff2 integres`);

if (css.includes('fonts.gstatic.com')) { console.error('Une reference distante subsiste.'); process.exit(1); }

await mkdir(join(ROOT, 'data'), { recursive: true });
await writeFile(join(ROOT, 'data', 'fonts.css'), css);
console.log(`data/fonts.css — ${(css.length / 1024 / 1024).toFixed(2)} Mo`);
