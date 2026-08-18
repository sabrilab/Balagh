import Ionicons from '@expo/vector-icons/Ionicons';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Card, Empty, Notice, Screen, Section, Segmented, useTheme } from '../src/components/ui';
import { PRESETS } from '../src/core/audio.mjs';
import { decodeTake, exportWav, playWithEffects, renderProcessed, stopPlayback } from '../src/audio/engine';
import { radius, space, type } from '../src/theme';
import { currentTake, setState, useStore } from '../src/store';

type Preset = { id: string; name: string; desc: string; premium?: boolean };

export default function Review() {
  const t = useTheme();
  const takeId = useStore((s) => s.currentTakeId);
  const takes = useStore((s) => s.takes);
  const preset = useStore((s) => s.preset);
  const wet = useStore((s) => s.wet);
  const premium = useStore((s) => s.premium);
  const take = takes.find((x) => x.id === takeId) ?? null;

  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState<null | 'render'>(null);
  const [exported, setExported] = useState<string | null>(null);

  useEffect(() => () => stopPlayback(), []);
  useEffect(() => { setExported(null); }, [preset, wet]);

  if (!take) {
    return (
      <Screen>
        <Empty title="Aucune prise">Enregistrez d’abord une récitation.</Empty>
      </Screen>
    );
  }

  const opts = { wet: wet ?? undefined, presence: 2.5 };

  const toggle = async () => {
    if (playing) { stopPlayback(); setPlaying(false); return; }
    try {
      const buffer = await decodeTake(take.uri);
      playWithEffects(buffer, preset, opts, () => setPlaying(false));
      setPlaying(true);
    } catch {
      Alert.alert('Lecture impossible', 'Le fichier de la prise n’a pas pu être relu.');
    }
  };

  const doExport = async () => {
    setBusy('render');
    stopPlayback();
    setPlaying(false);
    try {
      const buffer = await decodeTake(take.uri);
      const rendered = await renderProcessed(buffer, preset, opts);
      const uri = await exportWav(rendered, take.label);
      setExported(uri);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'audio/wav', dialogTitle: take.label, UTI: 'public.wav' });
      }
    } catch (e) {
      Alert.alert('Export impossible', 'Le rendu a échoué sur cet appareil.');
    } finally {
      setBusy(null);
    }
  };

  const depth = wet == null ? 'preset' : wet <= 0.18 ? 'discret' : wet >= 0.4 ? 'ample' : 'moyen';
  const setDepth = (v: string) =>
    setState({ wet: v === 'preset' ? null : v === 'discret' ? 0.14 : v === 'ample' ? 0.46 : 0.3 });

  return (
    <Screen>
      <Card style={{ gap: space.s3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[type.body, { color: t.label }]}>{take.name}</Text>
            <Text numberOfLines={1} style={[type.footnote, { color: t.label3 }]}>
              {take.label} · {Math.floor(take.duration / 60)}:{String(Math.floor(take.duration % 60)).padStart(2, '0')}
            </Text>
          </View>
          <Button label={playing ? 'Pause' : 'Écouter'} kind="grey" onPress={toggle}
            icon={<Ionicons name={playing ? 'pause' : 'play'} size={18} color={t.label} />} />
        </View>
        <View style={styles.wave}>
          {take.peaks.map((p, i) => (
            <View key={i} style={{ flex: 1, height: Math.max(2, p * 64), backgroundColor: t.separatorOpaque, borderRadius: 1 }} />
          ))}
        </View>
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
  wave: { flexDirection: 'row', alignItems: 'center', gap: 1, height: 68 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 },
  tile: { width: '48.5%', minHeight: 76, borderRadius: radius.card, padding: space.s3, gap: 3, justifyContent: 'center' },
});
