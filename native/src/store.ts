/**
 * État applicatif. Un magasin externe minuscule branché sur
 * useSyncExternalStore : pas de dépendance, pas de contexte à traverser, et le
 * moteur audio peut lire l'état sans être un composant.
 */
import { useSyncExternalStore } from 'react';
import type { VerseRef } from './corpus';
import { newRegion, totalDuration } from './core/edit.mjs';

/** Une carte du télépromptage : un verset entier, ou un fragment coupé à un waqf. */
export type Segment = {
  s: number; a: number;
  text: string;
  mark: string | null;
  technique: boolean;
  part: number; parts: number;
};

/** Un morceau du montage : un intervalle dans la prise d'origine. */
export type Region = { id: number; start: number; end: number };

export type Take = {
  id: number;
  name: string;
  label: string;
  uri: string;
  /** Durée de la SOURCE. Le montage a la sienne, voir `editedDuration`. */
  duration: number;
  verses: VerseRef[];
  /** Le découpage suivi pendant la récitation : c'est lui que suivra la vidéo. */
  segments: Segment[];
  /** Instants, en temps de source, où le récitant est passé au segment suivant. */
  cues: number[];
  /** Montage non destructif : la prise n'est jamais réécrite. */
  regions: Region[];
  /** Canal mono décodé, gardé pour dessiner la forme d'onde. */
  peaks: number[];
};

export type State = {
  mode: 'tajwid' | 'plain';
  tr: 'fr' | 'en' | 'none';
  selection: VerseRef[];
  takes: Take[];
  currentTakeId: number | null;
  preset: string;
  wet: number | null;
  presence: number;
  premium: boolean;
  prompterSpeed: number;
  /** Longueur visée par le tirage au sort, et famille de portions ouverte. */
  randomSize: string;
  kind: string;
  rangeFrom: VerseRef | null;
  /** Découpage courant de la sélection, recalculé à l'entrée du télépromptage. */
  segments: Segment[] | null;
  maxLines: number;
  /** Capacité mesurée d'une ligne du deck, en caractères. */
  charsPerLine: number;
  region: number | null;
  playAt: number;
};

let state: State = {
  mode: 'tajwid',
  tr: 'fr',
  selection: [],
  takes: [],
  currentTakeId: null,
  preset: 'quartier',
  wet: null,
  presence: 2.5,
  premium: false,
  prompterSpeed: 26,
  randomSize: 'moyen',
  kind: 'juz',
  rangeFrom: null,
  segments: null,
  maxLines: 3,
  charsPerLine: 0,
  region: null,
  playAt: 0,
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const getState = () => state;
export function setState(patch: Partial<State> | ((s: State) => Partial<State>)) {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...next };
  emit();
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => select(state), () => select(state));
}

/* --- opérations dérivées ------------------------------------------------ */

export const inSelection = (s: number, a: number) =>
  state.selection.some((v) => v.s === s && v.a === a);

export function toggleSelection(s: number, a: number) {
  const i = state.selection.findIndex((v) => v.s === s && v.a === a);
  const next = state.selection.slice();
  if (i >= 0) next.splice(i, 1);
  else { next.push({ s, a }); next.sort((x, y) => x.s - y.s || x.a - y.a); }
  setState({ selection: next, segments: null, rangeFrom: null });
}

/**
 * Remplace la sélection d'un bloc.
 *
 * Toute entrée par lot passe par là — portion, plage, tirage au sort — pour que
 * le découpage soit invalidé au même endroit : il dépend de la sélection, et le
 * garder afficherait les cartes du passage précédent.
 */
export function setSelection(list: VerseRef[]) {
  setState({ selection: list.slice(), segments: null, rangeFrom: null });
}

export const currentTake = () => state.takes.find((t) => t.id === state.currentTakeId) || null;

let seq = 0;
export function addTake(t: Omit<Take, 'id' | 'name' | 'regions'> & { regions?: Region[] }) {
  const regions = t.regions && t.regions.length ? t.regions : [newRegion(0, t.duration)];
  const take: Take = { ...t, regions, id: ++seq, name: `Prise ${seq}` };
  setState((s) => ({ takes: [take, ...s.takes], currentTakeId: take.id, region: regions[0].id, playAt: 0 }));
  return take;
}

/** Durée réellement lue et exportée — celle du montage, pas de la source. */
export const editedDuration = (t: Take) => totalDuration(t.regions) as number;

/** Remplace le montage d'une prise. La prise d'origine reste intacte. */
export function setRegions(id: number, regions: Region[]) {
  setState((s) => ({
    takes: s.takes.map((t) => (t.id === id ? { ...t, regions } : t)),
    region: regions.some((r) => r.id === s.region) ? s.region : (regions[0]?.id ?? null),
    playAt: Math.min(s.playAt, totalDuration(regions) as number),
  }));
}

export function removeTake(id: number) {
  setState((s) => ({
    takes: s.takes.filter((t) => t.id !== id),
    currentTakeId: s.currentTakeId === id ? (s.takes.find((t) => t.id !== id)?.id ?? null) : s.currentTakeId,
  }));
}
