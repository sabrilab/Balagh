import { router, useNavigation } from 'expo-router';
import { useLayoutEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AyahText } from '../../../src/components/AyahText';
import { Card, Chip, Empty, Notice, Screen, Section, useTheme } from '../../../src/components/ui';
import { THEMES, refLabel, search, verseAr, verseTr } from '../../../src/corpus';
import { space, type } from '../../../src/theme';
import { setState, useStore } from '../../../src/store';

export default function Search() {
  const t = useTheme();
  const nav = useNavigation();
  const mode = useStore((s) => s.mode);
  const tr = useStore((s) => s.tr);
  const [label, setLabel] = useState('');
  const [results, setResults] = useState<{ s: number; a: number }[] | null>(null);

  const run = (display: string, query: string) => {
    setLabel(display);
    setResults(search(query, 30));
  };

  useLayoutEffect(() => {
    nav.setOptions({
      title: 'Chercher',
      headerSearchBarOptions: {
        placeholder: 'Un verset sur la patience…',
        onSearchButtonPress: (e: any) => run(e.nativeEvent.text, e.nativeEvent.text),
        hideWhenScrolling: false,
      },
    });
  }, [nav]);

  return (
    <Screen>
      <Notice>
        <Text style={{ fontWeight: '600', color: t.label }}>Extraction, jamais rédaction. </Text>
        La recherche parcourt le corpus vérifié embarqué et renvoie des versets existants avec leur référence exacte. Aucun texte religieux n’est produit par un modèle.
      </Notice>

      <Section title="Thèmes">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s2, paddingVertical: 2 }}>
          {THEMES.map(([name, q]) => (
            <Chip key={name} label={name} active={label === name} onPress={() => run(name, `${name} ${q}`)} />
          ))}
        </ScrollView>
      </Section>

      {results === null ? (
        <Empty title="Cherchez un thème">Écrivez en langage naturel, ou touchez un thème ci-dessus.</Empty>
      ) : results.length === 0 ? (
        <Empty title="Aucun verset trouvé">Reformulez avec d’autres mots.</Empty>
      ) : (
        <Section title={`${results.length} verset${results.length > 1 ? 's' : ''}`} trailing="les plus proches d’abord">
          <Card flush>
            {results.map((r, i) => (
              <View key={`${r.s}:${r.a}`} style={[{ padding: space.s4 }, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.separator }]}>
                <Text style={[type.footnote, { color: t.tint, fontWeight: '600', marginBottom: space.s2 }]}>{refLabel(r.s, r.a)}</Text>
                <AyahText text={verseAr(r.s, r.a)} ayah={r.a} mode={mode} />
                {tr !== 'none' && <Text style={[type.callout, { color: t.label2, marginTop: space.s3 }]}>{verseTr(r.s, r.a, tr)}</Text>}
              </View>
            ))}
          </Card>
        </Section>
      )}
    </Screen>
  );
}
