import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';
import { palettes, type as t } from '../../src/theme';

// Les groupes de routes sont triés alphabétiquement : sans cette ligne,
// (account) passe devant et l application s ouvre sur Compte.
export const unstable_settings = { anchor: "(read)", initialRouteName: "(read)" };

export default function TabsLayout() {
  const scheme = useColorScheme();
  const p = scheme === 'dark' ? palettes.dark : palettes.light;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,   // chaque onglet porte sa propre pile native
        sceneStyle: { backgroundColor: p.bgGrouped },
        tabBarActiveTintColor: p.tint,
        tabBarInactiveTintColor: p.label3,
        // 10 pt est la taille des libellés d'onglets dans iOS : c'est la
        // convention de la plateforme, et la cible reste haute de 49 pt.
        tabBarLabelStyle: { fontSize: 10, lineHeight: 12 },
        tabBarStyle: { backgroundColor: p.bg, borderTopColor: p.separator },
      }}
    >
      <Tabs.Screen name="(read)" options={{ title: 'Lire', tabBarIcon: ({ color, size }) => <Ionicons name="book-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="(search)" options={{ title: 'Chercher', tabBarIcon: ({ color, size }) => <Ionicons name="search-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="(studio)" options={{ title: 'Studio', tabBarIcon: ({ color, size }) => <Ionicons name="mic-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="(takes)" options={{ title: 'Prises', tabBarIcon: ({ color, size }) => <Ionicons name="pulse-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="(account)" options={{ title: 'Compte', tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} /> }} />
    </Tabs>
  );
}
