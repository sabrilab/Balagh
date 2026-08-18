/**
 * État applicatif. Un magasin externe minuscule branché sur
 * useSyncExternalStore : pas de dépendance, pas de contexte à traverser, et le
 * moteur audio peut lire l'état sans être un composant.
 */
import { useSyncExternalStore } from 'react';
import type { VerseRef } from './corpus';

export type Take = {
  id: number;
  name: string;
  label: string;
  uri: string;
  duration: number;
  verses: VerseRef[];
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
  setState({ selection: next });
}

export const currentTake = () => state.takes.find((t) => t.id === state.currentTakeId) || null;

let seq = 0;
export function addTake(t: Omit<Take, 'id' | 'name'>) {
  const take: Take = { ...t, id: ++seq, name: `Prise ${seq}` };
  setState((s) => ({ takes: [take, ...s.takes], currentTakeId: take.id }));
  return take;
}

export function removeTake(id: number) {
  setState((s) => ({
    takes: s.takes.filter((t) => t.id !== id),
    currentTakeId: s.currentTakeId === id ? (s.takes.find((t) => t.id !== id)?.id ?? null) : s.currentTakeId,
  }));
}
