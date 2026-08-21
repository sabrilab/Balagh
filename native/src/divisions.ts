/**
 * Les découpes du mushaf, côté natif.
 *
 * Même module que le web (`core/divisions.mjs`), même corpus vérifié : sourate,
 * juz, hizb, rub' al-hizb et page viennent des métadonnées de l'édition Tanzil,
 * confrontées au texte à la compilation. Rien n'est recalculé ici.
 */
import { makeDivisions, KINDS, KIND_LABEL, SIZES, sizeById } from './core/divisions.mjs';
import { corpus, type VerseRef } from './corpus';
import type { Segment } from './store';

export type Kind = 'sourate' | 'juz' | 'hizb' | 'rub' | 'page';
export type Portion = {
  kind: Kind; n: number;
  from: VerseRef; to: VerseRef;
  verses: number; title: string; sub: string;
};

const D = makeDivisions(corpus);

export const DIVISION_KINDS = KINDS as Kind[];
export const DIVISION_LABEL = KIND_LABEL as Record<Kind, string>;
export const RANDOM_SIZES = SIZES as { id: string; nom: string; versets: number }[];
export const randomSizeById = sizeById as (id: string) => { id: string; nom: string; versets: number };

export const countOf = D.count as (kind: Kind) => number;
export const versesOf = D.verses as (kind: Kind, n: number) => VerseRef[];
export const describe = D.describe as (kind: Kind, n: number) => Portion | null;
export const locate = D.locate as (s: number, a: number) => Record<Kind, number>;

/** Un passage au hasard : uniforme sur les 6 236 versets, dans une seule sourate. */
export const randomPassage = (taille: number): VerseRef[] =>
  D.randomPassage(Math.random, taille) as VerseRef[];

/** « Juz 3 · page 42 » — où se trouve un passage dans le mushaf. */
export function situation(list: VerseRef[]): string {
  if (!list.length) return '';
  const a = locate(list[0].s, list[0].a);
  const b = locate(list[list.length - 1].s, list[list.length - 1].a);
  const plage = (x: number, y: number, nom: string) => (x === y ? `${nom} ${x}` : `${nom} ${x}–${y}`);
  return `${plage(a.juz, b.juz, 'Juz')} · ${plage(a.page, b.page, 'page')}`;
}

export type { Segment };
