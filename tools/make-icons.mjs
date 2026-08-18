/**
 * Génère les icônes du site dans data/icons/.
 *
 * Le motif est la rosette de fin de verset réduite à sa géométrie : deux
 * anneaux concentriques de laiton sur l'encre de nuit. Aucune figuration, rien
 * de dessiné à la main — deux cercles tracés au canvas.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'icons');
const INK = '#0E1414';
const GOLD = '#C9A25C';

const browser = await chromium.launch();
const page = await browser.newPage();

/** `inset` : part du côté laissée libre autour du motif (zone sûre maskable). */
async function icon(size, inset, radius) {
  return page.evaluate(([size, inset, radius, INK, GOLD]) => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');

    g.fillStyle = INK;
    if (radius > 0) {
      g.beginPath();
      g.roundRect(0, 0, size, size, size * radius);
      g.fill();
    } else {
      g.fillRect(0, 0, size, size);
    }

    const cx = size / 2;
    const outer = (size / 2) * (1 - inset);
    g.strokeStyle = GOLD;
    g.lineCap = 'round';

    // Arcs interrompus en haut et en bas : la voix qui se propage de part et
    // d autre, plutot que des cercles pleins qui liraient comme une cible.
    const R = Math.PI / 180;
    const pair = (radius, width, span) => {
      g.lineWidth = width;
      g.beginPath(); g.arc(cx, cx, radius, -span * R, span * R); g.stroke();
      g.beginPath(); g.arc(cx, cx, radius, (180 - span) * R, (180 + span) * R); g.stroke();
    };
    pair(outer, size * 0.05, 52);
    pair(outer * 0.62, size * 0.05, 44);

    g.fillStyle = GOLD;
    g.beginPath(); g.arc(cx, cx, outer * 0.19, 0, Math.PI * 2); g.fill();

    return c.toDataURL('image/png');
  }, [size, inset, radius, INK, GOLD]);
}

await mkdir(OUT, { recursive: true });
const files = [
  ['icon-192.png', 192, 0.24, 0.22],
  ['icon-512.png', 512, 0.24, 0.22],
  // Maskable : le système rogne jusqu'à 20 % du bord, le motif reste au centre.
  ['icon-512-maskable.png', 512, 0.36, 0],
  // iOS applique lui-même l'arrondi : on lui livre un carré plein.
  ['apple-touch-icon.png', 180, 0.24, 0],
];
for (const [name, size, inset, radius] of files) {
  const url = await icon(size, inset, radius);
  const buf = Buffer.from(url.split(',')[1], 'base64');
  await writeFile(join(OUT, name), buf);
  console.log(`  ${name} — ${(buf.length / 1024).toFixed(1)} Ko`);
}

// Le favicon reste en SVG : net à toute taille, et quelques centaines d'octets.
// Le favicon reprend le meme motif, en SVG : net a toute taille.
await writeFile(join(OUT, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="${INK}"/>
  <g fill="none" stroke="${GOLD}" stroke-width="5" stroke-linecap="round">
    <path d="M73.40 20.06A38.00 38.00 0 0 1 73.40 79.94M26.60 79.94A38.00 38.00 0 0 1 26.60 20.06"/>
    <path d="M66.95 33.63A23.56 23.56 0 0 1 66.95 66.37M33.05 66.37A23.56 23.56 0 0 1 33.05 33.63"/>
  </g>
  <circle cx="50" cy="50" r="7.22" fill="${GOLD}"/>
</svg>
`);
console.log('  favicon.svg');

await browser.close();
