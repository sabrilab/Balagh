/**
 * Banc du parcours studio : captation, import, effets, rendu audio et vidéo.
 * Chromium fournit un micro et une caméra synthétiques, ce qui permet
 * d'exercer getUserMedia et MediaRecorder pour de vrai.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// TARGET_URL permet de viser la cible web servie en HTTP ; sans elle on
// teste le fragment Artifact ouvert directement.
const URL_ = process.env.TARGET_URL || 'file://' + join(ROOT, 'dist', 'talawa-studio.html');
const OUT = join(ROOT, '.shots');

/** Petit WAV de test : bruit filtré module en amplitude, pour l'import. */
function testWav(seconds = 4, sr = 44100) {
  const n = Math.floor(seconds * sr);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.abs(Math.sin(t * 2.6)) * Math.exp(-((t % 1.3) * 1.4));
    lp = (Math.random() * 2 - 1) * 0.22 + lp * 0.78;
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, lp * env * 26000)), 44 + i * 2);
  }
  return buf;
}

const ok = [], bad = [], errors = [];
const t = (name, cond, detail) => (cond ? ok : bad).push(name + (detail ? ` — ${detail}` : ''));

const browser = await chromium.launch({
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
  ],
});
const ctx = await browser.newContext({ viewport: { width: 1360, height: 1180 }, deviceScaleFactor: 2, permissions: ['microphone'] });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(URL_, { waitUntil: 'load' });
await page.waitForFunction(() => window.TalawaStudio);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);

// --- choisir un passage court (Al-Ikhlas, 4 versets)
await page.click('[data-act="open-surah"][data-s="112"]');
await page.waitForTimeout(400);
for (const i of [0, 1]) await page.click(`.verse >> nth=${i} >> [data-act="pick"]`);
await page.click('[data-act="to-prompter"]');
await page.waitForTimeout(400);
t('télépromptage prêt', (await page.locator('#tp .tp-verse').count()) === 2);
await page.screenshot({ path: join(OUT, 'studio-prompteur.png') });

// --- captation réelle via le micro synthétique
await page.click('[data-act="rec-toggle"]');
await page.waitForTimeout(2900);                      // décompte 3-2-1
const recording = await page.getAttribute('.rec-main', 'data-state');
t('enregistrement en cours après le décompte', recording === 'recording', String(recording));
await page.waitForTimeout(2500);
await page.click('[data-act="rec-toggle"]');
await page.waitForTimeout(2500);
const onReview = await page.locator('#wave').count();
t('la prise est décodée et l’écoute s’ouvre', onReview === 1);
const dur = await page.evaluate(() => window.TalawaStudio.state.take && window.TalawaStudio.state.take.duration);
t('durée de prise plausible', dur > 1 && dur < 12, dur ? dur.toFixed(2) + ' s' : 'aucune');

// --- effets
await page.click('[data-act="preset"][data-v="grande"]');
await page.waitForTimeout(300);
t('acoustique sélectionnée', (await page.getAttribute('[data-act="preset"][data-v="grande"]', 'aria-pressed')) === 'true');
const locked = await page.getAttribute('[data-act="preset"][data-v="haram"]', 'disabled');
t('acoustique premium verrouillée en gratuit', locked !== null);
await page.screenshot({ path: join(OUT, 'studio-ecoute.png') });

// --- écoute réelle à travers la chaîne
await page.click('[data-act="play-toggle"]');
await page.waitForTimeout(1200);
t('lecture en cours', await page.evaluate(() => window.TalawaStudio.state.playing === true));
await page.click('[data-act="play-toggle"]');

// --- export vidéo
await page.click('[data-act="studio"][data-v="export"]');
await page.waitForTimeout(700);
const prevPainted = await page.evaluate(() => {
  const c = document.getElementById('vprev');
  if (!c) return 'absent';
  const d = c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data;
  return `${d[0]},${d[1]},${d[2]}`;
});
t('aperçu vidéo dessiné', prevPainted !== 'absent' && prevPainted !== '0,0,0', prevPainted);
await page.screenshot({ path: join(OUT, 'studio-export.png') });

await page.click('[data-act="render"]');
await page.waitForFunction(() => window.TalawaStudio.state.busy === null && window.TalawaStudio.state.rendered,
  null, { timeout: 90000 }).catch(() => {});
const rendered = await page.evaluate(() => {
  const r = window.TalawaStudio.state.rendered;
  return r ? { size: r.blob.size, type: r.blob.type, name: r.filename, video: r.video } : null;
});
t('rendu vidéo produit un fichier', !!rendered && rendered.size > 10000, rendered ? `${(rendered.size / 1024).toFixed(0)} Ko, ${rendered.type}, ${rendered.name}` : 'aucun');
await page.waitForTimeout(500);
await page.screenshot({ path: join(OUT, 'studio-rendu.png') });

// --- export audio
await page.click('[data-act="format"][data-v="audio"]');
await page.waitForTimeout(300);
await page.click('[data-act="render"]');
await page.waitForFunction(() => window.TalawaStudio.state.busy === null && window.TalawaStudio.state.rendered,
  null, { timeout: 90000 }).catch(() => {});
const audio = await page.evaluate(() => {
  const r = window.TalawaStudio.state.rendered;
  return r ? { size: r.blob.size, type: r.blob.type, name: r.filename } : null;
});
t('rendu audio produit un fichier', !!audio && audio.size > 4000, audio ? `${(audio.size / 1024).toFixed(0)} Ko, ${audio.type}, ${audio.name}` : 'aucun');

// --- import d'un fichier existant
await page.click('[data-act="studio"][data-v="passage"]');
await page.waitForTimeout(400);
await page.setInputFiles('[data-input="import"]', { name: 'essai.wav', mimeType: 'audio/wav', buffer: testWav(4) });
await page.waitForTimeout(1800);
const imported = await page.evaluate(() => {
  const s = window.TalawaStudio.state;
  return { n: s.takes.length, d: s.take ? s.take.duration : 0 };
});
t('import audio accepté', imported.n >= 2 && Math.abs(imported.d - 4) < 0.3, `${imported.n} prises, ${imported.d.toFixed(2)} s`);

// --- premium lève les verrous
await page.click('[data-act="tab"][data-v="compte"]');
await page.click('[data-act="premium"]');
await page.click('[data-act="tab"][data-v="studio"]');
await page.waitForTimeout(400);
await page.click('[data-act="studio"][data-v="review"]');   // reprise de la derniere prise
await page.waitForTimeout(500);
t('premium déverrouille le catalogue', (await page.getAttribute('[data-act="preset"][data-v="haram"]', 'disabled')) === null);

await browser.close();
await mkdir(OUT, { recursive: true });
console.log('Réussis :'); ok.forEach((x) => console.log('  ok   ' + x));
if (bad.length) { console.log('Échecs :'); bad.forEach((x) => console.log('  ÉCHEC ' + x)); }
if (errors.length) { console.log('Erreurs navigateur :'); [...new Set(errors)].slice(0, 8).forEach((e) => console.log('  ! ' + e)); }
console.log(`\n${ok.length} ok, ${bad.length} échec(s), ${new Set(errors).size} erreur(s)`);
process.exit(bad.length ? 1 : 0);
