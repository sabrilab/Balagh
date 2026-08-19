/**
 * Découpage du passage pour le télépromptage, côté natif.
 *
 * La logique vit dans `core/segments.mjs`, partagée avec le web. Ce qui change
 * ici, c'est la MESURE : il n'y a pas de DOM à interroger. On calibre donc une
 * fois la capacité d'une ligne, avec `onTextLayout` sur le verset le plus long
 * du corpus — assez long pour déborder largement, donc son rapport
 * caractères / lignes donne la vraie capacité d'une ligne dans cette police, à
 * cette taille, dans cette largeur.
 */
import { segmentPassage } from './core/segments.mjs';
import { verseAr, type VerseRef } from './corpus';
import type { Segment } from './store';

/** Al-Baqarah 2:282 — le verset le plus long. Il déborde toujours. */
export const CALIBRATION_TEXT = verseAr(2, 282);

export function makeFits(charsPerLine: number, maxLines: number) {
  // La tolérance de 0,35 ligne évite de couper un fragment qui n'entame la
  // ligne de trop que de quelques signes.
  const budget = charsPerLine * (maxLines + 0.35);
  return (s: string) => s.length <= budget;
}

/** Découpe la sélection. Sans calibration, chaque verset reste entier. */
export function computeSegments(selection: VerseRef[], charsPerLine: number, maxLines: number): Segment[] {
  if (!selection.length) return [];
  const fits = charsPerLine > 0 ? makeFits(charsPerLine, maxLines) : () => true;
  return segmentPassage(selection, verseAr, fits) as Segment[];
}

/** Taille du texte du deck : il occupe l'écran, c'est lui qu'on lit. */
export const deckFontSize = (width: number) => Math.max(24, Math.min(42, Math.round(width * 0.086)));
