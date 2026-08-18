/**
 * Rend un verset avec sa coloration tajwid.
 *
 * Le noyau renvoie des segments {t, c} ; ici on les emboîte dans un seul
 * <Text> parent. C'est ce qui préserve le façonnage de l'arabe : découper en
 * <Text> frères casserait les ligatures.
 */
import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { tajwidSegments, plainSegments } from '../core/tajwid.mjs';
import { ARABIC_FONT } from '../theme';
import { useTheme } from './ui';

const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
export const arNum = (n: number) => String(n).split('').map((d) => AR_DIGITS[+d]).join('');

type Seg = { t: string; c: string | null };

export function AyahText({ text, ayah, mode, size = 27, style }: {
  text: string; ayah?: number; mode: 'tajwid' | 'plain'; size?: number; style?: StyleProp<TextStyle>;
}) {
  const t = useTheme();
  const segs: Seg[] = mode === 'tajwid' ? tajwidSegments(text) : plainSegments(text);
  const colour = (c: string | null) => (c && c in t.tj ? (t.tj as Record<string, string>)[c] : t.label);

  return (
    <Text
      style={[{ fontFamily: ARABIC_FONT, fontSize: size, lineHeight: size * 2.05, color: t.label, writingDirection: 'rtl', textAlign: 'right' }, style]}
    >
      {segs.map((s, i) => (
        <Text key={i} style={mode === 'plain' ? undefined : { color: colour(s.c) }}>{s.t}</Text>
      ))}
      {ayah != null && <Text style={{ color: t.tint }}>{` ﴿${arNum(ayah)}﴾`}</Text>}
    </Text>
  );
}
