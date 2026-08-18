/**
 * Recherche par EXTRACTION. Un index inverse est construit sur les traductions
 * vérifiées et sur l'arabe normalisé ; tout résultat est un verset existant du
 * corpus, rendu avec sa référence exacte. Rien n'est rédigé ici.
 */

const STOP = new Set(('a ai au aux avec ce ces dans de des du elle en est et eux il ils je la le les leur lui ma mais me meme mes moi mon ne nos notre nous on ou par pas pour qu que qui sa se ses son sur ta te tes toi ton tu un une vos votre vous y d l n s c j m t est sont etre avoir plus tout tous toute toutes cela celui ceux dont ainsi donc alors comme quand the of and to in is are that for it with as be on at by an or from this these those what which').split(' '));

export const deAccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const AR_DIACRITICS = /[ً-ٰٟۖ-ۭ]/g;
const normAr = (s) => s.replace(AR_DIACRITICS, '')
  .replace(/[آأإٱ]/g, 'ا')
  .replace(/ى/g, 'ي')
  .replace(/ة/g, 'ه')
  .replace(/ـ/g, '');

export function tokenize(s) {
  const isArabic = /[؀-ۿ]/.test(s);
  const base = isArabic ? normAr(s) : deAccent(s.toLowerCase());
  return base.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1 && !STOP.has(t));
}

export function makeSearch(corpus) {
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
      const fr = corpus.ayat(s, 'fr'), en = corpus.ayat(s, 'en'), ar = corpus.ayat(s, 'ar');
      const off = corpus.OFFSETS[s - 1];
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

  /** Extension morphologique légère : « patience » trouve aussi « patient ». */
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
    const matched = new Map();

    terms.forEach((term) => {
      expand(term, map).forEach((v) => {
        const posting = map.get(v);
        if (!posting) return;
        const idf = Math.log(1 + corpus.TOTAL / posting.length);
        const exact = v === term ? 1 : 0.62;
        posting.forEach((idx) => {
          scores.set(idx, (scores.get(idx) || 0) + idf * exact);
          let set = matched.get(idx);
          if (!set) matched.set(idx, (set = new Set()));
          set.add(term);
        });
      });
    });
    if (!scores.size) return [];

    const out = [];
    scores.forEach((score, idx) => {
      const covered = matched.get(idx).size;
      // Couvrir tous les mots pèse plus lourd que répéter un mot rare.
      out.push({ idx, score: score * (1 + 1.9 * ((covered - 1) / Math.max(1, terms.length - 1) || 0)), covered });
    });
    out.sort((a, b) => b.covered - a.covered || b.score - a.score || a.idx - b.idx);
    return out.slice(0, limit || 40).map((r) => {
      const [s, a] = corpus.fromIndex(r.idx);
      return { s, a, score: r.score, covered: r.covered };
    });
  }

  return { search, buildIndex };
}

/** Les thèmes sont des REQUÊTES, pas des listes de références apprises. */
export const THEMES = [
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
