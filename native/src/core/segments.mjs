/**
 * Segmentation d'un verset aux marques de pause (waqf).
 *
 * Un verset long tenu en un seul plan noie le spectateur. Le texte othmanien
 * porte déjà les endroits où la tradition autorise — ou impose — une pause :
 * on coupe là, pas ailleurs.
 *
 * Deux règles ont un poids qui dépasse l'affichage :
 *   - ۙ (لا) interdit l'arrêt. Couper là serait une faute, pas un défaut de mise
 *     en page.
 *   - ۛ (mu'anaqah) va par paire : on peut s'arrêter à l'une OU à l'autre,
 *     jamais aux deux. On retient donc la première et on interdit la seconde.
 *
 * Ce module ne mesure rien : il reçoit un prédicat `fits` fourni par la
 * plateforme, qui sait, lui, ce que le texte donne une fois rendu. Un seuil en
 * nombre de caractères serait faux — la même longueur ne fait pas le même
 * nombre de lignes selon la taille de police.
 */

export const WAQF = {
  'ۘ': { code: 'م',   nom: 'arrêt obligatoire',            coupe: true, rang: 4 },
  'ۗ': { code: 'قلى', nom: 's’arrêter vaut mieux',         coupe: true, rang: 3 },
  'ۚ': { code: 'ج',   nom: 'arrêt permis',                 coupe: true, rang: 2 },
  'ۖ': { code: 'صلى', nom: 'continuer vaut mieux',         coupe: true, rang: 1 },
  'ۙ': { code: 'لا',  nom: 'ne pas s’arrêter',             coupe: false },
  'ۛ': { code: '···', nom: 'mu’anaqah — l’une ou l’autre', coupe: 'paire' },
  'ۜ': { code: 'س',   nom: 'annotation de lecture',        coupe: false },
  '۞': { code: '۞',   nom: 'repère de hizb',               coupe: false },
};

/**
 * Points de pause d'un verset. `coupable` dit si l'endroit autorise une coupe ;
 * la seconde marque d'une mu'anaqah est explicitement refusée.
 */
export function waqfPoints(text) {
  const out = [];
  let muanaqahVue = false;
  for (let i = 0; i < text.length; i++) {
    const info = WAQF[text[i]];
    if (!info) continue;
    let coupable = info.coupe === true;
    if (info.coupe === 'paire') {
      coupable = !muanaqahVue;      // la première seulement
      muanaqahVue = true;
    }
    out.push({ index: i, char: text[i], code: info.code, nom: info.nom, rang: info.rang || 0, coupable });
  }
  return out;
}

/** Coupe la plus proche du milieu, à rang de marque égal on préfère l'équilibre. */
function meilleurePause(text, points, debut, fin) {
  const milieu = (debut + fin) / 2;
  const candidats = points.filter((p) => p.coupable && p.index > debut + 1 && p.index < fin - 1);
  if (!candidats.length) return null;
  const rangMax = Math.max(...candidats.map((p) => p.rang));
  const forts = candidats.filter((p) => p.rang === rangMax);
  return forts.reduce((a, b) => (Math.abs(b.index - milieu) < Math.abs(a.index - milieu) ? b : a));
}

/** Repli quand aucune pause n'est autorisée : la frontière de mot la plus centrale. */
function coupureTechnique(text, debut, fin) {
  const milieu = (debut + fin) / 2;
  let best = -1;
  for (let i = debut + 1; i < fin - 1; i++) {
    if (text[i] !== ' ') continue;
    if (best < 0 || Math.abs(i - milieu) < Math.abs(best - milieu)) best = i;
  }
  return best;
}

/**
 * Découpe un verset en segments qui tiennent.
 *
 * @param {string} text       texte othmanien du verset
 * @param {(s: string) => boolean} fits  vrai si le texte tient à l'écran
 * @param {number} [profondeurMax]  garde-fou contre une récursion sans fin
 * @returns {{text: string, mark: string|null, technique: boolean}[]}
 *          `mark` porte la marque de pause qui a motivé la coupe — null quand
 *          le segment se termine à la fin du verset, ou sur une coupe technique.
 */
export function segmentVerse(text, fits, profondeurMax = 6) {
  const points = waqfPoints(text);

  const decouper = (debut, fin, profondeur) => {
    const morceau = text.slice(debut, fin).trim();
    if (!morceau) return [];
    if (fits(morceau) || profondeur >= profondeurMax) {
      return [{ text: morceau, mark: null, technique: false }];
    }
    const pause = meilleurePause(text, points, debut, fin);
    if (pause) {
      const gauche = decouper(debut, pause.index, profondeur + 1);
      const droite = decouper(pause.index + 1, fin, profondeur + 1);
      if (gauche.length) gauche[gauche.length - 1].mark = pause.code;
      return [...gauche, ...droite];
    }
    const tech = coupureTechnique(text, debut, fin);
    if (tech < 0) return [{ text: morceau, mark: null, technique: false }];
    const gauche = decouper(debut, tech, profondeur + 1);
    const droite = decouper(tech + 1, fin, profondeur + 1);
    // Une coupe technique ne prétend pas être une pause : elle est signalée.
    if (gauche.length) gauche[gauche.length - 1].technique = true;
    return [...gauche, ...droite];
  };

  return decouper(0, text.length, 0);
}

/**
 * Découpe un passage entier. Chaque segment garde la référence de son verset,
 * son rang dans le verset, et le total — de quoi afficher « 2 / 3 » sans
 * perdre le fait qu'on est toujours dans le même verset.
 */
export function segmentPassage(verses, verseText, fits) {
  const out = [];
  for (const v of verses) {
    const parts = segmentVerse(verseText(v.s, v.a), fits);
    parts.forEach((p, i) => out.push({
      s: v.s, a: v.a, text: p.text, mark: p.mark, technique: p.technique,
      part: i + 1, parts: parts.length,
    }));
  }
  return out;
}
