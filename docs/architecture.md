# Décisions techniques

Le cahier des charges laisse ouverts le choix des API, la pile technique et
l'architecture (section 7). Voici ce qui a été retenu, et pourquoi.

## Pourquoi un prototype web plutôt que du Swift

Le produit visé est une application iOS. Un projet Xcode aurait été le livrable
naturel, mais rien ici ne permet de le compiler ni de l'exécuter : on aurait
livré du code non vérifié, ce qui est le pire résultat possible pour une
application dont la valeur tient à l'exactitude.

Le choix retenu est une **application web à haute fidélité, réellement
fonctionnelle** : micro, effets, rendu et export marchent pour de bon, et les
27 vérifications automatisées s'exécutent dans un vrai navigateur. Elle sert de
spécification exécutable pour le portage natif, et elle est utilisable telle
quelle sur un téléphone.

Ce qui se transpose directement en Swift :

| Web | iOS |
|---|---|
| Web Audio `ConvolverNode` + réponses impulsionnelles générées | `AVAudioUnitReverb` ou `AVAudioUnitConvolution` |
| `MediaRecorder` sur `getUserMedia` | `AVAudioEngine` + `AVAudioFile` |
| Canvas 1080×1920 + `captureStream` | `AVAssetWriter` + `CALayer` |
| Index inverse en mémoire | SQLite FTS5 embarqué |

## Données

Un corpus **embarqué** plutôt qu'une API appelée à l'exécution. Trois raisons :
l'application doit fonctionner hors ligne (on récite là où on est) ; une
dépendance réseau sur un texte sacré introduit un risque de contenu altéré ou
indisponible ; et la page publiée s'exécute sous une politique de sécurité qui
interdit les appels externes.

Coût : 2,4 Mo de JSON. Bénéfice : aucun appel réseau, aucun risque d'altération,
recherche instantanée.

### Deux défauts de la source, détectés et traités

`tools/build-data.mjs` vérifie avant d'écrire. Deux anomalies réelles ont été
trouvées dans l'édition amont.

**La basmala collée au verset 1.** L'édition `quran-uthmani` sert la basmala
concaténée au premier verset de chaque sourate qui en porte une : 2:1 arrive
comme « *basmala* الٓمٓ » alors que le verset 2:1 est « الٓمٓ » seul. La basmala
d'ouverture n'est un verset numéroté que dans Al-Fatiha. Elle est donc détachée
sur les 112 sourates concernées (1 et 9 exclues) et stockée à part, en
s'appuyant sur le drapeau `bismillah_pre` de Quran.com.

La chaîne de la basmala n'est jamais écrite en dur : elle est **dérivée de 1:1**,
ce qui garantit une correspondance exacte octet pour octet avec la source.

**Une shadda parasite en 95:1 et 97:1.** Dans ces deux sourates, la basmala
préfixée porte une shadda sur le bāʾ initial (`U+0628 U+0651 U+0650` au lieu de
`U+0628 U+0650`), soit « بِّسْمِ » au lieu de « بِسْمِ ». Le défaut est confiné
au préfixe que l'on retire ; le verset lui-même n'est pas touché. Le
rapprochement tolère donc un écart portant uniquement sur des shadda
surnuméraires, et l'anomalie est journalisée dans les métadonnées du corpus.

Ces deux cas illustrent le principe : **une vérification qui échoue vaut mieux
qu'un corpus douteux qui passe.**

## Moteur tajwid

La coloration est une aide à la lecture, pas une autorité. Le principe retenu
est la **prudence** : seules les règles déterministes à partir du texte
othmanien vocalisé sont rendues ; en cas de doute, aucune couleur. Le mode
« noir simple » est toujours à un geste.

| Règle | Détection | Fiabilité |
|---|---|---|
| Madd | signe maddah `U+0653` explicite | totale, la marque est dans le texte |
| Ghunna | nūn ou mīm portant une shadda | totale |
| Qalqala | ق ط ب ج د portant un soukoun explicite | totale |
| Lettre muette | rond `U+06DF` ou rectangle `U+06E0` suscrit | totale |
| Ikhfa / idgham / iqlab | nūn quiescent ou tanwīn, selon la lettre suivante | règle déterministe |

