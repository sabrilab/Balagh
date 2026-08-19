# Décisions techniques

## Un fichier, aucune dépendance

Le livrable est un unique `dist/five-league.html` de 160 Ko. Il s'ouvre par
un double-clic, se copie sur une clé USB, se met en ligne en le déposant sur
n'importe quel hébergeur statique, et ne demande ni installation ni compte.

Le cahier des charges suggérait React, Tailwind, Recharts, jsPDF et SheetJS.
L'outil n'en utilise aucun, pour trois raisons :

1. **La durée de vie.** Une association ouvrira ce fichier dans trois ans. Un
   fichier HTML autonome s'ouvrira encore ; une chaîne de construction de 300
   paquets, non — il faudra la réparer avant même de lire une cotisation.
2. **Le poids.** L'ensemble — application, style, jeu de démonstration — pèse
   160 Ko. React et Recharts seuls dépassent 300 Ko avant la première ligne
   de code métier.
3. **Le besoin réel.** Sept tableaux, des formulaires et trois formes de
   graphique s'écrivent directement. `h()`, la fabrique de DOM de
   [`src/app/dom.js`](../src/app/dom.js), tient en trente lignes.

Ce qui aurait justifié un cadre — état partagé complexe, rendu incrémental de
milliers de lignes, routage imbriqué — n'est pas là. Le rendu se refait en
entier à chaque changement : à cette échelle, c'est instantané et le code
n'a aucun état d'interface à synchroniser.

Le montage ([`tools/build.mjs`](../tools/build.mjs)) concatène les modules ES
en retirant `import` et `export`. **Conséquence à connaître** : tout partage
une seule portée. Le montage refuse de produire un fichier si deux modules
déclarent le même nom au premier niveau.

## Le schéma comme source unique

[`src/app/schema.js`](../src/app/schema.js) décrit les sept domaines : champs
et types, colonnes du tableau, colonnes calculées, indicateurs, états, graphe
de répartition, contribution au modèle économique, flux datés.

Tout en découle : une seule vue de module
([`vue-module.js`](../src/app/vue-module.js)) sert les sept pages,
formulaires, tris, filtres, recherches et exports compris. Sept pages écrites
à la main auraient signifié sept formulaires à corriger à chaque évolution.

Ajouter un champ : une ligne dans `champs`. Ajouter un huitième domaine : un
objet de plus dans `MODULES` — il apparaît dans le hub, la navigation, la
synthèse, le rapport et les exports sans autre modification.

## Le modèle économique

Chaque domaine expose `economie(lignes)` — produits encaissés, charges
directes, montants attendus, bénévolat valorisé — et, quand ses flux ont une
date, `flux(ligne)`. [`stats.js`](../src/app/stats.js) assemble ces réponses.

Le principe : **seul l'encaissé compte comme produit**. Une subvention
accordée mais non versée, une facture émise, une cotisation appelée figurent
en « reste à percevoir », jamais dans les produits. C'est la lecture qui
évite de bâtir un budget sur des promesses.

Le bénévolat est valorisé à part, jamais mélangé aux produits monétaires : il
pèse dans un dossier de subvention, pas dans une trésorerie.

**Limite connue.** Le module boutique décrit un catalogue avec un stock, pas
un journal de ventes daté. Son chiffre d'affaires est donc annuel et
n'apparaît pas dans l'histogramme mensuel — ce que le graphique indique en
légende. Le jour où les ventes doivent être suivies au fil de l'eau, il
faudra un module de ventes distinct, et la boutique deviendra son catalogue.

## Persistance

Toute la base tient dans une clé de `localStorage`. Quelques milliers de
lignes restent très en deçà des 5 Mo du quota : la démonstration, deux saisons
complètes, pèse 145 Ko.

Si le stockage est refusé (navigation privée, certains navigateurs sur
`file://`), l'application continue en mémoire et l'annonce par un bandeau
plutôt que de laisser croire que les saisies sont conservées.

La lecture d'une base enregistrée par une version antérieure passe par
`normaliser()` : un module ou un réglage ajouté depuis est complété, jamais
perdu.

## Exports sans bibliothèque

Le **CSV** est écrit au format que les tableurs français attendent :
point-virgule, BOM, CRLF. Sans ces trois détails, Excel colle toute la ligne
dans la première colonne et casse les accents.

Le **XLSX** est produit à la main : un classeur est une archive ZIP de
quelques fichiers XML. L'archive est écrite en mode « stocké », sans
compression — inutile d'embarquer un compresseur pour des fichiers de
quelques dizaines de kilo-octets. Le banc de fumée vérifie la structure de
l'archive et recalcule les sommes de contrôle de chaque entrée : un classeur
qui ment sur ses CRC est rejeté par Excel, et c'est invisible autrement.

Le **PDF** passe par l'impression du navigateur, avec une feuille de style
dédiée. Un générateur de PDF embarqué produit un rendu approximatif de la
page ; « Enregistrer en PDF » produit exactement ce qui est à l'écran, avec
un texte sélectionnable et des polices propres.

## Graphiques

Trois formes suffisent : anneau, histogramme groupé, barres horizontales.
Toutes en SVG écrit à la main, avec un équivalent textuel pour les lecteurs
d'écran.

L'histogramme se redessine à la largeur réelle de son conteneur plutôt que
d'être étiré depuis un `viewBox` fixe : une unité SVG vaut un pixel, donc les
étiquettes d'axe gardent leur taille lisible sur un téléphone comme sur un
écran large. Les étiquettes s'espacent d'elles-mêmes quand la place manque.

## Accessibilité, mesurée

[`tools/audit.mjs`](../tools/audit.mjs) mesure dans le navigateur, sur 30
écrans (trois largeurs, deux thèmes, cinq vues), quatre règles vérifiables
mécaniquement : contraste 4,5:1 (3:1 pour le grand texte), texte au-dessus de
11 px, cibles de 40 px au pointeur et 44 px au doigt, aucun débordement
horizontal.

Trois écarts trouvés au premier passage, tous corrigés : le vert de la palette
d'origine sur fond blanc, l'ambre des pastilles d'état, et le médaillon
central dont le dégradé empêchait la mesure du fond. Les logotypes sont exclus
du critère de contraste, comme le prévoit le WCAG 1.4.3.

## Et ensuite

Ce que la version actuelle ne peut pas faire sans serveur :

- **Plusieurs personnes sur la même base.** Aujourd'hui, chaque appareil a la
  sienne ; la sauvegarde JSON sert de courroie de transmission.
- **Une authentification réelle** et des rôles (admin, responsable de domaine,
  lecture seule).
- **Un historique des modifications** — qui a changé quoi, quand.

Ces trois besoins appellent la même chose : une base de données partagée et
une API. Le schéma est prêt pour cela — il décrit déjà les entités, leurs
champs et leurs types ; il servira de définition de tables sans réécriture.
