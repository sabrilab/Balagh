/* ==========================================================================
   Talawa Studio — application
   Studio de récitation coranique personnelle. Prototype fonctionnel :
   lecture, recherche par thème, télépromptage, captation micro, effets de
   voix, export audio et vidéo.

   Règles structurantes tirées du cahier des charges :
   - le texte coranique provient d'un corpus vérifié embarqué, jamais généré ;
   - la recherche EXTRAIT du corpus, elle ne rédige jamais ;
   - les effets s'appliquent à la voix seule, aucun accompagnement musical.
   ========================================================================== */
(function () {
  'use strict';

  const D = window.__QURAN__;
  if (!D) throw new Error('Corpus absent : le build n a pas injecte __QURAN__.');

  /* ======================================================================
     1. Utilitaires
     ====================================================================== */

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const c = Math.floor((sec % 1) * 10);
    return `${m}:${String(s).padStart(2, '0')}.${c}`;
  }
  const fmtShort = (sec) => {
    const m = Math.floor(sec / 60);
    return `${m}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
  };

  /** Chiffres arabes-indiens, pour le rond de fin de verset. */
  const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  const arNum = (n) => String(n).split('').map((d) => AR_DIGITS[+d]).join('');

  /* ======================================================================
     2. Accès au corpus
     ====================================================================== */

  const SURAHS = D.surahs;
  const cacheAr = new Array(114);
  const cacheFr = new Array(114);
  const cacheEn = new Array(114);

  function ayat(surah, lang) {
    const i = surah - 1;
    const cache = lang === 'fr' ? cacheFr : lang === 'en' ? cacheEn : cacheAr;
    if (!cache[i]) cache[i] = (lang === 'fr' ? D.fr : lang === 'en' ? D.en : D.ar)[i].split('\n');
    return cache[i];
  }
  const verseAr = (s, a) => ayat(s, 'ar')[a - 1];
  const verseTr = (s, a, lang) => (lang === 'en' ? ayat(s, 'en') : ayat(s, 'fr'))[a - 1];
  const surahMeta = (s) => SURAHS[s - 1];
  const ref = (s, a) => `${s}:${a}`;
  const refLabel = (s, a) => `${surahMeta(s).tr} ${s}:${a}`;

  /** Index absolu 0..6235 <-> couple (sourate, verset). */
  const OFFSETS = (() => {
    const o = new Int32Array(115);
    for (let i = 0; i < 114; i++) o[i + 1] = o[i] + SURAHS[i].n;
    return o;
  })();
  const TOTAL = OFFSETS[114];
  function fromIndex(idx) {
    let lo = 0, hi = 113;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (OFFSETS[mid] <= idx) lo = mid; else hi = mid - 1;
    }
    return [lo + 1, idx - OFFSETS[lo] + 1];
  }
  const toIndex = (s, a) => OFFSETS[s - 1] + a - 1;

  /* ======================================================================
     3. Moteur tajwid
     --------------------------------------------------------------------
     Coloration d'aide à la lecture. Volontairement CONSERVATRICE : seules
     les règles déterministes à partir du texte othmanien vocalisé sont
     rendues. En cas de doute, aucune couleur. Le mushaf imprimé reste la
     référence ; le mode "Noir simple" est toujours disponible.
     ====================================================================== */

  const M = {
    SHADDA: 'ّ', SUKUN: 'ْ', MADDAH: 'ٓ',
    FATHATAN: 'ً', DAMMATAN: 'ٌ', KASRATAN: 'ٍ',
    ROUND_ZERO: '۟', RECT_ZERO: '۠',
  };
  const TANWEEN = M.FATHATAN + M.DAMMATAN + M.KASRATAN;
  const NOON = 'ن', MEEM = 'م', BA = 'ب';
  const SET_QALQALA = new Set(['ق', 'ط', 'ب', 'ج', 'د']);          // ق ط ب ج د
  const SET_THROAT = new Set(['ء', 'أ', 'إ', 'آ', 'ؤ', 'ئ',
                              'ه', 'ع', 'ح', 'غ', 'خ']);           // hamza ه ع ح غ خ
  const SET_IDGHAM_GHUNNA = new Set(['ي', 'ن', 'م', 'و']);              // ي ن م و
  const SET_IDGHAM_PLAIN = new Set(['ل', 'ر']);                                   // ل ر
  const RE_LETTER = /[ء-يٮٯٱ-ۓۮۯۺ-ۿ]/;
  const RE_MARK = /[ً-ٕٖ-ٰٟۖ-ۜ۟-۪ۨ-ۭ]/;
  const RE_PAUSE = /[ۖ-ۜ۞]/;

  /** Découpe le texte en unités {base, marks} + espaces + signes de pause. */
  function unitize(text) {
    const units = [];
    for (const ch of text) {
      if (RE_PAUSE.test(ch)) { units.push({ type: 'pause', raw: ch }); continue; }
      if (ch === ' ') { units.push({ type: 'space', raw: ch }); continue; }
      if (RE_MARK.test(ch)) {
        const last = units[units.length - 1];
        if (last && last.type === 'unit') { last.marks += ch; last.raw += ch; }
        else units.push({ type: 'other', raw: ch });
        continue;
      }
      if (RE_LETTER.test(ch)) { units.push({ type: 'unit', base: ch, marks: '', raw: ch }); continue; }
      units.push({ type: 'other', raw: ch });
    }
    return units;
  }

  const isSilent = (u) => u.marks.includes(M.ROUND_ZERO) || u.marks.includes(M.RECT_ZERO);

  /* Sieges de prolongation : alif nu, alif wasla et alif maqsura ne portent
     aucun son propre quand ils ne sont pas voyelles. Ils doivent etre traverses
     quand on cherche la lettre suivante reellement prononcee, sinon un tanwin
     suivi de "…a l-…" est classe ikhfa au lieu d'idgham. */
  const SEATS = new Set(['\u0627', '\u0671', '\u0649']);
  const HARAKAT = '\u064E\u064F\u0650\u064B\u064C\u064D\u0651\u0652';
  const isSeat = (u) => SEATS.has(u.base) && ![...u.marks].some((c) => HARAKAT.includes(c));

  /** Prochaine unité réellement prononcée (ignore espaces, pauses, lettres muettes). */
  function nextSounded(units, from) {
    for (let i = from + 1; i < units.length; i++) {
      const u = units[i];
      if (u.type !== 'unit') continue;
      if (isSilent(u) || isSeat(u)) continue;
      return u;
    }
    return null;
  }

  function classify(units) {
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.type !== 'unit') continue;

      if (isSilent(u)) { u.cls = 'tj-silent'; continue; }
      if (u.marks.includes(M.MADDAH)) { u.cls = 'tj-madd'; continue; }
      if ((u.base === NOON || u.base === MEEM) && u.marks.includes(M.SHADDA)) { u.cls = 'tj-ghunna'; continue; }
      if (SET_QALQALA.has(u.base) && u.marks.includes(M.SUKUN)) { u.cls = 'tj-qalqala'; continue; }
      const hasTanween = [...u.marks].some((c) => TANWEEN.includes(c));
      const isNoonSakin = u.base === NOON && u.marks.includes(M.SUKUN) && !u.marks.includes(M.SHADDA);
      if (hasTanween || isNoonSakin) {
        const nx = nextSounded(units, i);
        if (nx) {
          if (SET_IDGHAM_GHUNNA.has(nx.base)) u.cls = 'tj-ghunna';
          else if (SET_IDGHAM_PLAIN.has(nx.base)) u.cls = 'tj-silent';
          else if (nx.base === BA) u.cls = 'tj-iqlab';
          else if (SET_THROAT.has(nx.base)) u.cls = null;            // idhar : lecture claire
          else u.cls = 'tj-ikhfa';
        }
        continue;
      }

      if (u.base === MEEM && u.marks.includes(M.SUKUN)) {
        const nx = nextSounded(units, i);
        if (nx && nx.base === BA) u.cls = 'tj-ikhfa';
        else if (nx && nx.base === MEEM) u.cls = 'tj-ghunna';
      }
    }
    return units;
  }

  /**
   * Rend le texte en HTML coloré. Seule la couleur est appliquee aux spans :
   * ni padding ni display, afin de ne pas casser le façonnage de l'arabe.
   */
  function tajwidHTML(text) {
    const units = classify(unitize(text));
    let out = '';
    let open = null;
    const close = () => { if (open) { out += '</span>'; open = null; } };
    for (const u of units) {
      if (u.type === 'pause') { close(); out += `<span class="ayah-mark">${esc(u.raw)}</span>`; continue; }
      const cls = u.type === 'unit' ? u.cls || null : null;
      if (cls !== open) { close(); if (cls) { out += `<span class="${cls}">`; open = cls; } }
      out += esc(u.raw);
    }
    close();
    return out;
  }

  const plainHTML = (text) => {
    const units = unitize(text);
    let out = '';
    for (const u of units) {
      if (u.type === 'pause') out += `<span class="ayah-mark">${esc(u.raw)}</span>`;
      else out += esc(u.raw);
    }
    return out;
  };

  const TAJWID_LEGEND = [
    ['tj-madd', 'Madd — allongement (4 à 6 temps)'],
    ['tj-ghunna', 'Ghunna — nasalisation (2 temps)'],
    ['tj-qalqala', 'Qalqala — rebond'],
    ['tj-ikhfa', 'Ikhfa — dissimulation'],
    ['tj-iqlab', 'Iqlab — permutation en mīm'],
    ['tj-silent', 'Lettre non prononcée / assimilée'],
  ];

  /* ======================================================================
     4. Moteur de recherche
     --------------------------------------------------------------------
     Index inverse construit dans le navigateur sur les traductions vérifiées
     et sur le texte arabe normalisé. Tout résultat est un VERSET EXISTANT du
     corpus, rendu avec sa référence exacte. Aucun texte n'est produit ici.
     ====================================================================== */

  const STOP = new Set(('a ai au aux avec ce ces dans de des du elle en est et eux il ils je la le les leur lui ma mais me meme mes moi mon ne nos notre nous on ou par pas pour qu que qui sa se ses son sur ta te tes toi ton tu un une vos votre vous y d l n s c j m t qu est sont etre avoir plus tout tous toute toutes cela celui ceux dont ainsi donc alors comme quand the of and to in is are that for it with as be on at by an or from this these those what which').split(' '));

  const deAccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const AR_DIACRITICS = /[ً-ٰٟۖ-ۭ]/g;
  const normAr = (s) => s.replace(AR_DIACRITICS, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ـ/g, '');

  function tokenize(s) {
    const isArabic = /[؀-ۿ]/.test(s);
    const base = isArabic ? normAr(s) : deAccent(s.toLowerCase());
    return base.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1 && !STOP.has(t));
  }

  let INDEX = null;
  function buildIndex() {
    if (INDEX) return INDEX;
    const map = new Map();
    const push = (tok, idx) => {
      let arr = map.get(tok);
      if (!arr) map.set(tok, (arr = []));
      if (arr[arr.length - 1] !== idx) arr.push(idx);
    };
    for (let s = 1; s <= 114; s++) {
      const fr = ayat(s, 'fr'), en = ayat(s, 'en'), ar = ayat(s, 'ar');
      const off = OFFSETS[s - 1];
      for (let a = 0; a < fr.length; a++) {
        const idx = off + a;
        for (const t of tokenize(fr[a])) push(t, idx);
        for (const t of tokenize(en[a])) push(t, idx);
        for (const t of tokenize(ar[a])) push(t, idx);
      }
    }
    INDEX = map;
    return map;
  }

  /** Extension morphologique légère : "patience" trouve aussi "patient", "patiemment". */
  function expand(term, map) {
    const hits = new Set();
    if (map.has(term)) hits.add(term);
    if (term.length >= 5) {
      const stem = term.slice(0, Math.max(4, term.length - 2));
      for (const key of map.keys()) if (key.startsWith(stem)) hits.add(key);
    }
    return [...hits];
  }

  function search(query, limit) {
    const map = buildIndex();
    const terms = tokenize(query);
    if (!terms.length) return [];
    const scores = new Map();
    const matchedTerms = new Map();

    terms.forEach((term) => {
      const variants = expand(term, map);
      variants.forEach((v) => {
        const posting = map.get(v);
        if (!posting) return;
        const idf = Math.log(1 + TOTAL / posting.length);
        const exact = v === term ? 1 : 0.62;                 // les formes exactes priment
        posting.forEach((idx) => {
          scores.set(idx, (scores.get(idx) || 0) + idf * exact);
          let set = matchedTerms.get(idx);
          if (!set) matchedTerms.set(idx, (set = new Set()));
          set.add(term);
        });
      });
    });
    if (!scores.size) return [];

    const out = [];
    scores.forEach((score, idx) => {
      const covered = matchedTerms.get(idx).size;
      // Couvrir tous les mots de la requête pèse plus lourd que répéter un mot rare.
      out.push({ idx, score: score * (1 + 1.9 * ((covered - 1) / Math.max(1, terms.length - 1) || 0)), covered });
    });
    out.sort((a, b) => b.covered - a.covered || b.score - a.score || a.idx - b.idx);
    return out.slice(0, limit || 40).map((r) => {
      const [s, a] = fromIndex(r.idx);
      return { s, a, score: r.score, covered: r.covered, terms };
    });
  }

  /** Thèmes : ce sont des REQUETES pre-écrites, pas des listes de références. */
  const THEMES = [
    ['La patience', 'patience endurez endurance perseverez'],
    ['La gratitude', 'reconnaissant remerciez bienfaits grace'],
    ['Le pardon', 'pardonne pardon indulgent absoudre'],
    ['Le repentir', 'repentir repentez revient vers'],
    ['La confiance en Dieu', 'confiance remets garant suffit'],
    ['L’angoisse et la tristesse', 'tristesse affliction crainte detresse'],
    ['L’espoir', 'esperez desesperez misericorde'],
    ['Les parents', 'parents pere mere bonte envers'],
    ['La mort', 'mort mourir retour vers gout'],
    ['La prière', 'priere accomplissez prosternez invoquez'],
    ['L’aumône', 'aumone depensez biens pauvres'],
    ['Le jeûne', 'jeune prescrit ramadan'],
    ['La justice', 'justice equite balance temoignage'],
    ['Le savoir', 'science savent meditent raison'],
    ['L’unicité', 'unique associez divinite adorez'],
    ['La création', 'crea cieux terre creation'],
    ['La nuit', 'nuit veille aube leve'],
    ['L’épreuve', 'eprouverons epreuve endurants'],
    ['La parole juste', 'parole dites mensonge medisance'],
    ['La subsistance', 'subsistance attribue pourvoit biens'],
    ['Le paradis', 'jardins ruisseaux felicite demeure'],
    ['Les orphelins', 'orphelins biens injustice'],
    ['La guérison', 'guerison remede poitrines'],
    ['Le temps', 'temps heure jour terme'],
  ];

  /* ======================================================================
     5. Moteur audio
     --------------------------------------------------------------------
     Contrainte n.3 : les effets s'appliquent à la VOIX SEULE. Aucun
     oscillateur, aucune nappe, aucun échantillon musical n'existe dans ce
     fichier. Les reverberations sont des réponses impulsionnelles générées
     a partir de bruit filtré : elles ne font que placer la voix dans un
     volume acoustique, elles n'ajoutent aucune note.
     ====================================================================== */

  const PRESETS = [
    { id: 'nue', name: 'Voix nue', desc: 'Aucune réverbération, simple mise au net', rt: 0, wet: 0, pre: 0, tone: 6000 },
    { id: 'salle', name: 'Petite salle', desc: '0,9 s — pièce de travail', rt: 0.9, wet: 0.20, pre: 0.010, tone: 4200 },
    { id: 'quartier', name: 'Mosquée de quartier', desc: '1,8 s — salle carrelée', rt: 1.8, wet: 0.28, pre: 0.018, tone: 3400 },
    { id: 'grande', name: 'Grande mosquée', desc: '3,4 s — nef haute', rt: 3.4, wet: 0.34, pre: 0.030, tone: 2900 },
    { id: 'dome', name: 'Sous le dôme', desc: '5,2 s — coupole, queue longue', rt: 5.2, wet: 0.40, pre: 0.045, tone: 3200 },
    { id: 'veillee', name: 'Veillée', desc: '0,6 s et un écho lointain', rt: 0.6, wet: 0.18, pre: 0.008, tone: 3000, delay: 0.34, fb: 0.26, dw: 0.16 },
    { id: 'haram', name: 'Très grand volume', desc: '6,8 s — vaste esplanade couverte', premium: true, rt: 6.8, wet: 0.44, pre: 0.060, tone: 2600 },
    { id: 'plaine', name: 'Plaine ouverte', desc: 'Échos larges, sans queue', premium: true, rt: 1.2, wet: 0.20, pre: 0.020, tone: 2400, delay: 0.62, fb: 0.34, dw: 0.22 },
  ];
  const presetById = (id) => PRESETS.find((p) => p.id === id) || PRESETS[0];

  /**
   * Réponse impulsionnelle synthétique : bruit blanc passe-bas, enveloppe
   * exponentielle calée sur le RT60 demandé, plus quelques réflexions
   * précoces qui donnent sa taille au volume.
   */
  function makeIR(ctx, preset) {
    const sr = ctx.sampleRate;
    const tail = Math.max(0.05, preset.rt);
    const pre = preset.pre || 0;
    const len = Math.max(1, Math.floor(sr * (tail + pre)));
    const buf = ctx.createBuffer(2, len, sr);
    const start = Math.floor(sr * pre);
    const a = Math.exp((-2 * Math.PI * preset.tone) / sr);   // pole du passe-bas 1er ordre

    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = start; i < len; i++) {
        const t = (i - start) / (len - start);
        const env = Math.exp(-6.908 * t) * (1 - t);          // -60 dB au bout de RT60
        lp = (Math.random() * 2 - 1) * (1 - a) + lp * a;
        d[i] = lp * env;
      }
      // Reflexions précoces : quelques echos discrets, décorrélés entre canaux.
      const taps = [0.011, 0.019, 0.027, 0.041, 0.058];
      taps.forEach((tap, k) => {
        const pos = start + Math.floor(sr * tap * (1 + ch * 0.07));
        if (pos < len) d[pos] += (k % 2 ? -1 : 1) * 0.42 * Math.exp(-2.4 * tap * (10 / Math.max(0.5, tail)));
      });
    }
    return buf;
  }

  const irCache = new Map();
  function getIR(ctx, preset) {
    const key = `${preset.id}@${ctx.sampleRate}`;
    if (!irCache.has(key)) irCache.set(key, makeIR(ctx, preset));
    return irCache.get(key);
  }

  /**
   * Construit la chaîne de traitement et renvoie {input, output}.
   * source -> coupe-bas -> chaleur -> presence -> compresseur -> [direct | reverb | echo] -> sortie
   */
  function buildChain(ctx, preset, opts) {
    const o = opts || {};
    const input = ctx.createGain();

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 85; hp.Q.value = 0.7;

    const warmth = ctx.createBiquadFilter();
    warmth.type = 'lowshelf'; warmth.frequency.value = 220; warmth.gain.value = -1.5;

    const presence = ctx.createBiquadFilter();
    presence.type = 'peaking'; presence.frequency.value = 3200; presence.Q.value = 0.9;
    presence.gain.value = o.presence != null ? o.presence : 2.5;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -22; comp.knee.value = 22; comp.ratio.value = 2.8;
    comp.attack.value = 0.006; comp.release.value = 0.22;

    const out = ctx.createGain();
    out.gain.value = 1;

    input.connect(hp); hp.connect(warmth); warmth.connect(presence); presence.connect(comp);

    const wetAmount = o.wet != null ? o.wet : preset.wet;
    const dry = ctx.createGain();
    dry.gain.value = 1 - wetAmount * 0.45;
    comp.connect(dry); dry.connect(out);

    if (preset.rt > 0 && wetAmount > 0) {
      const conv = ctx.createConvolver();
      conv.normalize = true;
      conv.buffer = getIR(ctx, preset);
      const wet = ctx.createGain();
      wet.gain.value = wetAmount;
      comp.connect(conv); conv.connect(wet); wet.connect(out);
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
      comp.connect(dl); dl.connect(damp); damp.connect(fb); fb.connect(dl);
      dl.connect(dg); dg.connect(out);
    }

    return { input, output: out };
  }

  const AudioEngine = {
    ctx: null,
    stream: null,
    recorder: null,
    chunks: [],
    analyser: null,
    micError: null,

    ensureCtx() {
      if (!this.ctx || this.ctx.state === 'closed') {
        const C = window.AudioContext || window.webkitAudioContext;
        this.ctx = new C();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },

    /** Micro brut : les corrections navigateur dégraderaient la récitation. */
    async requestMic() {
      if (this.stream && this.stream.active) return this.stream;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        this.micError = 'unsupported';
        throw new Error('Ce navigateur n expose pas le micro.');
      }
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
        });
        this.micError = null;
        return this.stream;
      } catch (err) {
        this.micError = err && err.name === 'NotAllowedError' ? 'denied' : 'unavailable';
        throw err;
      }
    },

    pickMime(candidates) {
      if (typeof MediaRecorder === 'undefined') return '';
      for (const m of candidates) if (MediaRecorder.isTypeSupported(m)) return m;
      return '';
    },

    async startRecording(onLevel) {
      const stream = await this.requestMic();
      const ctx = this.ensureCtx();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.72;
      src.connect(analyser);
      this.analyser = analyser;

      const mime = this.pickMime(['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']);
      this.chunks = [];
      this.recorder = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 128000 } : undefined);
      this.recorder.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
      this.recorder.start(200);

      const data = new Uint8Array(analyser.frequencyBinCount);
      let raf = 0;
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0, sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
          if (Math.abs(v) > peak) peak = Math.abs(v);
        }
        onLevel(Math.sqrt(sum / data.length), peak);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      this._stopMeter = () => cancelAnimationFrame(raf);
      return this.recorder;
    },

    stopRecording() {
      return new Promise((resolve) => {
        if (!this.recorder || this.recorder.state === 'inactive') return resolve(null);
        this.recorder.onstop = () => {
          if (this._stopMeter) this._stopMeter();
          const type = this.recorder.mimeType || 'audio/webm';
          resolve(new Blob(this.chunks, { type }));
        };
        this.recorder.stop();
      });
    },

    releaseMic() {
      if (this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; }
    },

    async decode(blob) {
      const ctx = this.ensureCtx();
      const buf = await blob.arrayBuffer();
      return await ctx.decodeAudioData(buf);
    },

    /** Lecture temps réel du tampon a travers la chaîne. Renvoie un handle. */
    play(buffer, preset, opts, onEnd) {
      const ctx = this.ensureCtx();
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const chain = buildChain(ctx, preset, opts);
      src.connect(chain.input);
      chain.output.connect(ctx.destination);
      const startedAt = ctx.currentTime;
      src.onended = () => { if (onEnd) onEnd(); };
      src.start();
      return {
        stop() { try { src.stop(); } catch (e) { /* déjà arrêté */ } },
        elapsed: () => ctx.currentTime - startedAt,
      };
    },

    /**
     * Rendu temps réel du tampon traite vers un flux encodable.
     * Renvoie {stream, node, start, source} — l'appelant declenche start().
     */
    renderToStream(buffer, preset, opts) {
      const ctx = this.ensureCtx();
      const dest = ctx.createMediaStreamDestination();
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const chain = buildChain(ctx, preset, opts);
      src.connect(chain.input);
      chain.output.connect(dest);
      return { stream: dest.stream, source: src, ctx };
    },
  };

  /** Enveloppe de crête pour le dessin de forme d'onde. */
  function peaks(buffer, count) {
    const data = buffer.getChannelData(0);
    const block = Math.max(1, Math.floor(data.length / count));
    const out = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      let max = 0;
      const start = i * block;
      const end = Math.min(data.length, start + block);
      for (let j = start; j < end; j++) { const v = Math.abs(data[j]); if (v > max) max = v; }
      out[i] = max;
    }
    return out;
  }

  function drawWave(canvas, buffer, progress, colors) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, hgt = canvas.clientHeight;
    if (!w || !hgt) return;
    canvas.width = w * dpr; canvas.height = hgt * dpr;
    const g = canvas.getContext('2d');
    g.scale(dpr, dpr);
    g.clearRect(0, 0, w, hgt);
    const n = Math.floor(w / 3);
    const p = peaks(buffer, n);
    const mid = hgt / 2;
    const cut = (progress || 0) * n;
    for (let i = 0; i < n; i++) {
      const amp = Math.max(1.2, p[i] * (hgt / 2 - 3));
      g.fillStyle = i <= cut ? colors.played : colors.idle;
      g.fillRect(i * 3, mid - amp, 2, amp * 2);
    }
  }

  /* ======================================================================
     6. Rendu video
     --------------------------------------------------------------------
     Canvas 1080x1920 (vertical, format des reseaux). Les decors sont
     strictement geometriques et abstraits : aucune representation d'etre
     anime, conformement a la contrainte n.4 (respect du caractere sacre).
     ====================================================================== */

  const VIDEO_STYLES = [
    { id: 'nuit', name: 'Nuit', desc: 'Fond indigo profond, texte laiton' },
    { id: 'mushaf', name: 'Mushaf', desc: 'Pierre claire, encre noire, filets or' },
    { id: 'lueur', name: 'Lueur', desc: 'Halo chaud qui respire avec la voix' },
    { id: 'mihrab', name: 'Mihrab', desc: 'Arc géométrique et trame étoilée', premium: true },
  ];

  const PAL = {
    nuit: { bg0: '#0B1220', bg1: '#141E1C', ink: '#F0EBDF', sub: '#A9B4AE', gold: '#C9A25C', rule: 'rgba(201,162,92,.34)' },
    mushaf: { bg0: '#F2F1E9', bg1: '#E4E5DC', ink: '#141A19', sub: '#4A534F', gold: '#8A6620', rule: 'rgba(138,102,32,.35)' },
    lueur: { bg0: '#100C0A', bg1: '#1C1512', ink: '#F5EFE3', sub: '#B6A894', gold: '#E0BE7E', rule: 'rgba(224,190,126,.3)' },
    mihrab: { bg0: '#0A1512', bg1: '#122420', ink: '#EFEADC', sub: '#9FB2A8', gold: '#C9A25C', rule: 'rgba(201,162,92,.4)' },
  };

  /** Découpe un texte en lignes tenant dans maxWidth, police déjà posée sur g. */
  function wrapText(g, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const trial = line ? line + ' ' + w : w;
      if (g.measureText(trial).width > maxWidth && line) { lines.push(line); line = w; }
      else line = trial;
    }
    if (line) lines.push(line);
    return lines;
  }

  /** Réduit la taille de police jusqu'a ce que le bloc tienne dans la boîte. */
  function fitBlock(g, text, face, maxWidth, maxHeight, startSize, minSize, lineFactor) {
    const css = (size) => `${face.weight || 400} ${Math.round(size)}px ${face.family}`;
    const step = Math.max(1, (startSize - minSize) / 24);
    for (let size = startSize; size >= minSize; size -= step) {
      g.font = css(size);
      const lines = wrapText(g, text, maxWidth);
      const lh = size * lineFactor;
      if (lines.length * lh <= maxHeight) return { size, lines, lh, css: css(size) };
    }
    g.font = css(minSize);
    const lines = wrapText(g, text, maxWidth);
    return { size: minSize, lines, lh: minSize * lineFactor, css: css(minSize) };
  }

  /** Trame géométrique de fond : étoiles a huit branches, tracées, jamais figuratives. */
  function ornament(g, W, H, pal, styleId, phase) {
    g.save();
    g.globalAlpha = styleId === 'mushaf' ? 0.5 : 0.32;
    g.strokeStyle = pal.rule;
    g.lineWidth = 2;
    if (styleId === 'mihrab') {
      const cx = W / 2, cy = H * 0.42, r = W * 0.42;
      g.beginPath();
      g.moveTo(cx - r, H * 0.9);
      g.lineTo(cx - r, cy);
      g.arc(cx, cy, r, Math.PI, 0);
      g.lineTo(cx + r, H * 0.9);
      g.stroke();
      const step = W / 7;
      g.globalAlpha = 0.16;
      for (let x = step / 2; x < W; x += step) {
        for (let y = step / 2; y < H; y += step) {
          g.beginPath();
          for (let k = 0; k < 8; k++) {
            const ang = (k / 8) * Math.PI * 2;
            const rr = k % 2 ? step * 0.13 : step * 0.3;
            const px = x + Math.cos(ang) * rr, py = y + Math.sin(ang) * rr;
            k ? g.lineTo(px, py) : g.moveTo(px, py);
          }
          g.closePath(); g.stroke();
        }
      }
    } else {
      const cx = W / 2, cy = H * 0.5;
      for (let i = 0; i < 5; i++) {
        const r = W * (0.34 + i * 0.13) + Math.sin(phase + i) * 6;
        g.globalAlpha = 0.12 - i * 0.018;
        g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
      }
    }
    g.restore();
  }

  /** Dessine une image de la video a l'instant t. */
  function drawFrame(g, W, H, opts) {
    const { styleId, verse, translation, label, t, duration, level, watermark } = opts;
    const pal = PAL[styleId] || PAL.nuit;

    const grad = g.createLinearGradient(0, 0, W * 0.4, H);
    grad.addColorStop(0, pal.bg0);
    grad.addColorStop(1, pal.bg1);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    if (styleId === 'lueur') {
      const r = W * (0.5 + level * 0.5);
      const glow = g.createRadialGradient(W / 2, H * 0.44, 0, W / 2, H * 0.44, r);
      glow.addColorStop(0, `rgba(224,190,126,${0.16 + level * 0.2})`);
      glow.addColorStop(1, 'rgba(224,190,126,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, W, H);
    }
    ornament(g, W, H, pal, styleId, t * 0.6);

    // Toute la composition est exprimee en multiples de k : l'apercu basse
    // definition et l'export 1080x1920 donnent alors exactement la meme image.
    const k = W / 1080;
    const pad = W * 0.10;
    const boxW = W - pad * 2;

    const AR_FACE = { family: '"Amiri Quran", "Amiri", serif' };
    const TR_FACE = { family: '"Spectral", Georgia, serif' };
    const REF_CSS = `600 ${Math.round(30 * k)}px "IBM Plex Sans", system-ui, sans-serif`;

    // --- passe de mesure : on compose le bloc entier avant de le poser, sinon
    //     un verset long descend sous le centre et un verset court flotte.
    g.save();
    g.direction = 'rtl';
    const ar = fitBlock(g, verse, AR_FACE, boxW, H * 0.34, 112 * k, 44 * k, 1.95);
    g.restore();
    const tr = translation ? fitBlock(g, translation, TR_FACE, boxW, H * 0.19, 46 * k, 26 * k, 1.5) : null;

    const RULE_GAP = 78 * k, REF_GAP = 62 * k, TR_GAP = 78 * k, REF_H = 30 * k;
    const arH = ar.lines.length * ar.lh;
    const trH = tr ? tr.lines.length * tr.lh : 0;
    const blockH = arH + RULE_GAP + REF_GAP + REF_H + (tr ? TR_GAP + trH : 0);
    // Legerement au-dessus du centre geometrique : c'est le centre optique, et
    // cela degage le bas de l'image ou les reseaux posent leurs incrustations.
    const top = (H - blockH) / 2 - H * 0.045;

    // --- verset arabe
    g.save();
    g.direction = 'rtl';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.font = ar.css;
    g.fillStyle = pal.ink;
    let y = top + ar.lh * 0.82;
    for (const line of ar.lines) { g.fillText(line, W / 2, y); y += ar.lh; }
    g.restore();
    const arBottom = top + arH;

    // --- filet + reference
    g.save();
    g.strokeStyle = pal.rule;
    g.lineWidth = 2 * k;
    g.beginPath();
    g.moveTo(W / 2 - 66 * k, arBottom + RULE_GAP);
    g.lineTo(W / 2 + 66 * k, arBottom + RULE_GAP);
    g.stroke();
    g.fillStyle = pal.gold;
    g.font = REF_CSS;
    g.letterSpacing = `${(2.6 * k).toFixed(2)}px`;   // ignore par les moteurs qui ne le gerent pas
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillText(label.toUpperCase(), W / 2, arBottom + RULE_GAP + REF_GAP + REF_H * 0.75);
    g.letterSpacing = '0px';
    g.restore();

    // --- traduction
    if (tr) {
      g.save();
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      g.font = tr.css;
      g.fillStyle = pal.sub;
      let ty = arBottom + RULE_GAP + REF_GAP + REF_H + TR_GAP + tr.lh * 0.78;
      for (const line of tr.lines) { g.fillText(line, W / 2, ty); ty += tr.lh; }
      g.restore();
    }

    // --- progression
    const barY = H - 160 * k;
    g.fillStyle = pal.rule;
    g.fillRect(pad, barY, boxW, 4 * k);
    g.fillStyle = pal.gold;
    g.fillRect(pad, barY, boxW * clamp(t / Math.max(0.1, duration), 0, 1), 4 * k);

    if (watermark) {
      g.save();
      g.textAlign = 'center';
      g.font = `500 ${Math.round(27 * k)}px "IBM Plex Sans", system-ui, sans-serif`;
      g.fillStyle = pal.sub;
      g.globalAlpha = 0.72;
      g.fillText('Talawa Studio', W / 2, H - 96 * k);
      g.restore();
    }
  }

  /* ======================================================================
     7. Export
     ====================================================================== */

  /** Répartition estimée des versets sur la durée, au prorata du nombre de signes. */
  function autoCues(verses, duration) {
    const weights = verses.map((v) => Math.max(8, verseAr(v.s, v.a).length));
    const total = weights.reduce((a, b) => a + b, 0);
    let acc = 0;
    return verses.map((v, i) => {
      const start = (acc / total) * duration;
      acc += weights[i];
      return start;
    });
  }
  const cueIndex = (cues, t) => {
    let i = 0;
    for (let k = 0; k < cues.length; k++) if (t >= cues[k]) i = k;
    return i;
  };

  async function renderMedia(config) {
    const { buffer, preset, opts, verses, cues, styleId, translationLang, watermark, video, onProgress } = config;
    const duration = buffer.duration;
    const { stream: audioStream, source } = AudioEngine.renderToStream(buffer, preset, opts);

    let tracks = audioStream.getAudioTracks();
    let canvas = null, g = null, envelope = null, W = 1080, Hh = 1920;

    if (video) {
      await (document.fonts && document.fonts.ready);
      canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = Hh;
      g = canvas.getContext('2d');
      envelope = peaks(buffer, Math.max(2, Math.ceil(duration * 30)));
      const vstream = canvas.captureStream(30);
      tracks = [...vstream.getVideoTracks(), ...tracks];
    }

    const mixed = new MediaStream(tracks);
    const mime = AudioEngine.pickMime(
      video
        ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
        : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'],
    );
    if (typeof MediaRecorder === 'undefined') throw new Error('Ce navigateur ne sait pas encoder de media.');

    const chunks = [];
    const rec = new MediaRecorder(mixed, mime ? Object.assign({ mimeType: mime }, video ? { videoBitsPerSecond: 5_000_000 } : { audioBitsPerSecond: 160000 }) : undefined);
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

    const done = new Promise((resolve) => { rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || (video ? 'video/webm' : 'audio/webm') })); });

    rec.start(250);
    const t0 = performance.now();
    source.start();

    await new Promise((resolve) => {
      const loop = () => {
        const t = (performance.now() - t0) / 1000;
        if (video) {
          const i = cueIndex(cues, t);
          const v = verses[i];
          const level = envelope[clamp(Math.floor(t * 30), 0, envelope.length - 1)] || 0;
          drawFrame(g, W, Hh, {
            styleId,
            verse: verseAr(v.s, v.a),
            translation: translationLang === 'none' ? '' : verseTr(v.s, v.a, translationLang),
            label: refLabel(v.s, v.a),
            t, duration, level, watermark,
          });
        }
        if (onProgress) onProgress(clamp(t / duration, 0, 1));
        if (t >= duration + 0.25) return resolve();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });

    try { source.stop(); } catch (e) { /* déjà terminé */ }
    rec.stop();
    return await done;
  }

  /**
   * Remise du fichier au visiteur.
   * Dans un Artifact publié, la page ne peut pas déclencher de téléchargement
   * elle-même : on passe par la capacité `downloads`, qui affiche une
   * confirmation. Hors de ce contexte, on retombe sur un lien classique.
   */
  let downloadsNs;
  async function getDownloads() {
    if (downloadsNs !== undefined) return downloadsNs;
    downloadsNs = null;
    try {
      if (window.claude && typeof window.claude.use === 'function') downloadsNs = await window.claude.use('downloads');
    } catch (e) { downloadsNs = null; }
    return downloadsNs;
  }

  async function saveFile(filename, blob) {
    const ns = await getDownloads();
    if (ns) {
      await ns.save({ filename, data: blob });
      return 'saved';
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'linked';
  }

  const saveErrorMessage = (err) => {
    const code = err && err.code;
    if (code === 'declined') return 'Enregistrement annulé.';
    if (code === 'too_large') return 'Fichier trop lourd (16 Mo maximum). Raccourcissez la récitation.';
    if (code === 'rate_limited') return 'Une confirmation est déjà ouverte. Réessayez dans un instant.';
    if (code === 'rejected_extension' || code === 'extension_not_enabled') return 'Ce format n’est pas autorisé ici.';
    return 'Export impossible dans ce contexte.';
  };

  /* ======================================================================
     8. Pictogrammes
     ====================================================================== */

  const SVG = (d, extra) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${extra || ''}${d ? `<path d="${d}"/>` : ''}</svg>`;

  const ICONS = {
    book: SVG('M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5zM19 18v3H6.5A2.5 2.5 0 0 1 4 18.5'),
    search: SVG('M20 20l-3.6-3.6', '<circle cx="10.5" cy="10.5" r="6.5"/>'),
    mic: SVG('M12 15a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 0 0-7 0v5A3.5 3.5 0 0 0 12 15zM5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3'),
    wave: SVG('M3 12h2m14 0h2M8 7v10m4-14v20m4-16v12'),
    user: SVG('M4.5 20a7.5 7.5 0 0 1 15 0', '<circle cx="12" cy="8" r="4"/>'),
    left: SVG('M14.5 5.5L8 12l6.5 6.5'),
    right: SVG('M9.5 5.5L16 12l-6.5 6.5'),
    play: SVG('M7 4.8v14.4l12-7.2z'),
    pause: SVG('M9 5v14M15 5v14'),
    stop: SVG('M6.5 6.5h11v11h-11z'),
    down: SVG('M12 3.5v12m0 0l-4.5-4.5M12 15.5l4.5-4.5M4.5 19.5h15'),
    film: SVG('M3.5 5.5h17v13h-17zM3.5 10h17M3.5 14.5h17M8 5.5v13M16 5.5v13'),
    lock: SVG('M7 10.5V8a5 5 0 0 1 10 0v2.5', '<rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2"/>'),
    check: SVG('M5 12.5l4.5 4.5L19 7'),
    plus: SVG('M12 5.5v13M5.5 12h13'),
    close: SVG('M6 6l12 12M18 6L6 18'),
    info: SVG('M12 11v5.5M12 7.6v.1', '<circle cx="12" cy="12" r="8.5"/>'),
    sliders: SVG('M4 8h10m4 0h2M4 16h3m4 0h9M14 5.5v5M7 13.5v5'),
    upload: SVG('M12 19.5v-12m0 0L7.5 12M12 7.5l4.5 4.5M4.5 4.5h15'),
    star: SVG('M12 4l2.35 4.9 5.15.72-3.75 3.7.9 5.18L12 16.05 7.35 18.5l.9-5.18L4.5 9.62l5.15-.72z'),
    trash: SVG('M5 7h14M9.5 7V5.5h5V7M6.7 7l.8 12.5h9l.8-12.5'),
    dot: SVG('', '<circle cx="12" cy="12" r="6"/>'),
  };

  /* ======================================================================
     9. État
     ====================================================================== */

  const S = {
    tab: 'lire',
    screen: 'index',
    surah: 1,
    mode: 'tajwid',
    tr: 'fr',
    filter: '',
    query: '',
    results: null,
    selection: [],
    take: null,
    takes: [],
    preset: 'quartier',
    wet: null,
    presence: 2.5,
    videoStyle: 'nuit',
    format: 'video',
    premium: false,
    prompterSpeed: 26,
    rendered: null,
    progress: 0,
    busy: null,
    sheet: null,
    toast: null,
  };

  let takeSeq = 0;
  const scrollMem = {};

  const inSelection = (s, a) => S.selection.some((v) => v.s === s && v.a === a);
  function toggleSelection(s, a) {
    const i = S.selection.findIndex((v) => v.s === s && v.a === a);
    if (i >= 0) S.selection.splice(i, 1);
    else {
      S.selection.push({ s, a });
      S.selection.sort((x, y) => x.s - y.s || x.a - y.a);
    }
  }

  let toastTimer = 0;
  function toast(msg) {
    S.toast = msg;
    render();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { S.toast = null; render(); }, 3200);
  }

  const go = (tab, screen) => {
    S.tab = tab;
    if (screen) S.screen = screen;
    render();
    const el = $('#screen');
    if (el) el.scrollTop = 0;
  };

  /* ======================================================================
     10. Fragments partagés
     ====================================================================== */

  function ayahHTML(s, a, opts) {
    const o = opts || {};
    const ar = verseAr(s, a);
    const body = S.mode === 'tajwid' ? tajwidHTML(ar) : plainHTML(ar);
    const picked = inSelection(s, a);
    const tr = S.tr === 'none' ? '' : `<p class="ayah-tr">${esc(verseTr(s, a, S.tr))}</p>`;
    return `
      <article class="verse" data-picked="${picked ? 1 : 0}">
        <div class="verse-head">
          <span class="ayah-ref">${esc(o.label || ref(s, a))}</span>
          <div class="verse-actions">
            <button class="icon-btn" data-act="pick" data-s="${s}" data-a="${a}" aria-pressed="${picked}"
              title="${picked ? 'Retirer de la sélection' : 'Ajouter à la sélection'}"
              aria-label="${picked ? 'Retirer le verset de la sélection' : 'Ajouter le verset à la sélection'}">${picked ? ICONS.check : ICONS.plus}</button>
            <button class="icon-btn" data-act="recite" data-s="${s}" data-a="${a}" title="Réciter ce verset" aria-label="Réciter ce verset">${ICONS.mic}</button>
          </div>
        </div>
        <p class="ayah-ar ${S.mode === 'plain' ? 'plain' : ''}">${body}<span class="ayah-mark">﴿${arNum(a)}﴾</span></p>
        ${tr}
      </article>`;
  }

  const selectionBar = () => {
    if (!S.selection.length) return '';
    const label = S.selection.length === 1
      ? refLabel(S.selection[0].s, S.selection[0].a)
      : `${passageLabel(S.selection)} · ${S.selection.length} versets`;
    return `
      <div class="card card-pad" style="display:flex;align-items:center;gap:10px;justify-content:space-between">
        <div style="min-width:0">
          <div class="section-label" style="margin-bottom:3px">Passage à réciter</div>
          <div style="font-family:var(--serif);font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(label)}</div>
        </div>
        <button class="btn btn-primary" data-act="to-prompter">${ICONS.mic}Réciter</button>
      </div>`;
  };

  /* ======================================================================
     11. Écrans — Lire
     ====================================================================== */

  function screenIndex() {
    const q = deAccent(S.filter.trim().toLowerCase());
    const list = SURAHS.filter((s) =>
      !q || deAccent(s.tr.toLowerCase()).includes(q) || deAccent(s.fr.toLowerCase()).includes(q) || String(s.i) === q,
    );
    return `
      <div class="screen-pad">
        <input class="field" type="search" placeholder="Filtrer les 114 sourates" value="${esc(S.filter)}" data-input="filter" aria-label="Filtrer les sourates">
        ${selectionBar()}
        <div class="list card">
          ${list.map((s) => `
            <button class="row" data-act="open-surah" data-s="${s.i}">
              <span class="row-index">${s.i}</span>
              <span class="row-main">
                <span class="row-title">${esc(s.tr)}</span>
                <span class="row-sub">${esc(s.fr)} · ${s.n} versets · ${s.place === 'M' ? 'Mecquoise' : 'Médinoise'}</span>
              </span>
              <span class="row-ar">${esc(s.ar)}</span>
            </button>`).join('')}
        </div>
        ${list.length ? '' : '<div class="empty"><strong>Aucune sourate</strong>Essayez un autre nom ou un numéro.</div>'}
      </div>`;
  }

  function screenSurah() {
    const m = surahMeta(S.surah);
    const n = m.n;
    let out = '<div class="screen-pad">';
    out += `
      <div class="card card-pad" style="display:flex;flex-direction:column;gap:12px">
        <div class="segmented" role="group" aria-label="Mode d’affichage">
          <button data-act="mode" data-v="tajwid" aria-pressed="${S.mode === 'tajwid'}">Tajwid en couleurs</button>
          <button data-act="mode" data-v="plain" aria-pressed="${S.mode === 'plain'}">Noir simple</button>
        </div>
        <div class="segmented" role="group" aria-label="Traduction">
          <button data-act="tr" data-v="fr" aria-pressed="${S.tr === 'fr'}">Français</button>
          <button data-act="tr" data-v="en" aria-pressed="${S.tr === 'en'}">English</button>
          <button data-act="tr" data-v="none" aria-pressed="${S.tr === 'none'}">Arabe seul</button>
        </div>
        ${S.mode === 'tajwid' ? `<div class="tajwid-legend">${TAJWID_LEGEND.map(([c, l]) => `<span><i style="background:var(--${c})"></i>${esc(l)}</span>`).join('')}</div>` : ''}
      </div>`;
    out += selectionBar();
    out += '<div class="card card-pad">';
    if (m.pre) out += `<div class="basmala">${esc(D.basmala.ar)}</div>`;
    for (let a = 1; a <= n; a++) out += ayahHTML(S.surah, a);
    out += '</div>';
    out += `<div style="display:flex;gap:8px">
      ${S.surah > 1 ? `<button class="btn btn-block" data-act="open-surah" data-s="${S.surah - 1}">${ICONS.left}${esc(surahMeta(S.surah - 1).tr)}</button>` : ''}
      ${S.surah < 114 ? `<button class="btn btn-block" data-act="open-surah" data-s="${S.surah + 1}">${esc(surahMeta(S.surah + 1).tr)}${ICONS.right}</button>` : ''}
    </div>`;
    out += '</div>';
    return out;
  }

  /* ======================================================================
     12. Écrans — Chercher
     ====================================================================== */

  function screenSearch() {
    const r = S.results;
    return `
      <div class="screen-pad">
        <form data-act="search-submit" style="display:flex;gap:8px">
          <input class="field" type="search" placeholder="Un verset sur la patience…" value="${esc(S.query)}" data-input="query" aria-label="Rechercher un thème ou un mot">
          <button class="btn btn-primary" type="submit" aria-label="Chercher">${ICONS.search}</button>
        </form>

        <div class="notice">
          ${ICONS.info}
          <div><strong>Extraction, jamais rédaction.</strong> La recherche parcourt le corpus vérifié embarqué et renvoie des versets existants avec leur référence exacte. Aucun texte religieux n’est produit par un modèle.</div>
        </div>

        <div>
          <div class="section-label" style="margin-bottom:8px">Thèmes</div>
          <div class="chip-row">
            ${THEMES.map(([name, q]) => `<button class="chip" data-act="theme" data-q="${esc(q)}" data-name="${esc(name)}" aria-pressed="${S.query === name}">${esc(name)}</button>`).join('')}
          </div>
        </div>

        ${r === null ? `<div class="empty"><strong>Cherchez un thème</strong>Écrivez en langage naturel, ou touchez un thème ci-dessus.</div>`
          : !r.length ? `<div class="empty"><strong>Aucun verset trouvé</strong>Reformulez avec d’autres mots.</div>`
          : `<div class="section-label">${r.length} verset${r.length > 1 ? 's' : ''} — les plus proches d’abord</div>
             <div class="card card-pad" style="display:flex;flex-direction:column;gap:4px">
               ${r.map((x) => ayahHTML(x.s, x.a, { label: refLabel(x.s, x.a) })).join('')}
             </div>`}
      </div>`;
  }

  /* ======================================================================
     13. Écrans — Studio
     ====================================================================== */

  const REC = { state: 'idle', startedAt: 0, timer: 0, scroll: 0, handle: null };

  function screenPassage() {
    const has = S.selection.length > 0;
    const micBlocked = AudioEngine.micError === 'denied' || AudioEngine.micError === 'unsupported';
    return `
      <div class="screen-pad">
        <div class="section-label">Passage</div>
        ${has ? `
          <div class="card card-pad" style="display:flex;flex-direction:column;gap:10px">
            ${S.selection.map((v, i) => `
              <div style="display:flex;align-items:flex-start;gap:10px">
                <span class="row-index" style="width:26px;height:26px;font-size:10.5px">${i + 1}</span>
                <div style="flex:1;min-width:0">
                  <div class="ayah-ref">${esc(refLabel(v.s, v.a))}</div>
                  <p class="ayah-ar" style="font-size:19px;line-height:1.95;margin:4px 0 0">${plainHTML(verseAr(v.s, v.a))}</p>
                </div>
                <button class="icon-btn" data-act="pick" data-s="${v.s}" data-a="${v.a}" aria-label="Retirer ce verset">${ICONS.close}</button>
              </div>`).join('')}
          </div>
          <button class="btn btn-primary btn-lg btn-block" data-act="to-prompter">${ICONS.mic}Passer au télépromptage</button>
        ` : `
          <div class="empty">
            <strong>Aucun verset sélectionné</strong>
            Choisissez un ou plusieurs versets dans la lecture ou la recherche, puis revenez ici.
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-block" data-act="tab" data-v="lire">${ICONS.book}Parcourir</button>
            <button class="btn btn-block" data-act="tab" data-v="chercher">${ICONS.search}Chercher</button>
          </div>`}

        ${S.take ? `<button class="btn btn-block" data-act="studio" data-v="review">${ICONS.play}Reprendre « ${esc(S.take.name)} »</button>` : ''}

        <div class="section-label">Réglages de captation</div>
        <div class="card card-pad" style="display:flex;flex-direction:column;gap:12px">
          <div class="slider-row">
            <label for="sp">Défilement</label>
            <input id="sp" type="range" min="0" max="70" step="2" value="${S.prompterSpeed}" data-input="speed">
            <output>${S.prompterSpeed ? S.prompterSpeed + '' : 'off'}</output>
          </div>
          <p style="margin:0;font-size:11.5px;color:var(--ink-3)">Vitesse du télépromptage en pixels par seconde. À zéro, le texte reste fixe et vous faites défiler vous-même.</p>
        </div>

        ${micBlocked ? `
          <div class="notice notice-madder">
            ${ICONS.info}
            <div><strong>Micro inaccessible ici.</strong> ${AudioEngine.micError === 'denied'
              ? 'L’autorisation a été refusée.' : 'Ce contexte n’expose pas le micro.'}
              Ouvrez la page dans un onglet à part, ou importez un enregistrement existant pour utiliser les effets et l’export.</div>
          </div>` : ''}

        <label class="btn btn-block" style="cursor:pointer">
          ${ICONS.upload}Importer un enregistrement
          <input type="file" accept="audio/*" data-input="import" style="display:none">
        </label>
      </div>`;
  }

  function screenPrompter() {
    const verses = S.selection;
    return `
      <div class="teleprompter">
        <div class="tp-mask top"></div>
        <div class="tp-scroll" id="tp">
          ${verses.map((v, i) => `
            <div class="tp-verse" data-active="${i === 0 ? 1 : 0}" data-i="${i}">
              <div class="ayah-ref" style="margin-bottom:10px">${esc(refLabel(v.s, v.a))}</div>
              <p class="ayah-ar ${S.mode === 'plain' ? 'plain' : ''}">${S.mode === 'tajwid' ? tajwidHTML(verseAr(v.s, v.a)) : plainHTML(verseAr(v.s, v.a))}<span class="ayah-mark">﴿${arNum(v.a)}﴾</span></p>
              ${S.tr === 'none' ? '' : `<p class="ayah-tr">${esc(verseTr(v.s, v.a, S.tr))}</p>`}
            </div>`).join('')}
          <div style="height:120px"></div>
        </div>
        <div class="tp-mask bot"></div>
        <div class="rec-bar">
          <div class="rec-meta">
            <span class="rec-time" id="rec-time">0:00.0</span>
            <span id="rec-status">${REC.state === 'recording'
              ? '<span class="rec-live"><i></i>Enregistrement</span>'
              : '<span style="font-size:11.5px;color:var(--ink-3)">Prêt à enregistrer</span>'}</span>
          </div>
          <div class="meter" id="meter" aria-hidden="true">${Array.from({ length: 28 }, () => '<i style="height:2px"></i>').join('')}</div>
          <div class="rec-controls">
            <button class="btn btn-quiet" data-act="studio" data-v="passage" ${REC.state === 'recording' ? 'disabled' : ''}>${ICONS.left}Passage</button>
            <button class="rec-main" data-act="rec-toggle" data-state="${REC.state}" aria-label="${REC.state === 'recording' ? 'Arrêter l’enregistrement' : 'Démarrer l’enregistrement'}"><span class="core"></span></button>
            <button class="btn btn-quiet" data-act="studio" data-v="review" ${S.take ? '' : 'disabled'}>Écoûte${ICONS.right}</button>
          </div>
        </div>
      </div>`;
  }

  function screenReview() {
    const t = S.take;
    if (!t) return `<div class="screen-pad"><div class="empty"><strong>Aucune prise</strong>Enregistrez d’abord une récitation.</div><button class="btn btn-primary btn-block" data-act="studio" data-v="passage">Choisir un passage</button></div>`;
    const wet = S.wet == null ? presetById(S.preset).wet : S.wet;
    return `
      <div class="screen-pad">
        <div class="card card-pad" style="display:flex;flex-direction:column;gap:12px">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
            <div style="min-width:0">
              <div style="font-family:var(--serif);font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.name)}</div>
              <div style="font-size:11.5px;color:var(--ink-3)">${esc(t.label)} · ${fmtShort(t.duration)}</div>
            </div>
            <button class="btn" data-act="play-toggle">${S.playing ? ICONS.pause : ICONS.play}${S.playing ? 'Pause' : 'Écouter'}</button>
          </div>
          <canvas class="wave" id="wave"></canvas>
        </div>

        <div class="section-label">Acoustique</div>
        <div class="preset-grid">
          ${PRESETS.map((p) => {
            const locked = p.premium && !S.premium;
            return `<button class="preset" data-act="preset" data-v="${p.id}" aria-pressed="${S.preset === p.id}" ${locked ? 'disabled' : ''}>
              ${locked ? `<span class="preset-lock">${ICONS.lock}</span>` : ''}
              <span class="preset-name">${esc(p.name)}</span>
              <span class="preset-desc">${esc(p.desc)}</span>
            </button>`;
          }).join('')}
        </div>

        <div class="card card-pad" style="display:flex;flex-direction:column;gap:10px">
          <div class="slider-row">
            <label for="wet">Profondeur</label>
            <input id="wet" type="range" min="0" max="70" step="1" value="${Math.round(wet * 100)}" data-input="wet">
            <output>${Math.round(wet * 100)}%</output>
          </div>
          <div class="slider-row">
            <label for="pres">Présence</label>
            <input id="pres" type="range" min="-3" max="7" step="0.5" value="${S.presence}" data-input="presence">
            <output>${S.presence > 0 ? '+' : ''}${S.presence}</output>
          </div>
        </div>

        <div class="notice">
          ${ICONS.info}
          <div><strong>Voix seule.</strong> Ces réglages placent votre voix dans un volume acoustique. Aucun accompagnement musical n’est ajouté, ni ici ni à l’export.</div>
        </div>

        <button class="btn btn-primary btn-lg btn-block" data-act="studio" data-v="export">${ICONS.down}Exporter</button>
      </div>`;
  }

  function screenExport() {
    const t = S.take;
    if (!t) return `<div class="screen-pad"><div class="empty"><strong>Aucune prise</strong>Enregistrez une récitation avant d’exporter.</div></div>`;
    const isVideo = S.format === 'video';
    const busy = S.busy === 'render';
    return `
      <div class="screen-pad">
        <div class="segmented" role="group" aria-label="Format d’export">
          <button data-act="format" data-v="video" aria-pressed="${isVideo}">Vidéo 9:16</button>
          <button data-act="format" data-v="audio" aria-pressed="${!isVideo}">Audio seul</button>
        </div>

        ${isVideo ? `
          <div class="section-label">Style vidéo</div>
          <div class="preset-grid">
            ${VIDEO_STYLES.map((v) => {
              const locked = v.premium && !S.premium;
              return `<button class="preset" data-act="vstyle" data-v="${v.id}" aria-pressed="${S.videoStyle === v.id}" ${locked ? 'disabled' : ''}>
                ${locked ? `<span class="preset-lock">${ICONS.lock}</span>` : ''}
                <span class="preset-name">${esc(v.name)}</span>
                <span class="preset-desc">${esc(v.desc)}</span>
              </button>`;
            }).join('')}
          </div>
          <canvas class="video-preview" id="vprev" aria-label="Aperçu de la première image"></canvas>
        ` : ''}

        ${S.premium ? '' : `
          <div class="notice">
            ${ICONS.info}
            <div><strong>Formule gratuite.</strong> ${isVideo ? 'La vidéo porte la mention Talawa Studio.' : 'L’export audio est complet.'} Les acoustiques et styles marqués d’un cadenas, ainsi que l’export sans mention, font partie de l’abonnement.</div>
          </div>`}

        ${busy ? `
          <div class="card card-pad" style="display:flex;flex-direction:column;gap:9px">
            <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--ink-2)">
              <span>Rendu en temps réel…</span><span style="font-variant-numeric:tabular-nums">${Math.round(S.progress * 100)}%</span>
            </div>
            <div class="progress"><i style="width:${S.progress * 100}%"></i></div>
            <p style="margin:0;font-size:11.5px;color:var(--ink-3)">Le rendu suit la durée réelle de la récitation (${fmtShort(t.duration)}). Gardez cet écran affiché.</p>
          </div>
        ` : S.rendered ? `
          <div class="card card-pad" style="display:flex;flex-direction:column;gap:10px">
            <div style="display:flex;align-items:center;gap:9px">
              <span class="pill pill-myrtle">${ICONS.check}Rendu prêt</span>
              <span style="font-size:12px;color:var(--ink-3)">${esc(S.rendered.filename)} · ${(S.rendered.blob.size / 1024 / 1024).toFixed(1)} Mo</span>
            </div>
            ${S.rendered.video ? `<video class="video-preview" controls playsinline src="${esc(S.rendered.url)}"></video>`
              : `<audio controls style="width:100%" src="${esc(S.rendered.url)}"></audio>`}
            <button class="btn btn-gold btn-lg btn-block" data-act="save">${ICONS.down}Enregistrer le fichier</button>
            <button class="btn btn-quiet btn-block" data-act="render">Refaire le rendu</button>
          </div>
        ` : `
          <button class="btn btn-primary btn-lg btn-block" data-act="render">${isVideo ? ICONS.film : ICONS.wave}Lancer le rendu</button>
        `}

        <button class="btn btn-quiet btn-block" data-act="studio" data-v="passage">${ICONS.plus}Enregistrer un autre passage</button>

        <div class="section-label">Contenu</div>
        <div class="card card-pad" style="display:flex;flex-direction:column;gap:6px">
          <div style="font-size:12.5px;color:var(--ink-2)">${esc(t.label)}</div>
          <div style="font-size:11.5px;color:var(--ink-3)">Acoustique : ${esc(presetById(S.preset).name)} · Traduction incrustée : ${S.tr === 'none' ? 'aucune' : S.tr === 'fr' ? 'français (Hamidullah)' : 'anglais (Saheeh International)'}</div>
        </div>
      </div>`;
  }

  /* ======================================================================
     14. Écrans — Recitations et Compte
     ====================================================================== */

  function screenTakes() {
    if (!S.takes.length) {
      return `<div class="screen-pad"><div class="empty"><strong>Aucune récitation</strong>Vos prises apparaîtront ici pendant la session.</div>
        <button class="btn btn-primary btn-block" data-act="tab" data-v="studio">${ICONS.mic}Enregistrer</button></div>`;
    }
    return `
      <div class="screen-pad">
        <div class="notice">${ICONS.info}<div>Les prises vivent dans cette session. Exportez celles que vous voulez garder.</div></div>
        <div class="list card">
          ${S.takes.map((t) => `
            <div class="row">
              <button class="row-index" data-act="open-take" data-id="${t.id}" aria-label="Ouvrir ${esc(t.name)}">${ICONS.play}</button>
              <button class="row-main" data-act="open-take" data-id="${t.id}" style="text-align:left">
                <span class="row-title">${esc(t.name)}</span>
                <span class="row-sub">${esc(t.label)} · ${fmtShort(t.duration)}</span>
              </button>
              <button class="icon-btn" data-act="del-take" data-id="${t.id}" aria-label="Supprimer">${ICONS.trash}</button>
            </div>`).join('')}
        </div>
      </div>`;
  }

  function screenAccount() {
    const src = D.meta.sources;
    return `
      <div class="screen-pad">
        <div class="card card-pad" style="display:flex;flex-direction:column;gap:12px">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
            <div>
              <div style="font-family:var(--serif);font-size:16px">${S.premium ? 'Abonnement actif' : 'Formule gratuite'}</div>
              <div style="font-size:11.5px;color:var(--ink-3)">${S.premium ? 'Toutes les acoustiques, export sans mention' : 'Export avec mention, catalogue restreint'}</div>
            </div>
            <span class="pill ${S.premium ? 'pill-gold' : 'pill-myrtle'}">${S.premium ? 'Premium' : 'Gratuit'}</span>
          </div>
          <button class="btn ${S.premium ? '' : 'btn-gold'} btn-block" data-act="premium">
            ${S.premium ? 'Revenir à la formule gratuite' : ICONS.star + 'Simuler l’abonnement'}
          </button>
          <p style="margin:0;font-size:11px;color:var(--ink-3)">Bascule de démonstration : elle déverrouille le catalogue premium pour montrer la différence, sans aucun paiement.</p>
        </div>

        <div class="section-label">Affichage</div>
        <div class="card card-pad" style="display:flex;flex-direction:column;gap:10px">
          <div class="segmented" role="group" aria-label="Mode d’affichage">
            <button data-act="mode" data-v="tajwid" aria-pressed="${S.mode === 'tajwid'}">Tajwid</button>
            <button data-act="mode" data-v="plain" aria-pressed="${S.mode === 'plain'}">Noir simple</button>
          </div>
          <div class="segmented" role="group" aria-label="Traduction">
            <button data-act="tr" data-v="fr" aria-pressed="${S.tr === 'fr'}">Français</button>
            <button data-act="tr" data-v="en" aria-pressed="${S.tr === 'en'}">English</button>
            <button data-act="tr" data-v="none" aria-pressed="${S.tr === 'none'}">Arabe seul</button>
          </div>
        </div>

        <div class="section-label">Provenance du texte</div>
        <div class="card card-pad" style="display:flex;flex-direction:column;gap:9px;font-size:12px;color:var(--ink-2)">
          <div><strong style="color:var(--ink)">Texte arabe</strong><br>${esc(D.meta.script)} — edition <code>${esc(src.arabic.edition)}</code> (${esc(src.arabic.upstream)}).</div>
          <div><strong style="color:var(--ink)">Francais</strong><br>${esc(src.fr.translator)}.</div>
          <div><strong style="color:var(--ink)">Anglais</strong><br>${esc(src.en.translator)}.</div>
          <div style="font-size:11px;color:var(--ink-3)">${D.meta.verses} versets, ${D.meta.surahs} sourates, vérifiés à la compilation. Empreinte du texte arabe : <code>${esc(src.arabic.sha256.slice(0, 16))}…</code></div>
        </div>

        <div class="section-label">Règles du produit</div>
        <div class="card card-pad" style="display:flex;flex-direction:column;gap:8px;font-size:12.5px;color:var(--ink-2)">
          <div>${ICONS.check} Le texte affiché provient d’une source vérifiée, jamais d’un modèle.</div>
          <div>${ICONS.check} La recherche cite des versets existants avec leur référence.</div>
          <div>${ICONS.check} Les effets s’appliquent à la voix seule, sans musique.</div>
          <div>${ICONS.check} Aucune représentation figurative dans les vidéos.</div>
        </div>
      </div>`;
  }

  /* ======================================================================
     15. Chrome : barre de navigation et barre d onglets
     ====================================================================== */

  const TABS = [
    { id: 'lire', label: 'Lire', icon: 'book' },
    { id: 'chercher', label: 'Chercher', icon: 'search' },
    { id: 'studio', label: 'Studio', icon: 'mic' },
    { id: 'recitations', label: 'Prises', icon: 'wave' },
    { id: 'compte', label: 'Compte', icon: 'user' },
  ];

  function navHTML() {
    let back = '', title = '', sub = '', right = '';
    if (S.tab === 'lire') {
      if (S.screen === 'surah') {
        const m = surahMeta(S.surah);
        back = `<button class="navbar-btn" data-act="lire-index">${ICONS.left}Sourates</button>`;
        title = esc(m.tr); sub = `${esc(m.fr)} · ${m.n} versets`;
        right = `<span class="navbar-btn right" style="font-family:var(--arabic);font-size:19px;color:var(--gold)">${esc(m.ar)}</span>`;
      } else { title = 'Le Coran'; sub = '114 sourates · lecture Hafs'; }
    } else if (S.tab === 'chercher') { title = 'Chercher'; sub = 'par thème ou par mot'; }
    else if (S.tab === 'studio') {
      const steps = { passage: ['Passage', '1 sur 4'], prompter: ['Télépromptage', '2 sur 4'], review: ['Écoute et effets', '3 sur 4'], export: ['Export', '4 sur 4'] };
      const cur = steps[S.screen] || steps.passage;
      title = cur[0]; sub = cur[1];
      const prev = { prompter: 'passage', review: 'prompter', export: 'review' }[S.screen];
      if (prev) back = `<button class="navbar-btn" data-act="studio" data-v="${prev}" ${REC.state === 'recording' ? 'disabled' : ''}>${ICONS.left}Retour</button>`;
    } else if (S.tab === 'recitations') { title = 'Mes récitations'; sub = `${S.takes.length} prise${S.takes.length > 1 ? 's' : ''}`; }
    else { title = 'Compte'; sub = 'formule et sources'; }
    return `${back || '<span></span>'}<div class="navbar-title">${title}${sub ? `<small>${sub}</small>` : ''}</div>${right || '<span></span>'}`;
  }

  const tabbarHTML = () => TABS.map((t) => {
    const on = S.tab === t.id;
    if (t.id === 'studio') {
      return `<button class="tab tab-rec" data-act="tab" data-v="studio" aria-selected="${on}" role="tab">
        <span class="rec-dot">${ICONS.mic}</span><span>${t.label}</span></button>`;
    }
    return `<button class="tab" data-act="tab" data-v="${t.id}" aria-selected="${on}" role="tab">${ICONS[t.icon]}<span>${t.label}</span></button>`;
  }).join('') + '<span class="home-indicator"></span>';

  function screenHTML() {
    if (S.tab === 'lire') return S.screen === 'surah' ? screenSurah() : screenIndex();
    if (S.tab === 'chercher') return screenSearch();
    if (S.tab === 'studio') {
      if (S.screen === 'prompter') return screenPrompter();
      if (S.screen === 'review') return screenReview();
      if (S.screen === 'export') return screenExport();
      return screenPassage();
    }
    if (S.tab === 'recitations') return screenTakes();
    return screenAccount();
  }

  /* ======================================================================
     16. Rendu
     ====================================================================== */

  const screenKey = () => `${S.tab}/${S.screen}`;
  let lastKey = null;

  function render() {
    const scr = $('#screen');
    if (scr && lastKey) scrollMem[lastKey] = scr.scrollTop;

    $('#navbar').innerHTML = navHTML();
    $('#tabbar').innerHTML = tabbarHTML();
    const isPrompter = S.tab === 'studio' && S.screen === 'prompter';
    scr.classList.toggle('no-pad', isPrompter);
    scr.style.overflowY = isPrompter ? 'hidden' : 'auto';
    scr.innerHTML = screenHTML();

    $('#overlay').innerHTML = S.toast ? `<div class="toast">${esc(S.toast)}</div>` : '';

    const key = screenKey();
    if (key === lastKey && scrollMem[key] != null) scr.scrollTop = scrollMem[key];
    lastKey = key;
    afterRender();
  }

  const waveColors = () => {
    const cs = getComputedStyle(document.documentElement);
    return { played: cs.getPropertyValue('--gold').trim() || '#8A6620', idle: cs.getPropertyValue('--line-2').trim() || '#BFC5B9' };
  };

  function afterRender() {
    const wave = $('#wave');
    if (wave && S.take) drawWave(wave, S.take.buffer, S.playProgress || 0, waveColors());

    const prev = $('#vprev');
    if (prev && S.take) {
      const W = 540, Hh = 960;
      prev.width = W; prev.height = Hh;
      const v = S.selection[0] || S.take.verses[0];
      if (v) {
        drawFrame(prev.getContext('2d'), W, Hh, {
          styleId: S.videoStyle,
          verse: verseAr(v.s, v.a),
          translation: S.tr === 'none' ? '' : verseTr(v.s, v.a, S.tr),
          label: refLabel(v.s, v.a),
          t: 0, duration: S.take.duration, level: 0.3, watermark: !S.premium,
        });
      }
    }

    const tp = $('#tp');
    if (tp) tp.addEventListener('scroll', syncActiveVerse, { passive: true });
  }

  function syncActiveVerse() {
    const tp = $('#tp');
    if (!tp) return;
    const mid = tp.scrollTop + tp.clientHeight * 0.38;
    const verses = $$('.tp-verse', tp);
    let best = 0, bestD = Infinity;
    verses.forEach((el, i) => {
      const c = el.offsetTop + el.offsetHeight / 2;
      const d = Math.abs(c - mid);
      if (d < bestD) { bestD = d; best = i; }
    });
    verses.forEach((el, i) => el.setAttribute('data-active', i === best ? '1' : '0'));
  }

  /* ======================================================================
     17. Enregistrement
     ====================================================================== */

  function updateMeter(rms, peak) {
    const meter = $('#meter');
    if (!meter) return;
    const bars = meter.children;
    const level = clamp(rms * 3.4, 0, 1);
    for (let i = bars.length - 1; i > 0; i--) bars[i].style.height = bars[i - 1].style.height;
    bars[0].style.height = Math.max(2, level * 34) + 'px';
    for (const b of bars) b.classList.toggle('hot', parseFloat(b.style.height) > 30);
    if (peak > 0.985) { /* saturation : la barre passe au rouge via .hot */ }
  }

  function tickTime() {
    const el = $('#rec-time');
    if (el) el.textContent = fmtTime((performance.now() - REC.startedAt) / 1000);
  }

  async function recToggle() {
    if (REC.state === 'recording') return stopRec();
    if (REC.state !== 'idle') return;
    if (!S.selection.length) { toast('Choisissez d’abord un passage.'); return; }

    REC.state = 'countdown';
    render();
    const host = $('.device-screen');
    const overlay = document.createElement('div');
    overlay.className = 'countdown';
    overlay.innerHTML = '<span>3</span>';
    host.appendChild(overlay);
    for (const n of ['3', '2', '1']) {
      overlay.innerHTML = `<span>${n}</span>`;
      await new Promise((r) => setTimeout(r, 800));
    }
    overlay.remove();
    await startRec();
  }

  async function startRec() {
    try {
      await AudioEngine.startRecording(updateMeter);
    } catch (err) {
      REC.state = 'idle';
      render();
      toast(AudioEngine.micError === 'denied'
        ? 'Micro refusé. Autorisez le micro, ou importez un enregistrement.'
        : 'Micro indisponible ici. Importez un enregistrement depuis l’écran Passage.');
      return;
    }
    REC.state = 'recording';
    REC.startedAt = performance.now();
    render();
    REC.timer = setInterval(tickTime, 100);
    if (S.prompterSpeed > 0) {
      REC.scroll = setInterval(() => {
        const tp = $('#tp');
        if (tp) { tp.scrollTop += S.prompterSpeed / 10; syncActiveVerse(); }
      }, 100);
    }
  }

  async function stopRec() {
    clearInterval(REC.timer); clearInterval(REC.scroll);
    REC.timer = REC.scroll = 0;
    const blob = await AudioEngine.stopRecording();
    AudioEngine.releaseMic();
    REC.state = 'idle';
    if (!blob || !blob.size) { render(); toast('Aucun son capté.'); return; }
    try {
      const buffer = await AudioEngine.decode(blob);
      makeTake(blob, buffer, S.selection.slice());
      S.screen = 'review';
      render();
    } catch (err) {
      render();
      toast('Impossible de relire l’enregistrement.');
    }
  }

  /**
   * Libellé lisible d'un passage : "Al-Ikhlas 112:1", "112:1-4" quand les
   * versets se suivent dans la même sourate, sinon un décompte explicite.
   */
  function passageLabel(list) {
    const first = list[0];
    if (list.length === 1) return refLabel(first.s, first.a);
    const sameSurah = list.every((v) => v.s === first.s);
    const contiguous = sameSurah && list.every((v, i) => v.a === first.a + i);
    if (contiguous) return `${surahMeta(first.s).tr} ${first.s}:${first.a}-${list[list.length - 1].a}`;
    return `${refLabel(first.s, first.a)} et ${list.length - 1} autre${list.length > 2 ? 's' : ''}`;
  }

  function makeTake(blob, buffer, verses) {
    const list = verses && verses.length ? verses : S.selection.slice();
    const label = list.length ? passageLabel(list) : 'Enregistrement importé';
    const take = {
      id: ++takeSeq,
      name: `Prise ${takeSeq}`,
      label,
      blob, buffer,
      duration: buffer.duration,
      verses: list.length ? list : [{ s: S.surah, a: 1 }],
    };
    S.takes.unshift(take);
    S.take = take;
    S.rendered = null;
    return take;
  }

  /* ======================================================================
     18. Écoute et rendu
     ====================================================================== */

  let player = null, playRaf = 0;
  function stopPlayback() {
    if (player) { player.stop(); player = null; }
    cancelAnimationFrame(playRaf);
    S.playing = false;
    S.playProgress = 0;
  }

  function togglePlay() {
    if (S.playing) { stopPlayback(); render(); return; }
    const t = S.take;
    if (!t) return;
    const preset = presetById(S.preset);
    player = AudioEngine.play(t.buffer, preset, { wet: S.wet == null ? preset.wet : S.wet, presence: S.presence }, () => {
      stopPlayback(); render();
    });
    S.playing = true;
    render();
    const loop = () => {
      if (!player) return;
      S.playProgress = clamp(player.elapsed() / t.duration, 0, 1);
      const wave = $('#wave');
      if (wave) drawWave(wave, t.buffer, S.playProgress, waveColors());
      playRaf = requestAnimationFrame(loop);
    };
    playRaf = requestAnimationFrame(loop);
  }

  function setProgress(p) {
    S.progress = p;
    const bar = $('.progress i');
    if (bar) bar.style.width = p * 100 + '%';
  }

  async function doRender() {
    const t = S.take;
    if (!t || S.busy) return;
    stopPlayback();
    if (S.rendered && S.rendered.url) URL.revokeObjectURL(S.rendered.url);
    S.rendered = null;
    S.busy = 'render';
    S.progress = 0;
    render();

    const preset = presetById(S.preset);
    const video = S.format === 'video';
    try {
      const blob = await renderMedia({
        buffer: t.buffer,
        preset,
        opts: { wet: S.wet == null ? preset.wet : S.wet, presence: S.presence },
        verses: t.verses,
        cues: autoCues(t.verses, t.duration),
        styleId: S.videoStyle,
        translationLang: S.tr,
        watermark: !S.premium,
        video,
        onProgress: setProgress,
      });
      const ext = /mp4/.test(blob.type) ? 'mp4' : 'webm';
      const safe = t.label.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'recitation';
      // Audio et vidéo sortent tous deux en .webm : le genre doit figurer dans
      // le nom, sinon un export écrase l'autre dans le dossier de destination.
      S.rendered = { blob, url: URL.createObjectURL(blob), video, filename: `talawa-${safe}-${video ? 'video' : 'audio'}.${ext}` };
    } catch (err) {
      toast('Le rendu a échoué dans ce navigateur.');
    } finally {
      S.busy = null;
      render();
    }
  }

  async function doSave() {
    if (!S.rendered) return;
    try {
      const how = await saveFile(S.rendered.filename, S.rendered.blob);
      toast(how === 'saved' ? 'Fichier enregistré.' : 'Téléchargement lancé.');
    } catch (err) {
      toast(saveErrorMessage(err));
    }
  }

  /* ======================================================================
     19. Actions
     ====================================================================== */

  const ACTIONS = {
    tab(el) {
      const v = el.dataset.v;
      if (REC.state === 'recording') { toast('Arrêtez l’enregistrement d’abord.'); return; }
      stopPlayback();
      if (v === 'lire') go('lire', 'index');
      else if (v === 'studio') go('studio', 'passage');
      else go(v, 'index');
    },
    'lire-index'() { go('lire', 'index'); },
    'open-surah'(el) { S.surah = +el.dataset.s; go('lire', 'surah'); },
    mode(el) { S.mode = el.dataset.v; render(); },
    tr(el) { S.tr = el.dataset.v; render(); },
    pick(el) { toggleSelection(+el.dataset.s, +el.dataset.a); render(); },
    recite(el) {
      S.selection = [{ s: +el.dataset.s, a: +el.dataset.a }];
      go('studio', 'prompter');
    },
    'to-prompter'() { go('studio', 'prompter'); },
    studio(el) {
      if (REC.state === 'recording') { toast('Arrêtez l’enregistrement d’abord.'); return; }
      stopPlayback();
      go('studio', el.dataset.v);
    },
    theme(el) {
      // Le champ montre le nom lisible du thème ; la recherche porte sur ce nom
      // ET sur les termes dérivés, pour un meilleur rappel.
      S.query = el.dataset.name;
      S.results = search(`${el.dataset.name} ${el.dataset.q}`, 30);
      render();
    },
    'rec-toggle'() { recToggle(); },
    'play-toggle'() { togglePlay(); },
    preset(el) { S.preset = el.dataset.v; S.wet = null; S.rendered = null; if (S.playing) { stopPlayback(); } render(); },
    vstyle(el) { S.videoStyle = el.dataset.v; S.rendered = null; render(); },
    format(el) { S.format = el.dataset.v; S.rendered = null; render(); },
    render() { doRender(); },
    save() { doSave(); },
    premium() { S.premium = !S.premium; S.rendered = null; render(); },
    'open-take'(el) {
      const t = S.takes.find((x) => x.id === +el.dataset.id);
      if (!t) return;
      stopPlayback();
      S.take = t; S.rendered = null;
      go('studio', 'review');
    },
    'del-take'(el) {
      const id = +el.dataset.id;
      S.takes = S.takes.filter((x) => x.id !== id);
      if (S.take && S.take.id === id) { S.take = S.takes[0] || null; stopPlayback(); }
      render();
    },
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.tagName === 'FORM') return;
    const fn = ACTIONS[el.dataset.act];
    if (!fn) return;
    e.preventDefault();
    fn(el);
  });

  document.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-act="search-submit"]');
    if (!form) return;
    e.preventDefault();
    S.results = search(S.query, 30);
    render();
  });

  document.addEventListener('input', (e) => {
    const el = e.target.closest('[data-input]');
    if (!el) return;
    const k = el.dataset.input;
    if (k === 'filter') {
      S.filter = el.value;
      const scr = $('#screen');
      const top = scr.scrollTop;
      render();
      const field = $('[data-input="filter"]');
      if (field) { field.focus(); field.setSelectionRange(field.value.length, field.value.length); }
      scr.scrollTop = top;
    } else if (k === 'query') { S.query = el.value; }
    else if (k === 'speed') { S.prompterSpeed = +el.value; el.nextElementSibling.textContent = S.prompterSpeed ? String(S.prompterSpeed) : 'off'; }
    else if (k === 'wet') { S.wet = +el.value / 100; S.rendered = null; el.nextElementSibling.textContent = el.value + '%'; }
    else if (k === 'presence') { S.presence = +el.value; S.rendered = null; el.nextElementSibling.textContent = (S.presence > 0 ? '+' : '') + S.presence; }
  });

  document.addEventListener('change', async (e) => {
    const el = e.target.closest('[data-input="import"]');
    if (!el || !el.files || !el.files[0]) return;
    const file = el.files[0];
    try {
      AudioEngine.ensureCtx();
      const buffer = await AudioEngine.decode(file);
      makeTake(file, buffer, S.selection.slice());
      go('studio', 'review');
      toast('Enregistrement importé.');
    } catch (err) {
      toast('Ce fichier audio n’a pas pu être lu.');
    }
  });

  window.addEventListener('resize', () => {
    const wave = $('#wave');
    if (wave && S.take) drawWave(wave, S.take.buffer, S.playProgress || 0, waveColors());
  });

  /* ======================================================================
     20. Amorçage
     ====================================================================== */

  S.surah = 1;
  render();
  // L'index de recherche coûte environ 200 ms : on le construit hors du chemin
  // critique, pendant que l'utilisateur découvre l'ecran de lecture.
  (window.requestIdleCallback || ((f) => setTimeout(f, 400)))(() => buildIndex());

  window.TalawaStudio = { state: S, search, tajwidHTML, drawFrame, PRESETS, VIDEO_STYLES, data: D };
})();