**Ce qui n'est pas coloré, volontairement.** Le nūn quiescent non marqué d'un
soukoun — fréquent dans l'orthographe othmanienne, comme dans `أَنزَلَ` ou
`مَن يَقُولُ` — ne déclenche aucune règle. Le colorer supposerait d'inférer une
quiescence non écrite. On préfère le silence à l'erreur.

### Deux bugs trouvés en vérifiant

**Les sièges de prolongation.** L'alif nu, l'alif waṣla et l'alif maqṣūra ne
portent aucun son propre. En les prenant pour « la lettre suivante », le moteur
classait `هُدًۭى لِّلْمُتَّقِينَ` (2:2) en ikhfa au lieu d'idgham sans ghunna.
Ils sont désormais traversés.

**U+06E2 n'est pas un marqueur d'iqlab.** Le petit mīm suscrit isolé était
traité comme la marque de l'iqlab. Le corpus le dément : sur ses 2 445
occurrences, 409 seulement précèdent un bāʾ. Dans le texte de Tanzil il signale
un tanwīn non prononcé clairement, quelle que soit la suite — bāʾ (iqlab), lām
(idgham) ou qāf (ikhfa). Le raccourci colorait donc 2 036 lettres à tort. Il a
été supprimé : la règle générale, fondée sur la lettre suivante, est la seule
correcte. Les comptes sont passés de 2 525 iqlab à 290 — l'iqlab *est* rare.

Une vérification tourne sur les 6 236 versets et confirme que le texte extrait
du HTML coloré est **identique caractère pour caractère** au corpus. La
coloration ne peut pas altérer le texte.

## Recherche

Index inverse construit dans le navigateur (environ 200 ms, hors du chemin
critique) sur les traductions française et anglaise et sur l'arabe normalisé.
Le score combine la rareté des termes et la **couverture** de la requête : un
verset qui contient tous les mots demandés passe devant un verset qui en répète
un seul.

Les thèmes de l'écran de recherche sont des **requêtes pré-écrites**, pas des
listes de références. Ils traversent le même moteur que ce qu'écrit
l'utilisateur. Aucune référence n'est mémorisée dans le code, donc aucune ne
peut être fausse.

**Extension serveur.** Un agent LLM améliorerait le rappel sur les formulations
indirectes (« que dire quand on a peur de mourir »). Sa contrainte ne change
pas : il ne produit aucun texte religieux, il **désigne** des versets du corpus,
et l'application affiche le texte vérifié qu'elle détient déjà. En pratique :
l'agent renvoie une liste de références, l'application les résout localement, et
toute référence inconnue est écartée silencieusement.

## Audio

Chaîne : coupe-bas 85 Hz → creux de chaleur → présence 3,2 kHz → saturation
douce → direct + convolution + écho optionnel.

La chaîne vient de `core/audio.mjs`, le fichier qu'importe aussi l'application
native. Le web l'obtient par le build, qui transpose chaque module de `core/`
en fonction immédiate rangée sous `Core.<nom>` — il n'y a donc **qu'une seule
implémentation** à corriger, jamais deux à tenir en phase.

Deux conséquences de ce partage, toutes deux voulues. Le compresseur a cédé la
place à une courbe de tangente hyperbolique : le natif n'expose pas de
`DynamicsCompressorNode`, et une saturation douce appliquée des deux côtés vaut
mieux qu'un traitement qui diffère selon l'appareil. Le générateur de bruit des
réponses impulsionnelles est déterministe et non `Math.random` : deux appareils
produisent alors exactement la même acoustique, et un export est reproductible.

Les réponses impulsionnelles sont **générées** : bruit blanc passé au filtre
d'un pôle, enveloppe exponentielle calée sur le RT60 demandé, quelques
réflexions précoces décorrélées entre canaux pour donner sa taille au volume.
Elles sont mises en cache par couple préréglage/fréquence d'échantillonnage.

Le micro est demandé **sans** annulation d'écho, **sans** réduction de bruit et
**sans** gain automatique : ces traitements sont réglés pour la parole
téléphonique et abîment une récitation.

