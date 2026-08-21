/**
 * Studio — le choix du passage.
 *
 * Deux entrées rapides avant la liste : le tirage au sort, pour « je veux
 * réciter, peu importe quoi », et les portions du mushaf, pour « je récite une
 * soirée ». Cocher les versets un par un reste possible, ce n'est plus obligé.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { AyahText } from '../../../src/components/AyahText';
import { PortionSheet } from '../../../src/components/PortionSheet';
import { Button, Card, Empty, Notice, Screen, Section, Segmented, useTheme } from '../../../src/components/ui';
import { passageLabel, refLabel, verseAr } from '../../../src/corpus';
import {
  RANDOM_SIZES, describe, randomPassage, randomSizeById, situation, versesOf, type Kind,
} from '../../../src/divisions';
import { ensureMicPermission } from '../../../src/audio/engine';
import { space, type } from '../../../src/theme';
import { setSelection, setState, useStore } from '../../../src/store';

export default function Studio() {
  const t = useTheme();
  const selection = useStore((s) => s.selection);
  const takes = useStore((s) => s.takes);
  const currentId = useStore((s) => s.currentTakeId);
  const randomSize = useStore((s) => s.randomSize);
  const kind = useStore((s) => s.kind) as Kind;
  const take = takes.find((x) => x.id === currentId) ?? null;
  const [sheet, setSheet] = useState(false);

  const start = async () => {
    const ok = await ensureMicPermission();
    if (!ok) {
      Alert.alert(
        'Micro refusé',
        'Talawa Studio a besoin du micro pour enregistrer votre récitation. Vous pouvez l’autoriser dans les réglages de l’appareil.',
      );
      return;
    }
    router.push('/prompter');
  };

  const taille = randomSizeById(randomSize);
  const long = selection.length > 60;

  return (
    <Screen>
      <Card style={{ gap: space.s3 }}>
        <View style={{ flexDirection: 'row', gap: space.s2 }}>
          <Button
            label="Au hasard" kind="filled" style={{ flex: 1 }}
            icon={<Ionicons name="shuffle" size={18} color={t.bg} />}
            onPress={() => setSelection(randomPassage(taille.versets))}
          />
          <Button
            label="Une portion" kind="grey" style={{ flex: 1 }}
            icon={<Ionicons name="layers-outline" size={18} color={t.label} />}
            onPress={() => setSheet(true)}
          />
        </View>
        <Segmented
          value={randomSize}
          onChange={(v) => setState({ randomSize: v })}
          options={RANDOM_SIZES.map((x) => ({ value: x.id, label: x.nom }))}
        />
        <Text style={[type.footnote, { color: t.label3 }]}>
          {taille.versets} versets environ, dans une seule sourate. Une portion prend une sourate,
          un juz, un hizb, un rub’ ou une page entière.
        </Text>
      </Card>

      {selection.length === 0 ? (
        <>
          <Empty title="Aucun verset sélectionné">
            Tirez un passage au hasard, prenez une portion, ou choisissez vos versets dans la lecture.
          </Empty>
          <View style={{ flexDirection: 'row', gap: space.s2 }}>
            <Button label="Parcourir" kind="grey" style={{ flex: 1 }} onPress={() => router.push('/')} />
            <Button label="Chercher" kind="grey" style={{ flex: 1 }} onPress={() => router.push('/search')} />
          </View>
        </>
      ) : (
        <>
          {selection.length > 12 ? (
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[type.body, { color: t.label }]}>{passageLabel(selection)}</Text>
                <Text numberOfLines={1} style={[type.footnote, { color: t.label3 }]}>
                  {selection.length} versets · {situation(selection)}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button" accessibilityLabel="Vider la sélection"
                onPress={() => setSelection([])} style={styles.iconBtn}
              >
                <Ionicons name="close" size={22} color={t.label3} />
              </Pressable>
            </Card>
          ) : (
            <Card flush>
              {selection.map((v, i) => (
                <View key={`${v.s}:${v.a}`} style={[{ padding: space.s4 }, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.separator }]}>
                  <Text style={[type.footnote, { color: t.tint, fontWeight: '600', marginBottom: space.s1 }]}>{refLabel(v.s, v.a)}</Text>
                  <AyahText text={verseAr(v.s, v.a)} mode="plain" size={20} />
                </View>
              ))}
            </Card>
          )}

          {long && (
            <Notice>
              <Text style={{ fontWeight: '600' }}>Longue prise.</Text> L’enregistrement décodé reste
              en mémoire — environ 11 Mo par minute. Pour une soirée entière, enregistrez hizb par
              hizb ou rub’ par rub’ : chaque prise reste légère et les prises s’enchaînent dans
              l’onglet Prises.
            </Notice>
          )}

          <Button label="Passer au télépromptage" kind="filled" onPress={start} />
          {take && <Button label={`Reprendre « ${take.name} »`} kind="grey" onPress={() => router.push('/review')} />}
        </>
      )}

      <Section title="La voix, et rien d’autre">
        <Notice>
          Les acoustiques placent votre voix dans un volume — mosquée de quartier, grande nef, sous le dôme. Aucun accompagnement musical n’est ajouté, ni à l’écoute ni à l’export.
        </Notice>
      </Section>

      <PortionSheet
        visible={sheet}
        kind={kind}
        current={selection[0] ?? null}
        onKind={(k) => setState({ kind: k })}
        onClose={() => setSheet(false)}
        onPick={(k, n) => {
          setSelection(versesOf(k, n));
          setSheet(false);
          const d = describe(k, n);
          if (d) Alert.alert(d.title, `${d.sub} · ${d.verses} versets`);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
