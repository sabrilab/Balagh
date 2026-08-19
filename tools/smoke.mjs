/** Banc de fumée : charge la page construite dans Chromium et vérifié l essentiel. */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// TARGET_URL permet de viser la cible web servie en HTTP ; sans elle on
// teste le fragment Artifact ouvert directement.
const URL_ = process.env.TARGET_URL || 'file://' + join(ROOT, 'dist', 'talawa-studio.html');
const OUT = process.env.SHOTS || join(ROOT, '.shots');

const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 1180 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(URL_, { waitUntil: 'load' });
await page.waitForFunction(() => window.TalawaStudio && document.querySelector('#tabbar button'), null, { timeout: 20000 });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(900);

const ok = [];
const bad = [];
const t = (name, cond, detail) => (cond ? ok : bad).push(name + (detail ? ` — ${detail}` : ''));

// --- corpus
const meta = await page.evaluate(() => window.TalawaStudio.data.meta);
t('corpus 6236 versets', meta.verses === 6236, String(meta.verses));
t('corpus 114 sourates', meta.surahs === 114);

// --- tajwid : le texte brut doit etre integralement preserve
const tj = await page.evaluate(() => {
  const D = window.TalawaStudio.data;
  const strip = (h) => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent; };
  const out = [];
  let mismatches = 0, colored = 0, checked = 0;
  for (let s = 1; s <= 114; s++) {
    const list = D.ar[s - 1].split('\n');
    for (let a = 0; a < list.length; a++) {
      const html = window.TalawaStudio.tajwidHTML(list[a]);
      checked++;
      if (strip(html) !== list[a]) { mismatches++; if (out.length < 4) out.push(`${s}:${a + 1}`); }
      if (/class="tj-/.test(html)) colored++;
    }
  }
  return { mismatches, colored, checked, samples: out, demo: window.TalawaStudio.tajwidHTML(D.ar[111].split('\n')[0]) };
});
t('tajwid preserve le texte sur les 6236 versets', tj.mismatches === 0, `${tj.mismatches} ecart(s) ${tj.samples.join(', ')}`);
// Plancher de bon sens, pas une valeur figee : le taux exact depend de la
// prudence des regles. Il a baisse de 91,4 % a 89,5 % le jour ou le faux
// marqueur d iqlab a ete retire — c etait une correction, pas une regression.
t('tajwid colore une large majorite des versets', tj.colored / tj.checked > 0.85, `${((tj.colored / tj.checked) * 100).toFixed(1)}%`);
console.log('\n  112:1 rendu →', tj.demo, '\n');

// --- recherche
const search = await page.evaluate(() => {
  const r = window.TalawaStudio.search('un verset sur la patience', 5);
  const r2 = window.TalawaStudio.search('lumiere des cieux', 3);
  const r3 = window.TalawaStudio.search('zzzzqqqq', 5);
  return { r: r.map((x) => `${x.s}:${x.a}`), r2: r2.map((x) => `${x.s}:${x.a}`), empty: r3.length };
});
t('recherche "patience" renvoie des versets', search.r.length > 0, search.r.join(' '));
t('recherche "lumiere des cieux" renvoie des versets', search.r2.length > 0, search.r2.join(' '));
t('requete absurde ne renvoie rien', search.empty === 0);

// --- navigation
await page.click('[data-act="open-surah"][data-s="2"]');
await page.waitForTimeout(500);
t('ouverture de la sourate 2', (await page.textContent('.navbar-title')).includes('Al-Baqarah'));
const verseCount = await page.locator('.verse').count();
t('sourate 2 affiche 286 versets', verseCount === 286, String(verseCount));

await page.click('[data-act="tab"][data-v="chercher"]');
await page.waitForTimeout(300);
await page.click('.chip-row .chip >> nth=0');
await page.waitForTimeout(700);
const results = await page.locator('.verse').count();
t('un theme produit des resultats', results > 0, String(results));

// selection puis studio
await page.click('.verse >> nth=0 >> [data-act="pick"]');
await page.waitForTimeout(250);
await page.click('[data-act="tab"][data-v="studio"]');
await page.waitForTimeout(400);
t('le studio recoit la selection', (await page.locator('[data-act="to-prompter"]').count()) > 0);
await page.click('[data-act="to-prompter"]');
await page.waitForTimeout(500);
t('telepromptage affiche le deck', (await page.locator('.deck-card').count()) > 0);
// Le mode immersif masque les onglets : il faut sortir du deck pour naviguer.
await page.click('[data-act="studio"][data-v="passage"]');
await page.waitForTimeout(400);

await page.click('[data-act="tab"][data-v="compte"]');
await page.waitForTimeout(300);
t('ecran compte affiche la provenance', (await page.textContent('#screen')).includes('Hamidullah'));

// --- pas de debordement horizontal
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
t('aucun debordement horizontal', overflow <= 0, `${overflow}px`);

// --- captures
import { mkdir } from 'node:fs/promises';
await mkdir(OUT, { recursive: true });
await page.click('[data-act="tab"][data-v="lire"]');
await page.click('[data-act="open-surah"][data-s="36"]');
await page.waitForTimeout(600);
await page.screenshot({ path: join(OUT, 'clair-lecture.png'), fullPage: false });

await page.emulateMedia({ colorScheme: 'dark' });
await page.waitForTimeout(400);
await page.screenshot({ path: join(OUT, 'sombre-lecture.png'), fullPage: false });

await page.click('[data-act="tab"][data-v="chercher"]');
await page.click('.chip-row .chip >> nth=2');
await page.waitForTimeout(700);
await page.screenshot({ path: join(OUT, 'sombre-recherche.png'), fullPage: false });

// mobile
const m = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const mp = await m.newPage();
await mp.goto(URL_, { waitUntil: 'load' });
await mp.waitForFunction(() => window.TalawaStudio);
await mp.evaluate(() => document.fonts.ready);
await mp.waitForTimeout(700);
await mp.screenshot({ path: join(OUT, 'mobile.png') });
const mOverflow = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
t('mobile sans debordement horizontal', mOverflow <= 0, `${mOverflow}px`);

await browser.close();

console.log('Reussis :');
ok.forEach((x) => console.log('  ok   ' + x));
if (bad.length) { console.log('Echecs :'); bad.forEach((x) => console.log('  ECHEC ' + x)); }
if (errors.length) { console.log('\nErreurs navigateur :'); errors.slice(0, 12).forEach((e) => console.log('  ! ' + e)); }
console.log(`\n${ok.length} ok, ${bad.length} echec(s), ${errors.length} erreur(s) navigateur`);
process.exit(bad.length || errors.length ? 1 : 0);
