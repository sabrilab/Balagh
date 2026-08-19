# Application native (Expo)

`native/` est l'application React Native. Elle partage son cœur avec le web :
le moteur tajwid, la recherche, les accès au corpus et **la chaîne d'effets**
viennent tous de `core/`, recopiés par `npm run sync`.

## Mesurer sans DOM

Le découpage a besoin de savoir si un fragment tient sur trois lignes. Sur le
web, on mesure une copie invisible de la carte. En natif il n'y a rien à
interroger — mais `onTextLayout` renvoie les lignes réellement composées.

On calibre donc **une fois**, hors écran, avec Al-Baqarah 2:282 : le verset le
plus long du Coran, assez long pour déborder largement, donc son rapport
caractères / lignes donne la vraie capacité d'une ligne dans cette police, à
cette taille, dans cette largeur. Le prédicat qui en découle est synchrone, et
le découpage redevient un calcul pur. Tant que la calibration n'a pas eu lieu —
sur le web de secours, par exemple, où `onTextLayout` n'existe pas — chaque
verset reste entier : la dégradation est visible, pas silencieuse.

## Ce qui est partagé, et pourquoi c'est possible

`react-native-audio-api` implémente la même interface que la Web Audio API du
navigateur. `core/audio.mjs` tourne donc à l'identique des deux côtés : les
acoustiques sonnent exactement pareil sur le site et sur le téléphone, sans
une ligne de code dupliquée.

Deux adaptations ont été nécessaires :

- **Pas de `DynamicsCompressorNode` en natif.** Remplacé par une courbe de
  saturation douce (`createWaveShaper` + tangente hyperbolique), appliquée des
  deux côtés pour que le résultat reste identique.
- **Le générateur d'aléa des réponses impulsionnelles est déterministe**, pas
  `Math.random`. Deux appareils produisent alors la même réverbération.

Le natif gagne quelque chose au passage : `OfflineAudioContext` rend **plus vite
que le temps réel**. Là où le navigateur devait rejouer la prise en entier pour
l'exporter, le téléphone la calcule d'un coup.

Le découpage aux signes de pause (`core/segments.mjs`) et le montage
(`core/edit.mjs`) sont partagés de la même façon. Le premier a été écrit pour
cela : il ne connaît ni DOM ni React, il reçoit un prédicat « ce texte
tient-il », et chaque plateforme le fabrique à sa façon.

Une vérification (`npm run verify:core`) compare le noyau extrait à
l'implémentation web sur les 6 236 versets : zéro divergence de classement
tajwid, zéro texte altéré, zéro divergence de recherche. `npm run verify:edit`
prouve l'algèbre du montage, `npm run verify:segments` le découpage.

## Ce que fait la v1 native

| Brique | État |
|---|---|
| Lecture, tajwid, traductions | fonctionnel, corpus complet embarqué |
| Recherche par thème | fonctionnel, index local |
| Télépromptage à glissement, découpé aux waqf | fonctionnel (`ScrollView` paginé) |
| Captation micro | fonctionnel (`AudioRecorder`, M4A) |
| Montage : couper, supprimer, déplacer, rogner | fonctionnel, non destructif |
| Effets de voix | fonctionnel, chaîne partagée avec le web |
| Export audio et partage | fonctionnel (rendu hors temps réel → WAV → feuille de partage) |
| **Export vidéo** | **absent — voir ci-dessous** |

### Pourquoi l'export vidéo n'est pas dans la v1

Il n'existe aujourd'hui aucun encodeur vidéo maintenu et compatible Expo :
`ffmpeg-kit-react-native` est abandonné depuis 2023, `react-native-media-toolkit`
ne fait que rogner et compresser, `expo-video` ne lit que. Générer une vidéo à
partir d'images calculées demande donc soit un module natif écrit à la main
(`AVAssetWriter` côté iOS), soit un rendu côté serveur.

Écrire ce module natif est faisable, mais il ne peut être ni compilé ni testé
depuis cet environnement — livrer du Swift non exécuté serait pire que de ne
rien livrer. L'export vidéo reste donc sur la version web, qui le fait
réellement.

## Développer

```sh
npm run sync            # à la racine : recopie core/ et le corpus dans native/
cd native
npm install
npx expo start          # puis « i » ou « a », avec un build de développement
npm run typecheck
```

**Expo Go ne suffit pas.** `react-native-audio-api` est un module natif : il
faut un *development build*. C'est une commande, pas une difficulté :

```sh
npx eas build --profile development --platform ios      # ou android
```

## Installer sur un téléphone

### Android — gratuit, marche aujourd'hui

```sh
npx eas build --profile preview --platform android
```

EAS renvoie un `.apk` à télécharger depuis le lien fourni, puis à installer
directement. Aucun compte payant.

### iOS — un compte développeur Apple est nécessaire

C'est la contrainte à connaître avant de commencer. Pour installer une
application sur un iPhone, Apple exige un profil de provisionnement signé.
Trois chemins, aucun gratuit et simple à la fois :

| Chemin | Coût | Contrainte |
|---|---|---|
| Apple Developer Program + EAS | 99 $/an | le plus simple ; TestFlight ou distribution interne |
| Xcode + identifiant Apple gratuit | 0 € | il faut un Mac, et le certificat expire au bout de 7 jours |
| Simulateur iOS | 0 € | il faut un Mac ; ce n'est pas votre téléphone |

```sh
npx eas build --profile preview --platform ios
```

EAS demandera vos identifiants Apple et enregistrera l'appareil.

### L'alternative sans compte ni coût

Le site déployé s'ajoute à l'écran d'accueil (*Partager → Sur l'écran
d'accueil*) et s'ouvre en plein écran, sans barre de navigateur. La captation
et les effets y fonctionnent — Safari implémente la Web Audio API — et l'export
vidéo, lui, y est disponible. C'est aujourd'hui le chemin le plus court vers
« l'application sur mon téléphone ».

## Conformité aux Human Interface Guidelines

L'application n'imite pas iOS, elle l'utilise : chaque onglet porte sa propre
pile native, ce qui donne les vrais titres larges d'UIKit, les barres de
recherche du système et les en-têtes translucides. Les jetons de `src/theme.ts`
reprennent l'échelle typographique iOS au point près et les rôles de couleur du
système, avec les mêmes valeurs de contraste que celles vérifiées côté web.
