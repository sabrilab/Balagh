/**
 * Audit des Human Interface Guidelines, mesuré dans le navigateur.
 *
 * Trois règles d'Apple se vérifient mécaniquement, et ce sont celles qui
 * décident du confort d'usage réel :
 *   - toute cible tactile fait au moins 44 x 44 pt ;
 *   - aucun texte ne descend sous 11 pt (Caption 2) ;
 *   - le contraste atteint 4,5:1, ou 3:1 pour le grand texte (WCAG AA, repris
 *     par les critères d'accessibilité d'Apple).
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL_ = process.env.TARGET_URL || 'file://' + join(ROOT, 'dist', 'talawa-studio.html');

const AUDIT = () => {
  const lum = (c) => {
    const [r, g, b] = c.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const parse = (s) => {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
  };
  const over = (fg, bg) => fg.rgb.map((v, i) => v * fg.a + bg[i] * (1 - fg.a));
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  function bgOf(el) {
    let n = el;
    while (n && n !== document.documentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.95) return c.rgb;
      n = n.parentElement;
    }
    return [255, 255, 255];
  }

  const device = document.querySelector('.device-screen') || document.body;
  const small = [];
  const tiny = [];
  const lowContrast = [];
  const seen = new Set();

  // --- cibles tactiles
  const SEL = 'button, a[href], input, select, textarea, [role="button"], [role="tab"], label[for], summary';
  for (const el of device.querySelectorAll(SEL)) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (getComputedStyle(el).display === 'none') continue;
    // La cible effective peut être étendue par un pseudo-élément absolu —
    // c est ainsi qu un contrôle segmenté de 32 pt atteint les 44 pt requis.
    let w = r.width, h = r.height;
    for (const pseudo of ["::before", "::after"]) {
      const cs = getComputedStyle(el, pseudo);
      if (cs.content === "none" || cs.position !== "absolute") continue;
      const px = (v) => (v === "auto" ? 0 : parseFloat(v) || 0);
      w = Math.max(w, r.width - px(cs.left) - px(cs.right));
      h = Math.max(h, r.height - px(cs.top) - px(cs.bottom));
    }
    if (w < 44 || h < 44) {
      const label = (el.getAttribute('aria-label') || el.textContent || el.className || el.tagName).trim().slice(0, 44);
      const key = `${el.className}|${Math.round(r.width)}x${Math.round(r.height)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      small.push({ label, w: +w.toFixed(1), h: +h.toFixed(1), cls: String(el.className).slice(0, 40) });
    }
  }

  // --- taille de texte et contraste
  const fontSeen = new Set();
  const contrastSeen = new Set();
  for (const el of device.querySelectorAll('*')) {
    const txt = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(' ');
    if (!txt) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const size = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight, 10) || 400;

    // Les libellés de barre d onglets sont à 10 pt dans iOS : c est la
    // convention de la plateforme, et la cible reste haute de 49 pt.
    const tabLabel = el.classList.contains("tab-label");
    if (size < 11 && !tabLabel) {
      const key = `${size}|${el.className}`;
      if (!fontSeen.has(key)) { fontSeen.add(key); tiny.push({ size, cls: String(el.className).slice(0, 40), txt: txt.slice(0, 34) }); }
    }

    const fg = parse(cs.color);
    if (!fg) continue;
    const bg = bgOf(el);
    const c = ratio(over(fg, bg), bg);
    // Grand texte au sens WCAG : >= 18,66 px gras, ou >= 24 px.
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    if (c < need) {
      const key = `${cs.color}|${el.className}|${Math.round(size)}`;
      if (!contrastSeen.has(key)) {
        contrastSeen.add(key);
        lowContrast.push({ ratio: +c.toFixed(2), need, size: +size.toFixed(1), cls: String(el.className).slice(0, 36), txt: txt.slice(0, 30) });
      }
    }
  }
  // Débordement horizontal DANS le cadre de l application : c est là qu un
  // contrôle trop large sort de l écran, pas au niveau de la page.
  const overflow = [];
  const box = device.getBoundingClientRect();
  // Ce qui vit dans un conteneur à défilement horizontal sort du cadre par
  // construction — un carrousel de puces, par exemple. Seul compte ce qui
  // déborde sans pouvoir être atteint.
  const inScroller = (el) => {
    for (let n = el.parentElement; n && n !== device; n = n.parentElement) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === "auto" || ox === "scroll") return true;
    }
    return false;
  };
  for (const el of device.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (!r.width || inScroller(el)) continue;
    const over = Math.round(r.right - box.right);
    if (over > 1) overflow.push({ over, cls: String(el.className).slice(0, 40), txt: (el.textContent || "").trim().slice(0, 28) });
  }
  return { small, tiny, lowContrast, overflow };
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 1180 }, deviceScaleFactor: 2 });
await page.goto(URL_, { waitUntil: 'load' });
await page.waitForFunction(() => window.TalawaStudio, null, { timeout: 20000 });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(700);

const screens = [
  ['Accueil / liste des sourates', async () => {}],
  ['Lecture d une sourate', async () => { await page.click('[data-act="open-surah"][data-s="112"]'); }],
  ['Recherche', async () => { await page.click('[data-act="tab"][data-v="chercher"]'); await page.click('.chip-row .chip >> nth=0'); }],
  ['Studio — passage', async () => { await page.click('[data-act="tab"][data-v="studio"]'); }],
  ['Compte', async () => { await page.click('[data-act="tab"][data-v="compte"]'); }],
];

const all = { small: new Map(), tiny: new Map(), lowContrast: new Map(), overflow: new Map() };
for (const [name, go] of screens) {
  await go();
  await page.waitForTimeout(500);
  const r = await page.evaluate(AUDIT);
  for (const x of r.small) all.small.set(`${x.cls}|${x.w}x${x.h}`, { ...x, screen: name });
  for (const x of r.tiny) all.tiny.set(`${x.cls}|${x.size}`, { ...x, screen: name });
  for (const x of r.lowContrast) all.lowContrast.set(`${x.cls}|${x.size}|${x.ratio}`, { ...x, screen: name });
  for (const x of r.overflow) all.overflow.set(`${x.cls}|${x.over}`, { ...x, screen: name });
}
await browser.close();

const S = [...all.small.values()], T = [...all.tiny.values()], C = [...all.lowContrast.values()], O = [...all.overflow.values()];

console.log(`\n■ Cibles tactiles sous 44 x 44 pt — ${S.length} type(s)`);
S.sort((a, b) => a.w * a.h - b.w * b.h).slice(0, 14)
  .forEach((x) => console.log(`   ${String(x.w).padStart(5)} x ${String(x.h).padEnd(5)}  ${x.cls.padEnd(30)} ${x.label.slice(0, 26)}`));

console.log(`\n■ Texte sous 11 pt (Caption 2) — ${T.length} type(s)`);
T.sort((a, b) => a.size - b.size).slice(0, 14)
  .forEach((x) => console.log(`   ${String(x.size).padStart(5)} px  ${x.cls.padEnd(30)} « ${x.txt} »`));

console.log(`\n■ Contraste insuffisant — ${C.length} type(s)`);
C.sort((a, b) => a.ratio - b.ratio).slice(0, 14)
  .forEach((x) => console.log(`   ${String(x.ratio).padStart(5)}:1 (exigé ${x.need}) ${String(x.size).padStart(5)}px  ${x.cls.padEnd(26)} « ${x.txt} »`));

console.log(`\n■ Débordement hors du cadre — ${O.length} type(s)`);
O.sort((a, b) => b.over - a.over).slice(0, 10)
  .forEach((x) => console.log(`   +${String(x.over).padStart(4)} px  ${x.cls.padEnd(28)} « ${x.txt} »`));

console.log(`\nTotal : ${S.length + T.length + C.length + O.length} écarts.`);
