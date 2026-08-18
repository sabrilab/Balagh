/** Accès au corpus vérifié. Aucune dépendance de plateforme. */
export function makeCorpus(D) {
  const SURAHS = D.surahs;
  const cache = { ar: new Array(114), fr: new Array(114), en: new Array(114) };

  function ayat(surah, lang) {
    const i = surah - 1;
    if (!cache[lang][i]) cache[lang][i] = D[lang][i].split('\n');
    return cache[lang][i];
  }

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

  const surahMeta = (s) => SURAHS[s - 1];
  const verseAr = (s, a) => ayat(s, 'ar')[a - 1];
  const verseTr = (s, a, lang) => ayat(s, lang === 'en' ? 'en' : 'fr')[a - 1];
  const refLabel = (s, a) => `${surahMeta(s).tr} ${s}:${a}`;

  /** Libellé lisible d'un passage : plage contiguë quand c'en est une. */
  function passageLabel(list) {
    if (!list.length) return '';
    const first = list[0];
    if (list.length === 1) return refLabel(first.s, first.a);
    const contigu = list.every((v, i) => v.s === first.s && v.a === first.a + i);
    if (contigu) return `${surahMeta(first.s).tr} ${first.s}:${first.a}-${list[list.length - 1].a}`;
    return `${refLabel(first.s, first.a)} et ${list.length - 1} autre${list.length > 2 ? 's' : ''}`;
  }

  return {
    data: D, SURAHS, TOTAL, OFFSETS, ayat, fromIndex,
    toIndex: (s, a) => OFFSETS[s - 1] + a - 1,
    surahMeta, verseAr, verseTr, refLabel, passageLabel,
    basmala: D.basmala, meta: D.meta,
  };
}
