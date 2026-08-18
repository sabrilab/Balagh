# Talawa Studio

Studio de récitation coranique personnelle pour iOS. L'utilisateur trouve un
verset, le récite au télépromptage, sa voix est captée puis placée dans
l'acoustique d'un lieu, et repart en audio ou en vidéo verticale.

Ce dépôt contient un **prototype fonctionnel** : lecture du Coran avec tajwid
et traductions, recherche par thème, captation micro, effets de voix, export
audio et vidéo. Tout tourne réellement — ce n'est pas une maquette cliquable.

- Livrable : [`dist/talawa-studio.html`](dist/talawa-studio.html), page autonome
  de 3,5 Mo, sans dépendance réseau (corpus et polices embarqués).
- Cahier des charges : [`docs/cahier-des-charges.md`](docs/cahier-des-charges.md)
- Décisions techniques : [`docs/architecture.md`](docs/architecture.md)
- Direction artistique : [`docs/direction-artistique.md`](docs/direction-artistique.md)

## Application native (Expo)

`native/` est l application React Native, installable sur un téléphone. Elle
partage son cœur avec le web — moteur tajwid, recherche, accès au corpus **et
chaîne d effets** viennent tous de `core/`.

C est possible parce que `react-native-audio-api` implémente la même interface
que la Web Audio API : les acoustiques sonnent à l identique des deux côtés,
sans une ligne dupliquée. `npm run verify:core` le prouve sur les 6 236
versets — zéro divergence de classement tajwid, zéro divergence de recherche.

L export vidéo n y est pas : aucun encodeur maintenu n existe côté Expo. Il
reste sur la version web. Voir [`docs/native.md`](docs/native.md) pour les
détails et les chemins d installation — dont la contrainte du compte
développeur Apple pour iOS.

## Conformité Apple

`npm run audit` mesure dans le navigateur, sur cinq écrans, les quatre règles
des Human Interface Guidelines qui se vérifient mécaniquement : cibles tactiles
de 44 pt, plancher de texte à 11 pt, contraste 4,5:1, et absence de débordement
hors cadre. Le premier jet en comptait 39 en écart ; il en reste **zéro**.

## Deux cibles, mêmes sources

| Cible | Fichier | Forme |
|---|---|---|
| Site (Vercel) | `public/` | Document complet, actifs séparés et empreintés |
| Artifact | `dist/talawa-studio.html` | Fragment autonome, polices et corpus intégrés |

L'Artifact doit tout embarquer : sa politique de sécurité interdit toute requête
sortante. Le site a l'intérêt inverse — le corpus et les polices deviennent des
actifs immuables que le navigateur garde en cache.

Coût d'une première visite du site, mesuré : 118 Ko de HTML, 3,0 Mo de corpus
et **5 fichiers de police sur 23** — les règles `@font-face` portent un
`unicode-range`, donc le cyrillique, le grec et le vietnamien ne partent jamais.
Après compression Vercel, environ 1 Mo. Une visite de retour ne revalide que le
HTML, les actifs étant immuables.

## Démarrer

```sh
npm run all      # télécharge, vérifie, assemble les deux cibles
npm test         # 27 vérifications fonctionnelles + audit HIG
```

Pour le site : `npx http-server public -p 8080` puis `http://localhost:8080`.
Pour l'Artifact : ouvrir `dist/talawa-studio.html` directement.
Sur téléphone, le châssis iOS disparaît et l'application occupe tout l'écran.

Les bancs de test visent l'Artifact par défaut ; `TARGET_URL=http://localhost:8080/ npm test`
les fait viser le site.

## Déployer sur Vercel

Le dépôt est prêt : `vercel.json` déclare la commande de build, le répertoire de
sortie et les en-têtes. Aucune dépendance npm à installer.

**Par le tableau de bord** — Vercel → *Add New… → Project* → importer
`sabrilab/Balagh` → choisir la branche → *Deploy*. Les réglages sont lus dans
`vercel.json`, il n'y a rien à saisir.

**En ligne de commande** :

```sh
npx vercel --prod
```

### Ce que règle `vercel.json`

- `/assets/*` en cache immuable un an : les noms portent l'empreinte du contenu,
  un déploiement change le nom, jamais le contenu d'un nom déjà servi.