## Export

Rendu en **temps réel** : le tampon traité alimente un
`MediaStreamAudioDestinationNode`, le canvas fournit sa piste vidéo via
`captureStream`, et `MediaRecorder` encode les deux. Une passe hors ligne serait
plus rapide pour l'audio seul, mais l'encodage reste temps réel de toute façon,
et un seul chemin pour l'audio et la vidéo vaut mieux que deux.

Le calage des versets n'est plus estimé : il est **posé par le récitant**. Pendant
la captation, un glissement vers le haut — ou un appui, ou le bouton — passe au
verset suivant et horodate le passage. Le rendu suit donc la voix exactement.

L'estimation au prorata des signes subsiste comme repli : pour un enregistrement
importé, qui n'a pas de repères, et pour compléter la fin quand le récitant
n'a pas fait défiler jusqu'au dernier verset.

La composition vidéo est entièrement exprimée en multiples de `k = largeur/1080`,
de sorte que l'aperçu basse définition et l'export 1080×1920 donnent exactement
la même image.

L'unité affichée n'est plus le verset mais le **segment** : un verset long change
de plan à chacun de ses waqf. La barre de progression porte les passages d'un
segment au suivant, comme les chapitres d'une piste.

La traduction incrustée ne paraît qu'**une fois par verset**, sur le premier
fragment. La répéter sous chaque fragment donnait huit lignes de français figées
sous un arabe qui change ; la découper aurait supposé un alignement entre les
hémistiches arabes et les mots français, qui n'existe pas. La référence dit
« 2/5 » : le spectateur sait qu'il est dans le même verset.

L'image respire avec la voix. L'enveloppe est un **RMS** et non une crête : le
RMS suit l'énergie perçue là où la crête suit les accidents, donc le texte
respire au lieu de sursauter sur les claquements. L'effet est volontairement
ténu — 8 % d'opacité et quelques pixels de filet. Une pulsation visible ferait
du verset un effet, ce qu'il n'est pas.

### Les divisions du mushaf

Sourate, juz, hizb, rub' al-hizb, page : ces découpes ne sont pas des
conventions d'application, ce sont celles du Coran imprimé. Les métadonnées
par verset de l'édition Tanzil les portent déjà ; le build en extrait les
débuts — 30 juz, 240 rub', 604 pages — et les range dans le corpus. Un hizb
fait quatre rub' parce que c'est sa définition, jamais un partage du nombre de
versets.

La vérification est ce qui rend ces tables dignes de confiance : le signe ۞ est
dans le **texte**, les divisions sont dans les **métadonnées**, et les
confronter vérifie l'une par l'autre. Chacun des 199 signes doit tomber sur un
début de rub'. 198 le font. Le dernier, en 15:49, précède d'un verset la borne
tabulée du rub' 106 ; l'écart est tracé dans `meta.upstreamAnomalies`, la
division tabulée est retenue, et le build refuse d'écrire si un second écart
apparaît — ce serait la source qui a changé.

Les 42 débuts de rub' sans signe ne sont pas une anomalie : ils tombent au
premier verset d'une sourate, où le titre tient ce rôle.

### Découpage aux signes de pause

`core/segments.mjs` ne connaît ni le DOM ni React : il reçoit un prédicat
« ce texte tient-il ». C'est ce qui lui permet de servir les deux plateformes,
qui mesurent différemment — copie invisible de la carte sur le web,
`onTextLayout` calibré une fois en natif.

L'ordre de préférence des waqf est celui des maîtres de lecture : ۘ obligatoire,
puis ۗ, puis ۚ, puis ۖ. À rang égal, la coupe la plus proche du milieu, pour ne
pas produire un fragment d'un mot suivi d'un fragment de trois lignes. Le signe
ۙ, qui interdit l'arrêt, n'est jamais retenu ; les deux points d'un mu'anaqah ۛ
sont exclusifs — prendre les deux serait une faute de lecture.

Faute de waqf, une coupe de confort tombe sur une frontière de mot et se
**signale** à l'écran. Sur les 6 236 versets : 1 339 découpés en 8 291 segments,
408 coupes de confort, zéro texte altéré, zéro coupe interdite.

