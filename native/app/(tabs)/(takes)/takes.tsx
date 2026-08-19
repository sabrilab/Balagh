import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Button, Empty, ListGroup, Notice, Row, Screen, useTheme } from '../../../src/components/ui';
import { HIT, space, type } from '../../../src/theme';
import { editedDuration, removeTake, setState, useStore } from '../../../src/store';

export default function Takes() {
  const t = useTheme();
  const takes = useStore((s) => s.takes);

  if (!takes.length) {
    return (
      <Screen>
        <Empty title="Aucune récitation">Vos prises apparaîtront ici.</Empty>
        <Button label="Enregistrer" kind="filled" onPress={() => router.push('/studio')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Notice>Les prises sont conservées sur l’appareil. Exportez celles que vous voulez partager.</Notice>
      <ListGroup>
        {takes.map((tk, i) => (
          <Row
            key={tk.id}
            first={i === 0}
            onPress={() => { setState({ currentTakeId: tk.id }); router.push('/review'); }}
            lead={
              <View style={{ width: 38, height: 38, borderRadius: 9, backgroundColor: t.tintBg, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="play" size={17} color={t.tint} />
              </View>
            }
            title={tk.name}
            subtitle={`${tk.label} · ${Math.floor(editedDuration(tk) / 60)}:${String(Math.floor(editedDuration(tk) % 60)).padStart(2, '0')}`}
            trailing={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Supprimer ${tk.name}`}
                onPress={() => removeTake(tk.id)}
                style={{ width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="trash-outline" size={20} color={t.label3} />
              </Pressable>
            }
          />
        ))}
      </ListGroup>
    </Screen>
  );
}
