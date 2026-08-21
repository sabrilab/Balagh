import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useLayoutEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AyahText } from '../../src/components/AyahText';
import { Card, Screen, Segmented, useTheme } from '../../src/components/ui';
import { basmala, surahMeta, verseAr, verseTr } from '../../src/corpus';
import { TAJWID_RULES as RULES } from '../../src/core/tajwid.mjs';
const TAJWID_RULES = RULES as [string, string][];
import { HIT, space, type } from '../../src/theme';
import { setSelection, setState, toggleSelection, useStore } from '../../src/store';
import { Button } from '../../src/components/ui';
import { refLabel } from '../../src/corpus';

export default function Surah() {
  const t = useTheme();
  const nav = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = Math.max(1, Math.min(114, Number(id) || 1));
  const m = surahMeta(s);
  const mode = useStore((x) => x.mode);
  const tr = useStore((x) => x.tr);
  const selection = useStore((x) => x.selection);
  const rangeFrom = useStore((x) => x.rangeFrom);

  useLayoutEffect(() => { nav.setOptions({ title: m.tr }); }, [nav, m.tr]);

  const tousPris = selection.filter((v) => v.s === s).length >= m.n;

  /**
   * Plage en deux touches : la première pose le départ, la seconde l'arrivée.
   * Deux gestes simples valent mieux qu'un appui long, qui ne se découvre pas.
   */
  const range = (a: number) => {
    if (!rangeFrom) { setState({ rangeFrom: { s, a } }); return; }
    if (rangeFrom.s !== s) { setState({ rangeFrom: null }); return; }
    const [a1, a2] = rangeFrom.a <= a ? [rangeFrom.a, a] : [a, rangeFrom.a];
    setSelection(Array.from({ length: a2 - a1 + 1 }, (_, i) => ({ s, a: a1 + i })));
  };

  return (
    <Screen>
      <Card style={{ gap: space.s3 }}>
        <Segmented
          value={mode}
          onChange={(v) => setState({ mode: v })}
          options={[{ value: 'tajwid' as const, label: 'Tajwid' }, { value: 'plain' as const, label: 'Noir simple' }]}
        />
        <Segmented
          value={tr}
          onChange={(v) => setState({ tr: v })}
          options={[
            { value: 'fr' as const, label: 'Français' },
            { value: 'en' as const, label: 'English' },
            { value: 'none' as const, label: 'Arabe seul' },
          ]}
        />
        {mode === 'tajwid' && (
          <View style={styles.legend}>
            {TAJWID_RULES.map(([k, label]) => (
              <View key={k} style={styles.legendItem}>
                <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: (t.tj as Record<string, string>)[k] }} />
                <Text style={[type.footnote, { color: t.label2, flexShrink: 1 }]}>{label}</Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      <View style={{ flexDirection: 'row', gap: space.s2 }}>
        <Button
          label={tousPris ? 'Tout retirer' : 'Toute la sourate'}
          kind="grey"
          style={{ flex: 1 }}
          icon={<Ionicons name={tousPris ? 'close' : 'checkmark'} size={18} color={t.label} />}
          onPress={() => setSelection(tousPris ? [] : Array.from({ length: m.n }, (_, i) => ({ s, a: i + 1 })))}
        />
      </View>

      {!!rangeFrom && (
        <View style={[styles.range, { backgroundColor: t.tintBg }]}>
          <Ionicons name="log-in-outline" size={20} color={t.tint} />
          <Text style={[type.footnote, { color: t.label2, flex: 1 }]}>
            <Text style={{ fontWeight: '600', color: t.label }}>Plage ouverte à {refLabel(rangeFrom.s, rangeFrom.a)}.</Text>
            {' '}Touchez la même icône sur le verset d’arrivée.
          </Text>
          <Pressable accessibilityRole="button" onPress={() => setState({ rangeFrom: null })} style={styles.iconBtn}>
            <Text style={[type.footnote, { color: t.tint, fontWeight: '600' }]}>Annuler</Text>
          </Pressable>
        </View>
      )}

      <Card flush>
        {!!m.pre && (
          <Text style={{ fontFamily: 'AmiriQuran', fontSize: 25, lineHeight: 48, color: t.tint, textAlign: 'center', paddingVertical: space.s4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.separator }}>
            {basmala.ar}
          </Text>
        )}
        {Array.from({ length: m.n }, (_, k) => k + 1).map((a, i) => {
          const picked = selection.some((v) => v.s === s && v.a === a);
          return (
            <View key={a} style={[
              { padding: space.s4, backgroundColor: picked ? t.myrtleBg : 'transparent' },
              i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.separator },
            ]}>
              <View style={styles.verseHead}>
                <Text style={[type.footnote, { color: t.tint, fontWeight: '600' }]}>{s}:{a}</Text>
                <View style={{ flexDirection: 'row', marginRight: -space.s2 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={picked ? 'Retirer le verset de la sélection' : 'Ajouter le verset à la sélection'}
                    onPress={() => toggleSelection(s, a)}
                    style={styles.iconBtn}
                  >
                    <Ionicons name={picked ? 'checkmark' : 'add'} size={22} color={picked ? t.myrtle : t.label3} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={rangeFrom ? 'Terminer la plage ici' : 'Commencer une plage ici'}
                    onPress={() => range(a)}
                    style={styles.iconBtn}
                  >
                    <Ionicons name={rangeFrom ? 'log-out-outline' : 'log-in-outline'} size={22}
                      color={rangeFrom ? t.tint : t.label3} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Réciter ce verset"
                    onPress={() => { setSelection([{ s, a }]); router.push('/prompter'); }}
                    style={styles.iconBtn}
                  >
                    <Ionicons name="mic-outline" size={22} color={t.label3} />
                  </Pressable>
                </View>
              </View>
              <AyahText text={verseAr(s, a)} ayah={a} mode={mode} />
              {tr !== 'none' && <Text style={[type.callout, { color: t.label2, marginTop: space.s3 }]}>{verseTr(s, a, tr)}</Text>}
            </View>
          );
        })}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 158, flexGrow: 1 },
  verseHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.s2 },
  range: { flexDirection: 'row', alignItems: 'center', gap: space.s3, padding: space.s3, borderRadius: 14 },
  iconBtn: { width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' },
});