- Le HTML revalidé à chaque visite, pour que les mises à jour arrivent.
- `Permissions-Policy: microphone=(self)` — sans quoi la captation est refusée.
- `X-Content-Type-Options` et `Referrer-Policy`.

### Le micro exige HTTPS

C'est la raison d'être du déploiement : `getUserMedia` ne fonctionne qu'en
contexte sécurisé. En HTTPS sur Vercel la captation marche pour de bon, alors
qu'elle peut être refusée dans une page intégrée en cadre. À défaut, l'écran
Passage propose d'importer un enregistrement, et toute la chaîne effets et
export reste utilisable.

### Installable sur l'écran d'accueil

Le site sert un manifeste et les icônes correspondantes. Sur iOS, *Partager →
Sur l'écran d'accueil* lance l'application en plein écran, sans barre de
navigateur — c'est ce qui s'approche le plus de l'application native visée.

Le micro exige un contexte sécurisé : `file://` et `https://` conviennent, une
page servie en `http://` sur un hôte distant non. Si le micro est indisponible,
l'écran Passage propose d'importer un enregistrement existant, et toute la
chaîne d'effets et d'export reste utilisable.

## Chaîne de fabrication

| Étape | Commande | Rôle |
|---|---|---|
| 1 | `npm run fetch` | Télécharge les éditions de référence dans `data/raw/` (non versionné) |
| 2 | `npm run fonts` | Récupère les polices et les intègre en data: URI dans `data/fonts.css` |
| 3 | `npm run data` | Normalise, **vérifie**, et écrit `data/quran.data.json` |
| 4 | `npm run build` | Assemble `dist/talawa-studio.html` |

L'étape 3 échoue plutôt que de produire un corpus douteux : elle contrôle le
nombre de sourates et de versets, l'alignement des trois éditions, la
numérotation, l'absence de verset vide et l'inventaire des points de code.

## Les quatre contraintes non négociables, et comment elles sont tenues

**1. Exactitude du texte coranique.** Le corpus est téléchargé depuis des
éditions de référence, vérifié à la compilation, et embarqué. Aucun texte
coranique n'est produit par un modèle, à aucun moment. Deux défauts de la
source ont été détectés et traités — voir `docs/architecture.md`.

**2. Fiabilité de l'IA.** La recherche est une **extraction** : un index
inverse construit dans le navigateur sur les traductions vérifiées renvoie des
versets existants avec leur référence exacte. Les thèmes proposés sont des
requêtes, pas des listes de références mémorisées. Rien n'est rédigé.

**3. Pas de musique.** Il n'existe dans le code ni oscillateur, ni nappe, ni
échantillon musical. Les acoustiques sont des réponses impulsionnelles
synthétisées à partir de bruit filtré : elles placent la voix dans un volume,
elles n'ajoutent aucune note.

**4. Respect du caractère sacré.** Les décors vidéo sont strictement
géométriques, sans aucune représentation d'être animé. Les animations
d'interface sont brèves et respectent `prefers-reduced-motion`.

## État

| Brique | État |
|---|---|
| Lecture, tajwid, traductions FR/EN | fonctionnel, corpus complet |
| Recherche par thème | fonctionnel, local |
| Télépromptage et captation micro | fonctionnel |
| Effets de voix | fonctionnel (Web Audio) |
| Export audio et vidéo 9:16 | fonctionnel (rendu temps réel) |
| Calage verset par verset | réparti au prorata des signes ; un alignement forcé reste à faire |
| Comptes, paiement, stockage | maquette — la bascule premium ne fait que montrer la différence |

## Sources

- Texte arabe othmanien (Hafs), édition `quran-uthmani` d'AlQuran.cloud, qui
  redistribue le texte de Tanzil.net.
- Traduction française : Muhammad Hamidullah.
- Traduction anglaise : Saheeh International.
- Métadonnées des sourates : Quran.com API v4.
- Polices : Amiri Quran, Spectral, IBM Plex Sans — toutes sous licence SIL
  Open Font, qui autorise l'incorporation.

Les empreintes SHA-256 des fichiers sources sont conservées dans les
métadonnées de `data/quran.data.json` et affichées dans l'écran Compte.
