/**
 * Primitives d'interface, calées sur les Human Interface Guidelines :
 * cibles de 44 pt, échelle typographique iOS, listes groupées en retrait,
 * séparateurs alignés sur le texte.
 */
import React from 'react';
import {
  Platform, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme,
  type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palettes, radius, space, type, HIT, MARGIN, type Palette } from '../theme';

export function useTheme(): Palette {
  const scheme = useColorScheme();
  return scheme === 'dark' ? palettes.dark : palettes.light;
}

export function Screen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  // iOS compense seul un en-tête transparent via contentInsetAdjustmentBehavior.
  // Android et le web ne le font pas : sans ce décalage, le titre recouvre la
  // première carte — et Android est justement le chemin d installation gratuit.
  // 56 dp est la hauteur d en-tête standard hors iOS.
  const topInset = Platform.OS === 'ios' ? 0 : insets.top + 56;
  return (
    <ScrollView
      style={[{ backgroundColor: t.bgGrouped }, style]}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        padding: MARGIN,
        paddingTop: MARGIN + topInset,
        paddingBottom: space.s10 * 2,
        gap: space.s5,
      }}
      keyboardDismissMode="on-drag"
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, flush }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; flush?: boolean }) {
  const t = useTheme();
  return (
    <View style={[{ backgroundColor: t.raised, borderRadius: radius.card, padding: flush ? 0 : space.s4, overflow: 'hidden' }, style]}>
      {children}
    </View>
  );
}

export function Section({ title, trailing, children }: { title?: string; trailing?: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: space.s2 }}>
      {(title || trailing) && (
        <View style={styles.sectionHead}>
          {!!title && <Text style={[type.callout, { color: t.label, fontWeight: '600' }]}>{title}</Text>}
          {!!trailing && <Text style={[type.footnote, { color: t.label3 }]}>{trailing}</Text>}
        </View>
      )}
      {children}
    </View>
  );
}

export function ListGroup({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <View style={{ backgroundColor: t.raised, borderRadius: radius.list, overflow: 'hidden' }}>{children}</View>;
}

export function Row({ lead, title, subtitle, trailing, onPress, first, children }: {
  lead?: React.ReactNode; title?: string; subtitle?: string; trailing?: React.ReactNode;
  onPress?: () => void; first?: boolean; children?: React.ReactNode;
}) {
  const t = useTheme();
  const body = (
    <View style={[styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.separator }]}>
      {lead}
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        {children ?? (
          <>
            {!!title && <Text numberOfLines={1} style={[type.body, { color: t.label }]}>{title}</Text>}
            {!!subtitle && <Text numberOfLines={1} style={[type.footnote, { color: t.label3 }]}>{subtitle}</Text>}
          </>
        )}
      </View>
      {trailing}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} android_ripple={{ color: t.fill }}
      style={({ pressed }) => [pressed && { backgroundColor: t.fill }]}>
      {body}
    </Pressable>
  );
}

export function Button({ label, onPress, kind = 'plain', icon, disabled, style }: {
  label: string; onPress?: () => void; kind?: 'filled' | 'tinted' | 'plain' | 'grey';
  icon?: React.ReactNode; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg = kind === 'filled' ? t.label : kind === 'tinted' ? t.tintBg : kind === 'grey' ? t.fill : 'transparent';
  const fg = kind === 'filled' ? t.bg : kind === 'tinted' ? t.tint : kind === 'grey' ? t.label : t.tint;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.72 : 1 },
        style,
      ]}
    >
      {icon}
      <Text style={[type.body, { color: fg, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  const t = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: t.fill2 }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="button" accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, on && { backgroundColor: t.raised }]}>
            <Text numberOfLines={1} style={[type.footnote, { color: t.label, fontWeight: on ? '600' : '400' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!active }} onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: active ? t.tint : t.raised, borderColor: active ? t.tint : t.separator, opacity: pressed ? 0.75 : 1 },
      ]}>
      <Text style={[type.subhead, { color: active ? t.raised : t.label2, fontWeight: active ? '600' : '500' }]}>{label}</Text>
    </Pressable>
  );
}

export function Notice({ children, tone = 'tint' }: { children: React.ReactNode; tone?: 'tint' | 'madder' }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: tone === 'tint' ? t.tintBg : t.madderBg, borderRadius: radius.card, padding: space.s4 }}>
      <Text style={[type.footnote, { color: t.label2 }]}>{children}</Text>
    </View>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ paddingVertical: space.s10, paddingHorizontal: space.s5, alignItems: 'center', gap: space.s2 }}>
      <Text style={[type.title3, { color: t.label, textAlign: 'center' }]}>{title}</Text>
      {!!children && <Text style={[type.subhead, { color: t.label3, textAlign: 'center' }]}>{children}</Text>}
    </View>
  );
}

export function KeyValue({ k, v, first }: { k: string; v: string; first?: boolean }) {
  const t = useTheme();
  return (
    <View style={[styles.kv, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.separator }]}>
      <Text style={[type.subhead, { color: t.label3 }]}>{k}</Text>
      <Text style={[type.subhead, { color: t.label, flexShrink: 1, textAlign: 'right' }]}>{v}</Text>
    </View>
  );
}

export function Badge({ label, tone = 'tint' }: { label: string; tone?: 'tint' | 'myrtle' | 'madder' }) {
  const t = useTheme();
  const bg = tone === 'tint' ? t.tintBg : tone === 'myrtle' ? t.myrtleBg : t.madderBg;
  const fg = tone === 'tint' ? t.tint : tone === 'myrtle' ? t.myrtle : t.madder;
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: space.s2, paddingVertical: 3 }}>
      <Text style={[type.caption2, { color: fg, fontWeight: '600' }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.s2, paddingHorizontal: space.s1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s3, minHeight: HIT, paddingHorizontal: space.s4, paddingVertical: space.s2 },
  button: { minHeight: HIT, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.s2, paddingHorizontal: space.s5, borderRadius: radius.control },
  segmented: { flexDirection: 'row', padding: 2, gap: 2, borderRadius: 9, minHeight: 36 },
  segment: { flex: 1, minHeight: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 7, paddingHorizontal: space.s2 },
  chip: { minHeight: HIT, justifyContent: 'center', paddingHorizontal: space.s4, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  kv: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.s4, paddingVertical: space.s2 },
});
