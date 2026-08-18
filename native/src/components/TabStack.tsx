/**
 * Pile native pour un onglet. C'est cette imbrication — une pile par onglet —
 * qui donne les vrais titres larges d'UIKit, les barres de recherche du
 * système et l'en-tête translucide. Les onglets seuls n'exposent qu'un
 * en-tête dessiné en JavaScript.
 */
import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';
import { palettes } from '../theme';

export function TabStack({ title }: { title: string }) {
  const scheme = useColorScheme();
  const p = scheme === 'dark' ? palettes.dark : palettes.light;
  return (
    <Stack
      screenOptions={{
        title,
        headerLargeTitle: true,
        headerTransparent: true,
        headerBlurEffect: scheme === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight',
        headerShadowVisible: false,
        headerTintColor: p.tint,
        headerTitleStyle: { color: p.label },
        headerLargeTitleStyle: { color: p.label },
        contentStyle: { backgroundColor: p.bgGrouped },
      }}
    />
  );
}
