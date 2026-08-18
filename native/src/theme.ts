/**
 * Jetons repris des Human Interface Guidelines.
 *
 * L'échelle typographique est celle d'iOS, au point près. Les rôles de couleur
 * suivent la nomenclature du système (label / fill / separator / fonds groupé),
 * et les trois niveaux de texte passent 4,5:1 sur les trois fonds — les valeurs
 * sont celles vérifiées côté web, réutilisées telles quelles.
 */
import { Platform } from 'react-native';

export const HIT = 44;          // cible tactile minimale
export const MARGIN = 16;       // marge d'écran en largeur compacte

export const type = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700' as const, letterSpacing: 0.37 },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const, letterSpacing: 0.36 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '600' as const, letterSpacing: 0.35 },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '600' as const, letterSpacing: 0.38 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const, letterSpacing: -0.41 },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400' as const, letterSpacing: -0.41 },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '400' as const, letterSpacing: -0.32 },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400' as const, letterSpacing: -0.24 },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const, letterSpacing: -0.08 },
  caption1: { fontSize: 12, lineHeight: 16, fontWeight: '400' as const, letterSpacing: 0 },
  caption2: { fontSize: 11, lineHeight: 13, fontWeight: '400' as const, letterSpacing: 0.07 },
};

const light = {
  bgGrouped: '#EFEFEC',
  bg: '#FBFBF9',
  raised: '#FFFFFF',
  label: '#111716',
  label2: '#4B534F',
  label3: '#626964',
  fill: 'rgba(17,23,22,0.05)',
  fill2: 'rgba(17,23,22,0.08)',
  separator: 'rgba(17,23,22,0.14)',
  separatorOpaque: '#DEDED9',
  tint: '#7A5A18',
  tintBg: '#F0E9D9',
  myrtle: '#245247',
  myrtleBg: '#DFE9E5',
  madder: '#8C3225',
  madderBg: '#F3E0DC',
  tj: {
    madd: '#8C3225', ghunna: '#1F5B41', qalqala: '#204D74',
    ikhfa: '#6B4E0C', iqlab: '#5C3378', silent: '#626964', mark: '#7A5A18',
  },
};

const dark: typeof light = {
  bgGrouped: '#070B0B',
  bg: '#0F1514',
  raised: '#171F1E',
  label: '#F1EFE7',
  label2: '#B5BDB8',
  label3: '#8E9691',
  fill: 'rgba(241,239,231,0.07)',
  fill2: 'rgba(241,239,231,0.11)',
  separator: 'rgba(241,239,231,0.16)',
  separatorOpaque: '#2A3332',
  tint: '#D8B778',
  tintBg: '#2B2517',
  myrtle: '#7FB6A2',
  myrtleBg: '#16241F',
  madder: '#E0897A',
  madderBg: '#2B1714',
  tj: {
    madd: '#E58F7C', ghunna: '#7FC79C', qalqala: '#8FB8E0',
    ikhfa: '#DCBB6C', iqlab: '#C3A6E0', silent: '#8E9691', mark: '#D8B778',
  },
};

export type Palette = typeof light;
export const palettes = { light, dark };

/** Rayons : 10 pt pour les listes groupées, comme le système. */
export const radius = { list: 10, card: 14, control: 12, sheet: 20 };
export const space = { s1: 4, s2: 8, s3: 12, s4: 16, s5: 20, s6: 24, s8: 32, s10: 40 };

/** Amiri Quran pour le texte sacré ; la police du système pour l'interface. */
export const ARABIC_FONT = Platform.select({ default: 'AmiriQuran' });
