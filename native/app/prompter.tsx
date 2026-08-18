import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AyahText } from '../src/components/AyahText';
import { useTheme } from '../src/components/ui';
import { passageLabel, refLabel, verseAr, verseTr } from '../src/corpus';
import { decodeTake, startRecording, stopRecording, takePeaks } from '../src/audio/engine';
import { space, type } from '../src/theme';
import { addTake, getState, useStore } from '../src/store';

export default function Prompter() {
  const t = useTheme();
  const selection = useStore((s) => s.selection);
  const mode = useStore((s) => s.mode);
  const tr = useStore((s) => s.tr);
  const speed = useStore((s) => s.prompterSpeed);

  const [phase, setPhase] = useState<'idle' | 'count' | 'rec' | 'saving'>('idle');
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const scroller = useRef<ScrollView>(null);
  const offset = useRef(0);

  useEffect(() => {
    if (phase !== 'rec') return;
    const tick = setInterval(() => setElapsed((performance.now() - startedAt.current) / 1000), 100);
    const scroll = speed > 0
      ? setInterval(() => {
          offset.current += speed / 10;
          scroller.current?.scrollTo({ y: offset.current, animated: false });
        }, 100)
      : undefined;
    return () => { clearInterval(tick); if (scroll) clearInterval(scroll); };
  }, [phase, speed]);

  const begin = async () => {
    setPhase('count');
    for (const n of [3, 2, 1]) {
      setCount(n);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      await new Promise((r) => setTimeout(r, 800));
    }
    try {
      await startRecording();
    } catch {
      setPhase('idle');
      return;
    }
    startedAt.current = performance.now();
    setElapsed(0);
    setPhase('rec');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const finish = async () => {
    setPhase('saving');
    const uri = await stopRecording();
    if (!uri) { setPhase('idle'); return; }
    try {
      const buffer = await decodeTake(uri);
      const verses = getState().selection.slice();
      addTake({
        uri,
        duration: buffer.duration,
        verses,
        label: passageLabel(verses),
        peaks: takePeaks(buffer),
      });
      router.replace('/review');
    } catch {
      setPhase('idle');
    }
  };

  const mmss = `${Math.floor(elapsed / 60)}:${String(Math.floor(elapsed % 60)).padStart(2, '0')}.${Math.floor((elapsed % 1) * 10)}`;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView ref={scroller} contentContainerStyle={{ padding: space.s5, paddingTop: space.s10, paddingBottom: 160 }}>
        {selection.map((v) => (
          <View key={`${v.s}:${v.a}`} style={{ paddingVertical: space.s5 }}>
            <Text style={[type.footnote, { color: t.tint, fontWeight: '600', marginBottom: space.s3 }]}>{refLabel(v.s, v.a)}</Text>
            <AyahText text={verseAr(v.s, v.a)} ayah={v.a} mode={mode} size={31} />
            {tr !== 'none' && <Text style={[type.callout, { color: t.label2, marginTop: space.s3 }]}>{verseTr(v.s, v.a, tr)}</Text>}
          </View>
        ))}
      </ScrollView>

      {phase === 'count' && (
        <View style={styles.countdown} pointerEvents="none">
          <Text style={{ fontSize: 104, fontWeight: '700', color: t.tint }}>{count}</Text>
        </View>
      )}

      <View style={[styles.bar, { backgroundColor: t.raised, borderTopColor: t.separator }]}>
        <View style={styles.barTop}>
          <Text style={[type.title2, { color: t.label, fontVariant: ['tabular-nums'] }]}>{mmss}</Text>
          <Text style={[type.footnote, { color: phase === 'rec' ? t.madder : t.label3, fontWeight: '600' }]}>
            {phase === 'rec' ? 'Enregistrement' : phase === 'saving' ? 'Traitement…' : 'Prêt à enregistrer'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={phase === 'rec' ? 'Arrêter l’enregistrement' : 'Démarrer l’enregistrement'}
          disabled={phase === 'count' || phase === 'saving'}
          onPress={phase === 'rec' ? finish : begin}
          style={({ pressed }) => [styles.recBtn, { borderColor: t.separatorOpaque, backgroundColor: t.raised, transform: [{ scale: pressed ? 0.94 : 1 }] }]}
        >
          <View style={{
            backgroundColor: t.madder,
            width: phase === 'rec' ? 28 : 52,
            height: phase === 'rec' ? 28 : 52,
            borderRadius: phase === 'rec' ? 8 : 26,
          }} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  countdown: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  bar: { paddingHorizontal: space.s4, paddingTop: space.s4, paddingBottom: space.s8, gap: space.s3, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  barTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  recBtn: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
});
