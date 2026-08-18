/**
 * Moteur d'effets — partagé entre le web et le natif.
 *
 * `react-native-audio-api` implémente la même interface que la Web Audio API
 * du navigateur : ce fichier tourne donc à l'identique des deux côtés, et les
 * acoustiques sonnent pareil sur le web et sur le téléphone.
 *
 * Une seule adaptation : le natif n'expose pas de DynamicsCompressorNode. On
 * utilise à sa place une courbe de saturation douce (tangente hyperbolique),
 * appliquée des deux côtés pour que le résultat reste identique.
 *
 * Contrainte n.3 du cahier des charges : les effets s'appliquent à la VOIX
 * SEULE. Aucun oscillateur, aucune nappe, aucun échantillon musical ici. Les
 * réverbérations sont du bruit filtré : elles placent la voix dans un volume,
 * elles n'ajoutent aucune note.
 */

export const PRESETS = [
  { id: 'nue', name: 'Voix nue', desc: 'Aucune réverbération, simple mise au net', rt: 0, wet: 0, pre: 0, tone: 6000 },
  { id: 'salle', name: 'Petite salle', desc: '0,9 s — pièce de travail', rt: 0.9, wet: 0.20, pre: 0.010, tone: 4200 },
  { id: 'quartier', name: 'Mosquée de quartier', desc: '1,8 s — salle carrelée', rt: 1.8, wet: 0.28, pre: 0.018, tone: 3400 },
  { id: 'grande', name: 'Grande mosquée', desc: '3,4 s — nef haute', rt: 3.4, wet: 0.34, pre: 0.030, tone: 2900 },
  { id: 'dome', name: 'Sous le dôme', desc: '5,2 s — coupole, queue longue', rt: 5.2, wet: 0.40, pre: 0.045, tone: 3200 },
  { id: 'veillee', name: 'Veillée', desc: '0,6 s et un écho lointain', rt: 0.6, wet: 0.18, pre: 0.008, tone: 3000, delay: 0.34, fb: 0.26, dw: 0.16 },
  { id: 'haram', name: 'Très grand volume', desc: '6,8 s — vaste esplanade couverte', premium: true, rt: 6.8, wet: 0.44, pre: 0.060, tone: 2600 },
  { id: 'plaine', name: 'Plaine ouverte', desc: 'Échos larges, sans queue', premium: true, rt: 1.2, wet: 0.20, pre: 0.020, tone: 2400, delay: 0.62, fb: 0.34, dw: 0.22 },
];

export const presetById = (id) => PRESETS.find((p) => p.id === id) || PRESETS[0];

/**
 * Réponse impulsionnelle synthétique : bruit blanc passé au filtre d'un pôle,
 * enveloppe exponentielle calée sur le RT60 demandé, plus quelques réflexions
 * précoces décorrélées entre canaux qui donnent sa taille au volume.
 *
 * Le générateur pseudo-aléatoire est déterministe et non Math.random : deux
 * appareils produisent alors exactement la même acoustique.
 */
export function makeIR(ctx, preset) {
  const sr = ctx.sampleRate;
  const tail = Math.max(0.05, preset.rt);
  const pre = preset.pre || 0;
  const len = Math.max(1, Math.floor(sr * (tail + pre)));
  const buf = ctx.createBuffer(2, len, sr);
  const start = Math.floor(sr * pre);
  const a = Math.exp((-2 * Math.PI * preset.tone) / sr);

  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    let seed = 0x9E3779B9 ^ (ch * 0x85EBCA6B) ^ Math.floor(preset.rt * 1000);
    const rnd = () => {
      seed ^= seed << 13; seed |= 0;
      seed ^= seed >>> 17;
      seed ^= seed << 5; seed |= 0;
      return (seed >>> 0) / 4294967296 * 2 - 1;
    };
    for (let i = start; i < len; i++) {
      const t = (i - start) / (len - start);
      const env = Math.exp(-6.908 * t) * (1 - t);       // -60 dB au bout du RT60
      lp = rnd() * (1 - a) + lp * a;
      d[i] = lp * env;
    }
    [0.011, 0.019, 0.027, 0.041, 0.058].forEach((tap, k) => {
      const pos = start + Math.floor(sr * tap * (1 + ch * 0.07));
      if (pos < len) d[pos] += (k % 2 ? -1 : 1) * 0.42 * Math.exp(-2.4 * tap * (10 / Math.max(0.5, tail)));
    });
  }
  return buf;
}

/** Courbe de saturation douce : tient les crêtes sans écraser la dynamique. */
export function softClipCurve(amount = 2.2, n = 1024) {
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  return curve;
}

const irCache = new Map();
function getIR(ctx, preset) {
  const key = `${preset.id}@${ctx.sampleRate}`;
  if (!irCache.has(key)) irCache.set(key, makeIR(ctx, preset));
  return irCache.get(key);
}

/**
 * Chaîne complète. Renvoie {input, output} à raccorder par l'appelant.
 * entrée -> coupe-bas -> chaleur -> présence -> saturation douce
 *        -> [direct | réverbération | écho] -> sortie
 */
export function buildChain(ctx, preset, opts = {}) {
  const input = ctx.createGain();

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 85; hp.Q.value = 0.7;

  const warmth = ctx.createBiquadFilter();
  warmth.type = 'lowshelf'; warmth.frequency.value = 220; warmth.gain.value = -1.5;

  const presence = ctx.createBiquadFilter();
  presence.type = 'peaking'; presence.frequency.value = 3200; presence.Q.value = 0.9;
  presence.gain.value = opts.presence != null ? opts.presence : 2.5;

  const shaper = ctx.createWaveShaper();
  shaper.curve = softClipCurve();
  if ('oversample' in shaper) shaper.oversample = '2x';

  const out = ctx.createGain();
  out.gain.value = 1;

  input.connect(hp); hp.connect(warmth); warmth.connect(presence); presence.connect(shaper);

  const wetAmount = opts.wet != null ? opts.wet : preset.wet;
  const dry = ctx.createGain();
  dry.gain.value = 1 - wetAmount * 0.45;
  shaper.connect(dry); dry.connect(out);

  if (preset.rt > 0 && wetAmount > 0) {
    const conv = ctx.createConvolver();
    conv.normalize = true;
    conv.buffer = getIR(ctx, preset);
    const wet = ctx.createGain();
    wet.gain.value = wetAmount;
    shaper.connect(conv); conv.connect(wet); wet.connect(out);
  }

  if (preset.delay) {
    const dl = ctx.createDelay(2);
    dl.delayTime.value = preset.delay;
    const fb = ctx.createGain();
    fb.gain.value = preset.fb || 0.25;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass'; damp.frequency.value = 2200;
    const dg = ctx.createGain();
    dg.gain.value = (preset.dw || 0.18) * (wetAmount > 0 ? 1 : 0.6);
    shaper.connect(dl); dl.connect(damp); damp.connect(fb); fb.connect(dl);
    dl.connect(dg); dg.connect(out);
  }

  return { input, output: out };
}

/** Enveloppe de crête, pour dessiner une forme d'onde. */
export function peaks(channelData, count) {
  const block = Math.max(1, Math.floor(channelData.length / count));
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let max = 0;
    const start = i * block;
    const end = Math.min(channelData.length, start + block);
    for (let j = start; j < end; j++) { const v = Math.abs(channelData[j]); if (v > max) max = v; }
    out[i] = max;
  }
  return out;
}
