/**
 * Écoute et montage.
 *
 * Une prise ne sort jamais parfaite : on veut retirer le raclement de gorge du
 * début, le blanc au milieu, et remettre un morceau à sa place. Rien n'est
 * destructif — la prise d'origine reste entière, seule la liste des morceaux
 * change, et « Rétablir » la ramène d'un geste.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Badge, Button, Card, Empty, Notice, Screen, Section, Segmented, useTheme } from '../src/components/ui';
import { Timeline } from '../src/components/Timeline';
import { PRESETS } from '../src/core/audio.mjs';
import {
  cutSpan, moveRegion, newRegion, playSchedule, removeRegion, splitAt,
} from '../src/core/edit.mjs';
import {
  analyseSilence, decodeTake, editedTake, exportWav, playWithEffects, regionPeaks,
  renderProcessed, stopPlayback,
} from '../src/audio/engine';
import { radius, space, type } from '../src/theme';
import { editedDuration, setRegions, setState, useStore, type Region, type Take } from '../src/store';

type Preset = { id: string; name: string; desc: string; premium?: boolean };
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Repères effectifs : ceux posés à la récitation priment, la fin est complétée. */
function cuesFor(take: Take): number[] {
  const n = take.segments.length;
  const poids = take.segments.map((g) => Math.max(8, g.text.length));
  if (!take.cues || !take.cues.length) {
    const total = poids.reduce((a, b) => a + b, 0);
    let acc = 0;
    return poids.map((p) => { const start = (acc / total) * take.duration; acc += p; return start; });
  }
  const out = take.cues.slice(0, n);
  out[0] = 0;
  if (out.length < n) {
    const last = out[out.length - 1];
    const reste = Math.max(0.1, take.duration - last);
    const manque = n - out.length;
    for (let k = 1; k <= manque; k++) out.push(last + (reste * k) / (manque + 1));
  }
  return out;
}

