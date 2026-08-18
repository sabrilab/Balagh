# Cahier des charges — Application iOS de récitation du Coran

> Document de référence fourni par le porteur de projet. Reproduit ici tel quel.
> Voir `architecture.md` et `direction-artistique.md` pour les décisions prises
> sur les points laissés ouverts.

---

## 1. Vision du produit

Une application iOS qui transforme la récitation du Coran en expérience de création personnelle :

**L'utilisateur trouve un verset, le récite en le lisant à l'écran, sa voix est enregistrée et sublimée par des effets audio, puis exportée en audio ou en vidéo partageable.**

Positionnement : ce n'est **pas** une énième application de lecture du Coran. C'est un **studio de récitation personnelle** — l'équivalent d'un BandLab appliqué à la récitation coranique.

## 2. Public cible

- Musulmans pratiquants souhaitant réciter, s'enregistrer et s'écouter
- Créateurs de contenu islamique pour les réseaux sociaux (TikTok, Reels, Shorts)
- Apprenants travaillant leur récitation (boucle écoute / correction)

## 3. Fonctionnalités

### 3.1 Lecture du Coran

- Texte arabe intégral, écriture othmanie, lecture Hafs
- Deux modes d'affichage au choix : **tajwid en couleurs**, ou **noir simple**
- Traductions consultables : français (traduction Hamidullah), anglais, arabe seul
- Extensible à terme : traduction à la demande dans d'autres langues

### 3.2 Recherche intelligente par agent LLM

- Recherche de versets **par sujet ou thème**, en langage naturel (ex. « un verset sur la patience »)
- L'agent retourne des versets avec leurs **références exactes** (sourate, numéro de verset)
- Règle absolue : l'agent **cite et recherche**, il ne génère jamais de verset ni de contenu religieux inventé

### 3.3 Enregistrement de récitation

- Mode **téléprompteur** : le verset choisi s'affiche en arabe à l'écran pendant l'enregistrement
- Enregistrement vocal de qualité depuis le micro de l'appareil
- L'utilisateur choisit le ou les versets à réciter avant de lancer l'enregistrement

### 3.4 Effets audio

- Catalogue de **styles prédéfinis** appliqués à la voix : réverbération, délai, acoustiques de type mosquée, etc.
- **Voix uniquement** : aucun accompagnement musical, aucune nappe sonore (contrainte religieuse et choix produit)

### 3.5 Export audio et génération vidéo

- Export de la récitation traitée en **audio**
- Moteur de **génération vidéo** : texte arabe du verset + traduction + visuels, synchronisés avec la voix enregistrée
- Catalogue de styles vidéo
- Formats adaptés au partage social (vertical en priorité)

## 4. Contraintes non négociables

1. **Exactitude du texte coranique** : utiliser exclusivement des sources de données certifiées/vérifiées. Aucune tolérance sur le texte, la vocalisation (tashkeel) ou la numérotation des versets.
2. **Fiabilité de l'IA** : le LLM ne doit jamais halluciner de verset, de traduction ou d'exégèse. Recherche augmentée (RAG) sur données vérifiées, références toujours affichées.
3. **Pas de musique** : les effets s'appliquent à la voix seule.
4. **Respect du caractère sacré** : sobriété et dignité dans l'ensemble de l'expérience (design, animations, sons d'interface).

## 5. Modèle économique envisagé

- **Freemium** avec abonnement (modèle validé par le marché)
- Piste : export limité ou avec filigrane en gratuit ; catalogue de styles, qualité d'export et fonctionnalités avancées en premium
- Tarification exacte : laissée ouverte

## 6. Préconisations (indicatives, non contraignantes)

- **Différenciation** : aucune app concurrente ne combine aujourd'hui les trois briques (recherche LLM + enregistrement de la voix de l'utilisateur avec effets + export vidéo). C'est le cœur du positionnement.
- **MVP suggéré** : commencer par le cœur « wow » — enregistrement en mode téléprompteur + export vidéo avec 2-3 styles — car c'est la fonctionnalité viralisable. La recherche LLM peut suivre en V2.
- **Fenêtre de lancement** : viser une sortie quelques semaines avant Ramadan (pic saisonnier massif des téléchargements d'apps islamiques).
- **Benchmark** : étudier Tarteel (IA de suivi de récitation), QuranStudio / Ayah Video Maker (génération vidéo, ~17,99 $/mois), NurMontage et Muslim Pro (généraliste).

## 7. Décisions volontairement laissées ouvertes

- Choix des API et fournisseurs : texte coranique certifié, traductions, modèle LLM, traitement audio, rendu vidéo
- Stack technique (natif Swift, cross-platform, etc.)
- Design UI/UX complet : direction artistique, typographies, couleurs, composants
  - *Des références visuelles (Pinterest) seront fournies séparément par le porteur de projet*
- Architecture, nommage, organisation du code
- Tarification et structure exacte de l'abonnement
- **Aucune temporalité imposée**

## 8. Contexte concurrentiel (repères)

| Acteur | Positionnement | Enseignement |
|---|---|---|
| Muslim Pro | Généraliste (horaires, Coran, Qibla) | Le marché paie : 170 M+ téléchargements, revenus majoritairement en abonnement |
| Tarteel | IA de récitation / mémorisation | La voix + IA est validée (10 M+ téléchargements), mais orientée correction, pas création |
| QuranStudio (iOS) | Vidéos de récitation synchronisées | L'export vidéo se monétise (abo hebdo/mensuel), mais utilise des récitateurs pro |
| NurMontage / Quran Reels Maker | Clips Coran pour réseaux (Android) | La demande créateur existe, l'offre iOS reste limitée |

**Opportunité** : le créneau « studio de création de récitation personnelle » sur iOS est le moins occupé du marché.
