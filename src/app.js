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
(async function () {
  'use strict';

  /**
   * Le corpus arrive de deux façons selon la cible du build :
   *  - intégré à la page (`__QURAN__`) pour la publication en Artifact, dont la
   *    politique de sécurité interdit toute requête sortante ;
   *  - téléchargé depuis un fichier au nom empreinté (`__QURAN_URL__`) pour le
   *    site, où il devient un actif immuable que le navigateur garde en cache.
   */
  async function loadCorpus() {
    if (window.__QURAN__) return window.__QURAN__;
    const url = window.__QURAN_URL__;
    if (!url) throw new Error('Aucune source de corpus déclarée par le build.');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Corpus indisponible (HTTP ${res.status}).`);
    return res.json();
  }

  let D;
  try {
    D = await loadCorpus();
  } catch (err) {
    const host = document.getElementById('screen');
    if (host) {
      host.innerHTML =
        '<div class="empty"><strong>Corpus introuvable</strong>' +
        'Le texte coranique n’a pas pu être chargé. Rechargez la page ; ' +
        'si le problème persiste, le fichier de données manque au déploiement.</div>';
    }
    throw err;
  }

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

  /**
   * Acoustiques, chaîne d'effets et analyse viennent de `core/audio.mjs`, le
   * même fichier qu'importe l'application native : une acoustique corrigée ici
   * l'est là-bas, sans transcription. Le build l'insère sous `Core.audio`.
   */
  const { PRESETS, presetById, buildChain, rmsEnvelope, detectSilence, trimEdges } = Core.audio;
  const peaksOf = Core.audio.peaks;
  const { segmentPassage, WAQF } = Core.segments;
  const {
    newRegion, totalDuration, regionLength, splitAt, removeRegion, moveRegion,
    cutSpan, renderRegions, playSchedule, editedToSource,
  } = Core.edit;

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
    play(buffer, preset, opts, onEnd, offset) {
      const ctx = this.ensureCtx();
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const chain = buildChain(ctx, preset, opts);
      src.connect(chain.input);
      chain.output.connect(ctx.destination);
      const from = clamp(offset || 0, 0, Math.max(0, buffer.duration - 0.01));
      const startedAt = ctx.currentTime;
      src.onended = () => { if (onEnd) onEnd(); };
      src.start(0, from);
      return {
        cancelled: false,
        stop() { try { src.stop(); } catch (e) { /* déjà arrêté */ } },
        elapsed: () => from + (ctx.currentTime - startedAt),
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

  const peaks = (buffer, count) => peaksOf(buffer.getChannelData(0), count);

  const timelineColors = () => {
    const cs = getComputedStyle(document.documentElement);
    const v = (nom, repli) => cs.getPropertyValue(nom).trim() || repli;
    return {
      played: v('--label', '#111716'),
      idle: v('--fill-3', '#DEDED9'),
      sel: v('--fill-2', 'rgba(0,0,0,.12)'),
      cut: v('--madder', '#8C3225'),
      cue: v('--label-3', '#8A8A82'),
      head: v('--tint', '#7A5A18'),
    };
  };

  /**
   * La barre de montage.
   *
   * Une seule surface porte tout ce qui compte : la forme d'onde du montage,
   * la limite de chaque morceau, les passages d'un segment de texte au suivant,
   * et la tête de lecture. On y pointe pour se placer, on y glisse pour
   * parcourir — le geste des lecteurs iOS.
   */
  function drawTimeline(canvas, t, colors) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    const regions = takeRegions(t);
    const total = Math.max(0.05, takeDuration(t));
    const x = (sec) => (sec / total) * w;

    // Le morceau sélectionné se distingue par son fond, pas par sa couleur :
    // la forme d'onde reste lisible.
    if (regions.length > 1) {
      let acc = 0;
      for (const r of regions) {
        if (r.id === S.region) {
          g.fillStyle = colors.sel;
          g.fillRect(x(acc), 0, Math.max(3, x(regionLength(r))), h);
        }
        acc += regionLength(r);
      }
    }

    const p = peaks(editedBuffer(t), Math.max(8, Math.floor(w / 3)));
    const mid = h / 2, tete = x(S.playAt || 0);
    for (let i = 0; i < p.length; i++) {
      const amp = Math.max(1.2, p[i] * (h / 2 - 6));
      g.fillStyle = i * 3 <= tete ? colors.played : colors.idle;
      g.fillRect(i * 3, mid - amp, 2, amp * 2);
    }

    // Passages d'un segment au suivant : deux encoches, en haut et en bas,
    // pour ne pas couper la forme d'onde en son milieu.
    g.save();
    g.globalAlpha = 0.5;
    g.fillStyle = colors.cue;
    for (const e of playSchedule(regions, cuesFor(t)).slice(1)) {
      g.fillRect(x(e.start), 0, 1, h * 0.26);
      g.fillRect(x(e.start), h * 0.74, 1, h * 0.26);
    }
    g.restore();

    // Coupes du montage : un trait franc, sur toute la hauteur.
    g.fillStyle = colors.cut;
    let acc = 0;
    for (const r of regions.slice(0, -1)) { acc += regionLength(r); g.fillRect(x(acc) - 1, 0, 2, h); }

    g.fillStyle = colors.head;
    g.fillRect(clamp(tete - 1, 0, w - 2), 0, 2, h);
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
    const { styleId, verse, translation, label, t, duration, level, watermark, marks } = opts;
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
    // Le texte respire avec l'enveloppe de la voix. Tres legerement : une
    // pulsation visible ferait du verset un effet, ce qu'il n'est pas.
    g.globalAlpha = 0.92 + level * 0.08;
    let y = top + ar.lh * 0.82;
    for (const line of ar.lines) { g.fillText(line, W / 2, y); y += ar.lh; }
    g.restore();
    const arBottom = top + arH;

    // --- filet + reference
    g.save();
    g.strokeStyle = pal.rule;
    g.lineWidth = 2 * k;
    g.beginPath();
    const demi = (66 + level * 26) * k;
    g.moveTo(W / 2 - demi, arBottom + RULE_GAP);
    g.lineTo(W / 2 + demi, arBottom + RULE_GAP);
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
    // Les passages d'un segment au suivant sont marques : on voit venir la
    // coupe, comme les chapitres d'une piste.
    if (marks && marks.length > 1) {
      g.save();
      g.globalAlpha = 0.75;
      g.fillStyle = pal.sub;
      for (const m of marks.slice(1)) g.fillRect(pad + boxW * clamp(m, 0, 1) - k, barY - 5 * k, 2 * k, 14 * k);
      g.restore();
    }
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

  /** Répartition estimée des segments sur la durée, au prorata du nombre de signes. */
  function autoCues(segments, duration) {
    const weights = segments.map((g) => Math.max(8, g.text.length));
    const total = weights.reduce((a, b) => a + b, 0);
    let acc = 0;
    return segments.map((g, i) => {
      const start = (acc / total) * duration;
      acc += weights[i];
      return start;
    });
  }
  /** Segment a l'ecran a l'instant `t` du MONTAGE. */
  const scheduleAt = (schedule, t) => {
    for (let k = 0; k < schedule.length; k++) if (t >= schedule[k].start && t < schedule[k].end) return schedule[k].index;
    return schedule.length ? schedule[schedule.length - 1].index : 0;
  };

  /** Segments d'une prise — les prises d'avant le découpage n'en ont pas. */
  const takeSegments = (take) => (take.segments && take.segments.length ? take.segments : take.verses.map((v) => ({
    s: v.s, a: v.a, text: verseAr(v.s, v.a), mark: null, technique: false, part: 1, parts: 1,
  })));

  /**
   * Repères effectifs d'une prise.
   *
   * Ceux posés à la main pendant la récitation priment : ils suivent la voix.
   * L'estimation au prorata des signes ne sert que de repli, et complète la
   * fin quand le récitant n'a pas fait défiler jusqu'au dernier verset.
   */
  function cuesFor(take) {
    const list = takeSegments(take);
    const n = list.length;
    if (!take.cues || !take.cues.length) return autoCues(list, take.duration);
    const out = take.cues.slice(0, n);
    out[0] = 0;
    if (out.length < n) {
      const last = out[out.length - 1];
      const remaining = Math.max(0.1, take.duration - last);
      const missing = n - out.length;
      for (let k = 1; k <= missing; k++) out.push(last + (remaining * k) / (missing + 1));
    }
    return out;
  }

  async function renderMedia(config) {
    const { buffer, preset, opts, segments, schedule, styleId, translationLang, watermark, video, onProgress } = config;
    const duration = buffer.duration;
    const { stream: audioStream, source } = AudioEngine.renderToStream(buffer, preset, opts);

    let tracks = audioStream.getAudioTracks();
    let canvas = null, g = null, envelope = null, marks = null, W = 1080, Hh = 1920;

    if (video) {
      await (document.fonts && document.fonts.ready);
      canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = Hh;
      g = canvas.getContext('2d');
      // L'enveloppe RMS suit l'energie percue la ou la crete suit les
      // accidents : le texte respire avec la voix, il ne sursaute pas.
      const brut = rmsEnvelope(buffer.getChannelData(0), buffer.sampleRate, 1000 / 30);
      const tries = Array.from(brut).filter((v) => v > 1e-4).sort((a, b) => a - b);
      const haut = tries.length ? tries[Math.floor(tries.length * 0.92)] : 1;
      envelope = Float32Array.from(brut, (v) => clamp(v / Math.max(1e-4, haut), 0, 1));
      marks = schedule.map((e) => e.start / Math.max(0.1, duration));
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
          const gseg = segments[clamp(scheduleAt(schedule, t), 0, segments.length - 1)];
          const level = envelope[clamp(Math.floor(t * 30), 0, envelope.length - 1)] || 0;
          drawFrame(g, W, Hh, {
            styleId,
            verse: gseg.text,
            // La traduction appartient au VERSET, pas au fragment : la decouper
            // reviendrait a inventer un alignement entre l'arabe et le francais.
            translation: translationLang === 'none' ? '' : verseTr(gseg.s, gseg.a, translationLang),
            label: segLabel(gseg),
            t, duration, level, watermark, marks,
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
    chevron: SVG('M9.5 5.5L16 12l-6.5 6.5'),
    toStart: SVG('M18.5 5.5v13M17 12L8.5 6.2v11.6z'),
    rew: SVG('M12.2 6.6V3.4L7.4 6.6l4.8 3.2V6.6a5.6 5.6 0 1 1-5.6 5.6'),
    fwd: SVG('M11.8 6.6V3.4l4.8 3.2-4.8 3.2V6.6a5.6 5.6 0 1 0 5.6 5.6'),
    cut: SVG('M7.7 16.3L18 6M16.3 16.3L6 6', '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/>'),
    undo: SVG('M4.5 9.5h9a5.5 5.5 0 0 1 0 11H8M4.5 9.5L8.5 5.5M4.5 9.5l4 4'),
    chevronDown: SVG('M5.5 9.5L12 16l6.5-6.5'),
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
    // Les cartes du télépromptage : un verset court en fait une, un verset
    // long en fait plusieurs, coupées aux signes de pause du mushaf.
    segments: null,
    maxLignes: 3,
    take: null,
    takes: [],
    preset: 'quartier',
    wet: null,
    presence: 2.5,
    videoStyle: 'nuit',
    format: 'video',
    premium: false,
    rendered: null,
    progress: 0,
    region: null,          // région du montage sélectionnée
    playAt: 0,             // tête de lecture, en temps de montage
    silences: null,
    busy: null,
    sheet: null,
    toast: null,
  };

  let takeSeq = 0;
  const scrollMem = {};

  const inSelection = (s, a) => S.selection.some((v) => v.s === s && v.a === a);
  function toggleSelection(s, a) {
    S.segments = null;
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

  const largeTitle = (title, sub) =>
    `<h1 class="large-title">${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}</h1>`;

  const groupHeader = (label, trailing) =>
    `<div class="group-header"><strong>${esc(label)}</strong>${trailing || ''}</div>`;

  function ayahHTML(s, a, opts) {
    const o = opts || {};
    const body = S.mode === 'tajwid' ? tajwidHTML(verseAr(s, a)) : plainHTML(verseAr(s, a));
    const picked = inSelection(s, a);
    const tr = S.tr === 'none' ? '' : `<p class="ayah-tr">${esc(verseTr(s, a, S.tr))}</p>`;
    return `
      <article class="verse" data-picked="${picked ? 1 : 0}">
        <div class="verse-head">
          <span class="ayah-ref">${esc(o.label || ref(s, a))}</span>
          <div class="verse-actions">
            <button class="icon-btn" data-act="pick" data-s="${s}" data-a="${a}" aria-pressed="${picked}"
              aria-label="${picked ? 'Retirer le verset de la sélection' : 'Ajouter le verset à la sélection'}">${picked ? ICONS.check : ICONS.plus}</button>
            <button class="icon-btn" data-act="recite" data-s="${s}" data-a="${a}" aria-label="Réciter ce verset">${ICONS.mic}</button>
          </div>
        </div>
        <p class="ayah-ar ${S.mode === 'plain' ? 'plain' : ''}">${body}<span class="ayah-mark">﴿${arNum(a)}﴾</span></p>
        ${tr}
      </article>`;
  }

  const selectionCard = () => {
    if (!S.selection.length) return '';
    const label = S.selection.length === 1
      ? refLabel(S.selection[0].s, S.selection[0].a)
      : `${passageLabel(S.selection)} · ${S.selection.length} versets`;
    return `
      <div class="card" style="display:flex;align-items:center;gap:var(--sp-3)">
        <div style="flex:1;min-width:0">
          <div class="row-sub">Passage à réciter</div>
          <div class="row-title">${esc(label)}</div>
        </div>
        <button class="btn btn-filled" data-act="to-prompter">${ICONS.mic}Réciter</button>
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
      ${largeTitle('Le Coran', '114 sourates · lecture Hafs')}
      <div class="screen-pad">
        <label class="search">
          ${ICONS.search}
          <input type="search" placeholder="Rechercher une sourate" value="${esc(S.filter)}" data-input="filter" aria-label="Filtrer les sourates">
        </label>
        ${selectionCard()}
        ${list.length ? `<div class="list">
          ${list.map((s) => `
            <button class="list-row" data-act="open-surah" data-s="${s.i}">
              <span class="row-lead">${s.i}</span>
              <span class="row-body">
                <span class="row-title">${esc(s.tr)}</span>
                <span class="row-sub">${esc(s.fr)} · ${s.n} versets</span>
              </span>
              <span class="row-trail">
                <span class="row-ar">${esc(s.ar)}</span>
                <span class="row-chevron">${ICONS.chevron}</span>
              </span>
            </button>`).join('')}
        </div>` : '<div class="empty"><strong>Aucune sourate</strong>Essayez un autre nom ou un numéro.</div>'}
      </div>`;
  }

  function screenSurah() {
    const m = surahMeta(S.surah);
    let out = largeTitle(m.tr, `${m.fr} · ${m.n} versets · ${m.place === 'M' ? 'mecquoise' : 'médinoise'}`);
    out += '<div class="screen-pad">';
    out += `
      <div class="card" style="display:flex;flex-direction:column;gap:var(--sp-3)">
        <div class="segmented" role="group" aria-label="Mode d’affichage">
          <button data-act="mode" data-v="tajwid" aria-pressed="${S.mode === 'tajwid'}">Tajwid</button>
          <button data-act="mode" data-v="plain" aria-pressed="${S.mode === 'plain'}">Noir simple</button>
        </div>
        <div class="segmented" role="group" aria-label="Traduction">
          <button data-act="tr" data-v="fr" aria-pressed="${S.tr === 'fr'}">Français</button>
          <button data-act="tr" data-v="en" aria-pressed="${S.tr === 'en'}">English</button>
          <button data-act="tr" data-v="none" aria-pressed="${S.tr === 'none'}">Arabe seul</button>
        </div>
        ${S.mode === 'tajwid' ? `<div class="tajwid-legend">${TAJWID_LEGEND.map(([c, l]) => `<span><i style="background:var(--${c})"></i>${esc(l)}</span>`).join('')}</div>` : ''}
      </div>`;
    out += selectionCard();
    out += '<div class="card card-flush">';
    if (m.pre) out += `<div class="basmala">${esc(D.basmala.ar)}</div>`;
    for (let a = 1; a <= m.n; a++) out += ayahHTML(S.surah, a);
    out += '</div>';
    out += `<div style="display:flex;gap:var(--sp-2)">
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
      ${largeTitle('Chercher', 'par thème ou par mot')}
      <div class="screen-pad">
        <form data-act="search-submit">
          <label class="search">
            ${ICONS.search}
            <input type="search" enterkeyhint="search" placeholder="Un verset sur la patience…" value="${esc(S.query)}" data-input="query" aria-label="Rechercher un thème ou un mot">
          </label>
        </form>

        <div class="notice">
          ${ICONS.info}
          <div><strong>Extraction, jamais rédaction.</strong> La recherche parcourt le corpus vérifié embarqué et renvoie des versets existants avec leur référence exacte. Aucun texte religieux n’est produit par un modèle.</div>
        </div>

        <div class="group">
          ${groupHeader('Thèmes')}
          <div class="chip-row">
            ${THEMES.map(([name, q]) => `<button class="chip" data-act="theme" data-q="${esc(q)}" data-name="${esc(name)}" aria-pressed="${S.query === name}">${esc(name)}</button>`).join('')}
          </div>
        </div>

        ${r === null ? '<div class="empty"><strong>Cherchez un thème</strong>Écrivez en langage naturel, ou touchez un thème ci-dessus.</div>'
          : !r.length ? '<div class="empty"><strong>Aucun verset trouvé</strong>Reformulez avec d’autres mots.</div>'
          : `<div class="group">
               ${groupHeader(`${r.length} verset${r.length > 1 ? 's' : ''}`, '<span>les plus proches d’abord</span>')}
               <div class="card card-flush">${r.map((x) => ayahHTML(x.s, x.a, { label: refLabel(x.s, x.a) })).join('')}</div>
             </div>`}
      </div>`;
  }

  /* ======================================================================
     13. Écrans — Studio
     ====================================================================== */

  const REC = { state: 'idle', startedAt: 0, timer: 0, index: 0, cues: [] };

  /** Temps écoulé depuis le début de la prise, en secondes. */
  const recElapsed = () => (REC.state === 'recording' ? (performance.now() - REC.startedAt) / 1000 : 0);

  /**
   * Passe au verset suivant et horodate le passage.
   *
   * C'est le cœur du dispositif : le repère n'est plus estimé au prorata du
   * nombre de signes, il est posé par le récitant lui-même, à l'instant où il
   * change de verset. Le rendu vidéo suit alors la voix exactement.
   */
  function advanceVerse(delta) {
    const n = deckList().length;
    const next = clamp(REC.index + delta, 0, n - 1);
    if (next === REC.index) return;
    REC.index = next;
    if (REC.state === 'recording') {
      // Un retour en arrière corrige le dernier repère plutôt que d'en ajouter.
      if (delta > 0) REC.cues[next] = recElapsed();
      else REC.cues.length = Math.max(1, next + 1);
    }
    paintDeck();
  }

  const WAQF_BY_CODE = Object.entries(WAQF).reduce((m, [signe, info]) => {
    m[info.code] = Object.assign({ signe }, info);
    return m;
  }, {});

  /**
   * Prédicat « ce fragment tient dans le cadre ».
   *
   * On ne compte pas les caractères : l'arabe vocalisé a des largeurs très
   * inégales — une même longueur tient sur deux lignes ici et sur trois là.
   * On mesure donc le rendu réel, dans une copie invisible de la carte, et on
   * compare à la hauteur de `maxLignes` lignes. La sonde vit dans le même
   * conteneur que le deck : la taille de police en `cqw` y vaut la même chose.
   */
  function makeFits(maxLignes) {
    const hote = $('#screen') || document.body;
    const sonde = document.createElement('div');
    sonde.className = 'deck-probe';
    sonde.setAttribute('aria-hidden', 'true');
    sonde.innerHTML = '<p class="deck-ar"></p>';
    hote.appendChild(sonde);
    const p = sonde.firstChild;
    const mesure = (texte) => { p.textContent = texte; return p.offsetHeight; };

    const uneLigne = mesure('ا') || 1;
    const budget = uneLigne * (maxLignes + 0.35);   // tolère une ligne à peine entamée
    const vu = new Map();
    const test = (texte) => {
      if (!vu.has(texte)) vu.set(texte, mesure(texte) <= budget);
      return vu.get(texte);
    };
    test.dispose = () => sonde.remove();
    return test;
  }

  /**
   * Recalcule les cartes du deck à partir de la sélection.
   *
   * Le découpage ne réécrit jamais le texte : il ne fait que choisir où poser
   * la coupe, en priorité sur un signe de pause du mushaf, et il refuse les
   * signes qui interdisent l'arrêt.
   */
  function computeSegments() {
    if (!S.selection.length) { S.segments = null; return null; }
    const fits = makeFits(S.maxLignes);
    try {
      S.segments = segmentPassage(S.selection, verseAr, fits);
    } finally {
      fits.dispose();
    }
    REC.index = 0;
    return S.segments;
  }

  /** Les cartes affichées : les segments s'ils sont calculés, sinon les versets. */
  const deckList = () => (S.segments && S.segments.length ? S.segments : S.selection.map((v) => ({
    s: v.s, a: v.a, text: verseAr(v.s, v.a), mark: null, technique: false, part: 1, parts: 1,
  })));

  /** « An-Nur 24:35 » ou « An-Nur 24:35 · 2/3 » pour un fragment de verset. */
  const segLabel = (g) => (g.parts > 1 ? `${refLabel(g.s, g.a)} · ${g.part}/${g.parts}` : refLabel(g.s, g.a));

  /**
   * Signe de pause au pied de la carte. Le fragment s'arrête là parce que le
   * mushaf l'autorise, et le récitant doit savoir lequel. Faute de signe
   * disponible, la coupe de confort le dit franchement plutôt que de laisser
   * croire à un arrêt canonique.
   */
  function waqfBadge(g) {
    if (g.technique) return '<p class="deck-waqf" data-tech="1"><i>···</i>coupe de confort</p>';
    const w = g.mark ? WAQF_BY_CODE[g.mark] : null;
    if (!w) return '';
    return `<p class="deck-waqf"><i>${esc(w.signe)}</i>${esc(w.nom)}</p>`;
  }

  /** Redessine le deck sans reconstruire l'écran : l'enregistrement continue. */
  function paintDeck() {
    const deck = $('#deck');
    if (!deck) return;
    deck.style.transform = `translateY(${-REC.index * 100}%)`;
    $$('.deck-card', deck).forEach((el, i) => el.setAttribute('data-active', i === REC.index ? '1' : '0'));
    $$('#rail .rail-dot').forEach((el, i) => el.setAttribute('data-on', i <= REC.index ? '1' : '0'));
    const pos = $('#deck-pos');
    if (pos) pos.textContent = `${REC.index + 1} / ${deckList().length}`;
    const hint = $('#deck-hint');
    if (hint) hint.style.opacity = REC.index === 0 && REC.state === 'recording' ? '1' : '0';
  }

  function screenPassage() {
    const has = S.selection.length > 0;
    const micBlocked = AudioEngine.micError === 'denied' || AudioEngine.micError === 'unsupported';
    return `
      ${largeTitle('Studio', 'Étape 1 sur 4 · le passage')}
      <div class="screen-pad">
        ${has ? `
          <div class="card card-flush">
            ${S.selection.map((v) => `
              <div class="list-row flush">
                <span class="row-body">
                  <span class="ayah-ref">${esc(refLabel(v.s, v.a))}</span>
                  <p class="ayah-ar" style="font-size:20px;line-height:2;margin:var(--sp-1) 0 0">${plainHTML(verseAr(v.s, v.a))}</p>
                </span>
                <button class="icon-btn" data-act="pick" data-s="${v.s}" data-a="${v.a}" aria-label="Retirer ce verset">${ICONS.close}</button>
              </div>`).join('')}
          </div>
          <button class="btn btn-filled btn-block" data-act="to-prompter">${ICONS.mic}Passer au télépromptage</button>
          ${S.take ? `<button class="btn btn-block" data-act="studio" data-v="review">${ICONS.play}Reprendre « ${esc(S.take.name)} »</button>` : ''}
        ` : `
          <div class="empty">
            <strong>Aucun verset sélectionné</strong>
            Choisissez un ou plusieurs versets dans la lecture ou la recherche, puis revenez ici.
          </div>
          <div style="display:flex;gap:var(--sp-2)">
            <button class="btn btn-block" data-act="tab" data-v="lire">${ICONS.book}Parcourir</button>
            <button class="btn btn-block" data-act="tab" data-v="chercher">${ICONS.search}Chercher</button>
          </div>
        `}

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
    const list = deckList();
    const n = list.length;
    return `
      <div class="stage-deck">
        <div class="deck-rail" id="rail" aria-hidden="true">
          ${list.map((_, i) => `<i class="rail-dot" data-on="${i === 0 ? 1 : 0}"></i>`).join('')}
        </div>

        <div class="deck-window" id="deck-window">
          <div class="deck" id="deck">
            ${list.map((g, i) => `
              <article class="deck-card" data-active="${i === 0 ? 1 : 0}">
                <p class="deck-ref">${esc(segLabel(g))}</p>
                <p class="deck-ar ${S.mode === 'plain' ? 'plain' : ''}">${S.mode === 'tajwid' ? tajwidHTML(g.text) : plainHTML(g.text)}</p>
                ${waqfBadge(g)}
                ${S.tr === 'none' ? '' : `<p class="deck-tr" data-fragment="${g.parts > 1 ? 1 : 0}">${esc(verseTr(g.s, g.a, S.tr))}</p>`}
              </article>`).join('')}
          </div>
        </div>

        <p class="deck-hint" id="deck-hint">Glissez vers le haut pour la suite</p>

        <div class="glass-bar">
          <div class="glass-row">
            <span class="deck-pos" id="deck-pos">1 / ${n}</span>
            <span class="rec-clock" id="rec-time">0:00</span>
            <span class="rec-state" id="rec-status">${REC.state === 'recording' ? '<i class="live"></i>' : ''}</span>
          </div>
          <div class="glass-controls">
            <button class="glass-btn" data-act="studio" data-v="passage" ${REC.state === 'recording' ? 'disabled' : ''} aria-label="Revenir au passage">${ICONS.left}</button>
            <button class="rec-orb" data-act="rec-toggle" data-state="${REC.state}"
              aria-label="${REC.state === 'recording' ? 'Arrêter l’enregistrement' : 'Démarrer l’enregistrement'}"><span class="core"></span></button>
            <button class="glass-btn" data-act="deck-next" ${REC.index >= n - 1 ? 'disabled' : ''} aria-label="Verset suivant">${ICONS.chevronDown}</button>
          </div>
        </div>
      </div>`;
  }

  function screenReview() {
    const t = S.take;
    if (!t) return `<div class="screen-pad"><div class="empty"><strong>Aucune prise</strong>Enregistrez d’abord une récitation.</div><button class="btn btn-filled btn-block" data-act="studio" data-v="passage">Choisir un passage</button></div>`;
    const wet = S.wet == null ? presetById(S.preset).wet : S.wet;
    return `
      ${largeTitle('Écoute', 'Étape 3 sur 4 · les effets')}
      <div class="screen-pad">
        ${editorHTML(t)}

        <div class="group">
          ${groupHeader('Acoustique')}
          <div class="tile-grid">
            ${PRESETS.map((p) => {
              const locked = p.premium && !S.premium;
              return `<button class="tile" data-act="preset" data-v="${p.id}" aria-pressed="${S.preset === p.id}" ${locked ? 'disabled' : ''}>
                ${locked ? `<span class="tile-lock">${ICONS.lock}</span>` : ''}
                <span class="tile-name">${esc(p.name)}</span>
                <span class="tile-desc">${esc(p.desc)}</span>
              </button>`;
            }).join('')}
          </div>
        </div>

        <div class="card">
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

        <button class="btn btn-filled btn-block" data-act="studio" data-v="export">${ICONS.down}Exporter</button>
      </div>`;
  }

  /**
   * Le montage.
   *
   * Une prise ne sort jamais parfaite : on veut retirer le raclement de gorge
   * du début, le blanc au milieu, et remettre un morceau à sa place. Rien
   * n'est destructif — la prise d'origine reste entière, seule la liste des
   * morceaux change, et « Rétablir » la ramène d'un geste.
   */
  function editorHTML(t) {
    const regions = takeRegions(t);
    const total = takeDuration(t);
    const i = regionIndex(t);
    const multi = regions.length > 1;
    const { plages } = silencesOf(t);
    const interieurs = plages.filter((p) => !p.bord);
    return `
      <div class="card editor">
        <div class="editor-head">
          <div style="min-width:0">
            <div class="row-title">${esc(t.name)}</div>
            <div class="row-sub">${esc(t.label)}${multi ? ` · ${regions.length} morceaux` : ''}</div>
          </div>
          <span class="editor-time" id="ed-time">${fmtShort(S.playAt || 0)} / ${fmtShort(total)}</span>
        </div>

        <canvas class="wave" id="wave" role="slider" tabindex="0"
          aria-label="Tête de lecture" aria-valuemin="0" aria-valuemax="${total.toFixed(1)}"
          aria-valuenow="${(S.playAt || 0).toFixed(1)}" aria-valuetext="${fmtShort(S.playAt || 0)}"></canvas>

        <div class="transport">
          <button class="glass-btn" data-act="ed-home" aria-label="Revenir au début">${ICONS.toStart}</button>
          <button class="glass-btn" data-act="ed-rew" aria-label="Reculer de cinq secondes">${ICONS.rew}</button>
          <button class="orb-play" data-act="play-toggle" aria-label="${S.playing ? 'Mettre en pause' : 'Écouter'}">${S.playing ? ICONS.pause : ICONS.play}</button>
          <button class="glass-btn" data-act="ed-fwd" aria-label="Avancer de cinq secondes">${ICONS.fwd}</button>
          <button class="glass-btn" data-act="ed-cut" aria-label="Couper à la tête de lecture">${ICONS.cut}</button>
        </div>

        ${multi ? `
          <div class="chip-row" role="group" aria-label="Morceaux du montage">
            ${regions.map((r, k) => `<button class="chip chip-sm" data-act="ed-pick" data-id="${r.id}" aria-pressed="${r.id === S.region}">${k + 1} · ${fmtShort(regionLength(r))}</button>`).join('')}
          </div>
          <div class="editor-acts">
            <button class="btn" data-act="ed-left" ${i <= 0 ? 'disabled' : ''} aria-label="Avancer ce morceau dans l’ordre">${ICONS.left}</button>
            <button class="btn" data-act="ed-del">${ICONS.trash}Supprimer</button>
            <button class="btn" data-act="ed-right" ${i < 0 || i >= regions.length - 1 ? 'disabled' : ''} aria-label="Reculer ce morceau dans l’ordre">${ICONS.chevron}</button>
          </div>` : ''}

        <div class="editor-acts">
          <button class="btn btn-plain" data-act="ed-trim">Rogner les bords</button>
          ${multi || total < t.duration - 0.05 ? `<button class="btn btn-plain" data-act="ed-reset">${ICONS.undo}Rétablir</button>` : ''}
        </div>

        ${interieurs.length ? `
          <div class="editor-gaps">
            <p class="editor-gaps-title">${interieurs.length} pause${interieurs.length > 1 ? 's' : ''} dans la récitation</p>
            <div class="chip-row">
              ${interieurs.map((p) => `<button class="chip chip-sm" data-act="ed-gap" data-a="${p.start.toFixed(3)}" data-b="${p.end.toFixed(3)}">${fmtShort(p.start)} · ${(p.end - p.start).toFixed(1)} s</button>`).join('')}
            </div>
            <p class="editor-gaps-note">Touchez une pause pour la retirer du montage.</p>
          </div>` : ''}
      </div>`;
  }

  function screenExport() {
    const t = S.take;
    if (!t) return '<div class="screen-pad"><div class="empty"><strong>Aucune prise</strong>Enregistrez une récitation avant d’exporter.</div></div>';
    const isVideo = S.format === 'video';
    const busy = S.busy === 'render';
    return `
      ${largeTitle('Export', 'Étape 4 sur 4 · le fichier')}
      <div class="screen-pad">
        <div class="segmented" role="group" aria-label="Format d’export">
          <button data-act="format" data-v="video" aria-pressed="${isVideo}">Vidéo 9:16</button>
          <button data-act="format" data-v="audio" aria-pressed="${!isVideo}">Audio seul</button>
        </div>

        ${isVideo ? `
          <div class="group">
            ${groupHeader('Style vidéo')}
            <div class="tile-grid">
              ${VIDEO_STYLES.map((v) => {
                const locked = v.premium && !S.premium;
                return `<button class="tile" data-act="vstyle" data-v="${v.id}" aria-pressed="${S.videoStyle === v.id}" ${locked ? 'disabled' : ''}>
                  ${locked ? `<span class="tile-lock">${ICONS.lock}</span>` : ''}
                  <span class="tile-name">${esc(v.name)}</span>
                  <span class="tile-desc">${esc(v.desc)}</span>
                </button>`;
              }).join('')}
            </div>
            <canvas class="video-preview" id="vprev" aria-label="Aperçu de la première image"></canvas>
          </div>
        ` : ''}

        ${S.premium ? '' : `
          <div class="notice">
            ${ICONS.info}
            <div><strong>Formule gratuite.</strong> ${isVideo ? 'La vidéo porte la mention Talawa Studio.' : 'L’export audio est complet.'} Les acoustiques et styles marqués d’un cadenas, ainsi que l’export sans mention, font partie de l’abonnement.</div>
          </div>`}

        ${busy ? `
          <div class="card" style="display:flex;flex-direction:column;gap:var(--sp-2)">
            <div style="display:flex;justify-content:space-between;font-size:var(--t-subhead);color:var(--label-2)">
              <span>Rendu en temps réel…</span><span style="font-variant-numeric:tabular-nums">${Math.round(S.progress * 100)} %</span>
            </div>
            <div class="progress"><i style="width:${S.progress * 100}%"></i></div>
            <p style="margin:0;font-size:var(--t-footnote);line-height:var(--lh-footnote);color:var(--label-3)">Le rendu suit la durée réelle du montage (${fmtShort(takeDuration(t))}). Gardez cet écran affiché.</p>
          </div>
        ` : S.rendered ? `
          <div class="card" style="display:flex;flex-direction:column;gap:var(--sp-3)">
            <div style="display:flex;align-items:center;gap:var(--sp-2);flex-wrap:wrap">
              <span class="badge badge-myrtle">${ICONS.check}Rendu prêt</span>
              <span style="font-size:var(--t-footnote);color:var(--label-3)">${esc(S.rendered.filename)} · ${(S.rendered.blob.size / 1024 / 1024).toFixed(1)} Mo</span>
            </div>
            ${S.rendered.video ? `<video class="video-preview" controls playsinline src="${esc(S.rendered.url)}"></video>`
              : `<audio controls style="width:100%" src="${esc(S.rendered.url)}"></audio>`}
            <button class="btn btn-filled btn-block" data-act="save">${ICONS.down}Enregistrer le fichier</button>
            <button class="btn btn-plain btn-block" data-act="render">Refaire le rendu</button>
          </div>
        ` : `
          <button class="btn btn-filled btn-block" data-act="render">${isVideo ? ICONS.film : ICONS.wave}Lancer le rendu</button>
        `}

        <button class="btn btn-block" data-act="studio" data-v="passage">${ICONS.plus}Enregistrer un autre passage</button>

        <div class="group">
          ${groupHeader('Contenu')}
          <div class="card">
            <dl style="margin:0">
              <div class="kv"><dt>Passage</dt><dd>${esc(t.label)}</dd></div>
              <div class="kv"><dt>Acoustique</dt><dd>${esc(presetById(S.preset).name)}</dd></div>
              <div class="kv"><dt>Traduction incrustée</dt><dd>${S.tr === 'none' ? 'aucune' : S.tr === 'fr' ? 'français (Hamidullah)' : 'anglais (Saheeh International)'}</dd></div>
            </dl>
          </div>
        </div>
      </div>`;
  }

  /* ======================================================================
     14. Écrans — Récitations et Compte
     ====================================================================== */

  function screenTakes() {
    if (!S.takes.length) {
      return `${largeTitle('Prises', 'aucune pour le moment')}
        <div class="screen-pad">
          <div class="empty"><strong>Aucune récitation</strong>Vos prises apparaîtront ici pendant la session.</div>
          <button class="btn btn-filled btn-block" data-act="tab" data-v="studio">${ICONS.mic}Enregistrer</button>
        </div>`;
    }
    return `
      ${largeTitle('Prises', `${S.takes.length} enregistrement${S.takes.length > 1 ? 's' : ''}`)}
      <div class="screen-pad">
        <div class="notice">${ICONS.info}<div>Les prises vivent dans cette session. Exportez celles que vous voulez garder.</div></div>
        <div class="list">
          ${S.takes.map((t) => `
            <div class="list-row">
              <span class="row-lead">${ICONS.play}</span>
              <button class="row-body" data-act="open-take" data-id="${t.id}" style="text-align:left;min-height:var(--hit);justify-content:center">
                <span class="row-title">${esc(t.name)}</span>
                <span class="row-sub">${esc(t.label)} · ${fmtShort(takeDuration(t))}</span>
              </button>
              <button class="icon-btn" data-act="del-take" data-id="${t.id}" aria-label="Supprimer ${esc(t.name)}">${ICONS.trash}</button>
            </div>`).join('')}
        </div>
      </div>`;
  }

  function screenAccount() {
    const src = D.meta.sources;
    return `
      ${largeTitle('Compte', 'formule et sources')}
      <div class="screen-pad">
        <div class="card" style="display:flex;flex-direction:column;gap:var(--sp-3)">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:var(--sp-3)">
            <div>
              <div class="row-title">${S.premium ? 'Abonnement actif' : 'Formule gratuite'}</div>
              <div class="row-sub">${S.premium ? 'Toutes les acoustiques, export sans mention' : 'Export avec mention, catalogue restreint'}</div>
            </div>
            <span class="badge ${S.premium ? 'badge-tint' : 'badge-myrtle'}">${S.premium ? 'Premium' : 'Gratuit'}</span>
          </div>
          <button class="btn ${S.premium ? '' : 'btn-tinted'} btn-block" data-act="premium">
            ${S.premium ? 'Revenir à la formule gratuite' : ICONS.star + 'Simuler l’abonnement'}
          </button>
          <p style="margin:0;font-size:var(--t-footnote);line-height:var(--lh-footnote);color:var(--label-3)">
            Bascule de démonstration : elle déverrouille le catalogue premium pour montrer la différence, sans aucun paiement.
          </p>
        </div>

        <div class="group">
          ${groupHeader('Affichage')}
          <div class="card" style="display:flex;flex-direction:column;gap:var(--sp-3)">
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
        </div>

        <div class="group">
          ${groupHeader('Provenance du texte')}
          <div class="card">
            <dl style="margin:0">
              <div class="kv"><dt>Texte arabe</dt><dd>${esc(D.meta.script)}</dd></div>
              <div class="kv"><dt>Édition</dt><dd>${esc(src.arabic.edition)} · ${esc(src.arabic.upstream)}</dd></div>
              <div class="kv"><dt>Français</dt><dd>${esc(src.fr.translator)}</dd></div>
              <div class="kv"><dt>Anglais</dt><dd>${esc(src.en.translator)}</dd></div>
              <div class="kv"><dt>Vérifié</dt><dd>${D.meta.verses} versets · ${D.meta.surahs} sourates</dd></div>
              <div class="kv"><dt>Empreinte</dt><dd style="font-family:ui-monospace,Menlo,monospace;font-size:var(--t-footnote)">${esc(src.arabic.sha256.slice(0, 16))}…</dd></div>
            </dl>
          </div>
        </div>

        <div class="group">
          ${groupHeader('Règles du produit')}
          <div class="list">
            ${[
              'Le texte affiché provient d’une source vérifiée, jamais d’un modèle.',
              'La recherche cite des versets existants avec leur référence.',
              'Les effets s’appliquent à la voix seule, sans musique.',
              'Aucune représentation figurative dans les vidéos.',
            ].map((r) => `<div class="list-row">
              <span style="color:var(--myrtle);display:grid;place-items:center;flex:none">${ICONS.check}</span>
              <span class="row-body"><span style="font-size:var(--t-subhead);line-height:var(--lh-subhead);white-space:normal">${esc(r)}</span></span>
            </div>`).join('')}
          </div>
        </div>
      </div>`;
  }

  /* ======================================================================
     15. Chrome : barre de navigation et barre d'onglets
     ====================================================================== */

  const TABS = [
    { id: 'lire', label: 'Lire', icon: 'book' },
    { id: 'chercher', label: 'Chercher', icon: 'search' },
    { id: 'studio', label: 'Studio', icon: 'mic' },
    { id: 'recitations', label: 'Prises', icon: 'wave' },
    { id: 'compte', label: 'Compte', icon: 'user' },
  ];

  /** Titre compact et bouton de retour. Le titre large vit dans le contenu. */
  function navHTML() {
    let back = '';
    let title = '';
    if (S.tab === 'lire') {
      title = S.screen === 'surah' ? surahMeta(S.surah).tr : 'Le Coran';
      if (S.screen === 'surah') back = `<button class="navbar-btn" data-act="lire-index">${ICONS.left}Sourates</button>`;
    } else if (S.tab === 'chercher') { title = 'Chercher'; }
    else if (S.tab === 'studio') {
      const steps = { passage: 'Passage', prompter: 'Télépromptage', review: 'Écoute', export: 'Export' };
      title = steps[S.screen] || 'Studio';
      const prev = { prompter: 'passage', review: 'prompter', export: 'review' }[S.screen];
      // En mode immersif la barre est masquée : ne pas rendre son bouton évite
      // un second élément portant la même action, invisible et injoignable.
      if (prev && S.screen !== 'prompter') back = `<button class="navbar-btn" data-act="studio" data-v="${prev}" ${REC.state === 'recording' ? 'disabled' : ''}>${ICONS.left}${esc(steps[prev])}</button>`;
    } else if (S.tab === 'recitations') { title = 'Prises'; }
    else { title = 'Compte'; }
    return `${back || '<span class="navbar-slot"></span>'}<div class="navbar-title">${esc(title)}</div><span class="navbar-slot"></span>`;
  }

  const tabbarHTML = () => TABS.map((t) => `
    <button class="tab" data-act="tab" data-v="${t.id}" aria-selected="${S.tab === t.id}" role="tab">
      ${ICONS[t.icon]}<span class="tab-label">${t.label}</span>
    </button>`).join('') + '<span class="home-indicator"></span>';

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

    const nav = $('#navbar');
    nav.innerHTML = navHTML();
    $('#tabbar').innerHTML = tabbarHTML();

    const isPrompter = S.tab === 'studio' && S.screen === 'prompter';
    // Pendant la récitation, l écran se vide : ni barre de navigation ni
    // onglets. On récite, on ne navigue pas.
    $('.device-screen').dataset.immersive = isPrompter ? '1' : '0';
    scr.classList.toggle('no-pad', isPrompter);
    scr.style.overflowY = isPrompter ? 'hidden' : 'auto';
    scr.innerHTML = screenHTML();
    // Sans titre large — écran plein cadre — le titre compact reste visible.
    nav.dataset.compact = isPrompter || !scr.querySelector('.large-title') ? '1' : '0';

    $('#overlay').innerHTML = S.toast ? `<div class="toast">${esc(S.toast)}</div>` : '';

    const key = screenKey();
    if (key === lastKey && scrollMem[key] != null) scr.scrollTop = scrollMem[key];
    lastKey = key;
    afterRender();
  }

  /** Le titre compact prend le relais du titre large dès qu'il sort du cadre. */
  function syncNavbar() {
    const scr = $('#screen');
    const nav = $('#navbar');
    if (!scr || !nav) return;
    const big = scr.querySelector('.large-title');
    const passed = big ? scr.scrollTop > big.offsetHeight - 8 : scr.scrollTop > 4;
    nav.dataset.scrolled = passed ? '1' : '0';
  }

  function afterRender() {
    const wave = $('#wave');
    if (wave && S.take) { drawTimeline(wave, S.take, timelineColors()); wireTimeline(wave); }

    const prev = $('#vprev');
    if (prev && S.take) {
      const W = 540, Hh = 960;
      prev.width = W; prev.height = Hh;
      const list = takeSegments(S.take);
      const gseg = list[0];
      if (gseg) {
        const cues = cuesFor(S.take);
        const duree = takeDuration(S.take);
        drawFrame(prev.getContext('2d'), W, Hh, {
          styleId: S.videoStyle,
          verse: gseg.text,
          translation: S.tr === 'none' ? '' : verseTr(gseg.s, gseg.a, S.tr),
          label: segLabel(gseg),
          t: 0, duration: duree, level: 0.3, watermark: !S.premium,
          marks: playSchedule(takeRegions(S.take), cues).map((e) => e.start / Math.max(0.1, duree)),
        });
      }
    }

    wireDeck();

    const scr = $('#screen');
    if (scr) { scr.addEventListener('scroll', syncNavbar, { passive: true }); syncNavbar(); }
  }

  /**
   * Gestes de la barre de montage : pointer pour se placer, glisser pour
   * parcourir. Les flèches du clavier déplacent la tête d'une seconde, ce qui
   * rend la barre utilisable sans souris.
   */
  function wireTimeline(el) {
    if (el.dataset.wired) return;
    el.dataset.wired = '1';

    const posDe = (e) => {
      const t = S.take;
      if (!t) return 0;
      const r = el.getBoundingClientRect();
      return (clamp(e.clientX - r.left, 0, r.width) / Math.max(1, r.width)) * takeDuration(t);
    };
    let glisse = false;
    el.addEventListener('pointerdown', (e) => {
      glisse = true;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* souris hors capture */ }
      seekTo(posDe(e));
    });
    el.addEventListener('pointermove', (e) => { if (glisse) seekTo(posDe(e)); });
    const fin = () => { glisse = false; };
    el.addEventListener('pointerup', fin);
    el.addEventListener('pointercancel', fin);

    el.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); seekTo((S.playAt || 0) - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); seekTo((S.playAt || 0) + 1); }
      if (e.key === 'Home') { e.preventDefault(); seekTo(0); }
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); togglePlay(); }
    });
  }

  /**
   * Gestes du deck. Glisser vers le haut avance, vers le bas revient, et un
   * appui simple avance aussi : en pleine récitation, une grande cible vaut
   * mieux qu'un geste précis. Les flèches du clavier font la même chose.
   */
  function wireDeck() {
    const win = $('#deck-window');
    if (!win || win.dataset.wired) return;
    win.dataset.wired = '1';
    paintDeck();

    let y0 = 0, t0 = 0, moved = false;
    win.addEventListener('pointerdown', (e) => {
      y0 = e.clientY; t0 = performance.now(); moved = false;
      try { win.setPointerCapture(e.pointerId); } catch (err) { /* souris hors capture */ }
    });
    win.addEventListener('pointermove', (e) => { if (Math.abs(e.clientY - y0) > 8) moved = true; });
    win.addEventListener('pointerup', (e) => {
      const dy = e.clientY - y0;
      if (!moved && performance.now() - t0 < 400) { advanceVerse(1); return; }
      if (dy < -50) advanceVerse(1);
      else if (dy > 50) advanceVerse(-1);
    });

    let wheelLock = 0;
    win.addEventListener('wheel', (e) => {
      const now = performance.now();
      if (now - wheelLock < 420 || Math.abs(e.deltaY) < 12) return;
      wheelLock = now;
      advanceVerse(e.deltaY > 0 ? 1 : -1);
    }, { passive: true });
  }

  document.addEventListener('keydown', (e) => {
    if (!(S.tab === 'studio' && S.screen === 'prompter')) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); advanceVerse(1); }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); advanceVerse(-1); }
  });

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

  /**
   * Le niveau d'entrée se lit sur le halo de l'orbe, pas sur un vumètre à
   * barres : un seul élément, qui respire avec la voix. La saturation se
   * signale par un halo net plutôt que par une couleur d'alerte.
   */
  function updateMeter(rms, peak) {
    const orb = $('.rec-orb');
    if (!orb) return;
    orb.style.setProperty('--level', clamp(rms * 3.4, 0, 1).toFixed(3));
    orb.dataset.clip = peak > 0.985 ? '1' : '0';
  }

  function tickTime() {
    const el = $('#rec-time');
    if (el) el.textContent = fmtShort((performance.now() - REC.startedAt) / 1000);
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
    REC.index = 0;
    REC.cues = [0];            // le premier verset commence à l'instant zéro
    render();
    REC.timer = setInterval(tickTime, 100);
  }

  async function stopRec() {
    clearInterval(REC.timer);
    REC.timer = 0;
    const cues = REC.cues.slice();
    const blob = await AudioEngine.stopRecording();
    AudioEngine.releaseMic();
    REC.state = 'idle';
    if (!blob || !blob.size) { render(); toast('Aucun son capté.'); return; }
    try {
      const buffer = await AudioEngine.decode(blob);
      makeTake(blob, buffer, S.selection.slice(), cues, S.segments);
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

  function makeTake(blob, buffer, verses, cues, segments) {
    const list = verses && verses.length ? verses : S.selection.slice();
    const label = list.length ? passageLabel(list) : 'Enregistrement importé';
    const versets = list.length ? list : [{ s: S.surah, a: 1 }];
    const take = {
      id: ++takeSeq,
      name: `Prise ${takeSeq}`,
      label,
      blob, buffer,
      duration: buffer.duration,          // durée de la SOURCE, jamais réécrite
      verses: versets,
      // Le découpage utilisé à la récitation : c'est lui que suit la vidéo.
      segments: (segments && segments.length ? segments : null)
        || versets.map((v) => ({ s: v.s, a: v.a, text: verseAr(v.s, v.a), mark: null, technique: false, part: 1, parts: 1 })),
      cues: cues && cues.length ? cues : null,
      // Montage non destructif : une seule région couvrant toute la prise.
      regions: [newRegion(0, buffer.duration)],
    };
    S.takes.unshift(take);
    S.take = take;
    S.rendered = null;
    S.region = take.regions[0].id;
    S.playAt = 0;
    S.silences = null;
    return take;
  }

  /* ----------------------------------------------------------- Montage */

  const takeRegions = (t) => {
    if (!t.regions || !t.regions.length) t.regions = [newRegion(0, t.duration)];
    return t.regions;
  };
  const takeDuration = (t) => totalDuration(takeRegions(t));
  const editSig = (regions) => regions.map((r) => `${r.id}:${r.start.toFixed(4)}:${r.end.toFixed(4)}`).join('|');

  /**
   * Tampon effectivement lu et exporté.
   *
   * La prise d'origine n'est jamais touchée : on assemble les régions à la
   * demande, et on garde le résultat tant que le montage ne bouge pas. Un
   * montage intact ne coûte rien — on rend le tampon source tel quel.
   */
  function editedBuffer(t) {
    const regions = takeRegions(t);
    const sig = editSig(regions);
    if (t.editedSig === sig && t.edited) return t.edited;
    const intact = regions.length === 1 && regions[0].start <= 0.001 && regions[0].end >= t.duration - 0.001;
    t.edited = intact ? t.buffer : renderRegions(AudioEngine.ensureCtx(), t.buffer, regions);
    t.editedSig = sig;
    return t.edited;
  }

  /** Le montage a changé : le rendu précédent ne vaut plus. */
  function editChanged(regions) {
    const t = S.take;
    if (!t) return;
    t.regions = regions;
    if (!regions.some((r) => r.id === S.region)) S.region = (regions[0] || {}).id || null;
    S.playAt = clamp(S.playAt, 0, takeDuration(t));
    S.rendered = null;
    stopPlayback();
    render();
  }

  /* ======================================================================
     18. Écoute et rendu
     ====================================================================== */

  let player = null, playRaf = 0;
  /** Arrête la lecture SANS bouger la tête : mettre en pause, c'est rester là. */
  function stopPlayback() {
    if (player) { player.cancelled = true; player.stop(); player = null; }
    cancelAnimationFrame(playRaf);
    playRaf = 0;
    S.playing = false;
  }

  function startPlayback(from) {
    const t = S.take;
    if (!t) return;
    const total = takeDuration(t);
    const at = clamp(from == null ? S.playAt || 0 : from, 0, Math.max(0, total - 0.05));
    const preset = presetById(S.preset);
    const opts = { wet: S.wet == null ? preset.wet : S.wet, presence: S.presence };

    // `stop()` déclenche aussi `onended` : sans ce drapeau, une pause serait
    // prise pour une fin de lecture et ramènerait la tête au début.
    const handle = AudioEngine.play(editedBuffer(t), preset, opts, () => {
      if (handle.cancelled) return;
      stopPlayback();
      S.playAt = 0;
      render();
    }, at);
    player = handle;
    S.playAt = at;
    S.playing = true;
    render();

    const loop = () => {
      if (!player) return;
      S.playAt = clamp(player.elapsed(), 0, total);
      const tl = $('#wave');
      if (tl) drawTimeline(tl, t, timelineColors());
      const pos = $('#ed-time');
      if (pos) pos.textContent = `${fmtShort(S.playAt)} / ${fmtShort(total)}`;
      playRaf = requestAnimationFrame(loop);
    };
    playRaf = requestAnimationFrame(loop);
  }

  function togglePlay() {
    if (S.playing) { stopPlayback(); render(); return; }
    startPlayback();
  }

  /** Déplace la tête de lecture. La lecture reprend là si elle était en cours. */
  function seekTo(sec) {
    const t = S.take;
    if (!t) return;
    const at = clamp(sec, 0, takeDuration(t));
    const lisait = S.playing;
    if (lisait) stopPlayback();
    S.playAt = at;
    if (lisait) { startPlayback(at); return; }
    const tl = $('#wave');
    if (tl) drawTimeline(tl, t, timelineColors());
    const pos = $('#ed-time');
    if (pos) pos.textContent = `${fmtShort(at)} / ${fmtShort(takeDuration(t))}`;
    // Se placer, c'est aussi choisir le morceau : les commandes suivent.
    const avant = S.region;
    S.region = regionAt(t, at);
    if (avant !== S.region) render();
  }

  /** Morceau du montage sous un instant de lecture. */
  function regionAt(t, sec) {
    const regions = takeRegions(t);
    let acc = 0;
    for (const r of regions) {
      acc += regionLength(r);
      if (sec < acc - 1e-6) return r.id;
    }
    const last = regions[regions.length - 1];
    return last ? last.id : null;
  }

  const regionIndex = (t) => takeRegions(t).findIndex((r) => r.id === S.region);

  /** Début, en temps de montage, du morceau de rang `i`. */
  function regionStart(t, i) {
    const regions = takeRegions(t);
    let acc = 0;
    for (let k = 0; k < i && k < regions.length; k++) acc += regionLength(regions[k]);
    return acc;
  }

  /* ------------------------------------------------------------ Le montage */

  /** Coupe au niveau de la tête de lecture : un morceau devient deux. */
  function editCut() {
    const t = S.take;
    if (!t) return;
    const avant = takeRegions(t);
    const apres = splitAt(avant, S.playAt);
    if (apres === avant) { toast('Placez la tête de lecture à l’intérieur d’un morceau.'); return; }
    editChanged(apres);
    S.region = regionAt(t, S.playAt);
    render();
  }

  function editDelete() {
    const t = S.take;
    if (!t) return;
    const regions = takeRegions(t);
    if (regions.length <= 1) { toast('Il ne reste qu’un morceau : coupez-le d’abord.'); return; }
    const i = regionIndex(t);
    const apres = removeRegion(regions, S.region);
    if (apres === regions) return;
    editChanged(apres);
    S.region = (apres[Math.min(i, apres.length - 1)] || apres[0]).id;
    S.playAt = regionStart(t, Math.min(i, apres.length - 1));
    render();
  }

  function editMove(delta) {
    const t = S.take;
    if (!t) return;
    const regions = takeRegions(t);
    const i = regionIndex(t);
    const j = clamp(i + delta, 0, regions.length - 1);
    if (i < 0 || i === j) return;
    editChanged(moveRegion(regions, i, j));
    S.playAt = regionStart(t, j);
    render();
  }

  function editReset() {
    const t = S.take;
    if (!t) return;
    editChanged([newRegion(0, t.duration)]);
    S.region = t.regions[0].id;
    S.playAt = 0;
    S.silences = null;
    render();
  }

  /** Plages sans voix, datées dans la source. Calculées une fois par prise. */
  function silencesOf(t) {
    if (t.silences) return t.silences;
    const ch = t.buffer.getChannelData(0);
    const bornes = trimEdges(ch, t.buffer.sampleRate);
    const plages = detectSilence(ch, t.buffer.sampleRate, { minSilenceMs: 700 })
      .filter((p) => p.end - p.start >= 0.7)
      .map((p) => ({
        start: p.start, end: p.end,
        bord: p.start <= 0.03 || p.end >= t.duration - 0.03,
      }));
    t.silences = { plages, bornes };
    return t.silences;
  }

  /** Rogne les blancs de début et de fin, sans toucher au reste du montage. */
  function editTrim() {
    const t = S.take;
    if (!t) return;
    const { start, end } = silencesOf(t).bornes;
    if (start <= 0.03 && end >= t.duration - 0.03) { toast('La prise démarre et finit déjà sur la voix.'); return; }
    const regions = takeRegions(t)
      .map((r) => newRegion(clamp(r.start, start, end), clamp(r.end, start, end)))
      .filter((r) => regionLength(r) > 0.05);
    if (!regions.length) { toast('Rien à garder après rognage.'); return; }
    editChanged(regions);
    toast(`${(t.duration - (end - start)).toFixed(1)} s de silence retiré aux extrémités.`);
  }

  /** Retire un blanc repéré au milieu de la récitation. */
  function editCutSilence(a, b) {
    const t = S.take;
    if (!t) return;
    editChanged(cutSpan(takeRegions(t), a, b));
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
        buffer: editedBuffer(t),
        preset,
        opts: { wet: S.wet == null ? preset.wet : S.wet, presence: S.presence },
        segments: takeSegments(t),
        // Le programme est reconstruit depuis les regions : couper ou
        // deplacer un morceau deplace le texte avec lui, sans decalage.
        schedule: playSchedule(takeRegions(t), cuesFor(t)),
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
      computeSegments();
      go('studio', 'prompter');
    },
    'to-prompter'() { computeSegments(); go('studio', 'prompter'); },
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
    'deck-next'() { advanceVerse(1); },
    'play-toggle'() { togglePlay(); },
    'ed-home'() { seekTo(0); },
    'ed-rew'() { seekTo((S.playAt || 0) - 5); },
    'ed-fwd'() { seekTo((S.playAt || 0) + 5); },
    'ed-cut'() { editCut(); },
    'ed-del'() { editDelete(); },
    'ed-left'() { editMove(-1); },
    'ed-right'() { editMove(1); },
    'ed-trim'() { editTrim(); },
    'ed-reset'() { editReset(); },
    'ed-pick'(el) {
      const t = S.take;
      if (!t) return;
      S.region = +el.dataset.id;
      seekTo(regionStart(t, regionIndex(t)));
      render();
    },
    'ed-gap'(el) { editCutSilence(+el.dataset.a, +el.dataset.b); },
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
      S.region = takeRegions(t)[0].id;
      S.playAt = 0;
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
      makeTake(file, buffer, S.selection.slice(), null, computeSegments());
      go('studio', 'review');
      toast('Enregistrement importé.');
    } catch (err) {
      toast('Ce fichier audio n’a pas pu être lu.');
    }
  });

  /**
   * L'écran change de taille : la barre de montage se redessine, et le
   * découpage se refait — le nombre de lignes qui tient dans le cadre vient
   * de changer, donc les coupes aussi. Jamais pendant une récitation : les
   * repères déjà posés désigneraient d'autres segments.
   */
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    const wave = $('#wave');
    if (wave && S.take) drawTimeline(wave, S.take, timelineColors());
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (REC.state !== 'idle') return;
      if (!(S.tab === 'studio' && S.screen === 'prompter')) return;
      computeSegments();
      render();
    }, 220);
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
