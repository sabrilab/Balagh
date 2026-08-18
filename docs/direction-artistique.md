# Direction artistique

## Le problème posé

Le cahier des charges demande « sobriété et dignité dans l'ensemble de
l'expérience ». C'est une contrainte, pas une direction : elle dit ce qu'il
faut éviter, pas où aller. Les références visuelles annoncées à la section 7
n'étaient pas accessibles depuis cet environnement (voir la note en fin de
document). La direction a donc été tirée du sujet lui-même.

## La thèse : l'acoustique comme architecture

Le mihrab existe à cause du son. Cette niche projette la voix de l'imam dans la
salle : c'est un dispositif acoustique avant d'être un ornement. Une
réverbération d'application n'est rien d'autre — un volume dans lequel on place
une voix. L'application prend ce parallèle au sérieux : ses préréglages ne
s'appellent pas « hall » ou « plate », ils s'appellent « mosquée de quartier »,
« grande mosquée », « sous le dôme ».

De là découle tout le reste.

## Couleur : deux registres, une même famille

Le mushaf imprimé le jour, la salle de prière la nuit. Ce ne sont pas un thème
clair et son inversion mécanique, mais deux états réels du même sujet.

| Rôle | Clair — « Mushaf » | Sombre — « Qiyam » |
|---|---|---|
| Fond | `#E4E6DF` calcaire | `#090D0D` |
| Surface | `#F2F3ED` | `#0E1414` |
| Encre | `#141A19` | `#E8E6DE` |
| Laiton (accent) | `#8A6620` | `#C9A25C` |
| Myrte (structure) | `#2F5D50` | `#6FA491` |
| Garance (captation) | `#9B3A2E` | `#C97563` |

Trois décisions à défendre :

**Le neutre est biaisé vert, jamais gris pur.** Un gris neutre a l'air de
n'avoir pas été choisi. Le calcaire des intérieurs de mosquée tire légèrement
vers le vert froid ; les deux registres partagent ce biais, ce qui les fait lire
comme une même famille plutôt que comme deux thèmes.

**Le clair est de la pierre, pas de la crème.** La tentation était un ivoire
chaud de papier ancien. C'est devenu le fond par défaut de toute maquette
générée, et cela tirait la palette vers le pastiche. La pierre pâle rattache le
registre clair à l'architecture plutôt qu'au parchemin.

**La garance n'est pas une alarme.** Le rouge signale l'enregistrement en cours.
Dans une application religieuse il pouvait détonner — sauf que le mushaf imprimé
utilise réellement le rouge, pour les signes de pause et les marques de tajwid.
La couleur est donc authentique au sujet, et non empruntée aux interfaces
d'enregistrement.

Un seul accent porte l'ensemble — le laiton. Tout le reste est tenu au calme.

## Typographie

**Amiri Quran** pour le texte sacré. Ce n'est pas un choix d'ambiance : c'est la
seule police libre dessinée pour l'othmanien entièrement vocalisé. Les
substituts avalent les petits ronds suscrits ou déplacent les signes de madd —
c'est-à-dire précisément l'information que le mode tajwid met en couleur.

**Spectral** pour les traductions et les titres. Un romain dessiné pour l'écran,
d'un classicisme qui répond au naskh sans le singer.

**IBM Plex Sans** pour l'interface, les minuteurs et les chiffres tabulaires.
Un caractère d'ingénieur : l'application est un studio, ses commandes doivent
avoir l'air d'outils.

Les polices sont **embarquées en data: URI**. Environ 430 Ko de woff2, pour que
le rendu du texte coranique ne dépende d'aucun réseau.

## Mise en page

L'application vit dans un châssis iOS rendu — fidèle au `ios-frame.jsx` du
projet de design d'origine. Autour, un rail de notes explique les décisions :
la page est à la fois une démonstration et sa propre spécification.

Sous 720 px, le châssis disparaît et l'application occupe tout l'écran. Ce n'est
pas une simplification de secours : sur un téléphone, c'est l'application, pour
de vrai.

## Ce que le sujet interdit

Aucune représentation d'être animé, nulle part. Les décors vidéo sont des arcs
concentriques et des étoiles à huit branches tracées au canvas — de la géométrie,
pas de la figuration. Les animations sont brèves, et `prefers-reduced-motion`
les désactive.

Le silence compte aussi : aucun son d'interface. Dans une application dont
l'objet est la voix, le seul son est celui de l'utilisateur.

## Note sur le projet de design d'origine

Le fichier `Talawa Studio.dc.html` et les cinq références visuelles jointes
n'ont pas pu être lus : le MCP `claude_design` exige une autorisation
interactive (`/design-login`) indisponible dans un environnement distant, et
l'URL du projet répond 403 sans session. Le nom de l'application, le cadre iOS
et le parti pris d'un studio en quatre étapes viennent de ce qui était lisible
dans la demande ; la palette et la typographie ont été dérivées du sujet.

Si le fichier de design est fourni, l'habillage se reprend sans toucher au
moteur : les jetons de couleur sont regroupés en tête de `src/styles.css`, et
la palette vidéo dans la constante `PAL` de `src/app.js`.
