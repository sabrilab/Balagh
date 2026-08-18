import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { palettes } from '../src/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const scheme = useColorScheme();
  const t = scheme === 'dark' ? palettes.dark : palettes.light;
  // Amiri Quran est la seule police libre dessinée pour l'othmanien
  // entièrement vocalisé : on attend son chargement avant d'afficher quoi que
  // ce soit, plutôt que de montrer le texte sacré dans une police de repli.
  const [ready] = useFonts({ AmiriQuran: require('../assets/fonts/AmiriQuran-Regular.ttf') });

  useEffect(() => { if (ready) SplashScreen.hideAsync().catch(() => {}); }, [ready]);
  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerLargeTitle: true,
          headerTransparent: true,
          headerBlurEffect: scheme === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight',
          headerShadowVisible: false,
          headerTintColor: t.tint,
          headerTitleStyle: { color: t.label },
          headerLargeTitleStyle: { color: t.label },
          contentStyle: { backgroundColor: t.bgGrouped },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="surah/[id]" options={{ headerBackTitle: 'Sourates' }} />
        <Stack.Screen name="prompter" options={{ title: 'Télépromptage', headerLargeTitle: false, presentation: 'fullScreenModal' }} />
        <Stack.Screen name="review" options={{ title: 'Écoute' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
