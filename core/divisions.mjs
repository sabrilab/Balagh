/**
 * Les divisions du mushaf, et le tirage au sort d'un passage.
 *
 * Sourate, juz, hizb, rub' al-hizb, page : ces découpes ne sont pas des
 * conventions d'application, ce sont celles du Coran imprimé. Elles viennent
 * des métadonnées de l'édition Tanzil, vérifiées à la compilation contre le
 * TEXTE lui-même — chaque signe ۞ doit tomber sur un début de rub'.
 *
 * Rien n'est calculé ici à partir d'un découpage inventé : un hizb fait quatre
 * quarts parce que c'est sa définition, et les 240 quarts sont tabulés, pas
 * déduits d'un partage du nombre de versets.
 */

/** Familles de divisions, dans l'ordre où on les propose à l'écran. */
export const KINDS = ['sourate', 'juz', 'hizb', 'rub', 'page'];

export const KIND_LABEL = {
  sourate: 'Sourate',
  juz: 'Juz',
  hizb: 'Hizb',
  rub: 'Rub’',
  page: 'Page',
};

/** Tailles proposées au tirage au sort, en nombre de versets visé. */
export const SIZES = [
  { id: 'court', nom: 'Court', versets: 3 },
  { id: 'moyen', nom: 'Moyen', versets: 7 },
  { id: 'long', nom: 'Long', versets: 15 },
];
export const sizeById = (id) => SIZES.find((t) => t.id === id) || SIZES[1];

export function makeDivisions(corpus) {
  const D = corpus.data;
  const { OFFSETS, TOTAL, fromIndex, toIndex, surahMeta } = corpus;

  // Chaque famille devient un tableau d'index absolus de début, rangé par
  // numéro. Une division va donc de son début au début de la suivante.
  const debuts = (list) => list.map(([, s, a]) => toIndex(s, a));
  const JUZ = debuts(D.juz);
  const RUB = debuts(D.hizb);          // 240 quarts
  const PAGE = debuts(D.page);

  const FAMILLES = {
    sourate: { total: 114, debut: (n) => OFFSETS[n - 1] },
    juz: { total: 30, debut: (n) => JUZ[n - 1] },
    // Un hizb, c'est quatre quarts — la définition, pas une approximation.
    hizb: { total: 60, debut: (n) => RUB[(n - 1) * 4] },
    rub: { total: 240, debut: (n) => RUB[n - 1] },
    page: { total: 604, debut: (n) => PAGE[n - 1] },
  };

  const count = (kind) => (FAMILLES[kind] ? FAMILLES[kind].total : 0);

  /** Bornes absolues [début, fin) d'une division. */
  function bounds(kind, n) {
    const f = FAMILLES[kind];
    if (!f || n < 1 || n > f.total) return null;
    return { from: f.debut(n), to: n < f.total ? f.debut(n + 1) : TOTAL };
  }

  const versesBetween = (from, to) => {
    const out = [];
    for (let i = from; i < to; i++) {
      const [s, a] = fromIndex(i);
      out.push({ s, a });
    }
    return out;
  };

  /** Les versets d'une division, prêts à devenir une sélection. */
  function verses(kind, n) {
    const b = bounds(kind, n);
    return b ? versesBetween(b.from, b.to) : [];
  }

  /** Où tombe un verset dans chaque famille. Recherche dichotomique. */
  function locate(s, a) {
    const idx = toIndex(s, a);
    const rang = (starts) => {
      let lo = 0, hi = starts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid] <= idx) lo = mid; else hi = mid - 1;
      }
      return lo + 1;
    };
    const rub = rang(RUB);
    return { sourate: s, juz: rang(JUZ), hizb: Math.ceil(rub / 4), rub, page: rang(PAGE) };
  }

  /** « Juz 5 · An-Nisa 4:24 → Al-Ma'idah 5:81 », et le nombre de versets. */
  function describe(kind, n) {
    const b = bounds(kind, n);
    if (!b) return null;
    const [s1, a1] = fromIndex(b.from);
    const [s2, a2] = fromIndex(b.to - 1);
    return {
      kind, n,
      from: { s: s1, a: a1 },
      to: { s: s2, a: a2 },
      verses: b.to - b.from,
      title: kind === 'sourate' ? surahMeta(n).tr : `${KIND_LABEL[kind]} ${n}`,
      sub: s1 === s2 ? `${surahMeta(s1).tr} ${s1}:${a1}-${a2}` : `${s1}:${a1} → ${s2}:${a2}`,
    };
  }

  /**
   * Un passage au hasard.
   *
   * Le tirage est uniforme sur les 6 236 versets — aucune sourate n'est
   * favorisée, aucun jugement n'est porté sur ce qu'il faudrait réciter. La
   * suite reste dans UNE sourate : on ne récite pas à cheval sur deux.
   *
   * @param {() => number} rnd  générateur dans [0, 1[ — injecté, donc testable
   * @param {number} taille    nombre de versets visé
   */
  function randomPassage(rnd, taille) {
    const vise = Math.max(1, Math.floor(taille) || 1);
    const [s] = fromIndex(Math.min(TOTAL - 1, Math.floor(rnd() * TOTAL)));
    const n = surahMeta(s).n;
    const longueur = Math.min(vise, n);
    // Le départ est retiré parmi ceux qui laissent la place à la suite
    // entière : sinon les fins de sourate donneraient toujours un extrait
    // tronqué, et les derniers versets seraient sur-représentés.
    const depart = 1 + Math.floor(rnd() * (n - longueur + 1));
    const out = [];
    for (let a = depart; a < depart + longueur; a++) out.push({ s, a });
    return out;
  }

  return { KINDS, KIND_LABEL, SIZES, sizeById, count, bounds, verses, locate, describe, randomPassage };
}
