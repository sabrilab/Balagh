/**
 * Les signes de pause, retrouvés depuis le code renvoyé par le découpage.
 *
 * `core/segments.mjs` est indexé par le signe et renvoie son code ; l'affichage
 * a besoin du chemin inverse — montrer le signe du mushaf et le nommer.
 */
import { WAQF } from './core/segments.mjs';

export type WaqfInfo = { signe: string; code: string; nom: string };

export const WAQF_BY_CODE: Record<string, WaqfInfo> = Object.fromEntries(
  Object.entries(WAQF as Record<string, { code: string; nom: string }>)
    .map(([signe, info]) => [info.code, { signe, code: info.code, nom: info.nom }]),
);
