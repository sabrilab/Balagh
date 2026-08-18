/**
 * Corpus vérifié, embarqué dans l'application.
 *
 * Le même fichier que celui du web, recopié par `npm run sync` à la racine du
 * dépôt. Aucun appel réseau : on récite là où on est, et un texte sacré ne
 * doit dépendre d'aucune disponibilité de serveur.
 */
import data from '../assets/quran.data.json';
import { makeCorpus } from './core/corpus.mjs';
import { makeSearch, THEMES } from './core/search.mjs';

export const corpus = makeCorpus(data as any);
const engine = makeSearch(corpus);

export const search = engine.search as (q: string, limit?: number) => { s: number; a: number; score: number; covered: number }[];
export const buildSearchIndex = engine.buildIndex as () => unknown;
export const themes = THEMES as [string, string][];
export { themes as THEMES };

export type SurahMeta = {
  i: number; ar: string; tr: string; fr: string; en: string;
  n: number; place: 'M' | 'D'; order: number; pre: 0 | 1; page: number;
};
export type VerseRef = { s: number; a: number };

export const SURAHS = corpus.SURAHS as SurahMeta[];
export const surahMeta = corpus.surahMeta as (s: number) => SurahMeta;
export const verseAr = corpus.verseAr as (s: number, a: number) => string;
export const verseTr = corpus.verseTr as (s: number, a: number, lang: string) => string;
export const refLabel = corpus.refLabel as (s: number, a: number) => string;
export const passageLabel = corpus.passageLabel as (list: VerseRef[]) => string;
export const basmala = corpus.basmala as { ar: string; fr: string; en: string };
export const meta = corpus.meta as any;
