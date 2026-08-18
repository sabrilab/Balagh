import { router } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { AyahText } from '../../../src/components/AyahText';
import { Button, Card, Empty, Notice, Screen, Section, useTheme } from '../../../src/components/ui';
import { refLabel, verseAr } from '../../../src/corpus';
import { ensureMicPermission } from '../../../src/audio/engine';
import { space, type } from '../../../src/theme';
import { currentTake, useStore } from '../../../src/store';

export default function Studio() {
  const t = useTheme();
  const selection = useStore((s) => s.selection);
  const takes = useStore((s) => s.takes);
  const take = takes.find((x) => x.id === useStore((s) => s.currentTakeId)) ?? null;

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

  return (
    <Screen>
      {selection.length === 0 ? (
        <>
          <Empty title="Aucun verset sélectionné">
            Choisissez un ou plusieurs versets dans la lecture ou la recherche, puis revenez ici.
          </Empty>
          <View style={{ flexDirection: 'row', gap: space.s2 }}>
            <Button label="Parcourir" kind="grey" style={{ flex: 1 }} onPress={() => router.push('/')} />
            <Button label="Chercher" kind="grey" style={{ flex: 1 }} onPress={() => router.push('/search')} />
          </View>
        </>
      ) : (
        <>
          <Card flush>
            {selection.map((v, i) => (
              <View key={`${v.s}:${v.a}`} style={[{ padding: space.s4 }, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.separator }]}>
                <Text style={[type.footnote, { color: t.tint, fontWeight: '600', marginBottom: space.s1 }]}>{refLabel(v.s, v.a)}</Text>
                <AyahText text={verseAr(v.s, v.a)} mode="plain" size={20} />
              </View>
            ))}
          </Card>
          <Button label="Passer au télépromptage" kind="filled" onPress={start} />
          {take && <Button label={`Reprendre « ${take.name} »`} kind="grey" onPress={() => router.push('/review')} />}
        </>
      )}

      <Section title="La voix, et rien d’autre">
        <Notice>
          Les acoustiques placent votre voix dans un volume — mosquée de quartier, grande nef, sous le dôme. Aucun accompagnement musical n’est ajouté, ni à l’écoute ni à l’export.
        </Notice>
      </Section>
    </Screen>
  );
}
