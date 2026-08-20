# Hypothèses de cadrage

Le cahier des charges posait cinq questions avant de commencer. Faute de
réponses, chacune a reçu une hypothèse explicite, choisie pour être facile à
corriger. Voici ce qui a été retenu, et où le changer.

## 1. Identité visuelle

**Retenu : palette « énergique sport » (option 1), corrigée pour le
contraste.** Bleu marine `#1C3144` en fond de marque, vert `#2ECC71` en
accent, orange `#E67E22` en signal.

Le vert `#2ECC71` du cahier des charges ne tient pas 4,5:1 sur fond blanc
(2,0:1) : il reste la couleur des surfaces et des graphiques, mais le texte et
les boutons utilisent `#17864A`, sa version foncée, qui atteint 4,7:1. Même
raisonnement pour l'ambre des pastilles d'état.

Chaque domaine porte sa propre couleur, choisie pour rester distinguable des
six autres : bleu (RH), vert (cotisations), violet (subventions), orange
(boutique), rouge (événements), turquoise (prestations), or (partenariats).

**Logo.** Aucun logo n'ayant été fourni, la marque est dessinée en SVG dans
[`src/app/composants.js`](../src/app/composants.js) — un ballon stylisé portant
le chiffre 5. Pour lui substituer le vrai logo, remplacer le corps de la
fonction `logo()`.

**Où changer** : le bloc `:root` de [`src/styles.css`](../src/styles.css) pour
la palette, le champ `couleur` de chaque module dans
[`src/app/schema.js`](../src/app/schema.js) pour les couleurs de domaine.

**Un huitième domaine.** Le cahier des charges en listait sept, tous du côté
des ressources. Les dépenses de fonctionnement ont été ajoutées ensuite, à la
demande : sans elles, le tableau de bord affichait des produits sans contre-
partie, et le « résultat » ne valait rien. Le domaine reprend la même
mécanique que les sept autres.

## 2. Données et volumes

**Retenu :** une association d'environ 130 adhérents, 26 bénévoles, 12 équipes
engagées, 11 partenaires, pour un budget annuel de l'ordre de 48 000 € de
produits et 41 000 € de charges — la fourchette annoncée (5 000 à 50 000 €),
cohérente avec une ligue qui organise 26 journées par saison.

Le poste de dépenses le plus lourd de la démonstration est un éducateur en
apprentissage (11 250 € chargés sur la saison). Si l'association n'emploie
personne, supprimer ces écritures ramène le résultat à un excédent d'environ
18 000 € — c'est le premier réglage à faire en saisissant les données
réelles.

Ces volumes ne sont que ceux de la démonstration : l'outil n'impose aucune
limite. Les objectifs de saison (produits attendus, nombre d'adhérents visé)
se règlent dans **Réglages et données** et alimentent les jauges du tableau de
bord.

**Valorisation du bénévolat : 12 € de l'heure**, ordre de grandeur du SMIC
horaire brut, comme le recommande le plan comptable associatif pour les
contributions volontaires en nature. Réglable.

## 3. Utilisateurs et accès

**Retenu : usage par le bureau directeur, sans authentification.**

Un écran de connexion posé sur des données stockées dans le navigateur
protégerait de la curiosité, pas d'un accès à la machine : le mot de passe et
les données vivraient au même endroit, et n'importe qui pourrait lire les
deux. Plutôt qu'une sécurité de façade, l'outil l'annonce dans ses réglages —
la page **Réglages et données** dit noir sur blanc ce que l'outil ne protège
pas.

Une authentification qui tient suppose un serveur. C'est l'étape suivante, et
elle est décrite dans [`architecture.md`](architecture.md#et-ensuite).

**Travail à plusieurs** : chaque appareil a sa base. La sauvegarde JSON sert à
transmettre l'état complet d'une personne à une autre.

## 4. Priorités

**Retenu :** les quatre étapes du cahier des charges sont livrées — hub et
navigation, pages détaillées avec saisie persistante, indicateurs et
graphiques, exports et thème sombre.

Parmi les fonctionnalités de la phase 2, ont été retenues celles qui servent
tous les jours : import CSV, sauvegarde et restauration, et surtout les **alertes** —
cotisations à recouvrer, dates limites de dépôt, factures échues, stocks bas,
partenariats à renouveler. Un tableau de bord qui se contente d'afficher des
totaux ne fait pas agir ; celui-ci dit ce qu'il y a à faire cette semaine.

Écartés à ce stade : l'authentification (voir plus haut) et les intégrations
externes (facturation, Google Drive), qui supposent un serveur et des comptes.

## 5. Usage

**Retenu : desktop d'abord, mobile pleinement utilisable, hors ligne par
défaut.**

La saisie et les rapports se font sur ordinateur ; la consultation en salle,
un dimanche de championnat, se fait sur téléphone. Le hub devient une grille
au-dessous de 920 px et les tableaux deviennent des fiches empilées au-dessous
de 760 px — un tableau de neuf colonnes qui défile horizontalement sur un
téléphone n'est pas lisible.

Aucune requête réseau n'est émise, à aucun moment. Le fichier fonctionne
depuis une clé USB, dans un gymnase sans réseau.