### Montage

`core/edit.mjs` tient la liste des morceaux — des intervalles dans la prise,
lus dans l'ordre du tableau. La prise n'est jamais réécrite ; « Rétablir » est
donc gratuit, et un fondu de six millisecondes à chaque jointure évite le
claquement d'une discontinuité de forme d'onde.

Le piège est le calage. Les repères sont datés dans la **source** : dès qu'on
coupe, ils ne correspondent plus. Une première version remappait chaque repère
vers son instant de montage — et donnait des résultats absurdes dès qu'on
déplaçait un morceau, tous les repères s'effondrant sur la même valeur. C'est
que le remappage suppose un ordre inchangé, ce que le déplacement contredit par
définition.

`playSchedule` reconstruit donc le **programme** depuis les morceaux : pour
chaque morceau lu, on sait d'où il vient dans la source, donc quel segment il
porte ; un morceau qui enjambe deux repères est scindé d'autant, et deux
morceaux voisins portant le même segment sont fondus. Le texte suit le son,
quelle que soit la manipulation.

### Silences

Le seuil de détection est **relatif à la voix**, pas absolu : une récitation
murmurée dans une pièce calme et une récitation portée n'ont pas le même
plancher. On prend le 75ᵉ centile des fenêtres actives comme référence, et
32 dB en dessous comme seuil. Les blancs des extrémités se rognent d'un geste ;
ceux du milieu sont proposés un par un, jamais retirés d'office — une pause de
récitation peut être voulue.

## Deux cibles, mêmes sources

Le même code produit deux formes, parce que les contraintes sont opposées.

**L'Artifact** doit tout embarquer : sa politique de sécurité interdit toute requête
sortante. Un seul fichier de 4,1 Mo, polices et corpus intégrés.

**Le site** a l'intérêt inverse. Le corpus et les polices ne changent presque
jamais ; les servir séparément, sous un nom empreinté sur leur contenu, permet un
cache immuable. Le HTML tombe à 118 Ko et une visite de retour ne revalide que lui.

Trois marqueurs en commentaire dans `src/index.html` — `HEAD`, `FONTS`, `DATA` —
et un séparateur `BODY` suffisent : le build substitue la balise entière, pas
seulement son contenu, et enveloppe la cible web dans un document complet.

Côté application, un seul point bouge :

```js
const D = window.__QURAN__ || await fetch(window.__QURAN_URL__).then(r => r.json());
```

### Les polices séparées ne sont pas qu'une question de cache

Les règles `@font-face` de Google Fonts portent un `unicode-range`. Intégrées en
base64, les 23 sous-ensembles partent d'un bloc — cyrillique, grec et vietnamien
compris, qui ne seront jamais dessinés. Servis en fichiers, le navigateur n'en
demande que ce qu'il doit rendre : **5 sur 23, 154 Ko au lieu de 431**, mesuré.

### Ce qui reste à gagner

Le corpus domine la première visite : 3,0 Mo, dont environ un tiers pour la
traduction anglaise, qui n'est chargée que si on la demande. La scinder du noyau
arabe et français couperait encore un quart du transfert initial. Non fait :
cela rend la lecture d'un verset asynchrone, ce qui touche le chemin de rendu.

## Publication

Le fichier construit est un **fragment** : ni doctype, ni `<html>`, ni `<body>`.
Les navigateurs l'ouvrent tel quel, et la plateforme Artifact l'enveloppe dans sa
propre coquille.

Une garde du build refuse d'écrire si `<meta charset="utf-8">` ne figure pas
dans les 1 024 premiers octets. Ce n'est pas de la superstition : le bloc de
polices en base64 remplit la fenêtre de détection d'encodage du navigateur, qui
retombe alors sur du latin-1 et casse tous les littéraux arabes du moteur
tajwid. Le bug s'est produit, le test l'a attrapé, la garde l'empêche de
revenir.

L'export de fichier passe par la capacité `downloads` de la plateforme quand
elle est disponible — une page publiée ne peut pas déclencher un téléchargement
elle-même — et retombe sur un lien classique en dehors de ce contexte.