export default function Review() {
  const t = useTheme();
  const takeId = useStore((s) => s.currentTakeId);
  const takes = useStore((s) => s.takes);
  const preset = useStore((s) => s.preset);
  const wet = useStore((s) => s.wet);
  const premium = useStore((s) => s.premium);
  const region = useStore((s) => s.region);
  const playAt = useStore((s) => s.playAt);
  const take = takes.find((x) => x.id === takeId) ?? null;

  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState<null | 'render'>(null);
  const [exported, setExported] = useState<string | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [gaps, setGaps] = useState<{ start: number; end: number }[]>([]);
  const [bornes, setBornes] = useState<{ start: number; end: number } | null>(null);
  const raf = useRef<number | null>(null);
  const handle = useRef<{ elapsed: () => number } | null>(null);

  const regions: Region[] = take ? take.regions : [];
  const sig = regions.map((r) => `${r.id}:${r.start.toFixed(3)}:${r.end.toFixed(3)}`).join('|');
  const total = take ? editedDuration(take) : 0;

  /* --- forme d'onde du MONTAGE : refaite dès que les morceaux changent ----- */
  useEffect(() => {
    let vivant = true;
    if (!take) return;
    editedTake(take.uri, take.regions, take.duration)
      .then((buf) => { if (vivant) setPeaks(regionPeaks(buf)); })
      .catch(() => { if (vivant) setPeaks(take.peaks); });
    return () => { vivant = false; };
  }, [take?.uri, sig]);

  /* --- analyse des blancs : une fois par prise ---------------------------- */
  useEffect(() => {
    let vivant = true;
    if (!take) return;
    decodeTake(take.uri)
      .then((buf) => {
        if (!vivant) return;
        const a = analyseSilence(buf);
        setGaps(a.plages.filter((p) => p.start > 0.03 && p.end < take.duration - 0.03));
        setBornes(a.bornes);
      })
      .catch(() => {});
    return () => { vivant = false; };
  }, [take?.uri]);

  useEffect(() => () => { stopPlayback(); if (raf.current) cancelAnimationFrame(raf.current); }, []);
  useEffect(() => { setExported(null); }, [preset, wet, sig]);

  const halt = useCallback(() => {
    stopPlayback();
    handle.current = null;
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    setPlaying(false);
  }, []);

  // Les mémos précèdent toute sortie anticipée : l'ordre des hooks ne doit
  // jamais dépendre de la présence d'une prise.
  const cues = useMemo(() => (take ? cuesFor(take) : []), [take?.id, take?.cues, take?.segments]);
  const schedule = useMemo(
    () => playSchedule(regions, cues) as { start: number; end: number; index: number }[],
    [sig, cues],
  );

  if (!take) {
    return <Screen><Empty title="Aucune prise">Enregistrez d’abord une récitation.</Empty></Screen>;
  }

  const opts = { wet: wet ?? undefined, presence: 2.5 };

  const commit = (next: Region[]) => {
    halt();
    setRegions(take.id, next);
    Haptics.selectionAsync().catch(() => {});
  };

  const start = async (from?: number) => {
    const at = Math.max(0, Math.min(from ?? playAt, Math.max(0, total - 0.05)));
    try {
      const buffer = await editedTake(take.uri, take.regions, take.duration);
      const h = playWithEffects(buffer, preset, opts, () => { halt(); setState({ playAt: 0 }); }, at);
      handle.current = h;
      setState({ playAt: at });
      setPlaying(true);
      const loop = () => {
        if (!handle.current) return;
        setState({ playAt: Math.min(total, handle.current.elapsed()) });
        raf.current = requestAnimationFrame(loop);
      };
      raf.current = requestAnimationFrame(loop);
    } catch {
      Alert.alert('Lecture impossible', 'Le fichier de la prise n’a pas pu être relu.');
    }
  };

  const toggle = () => (playing ? halt() : start());

  const seek = (sec: number) => {
    const at = Math.max(0, Math.min(sec, total));
    const lisait = playing;
    if (lisait) halt();
    setState({ playAt: at, region: regionAt(at) });
    if (lisait) start(at);
  };

  const regionAt = (sec: number) => {
    let acc = 0;
    for (const r of regions) {
      acc += Math.max(0, r.end - r.start);
      if (sec < acc - 1e-6) return r.id;
    }
    return regions[regions.length - 1]?.id ?? null;
  };
  const startOf = (i: number) => regions.slice(0, i).reduce((a, r) => a + Math.max(0, r.end - r.start), 0);
  const index = regions.findIndex((r) => r.id === region);

  const doCut = () => {
    const next = splitAt(regions, playAt) as Region[];
    if (next === regions) { Alert.alert('Coupe impossible', 'Placez la tête de lecture à l’intérieur d’un morceau.'); return; }
    commit(next);
    setState({ region: regionAt(playAt) });
  };
  const doDelete = () => {
    if (regions.length <= 1) { Alert.alert('Un seul morceau', 'Coupez d’abord la prise pour pouvoir en retirer une partie.'); return; }
    const i = index;
    const next = removeRegion(regions, region) as Region[];
    if (next === regions) return;
    commit(next);
    const j = Math.min(i, next.length - 1);
    setState({ region: next[j].id, playAt: next.slice(0, j).reduce((a, r) => a + (r.end - r.start), 0) });
  };
  const doMove = (delta: number) => {
    const j = Math.max(0, Math.min(regions.length - 1, index + delta));
    if (index < 0 || j === index) return;
    commit(moveRegion(regions, index, j) as Region[]);
    setState({ playAt: startOf(j) });
  };
  const doTrim = () => {
    if (!bornes) return;
    if (bornes.start <= 0.03 && bornes.end >= take.duration - 0.03) {
      Alert.alert('Rien à rogner', 'La prise démarre et finit déjà sur la voix.');
      return;
    }
    const next = regions
      .map((r) => newRegion(Math.min(Math.max(r.start, bornes.start), bornes.end), Math.min(Math.max(r.end, bornes.start), bornes.end)) as Region)
      .filter((r) => r.end - r.start > 0.05);
    if (!next.length) return;
    commit(next);
  };
  const doReset = () => { commit([newRegion(0, take.duration) as Region]); setState({ playAt: 0 }); };

  const doExport = async () => {
    setBusy('render');
    halt();
    try {
      const buffer = await editedTake(take.uri, take.regions, take.duration);
      const rendered = await renderProcessed(buffer, preset, opts);
      const uri = await exportWav(rendered, take.label);
      setExported(uri);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'audio/wav', dialogTitle: take.label, UTI: 'public.wav' });
      }
    } catch {
      Alert.alert('Export impossible', 'Le rendu a échoué sur cet appareil.');
    } finally {
      setBusy(null);
    }
  };

  const depth = wet == null ? 'preset' : wet <= 0.18 ? 'discret' : wet >= 0.4 ? 'ample' : 'moyen';
  const setDepth = (v: string) =>
    setState({ wet: v === 'preset' ? null : v === 'discret' ? 0.14 : v === 'ample' ? 0.46 : 0.3 });

  const multi = regions.length > 1;

  return (
    <Screen>
      <Card style={{ gap: space.s3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[type.body, { color: t.label }]}>{take.name}</Text>
            <Text numberOfLines={1} style={[type.footnote, { color: t.label3 }]}>
              {take.label}{multi ? ` · ${regions.length} morceaux` : ''}
            </Text>
          </View>
          <Text style={[type.footnote, { color: t.label2, fontVariant: ['tabular-nums'] }]}>
            {mmss(playAt)} / {mmss(total)}
          </Text>
        </View>

        <Timeline
          peaks={peaks.length ? peaks : take.peaks}
          regions={regions}
          total={total}
          playAt={playAt}
          selected={region}
          cues={schedule.slice(1).map((e) => e.start)}
          onSeek={seek}
        />

        <View style={styles.transport}>
          <Pressable accessibilityRole="button" accessibilityLabel="Revenir au début"
            onPress={() => seek(0)} style={[styles.round, { backgroundColor: t.fill }]}>
            <Ionicons name="play-skip-back" size={22} color={t.label} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Reculer de cinq secondes"
            onPress={() => seek(playAt - 5)} style={[styles.round, { backgroundColor: t.fill }]}>
            <Ionicons name="play-back" size={22} color={t.label} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={playing ? 'Mettre en pause' : 'Écouter'}
            onPress={toggle} style={[styles.play, { backgroundColor: t.label }]}>
            <Ionicons name={playing ? 'pause' : 'play'} size={26} color={t.bg} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Avancer de cinq secondes"
            onPress={() => seek(playAt + 5)} style={[styles.round, { backgroundColor: t.fill }]}>
            <Ionicons name="play-forward" size={22} color={t.label} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Couper à la tête de lecture"
            onPress={doCut} style={[styles.round, { backgroundColor: t.fill }]}>
            <Ionicons name="cut-outline" size={22} color={t.label} />
          </Pressable>
        </View>

        {multi && (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s2 }}>
              {regions.map((r, k) => {
                const on = r.id === region;
                return (
                  <Pressable key={r.id} accessibilityRole="button" accessibilityState={{ selected: on }}
                    onPress={() => { setState({ region: r.id }); seek(startOf(k)); }}
                    style={[styles.chip, { backgroundColor: on ? t.label : t.raised, borderColor: on ? t.label : t.separator }]}>
                    <Text style={[type.footnote, { color: on ? t.bg : t.label2, fontVariant: ['tabular-nums'] }]}>
                      {k + 1} · {mmss(r.end - r.start)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.row}>
              <Pressable accessibilityRole="button" accessibilityLabel="Avancer ce morceau dans l’ordre"
                disabled={index <= 0} onPress={() => doMove(-1)}
                style={[styles.sq, { backgroundColor: t.fill, opacity: index <= 0 ? 0.3 : 1 }]}>
                <Ionicons name="chevron-back" size={20} color={t.label} />
              </Pressable>
              <Button label="Supprimer" kind="grey" onPress={doDelete} style={{ flex: 1 }}
                icon={<Ionicons name="trash-outline" size={18} color={t.label} />} />
              <Pressable accessibilityRole="button" accessibilityLabel="Reculer ce morceau dans l’ordre"
                disabled={index < 0 || index >= regions.length - 1} onPress={() => doMove(1)}
                style={[styles.sq, { backgroundColor: t.fill, opacity: index < 0 || index >= regions.length - 1 ? 0.3 : 1 }]}>
                <Ionicons name="chevron-forward" size={20} color={t.label} />
              </Pressable>
            </View>
          </>
        )}

        <View style={styles.row}>
          <Button label="Rogner les bords" onPress={doTrim} style={{ flex: 1 }} />
          {(multi || total < take.duration - 0.05) && (
            <Button label="Rétablir" onPress={doReset} style={{ flex: 1 }}
              icon={<Ionicons name="arrow-undo-outline" size={18} color={t.tint} />} />
          )}
        </View>

        {gaps.length > 0 && (
          <View style={{ gap: space.s2, paddingTop: space.s3, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.separator }}>
            <Text style={[type.subhead, { color: t.label, fontWeight: '600' }]}>
              {gaps.length} pause{gaps.length > 1 ? 's' : ''} dans la récitation
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s2 }}>
              {gaps.map((p, i) => (
                <Pressable key={i} accessibilityRole="button"
                  onPress={() => commit(cutSpan(regions, p.start, p.end) as Region[])}
                  style={[styles.chip, { backgroundColor: t.raised, borderColor: t.separator }]}>
                  <Text style={[type.footnote, { color: t.label2, fontVariant: ['tabular-nums'] }]}>
                    {mmss(p.start)} · {(p.end - p.start).toFixed(1)} s
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={[type.footnote, { color: t.label3 }]}>Touchez une pause pour la retirer du montage.</Text>
          </View>
        )}
      </Card>

      <Section title="Acoustique">
        <View style={styles.tiles}>
          {(PRESETS as Preset[]).map((p) => {
            const locked = !!p.premium && !premium;
            const on = preset === p.id;
            return (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityState={{ selected: on, disabled: locked }}
                disabled={locked}
                onPress={() => setState({ preset: p.id, wet: null })}
                style={[styles.tile, {
                  backgroundColor: on ? t.tintBg : t.raised,
                  borderColor: on ? t.tint : t.separator,
                  borderWidth: on ? 2 : StyleSheet.hairlineWidth,
                  opacity: locked ? 0.55 : 1,
                }]}
              >
                {locked && <Ionicons name="lock-closed" size={14} color={t.tint} style={{ position: 'absolute', top: 10, right: 10 }} />}
                <Text style={[type.callout, { color: t.label, fontWeight: '600' }]}>{p.name}</Text>
                <Text style={[type.caption1, { color: t.label3 }]}>{p.desc}</Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title="Profondeur">
        <Segmented
          value={depth}
          onChange={setDepth}
          options={[
            { value: 'discret', label: 'Discrète' },
            { value: 'preset', label: 'Réglage du lieu' },
            { value: 'ample', label: 'Ample' },
          ]}
        />
      </Section>

      <Notice>
        Ces réglages placent votre voix dans un volume acoustique. Aucun accompagnement musical n’est ajouté, ni ici ni à l’export.
      </Notice>

      {busy === 'render' ? (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
          <ActivityIndicator color={t.tint} />
          <Text style={[type.subhead, { color: t.label2 }]}>Rendu hors temps réel…</Text>
        </Card>
      ) : (
        <Button label="Exporter et partager" kind="filled" onPress={doExport}
          icon={<Ionicons name="share-outline" size={18} color={t.bg} />} />
      )}

      {!!exported && (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
          <Badge label="Fichier prêt" tone="myrtle" />
          <Text numberOfLines={1} style={[type.footnote, { color: t.label3, flex: 1 }]}>{exported.split('/').pop()}</Text>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  round: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  play: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  sq: { width: 56, height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  chip: { minHeight: 44, paddingHorizontal: space.s3, justifyContent: 'center', borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 },
  tile: { width: '48.5%', minHeight: 76, borderRadius: radius.card, padding: space.s3, gap: 3, justifyContent: 'center' },
});
