/**
 * Moteur tajwid — partagé entre le web et l'application native.
 *
 * Il ne produit PAS de HTML : il renvoie des segments {t, c}, où `c` est une
 * classe de règle ou null. Chaque plateforme les rend à sa façon — des <span>
 * sur le web, des <Text> imbriqués en React Native. La logique, elle, est
 * écrite une seule fois.
 *
 * Coloration volontairement CONSERVATRICE : seules les règles déterministes à
 * partir du texte othmanien vocalisé sont rendues. Dans le doute, aucune
 * couleur. Le mushaf imprimé reste la référence.
 */

const SHADDA = 'ّ';
const SUKUN = 'ْ';
const MADDAH = 'ٓ';
const TANWEEN = 'ًٌٍ';
const ROUND_ZERO = '۟';   // petit rond suscrit : lettre non prononcée
const RECT_ZERO = '۠';    // rectangle suscrit : non prononcée en liaison

const NOON = 'ن';
const MEEM = 'م';
const BA = 'ب';

const SET_QALQALA = new Set(['ق', 'ط', 'ب', 'ج', 'د']);
const SET_THROAT = new Set(['ء', 'أ', 'إ', 'آ', 'ؤ', 'ئ',
                            'ه', 'ع', 'ح', 'غ', 'خ']);
const SET_IDGHAM_GHUNNA = new Set(['ي', 'ن', 'م', 'و']);
const SET_IDGHAM_PLAIN = new Set(['ل', 'ر']);

/* Sièges de prolongation : alif nu, alif wasla, alif maqsura. Sans voyelle
   propre ils ne portent aucun son et doivent être traversés quand on cherche
   la lettre suivante — sinon un tanwin suivi de « …a l-… » est classé ikhfa
   au lieu d'idgham. */
const SEATS = new Set(['ا', 'ٱ', 'ى']);
const HARAKAT = 'ًٌٍَُِّْ';

const RE_LETTER = /[ء-يٮٯٱ-ۓۮۯۺ-ۿ]/;
const RE_MARK = /[ً-ٕٖ-ٰٟۖ-ۜ۟-۪ۨ-ۭ]/;
const RE_PAUSE = /[ۖ-ۜ۞]/;

/** Découpe en unités {base, marks}, espaces et signes de pause. */
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

const isSilent = (u) => u.marks.includes(ROUND_ZERO) || u.marks.includes(RECT_ZERO);
const isSeat = (u) => SEATS.has(u.base) && ![...u.marks].some((c) => HARAKAT.includes(c));

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

    if (isSilent(u)) { u.cls = 'silent'; continue; }
    if (u.marks.includes(MADDAH)) { u.cls = 'madd'; continue; }
    if ((u.base === NOON || u.base === MEEM) && u.marks.includes(SHADDA)) { u.cls = 'ghunna'; continue; }
    if (SET_QALQALA.has(u.base) && u.marks.includes(SUKUN)) { u.cls = 'qalqala'; continue; }

    const hasTanween = [...u.marks].some((c) => TANWEEN.includes(c));
    const isNoonSakin = u.base === NOON && u.marks.includes(SUKUN) && !u.marks.includes(SHADDA);
    if (hasTanween || isNoonSakin) {
      const nx = nextSounded(units, i);
      if (nx) {
        if (SET_IDGHAM_GHUNNA.has(nx.base)) u.cls = 'ghunna';
        else if (SET_IDGHAM_PLAIN.has(nx.base)) u.cls = 'silent';
        else if (nx.base === BA) u.cls = 'iqlab';
        else if (SET_THROAT.has(nx.base)) u.cls = null;    // idhar : lecture claire
        else u.cls = 'ikhfa';
      }
      continue;
    }

    if (u.base === MEEM && u.marks.includes(SUKUN)) {
      const nx = nextSounded(units, i);
      if (nx && nx.base === BA) u.cls = 'ikhfa';
      else if (nx && nx.base === MEEM) u.cls = 'ghunna';
    }
  }
  return units;
}

/**
 * Segments d'un verset. `c` vaut une classe de règle, 'mark' pour un signe de
 * pause, ou null. Les segments consécutifs de même classe sont fusionnés :
 * moins d'éléments à rendre, et le façonnage de l'arabe reste intact.
 */
export function tajwidSegments(text) {
  const units = classify(unitize(text));
  const out = [];
  for (const u of units) {
    const c = u.type === 'pause' ? 'mark' : u.type === 'unit' ? u.cls || null : null;
    const last = out[out.length - 1];
    if (last && last.c === c) last.t += u.raw;
    else out.push({ t: u.raw, c });
  }
  return out;
}

/** Segments sans coloration, pour le mode « noir simple ». */
export function plainSegments(text) {
  const out = [];
  for (const u of unitize(text)) {
    const c = u.type === 'pause' ? 'mark' : null;
    const last = out[out.length - 1];
    if (last && last.c === c) last.t += u.raw;
    else out.push({ t: u.raw, c });
  }
  return out;
}

export const TAJWID_RULES = [
  ['madd', 'Madd — allongement (4 à 6 temps)'],
  ['ghunna', 'Ghunna — nasalisation (2 temps)'],
  ['qalqala', 'Qalqala — rebond'],
  ['ikhfa', 'Ikhfa — dissimulation'],
  ['iqlab', 'Iqlab — permutation en mīm'],
  ['silent', 'Lettre non prononcée / assimilée'],
];
