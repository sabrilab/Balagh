# Five League — outil de gestion

Tableau de bord de l'association **Five League**, qui organise la **Sunday
Five League** (SFL), ligue de football à cinq du Nord. L'outil réunit en une
page les huit domaines du modèle socio-économique — sept sources de produits
et les charges de fonctionnement — et permet de les tenir au jour le jour.

- Livrable : [`dist/five-league.html`](dist/five-league.html) — **un seul
  fichier de 160 Ko**, sans dépendance ni serveur. Un double-clic suffit.
- Les données sont enregistrées dans le navigateur (`localStorage`) : l'outil
  fonctionne hors connexion, et rien ne quitte l'appareil.

## Les huit domaines

| Domaine | Ce qu'il suit | Indicateur mis en avant |
|---|---|---|
| Ressources humaines | Bénévoles, dirigeants, arbitres, heures contribuées | Bénévoles actifs, valorisation du bénévolat |
| Cotisations | Adhésions, encaissements, relances | Encaissé, taux de règlement |
| Subventions publiques | Dossiers, échéances de dépôt, versements | Reçu cette saison, dossiers en cours |
| Merchandising | Catalogue, stocks, marges | Chiffre d'affaires, alertes de stock |
| Événements | Journées de championnat, tournois, logistique | Événements réalisés, solde |
| Prestations | Animations, formations, facturation | CA encaissé, en attente de paiement |
| Partenariats privés | Sponsors, contreparties, échéances | Sponsoring encaissé, à renouveler |
| Dépenses | Salaires, créneaux, assurances, licences, matériel | Charges payées, à régler |

Les coûts propres à une journée de championnat (terrain, arbitrage,
récompenses du jour) restent dans l'événement concerné ; le module Dépenses
porte les charges de fonctionnement de l'association. Cette frontière évite
de compter deux fois la même somme.

## Ce que fait l'outil

**Vision d'ensemble.** Le hub place les huit domaines autour de la marque,
chacun avec son chiffre clé. Sous le hub : produits, charges, résultat, reste
à percevoir, bénévolat valorisé, la répartition des produits par source, la
structure des charges par poste, les encaissements et décaissements mois par
mois, et les points d'attention du moment (résultat déficitaire, cotisations à
recouvrer, dépôts de subvention qui approchent, factures échues, dépenses
engagées non réglées, stocks bas, partenariats à renouveler).

**Gestion quotidienne.** Chaque domaine a sa page : recherche, filtre par état,
tri par colonne, ajout, modification, suppression. Tout est enregistré au fil
de la saisie.

**Saisons.** Les données sont rattachées à une saison sportive (1er septembre —
31 août). Le sélecteur en haut à droite change la lecture d'ensemble ; les
indicateurs comparent automatiquement à la saison précédente.

**Sorties.** Export CSV et Excel (`.xlsx`) par domaine, classeur complet des
huit domaines, sauvegarde JSON de toute la base, et un rapport de saison mis
en page pour l'impression ou l'enregistrement en PDF — le document qui
s'attache à un dossier de subvention ou se projette en assemblée générale.

**Entrées.** Import CSV par domaine : le format d'export est aussi le format
d'import, les colonnes sont reconnues par leur intitulé, dans n'importe quel
ordre. Restauration d'une sauvegarde JSON.

**Sur tous les écrans.** Au-dessous de 920 px le hub devient une grille ; sur
téléphone, les tableaux deviennent des fiches empilées. Thème clair, sombre ou
automatique.

## Où sont enregistrées les données

Dans le navigateur, sur l'appareil qui a ouvert le fichier — pas sur un
serveur. Les saisies sont écrites au fil de l'eau et retrouvées au
rechargement suivant.

Deux situations font exception, et l'outil les signale par un bandeau rouge :

- **Le stockage est refusé** (navigation privée, réglage de sécurité). Une
  sonde d'écriture le vérifie au démarrage : l'outil continue de fonctionner
  en mémoire, mais prévient que rien ne sera conservé.
- **La page est affichée dans un aperçu intégré** (cadre d'une messagerie,
  prévisualisation d'un service en ligne). Le stockage y répond correctement,
  mais la page n'a pas d'origine stable : au chargement suivant, tout est
  reparti de zéro. **Dans ce cas, enregistrez le fichier sur votre ordinateur
  et ouvrez-le par un double-clic** — les deux bandeaux proposent aussi un
  bouton « Sauvegarder maintenant » qui télécharge une sauvegarde JSON.

Pour travailler à plusieurs, ou passer d'un appareil à l'autre : la sauvegarde
JSON des réglages exporte toute la base, et la restauration la réinstalle.

## Démarrer

```sh
npm run build   # assemble dist/five-league.html à partir de src/
npm test        # assemble, puis passe le banc de fumée et l'audit
```

`npm test` lance deux bancs, tous deux dans Chromium :

- `tools/smoke.mjs` — **84 vérifications** sur le parcours réel : navigation,
  formulaires, tri, recherche, persistance après rechargement, changement de
  saison, exports (dont la validité de l'archive `.xlsx`, sommes de contrôle
  comprises), import CSV, réinitialisation, rendu sur téléphone.
- `tools/audit.mjs` — accessibilité mesurée sur **36 écrans** (3 largeurs ×
  2 thèmes × 6 vues) : contraste 4,5:1, texte au-dessus de 11 px, cibles de
  40 px au pointeur et 44 px au doigt, aucun débordement horizontal. Zéro
  écart.

## Jeu de démonstration

Au premier lancement, l'outil charge une association fictive : 26 bénévoles,
132 adhésions, 9 dossiers de subvention, 14 articles, 26 événements, 12
prestations, 11 partenariats et 66 écritures de dépenses, sur deux saisons
complètes — environ 48 000 € de produits, 41 000 € de charges, un résultat
excédentaire de 6 500 €. Un bandeau le signale, et un bouton des réglages vide tout d'un
coup pour saisir les données réelles.

Les noms de personnes, d'entreprises et de clients sont inventés.

## Organisation du dépôt

```
src/index.html      coquille et méta
src/styles.css      thème clair et sombre, mise en page, impression
src/app/            modules ES : schéma, persistance, agrégats, vues
tools/build.mjs     assemblage en un fichier unique
tools/smoke.mjs     banc de fumée fonctionnel
tools/audit.mjs     audit d'accessibilité
docs/               décisions produit et techniques
```

Le cœur de l'application est [`src/app/schema.js`](src/app/schema.js) : les
huit domaines y sont décrits une fois — champs, colonnes, indicateurs, états,
contribution au modèle économique — et tout le reste en découle, formulaires,
tableaux, exports et graphiques compris. Ajouter un champ à un module, c'est
ajouter une ligne à ce fichier.

Voir [`docs/architecture.md`](docs/architecture.md) pour les décisions
techniques et [`docs/decisions.md`](docs/decisions.md) pour les hypothèses de
cadrage.
