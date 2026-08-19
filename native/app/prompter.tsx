/**
 * Télépromptage.
 *
 * Le texte ne défile plus tout seul : on glisse. Une carte par segment, le
 * défilement paginé d'iOS, et chaque passage à la carte suivante est horodaté.
 * C'est ce qui rend le rendu vidéo exact — le repère n'est plus estimé au
 * prorata des signes, il est posé par le récitant, à l'instant où il change.
 */
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, View,
  type LayoutChangeEvent, type NativeSyntheticEvent, type TextLayoutEventData,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { AyahText } from '../src/components/AyahText';
import { useTheme } from '../src/components/ui';
import { passageLabel, refLabel, verseAr, verseTr } from '../src/corpus';
import { decodeTake, startRecording, stopRecording, takePeaks } from '../src/audio/engine';
import { CALIBRATION_TEXT, computeSegments, deckFontSize } from '../src/segments';
import { ARABIC_FONT, space, type } from '../src/theme';
import { WAQF_BY_CODE } from '../src/waqf';
import { addTake, getState, setState, useStore, type Segment } from '../src/store';

export default function Prompter() {
  const t = useTheme();
  const selection = useStore((s) => s.selection);
  const mode = useStore((s) => s.mode);
  const tr = useStore((s) => s.tr);
  const segments = useStore((s) => s.segments);
  const charsPerLine = useStore((s) => s.charsPerLine);
  const maxLines = useStore((s) => s.maxLines);

  const [phase, setPhase] = useState<'idle' | 'count' | 'rec' | 'saving'>('idle');
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState({ w: 0, h: 0 });

  const startedAt = useRef(0);
  const cues = useRef<number[]>([0]);
  const deck = useRef<ScrollView>(null);
  const fontSize = deckFontSize(box.w || 390);

  /* --- calibration : combien de caractères tiennent sur une ligne ---------- */
  const onCalibrate = (e: NativeSyntheticEvent<TextLayoutEventData>) => {
    const lines = e.nativeEvent.lines.length;
    if (!lines) return;
    const perLine = CALIBRATION_TEXT.length / lines;
    if (Math.abs(perLine - charsPerLine) > 0.5) setState({ charsPerLine: perLine, segments: null });
  };

  /* --- découpage : refait dès que la mesure ou la sélection change --------- */
  useEffect(() => {
    if (phase !== 'idle') return;          // jamais pendant une récitation
    if (segments && segments.length) return;
    if (!selection.length) return;
    setState({ segments: computeSegments(selection, charsPerLine, maxLines) });
    setIndex(0);
  }, [selection, charsPerLine, maxLines, segments, phase]);

  const cards: Segment[] = useMemo(
    () => (segments && segments.length
      ? segments
      : selection.map((v) => ({ s: v.s, a: v.a, text: verseAr(v.s, v.a), mark: null, technique: false, part: 1, parts: 1 }))),
    [segments, selection],
  );

  useEffect(() => {
    if (phase !== 'rec') return;
    const tick = setInterval(() => setElapsed((performance.now() - startedAt.current) / 1000), 100);
    return () => clearInterval(tick);
  }, [phase]);

  /** Le passage à la carte suivante est horodaté : c'est le repère de la vidéo. */
  const goTo = (next: number, fromGesture: boolean) => {
    const i = Math.max(0, Math.min(cards.length - 1, next));
    if (i === index) return;
    if (phase === 'rec') {
      const now = (performance.now() - startedAt.current) / 1000;
      if (i > index) cues.current[i] = now;
      else cues.current.length = Math.max(1, i + 1);
      Haptics.selectionAsync().catch(() => {});
    }
    setIndex(i);
    if (!fromGesture && box.h) deck.current?.scrollTo({ y: i * box.h, animated: true });
  };

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
    cues.current = [0];
    setElapsed(0);
    setIndex(0);
    deck.current?.scrollTo({ y: 0, animated: false });
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
        segments: cards,
        cues: cues.current.slice(),
        label: passageLabel(verses),
        peaks: takePeaks(buffer),
      });
      router.replace('/review');
    } catch {
      setPhase('idle');
    }
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox({ w: width, h: height });
  };

  const mmss = `${Math.floor(elapsed / 60)}:${String(Math.floor(elapsed % 60)).padStart(2, '0')}`;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {/* Sonde de mesure : hors écran, dans la police et la largeur du deck. */}
      <View style={styles.probe} pointerEvents="none" aria-hidden>
        <Text
          onTextLayout={onCalibrate}
          style={{ fontFamily: ARABIC_FONT, fontSize, lineHeight: fontSize * 2.05, writingDirection: 'rtl', textAlign: 'right' }}
        >
          {CALIBRATION_TEXT}
        </Text>
      </View>

      {/* Rail de progression : une barre par segment. */}
      <View style={[styles.rail, { paddingHorizontal: space.s4 }]} pointerEvents="none">
        {cards.map((_, i) => (
          <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= index ? t.label : t.separatorOpaque }} />
        ))}
      </View>

      <View style={{ flex: 1 }} onLayout={onLayout}>
        {box.h > 0 && (
          <ScrollView
            ref={deck}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            decelerationRate="fast"
            onMomentumScrollEnd={(e) => goTo(Math.round(e.nativeEvent.contentOffset.y / box.h), true)}
          >
            {cards.map((g, i) => {
              const w = g.mark ? WAQF_BY_CODE[g.mark] : null;
              return (
                <View key={`${g.s}:${g.a}:${g.part}`} style={[styles.card, { height: box.h, opacity: i === index ? 1 : 0.18 }]}>
                  <Text style={[type.footnote, { color: t.label3, fontWeight: '600', letterSpacing: 1.4, textAlign: 'center' }]}>
                    {refLabel(g.s, g.a).toUpperCase()}{g.parts > 1 ? ` · ${g.part}/${g.parts}` : ''}
                  </Text>
                  <AyahText text={g.text} mode={mode} size={fontSize} style={{ textAlign: 'center' }} />
                  {(w || g.technique) && (
                    <View style={styles.waqf}>
                      <Text style={{ fontFamily: w ? ARABIC_FONT : undefined, fontSize: w ? fontSize * 0.6 : 13, color: t.label2 }}>
                        {w ? w.signe : '···'}
                      </Text>
                      <Text style={[type.footnote, { color: t.label3 }]}>{w ? w.nom : 'coupe de confort'}</Text>
                    </View>
                  )}
                  {tr !== 'none' && (
                    // La traduction porte le VERSET entier : la découper
                    // reviendrait à inventer un alignement entre l'arabe et le
                    // français. Sur un fragment on la replie — elle rappelle le
                    // sens sans occuper la carte.
                    <Text numberOfLines={g.parts > 1 ? 2 : undefined} style={[type.subhead, { color: t.label3, textAlign: 'center' }]}>
                      {verseTr(g.s, g.a, tr)}
                    </Text>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>

      {phase === 'count' && (
        <View style={styles.countdown} pointerEvents="none">
          <Text style={{ fontSize: 104, fontWeight: '700', color: t.label }}>{count}</Text>
        </View>
      )}

      <View style={[styles.bar, { backgroundColor: t.raised, borderTopColor: t.separator }]}>
        <View style={styles.barTop}>
          <Text style={[type.footnote, { color: t.label3, fontVariant: ['tabular-nums'], width: 64 }]}>
            {index + 1} / {cards.length}
          </Text>
          <Text style={[type.title2, { color: t.label, fontVariant: ['tabular-nums'] }]}>{mmss}</Text>
          <View style={{ width: 64, alignItems: 'flex-end' }}>
            {phase === 'rec' && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.madder }} />}
          </View>
        </View>

        <View style={styles.barControls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Segment précédent"
            disabled={index <= 0}
            onPress={() => goTo(index - 1, false)}
            style={[styles.round, { backgroundColor: t.fill, opacity: index <= 0 ? 0.28 : 1 }]}
          >
            <Ionicons name="chevron-up" size={24} color={t.label} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={phase === 'rec' ? 'Arrêter l’enregistrement' : 'Démarrer l’enregistrement'}
            disabled={phase === 'count' || phase === 'saving'}
            onPress={phase === 'rec' ? finish : begin}
            style={({ pressed }) => [styles.recBtn, { borderColor: t.separatorOpaque, backgroundColor: t.fill, transform: [{ scale: pressed ? 0.94 : 1 }] }]}
          >
            <View style={{
              backgroundColor: t.madder,
              width: phase === 'rec' ? 30 : 62,
              height: phase === 'rec' ? 30 : 62,
              borderRadius: phase === 'rec' ? 9 : 31,
            }} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Segment suivant"
            disabled={index >= cards.length - 1}
            onPress={() => goTo(index + 1, false)}
            style={[styles.round, { backgroundColor: t.fill, opacity: index >= cards.length - 1 ? 0.28 : 1 }]}
          >
            <Ionicons name="chevron-down" size={24} color={t.label} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  probe: { position: 'absolute', left: 0, right: 0, top: -10000, opacity: 0, paddingHorizontal: space.s6 },
  rail: { flexDirection: 'row', gap: 4, paddingTop: space.s3, paddingBottom: space.s2 },
  card: { justifyContent: 'center', gap: space.s5, paddingHorizontal: space.s6 },
  waqf: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.s2 },
  countdown: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  bar: { paddingHorizontal: space.s4, paddingTop: space.s4, paddingBottom: space.s8, gap: space.s3, borderTopWidth: StyleSheet.hairlineWidth },
  barTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  barControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  round: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  recBtn: { width: 84, height: 84, borderRadius: 42, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
