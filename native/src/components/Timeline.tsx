/**
 * La barre de montage.
 *
 * Pas de canvas en natif : la forme d'onde est une rangée de vues, et les
 * repères se posent par-dessus en position absolue. C'est suffisant pour cent
 * vingt barres, et cela évite une dépendance de dessin de plus.
 *
 * On y pointe pour se placer, on y glisse pour parcourir — le geste attendu
 * d'un lecteur iOS.
 */
import { useRef, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { useTheme } from './ui';
import type { Region } from '../store';

export type Marker = { at: number };

export function Timeline({ peaks, regions, total, playAt, selected, cues, onSeek, height = 108 }: {
  peaks: number[];
  regions: Region[];
  total: number;
  playAt: number;
  selected: number | null;
  cues: number[];
  onSeek: (sec: number) => void;
  height?: number;
}) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const box = useRef(0);

  const onLayout = (e: LayoutChangeEvent) => {
    box.current = e.nativeEvent.layout.width;
    setWidth(e.nativeEvent.layout.width);
  };
  const seek = (e: GestureResponderEvent) => {
    if (!box.current) return;
    const x = Math.max(0, Math.min(box.current, e.nativeEvent.locationX));
    onSeek((x / box.current) * total);
  };

  const x = (sec: number) => (total > 0 ? (sec / total) * width : 0);
  const played = x(playAt);

  // Bornes de chaque morceau, en temps de montage.
  const bounds: { start: number; end: number; id: number }[] = [];
  let acc = 0;
  for (const r of regions) {
    const len = Math.max(0, r.end - r.start);
    bounds.push({ start: acc, end: acc + len, id: r.id });
    acc += len;
  }
  const current = bounds.find((b) => b.id === selected);

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel="Tête de lecture"
      onLayout={onLayout}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={seek}
      onResponderMove={seek}
      style={[styles.box, { height, backgroundColor: t.fill }]}
    >
      {regions.length > 1 && current && (
        <View style={[styles.abs, {
          left: x(current.start), width: Math.max(3, x(current.end) - x(current.start)),
          top: 0, bottom: 0, backgroundColor: t.fill2,
        }]} />
      )}

      <View style={styles.bars} pointerEvents="none">
        {peaks.map((p, i) => {
          const cx = width ? (i / peaks.length) * width : 0;
          return (
            <View key={i} style={{
              flex: 1,
              height: Math.max(2, p * (height - 14)),
              backgroundColor: cx <= played ? t.label : t.separatorOpaque,
              borderRadius: 1,
            }} />
          );
        })}
      </View>

      {/* Passages d'un segment de texte au suivant : deux encoches. */}
      {cues.map((c, i) => (
        <View key={`c${i}`} pointerEvents="none">
          <View style={[styles.abs, { left: x(c), width: 1, top: 0, height: height * 0.26, backgroundColor: t.label3, opacity: 0.5 }]} />
          <View style={[styles.abs, { left: x(c), width: 1, bottom: 0, height: height * 0.26, backgroundColor: t.label3, opacity: 0.5 }]} />
        </View>
      ))}

      {/* Coupes du montage : un trait franc, sur toute la hauteur. */}
      {bounds.slice(0, -1).map((b) => (
        <View key={`b${b.id}`} pointerEvents="none"
          style={[styles.abs, { left: x(b.end) - 1, width: 2, top: 0, bottom: 0, backgroundColor: t.madder }]} />
      ))}

      <View pointerEvents="none"
        style={[styles.abs, { left: Math.max(0, Math.min(width - 2, played - 1)), width: 2, top: 0, bottom: 0, backgroundColor: t.tint }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 12, overflow: 'hidden', justifyContent: 'center' },
  bars: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 1, paddingHorizontal: 2 },
  abs: { position: 'absolute' },
});
