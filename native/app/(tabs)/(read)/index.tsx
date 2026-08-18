import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useNavigation } from 'expo-router';
import { useLayoutEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { SURAHS } from '../../../src/corpus';
import { deAccent } from '../../../src/core/search.mjs';
import { space, type } from '../../../src/theme';
import { Card, Empty, ListGroup, Row, Screen, useTheme } from '../../../src/components/ui';
import { passageLabel } from '../../../src/corpus';
import { useStore } from '../../../src/store';

export default function Read() {
  const t = useTheme();
  const nav = useNavigation();
  const [q, setQ] = useState('');
  const selection = useStore((s) => s.selection);

  // Le champ de recherche de la barre de navigation est celui du système.
  useLayoutEffect(() => {
    nav.setOptions({
      title: 'Le Coran',
      headerSearchBarOptions: {
        placeholder: 'Rechercher une sourate',
        onChangeText: (e: any) => setQ(e.nativeEvent.text),
        hideWhenScrolling: false,
      },
    });
  }, [nav]);

  const list = useMemo(() => {
    const needle = deAccent(q.trim().toLowerCase());
    if (!needle) return SURAHS;
    return SURAHS.filter((s) =>
      deAccent(s.tr.toLowerCase()).includes(needle) ||
      deAccent(s.fr.toLowerCase()).includes(needle) ||
      String(s.i) === needle);
  }, [q]);

  return (
    <Screen>
      {selection.length > 0 && (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[type.footnote, { color: t.label3 }]}>Passage à réciter</Text>
            <Text numberOfLines={1} style={[type.body, { color: t.label }]}>{passageLabel(selection)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={t.label3} onPress={() => router.push('/studio')} />
        </Card>
      )}

      {list.length === 0 ? (
        <Empty title="Aucune sourate">Essayez un autre nom ou un numéro.</Empty>
      ) : (
        <ListGroup>
          {list.map((s, i) => (
            <Row
              key={s.i}
              first={i === 0}
              onPress={() => router.push(`/surah/${s.i}`)}
              lead={
                <View style={{ width: 38, height: 38, borderRadius: 9, backgroundColor: t.tintBg, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={[type.footnote, { color: t.tint, fontWeight: '600' }]}>{s.i}</Text>
                </View>
              }
              title={s.tr}
              subtitle={`${s.fr} · ${s.n} versets`}
              trailing={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
                  <Text style={{ fontFamily: 'AmiriQuran', fontSize: 20, color: t.label2 }}>{s.ar}</Text>
                  <Ionicons name="chevron-forward" size={17} color={t.label3} />
                </View>
              }
            />
          ))}
        </ListGroup>
      )}
    </Screen>
  );
}
