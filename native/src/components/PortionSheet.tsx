/**
 * Feuille de choix d'une portion.
 *
 * Les découpes proposées sont celles du mushaf — sourate, juz, hizb, rub',
 * page —, pas des lots inventés pour l'occasion. Choisir une soirée de
 * récitation doit tenir en deux touches, pas en deux cents cases cochées.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useRef } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Segmented, useTheme } from './ui';
import { DIVISION_KINDS, DIVISION_LABEL, countOf, describe, locate, type Kind, type Portion } from '../divisions';
import { radius, space, type } from '../theme';
import type { VerseRef } from '../corpus';

export function PortionSheet({ visible, kind, onKind, onPick, onClose, current }: {
  visible: boolean;
  kind: Kind;
  onKind: (k: Kind) => void;
  onPick: (kind: Kind, n: number) => void;
  onClose: () => void;
  current: VerseRef | null;
}) {
  const t = useTheme();
  const liste = useRef<FlatList<number>>(null);

  const nums = useMemo(() => Array.from({ length: countOf(kind) }, (_, i) => i + 1), [kind]);
  const ici = current ? locate(current.s, current.a)[kind] : 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: t.bgGrouped, padding: space.s4, gap: space.s3 }}>
        <View style={styles.head}>
          <Text style={[type.title3, { flex: 1, color: t.label }]}>Une portion</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={onClose} style={styles.close}>
            <Ionicons name="close" size={24} color={t.label} />
          </Pressable>
        </View>

        <Segmented
          value={kind}
          onChange={(k) => onKind(k as Kind)}
          options={DIVISION_KINDS.map((k) => ({ value: k, label: DIVISION_LABEL[k] }))}
        />

        <FlatList
          ref={liste}
          data={nums}
          keyExtractor={(n) => String(n)}
          style={{ flex: 1, borderRadius: radius.card, backgroundColor: t.raised }}
          // Les lignes ont toutes la même hauteur : le dire évite à la liste de
          // mesurer 604 pages avant de pouvoir sauter à la bonne.
          getItemLayout={(_, i) => ({ length: 64, offset: 64 * i, index: i })}
          initialScrollIndex={ici > 2 ? ici - 2 : 0}
          renderItem={({ item: n, index }) => {
            const d = describe(kind, n) as Portion;
            const on = n === ici;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => onPick(kind, n)}
                style={[styles.row, {
                  height: 64,
                  backgroundColor: on ? t.fill : 'transparent',
                  borderTopWidth: index > 0 ? StyleSheet.hairlineWidth : 0,
                  borderTopColor: t.separator,
                }]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={[type.body, { color: t.label, fontWeight: '600' }]}>{d.title}</Text>
                  <Text numberOfLines={1} style={[type.footnote, { color: t.label3 }]}>{d.sub}</Text>
                </View>
                <Text style={[type.footnote, { color: t.label3, fontVariant: ['tabular-nums'] }]}>{d.verses}</Text>
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.s3 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s3, paddingHorizontal: space.s4 },
});
