/**
 * Réglages, sauvegarde et restauration. Tout ce qui touche à la base entière
 * est réuni ici plutôt que dispersé : effacer, restaurer et recharger le jeu
 * de démonstration sont des gestes rares et lourds de conséquences, ils
 * méritent un seul endroit et une confirmation.
 */

import { h, modale, confirmer, toast } from './dom.js';
import { MODULES, SAISONS } from './schema.js';
import { euros, nombre } from './format.js';
import { carte, bouton, champFichier, TRACE_ICONES } from './composants.js';
import { versXLSX, tableModule, livrerFichier, nomHorodate } from './echange.js';
import { definirSaison, definirTheme, estDemo, exporterBase, lignes, majReglages, reglagesActifs, reinitialiser, restaurer, saisonActive, saisons, stockageDisponible, themeEnregistre } from './store.js';

const CHAMPS_REGLAGES = [
  { id: 'association', libelle: 'Nom de l’association', type: 'text' },
  { id: 'ligue', libelle: 'Nom de la ligue', type: 'text' },
  { id: 'territoire', libelle: 'Territoire', type: 'text' },
  { id: 'tauxHoraire', libelle: 'Taux de valorisation du bénévolat (€/h)', type: 'number', aide: 'Sert au calcul des contributions volontaires en nature.' },
  { id: 'objectifProduits', libelle: 'Objectif de produits (€)', type: 'number' },
  { id: 'adherentsAttendus', libelle: 'Objectif d’adhérents', type: 'number' },
];

function classeurComplet() {
  const r = reglagesActifs();
  return versXLSX(MODULES.map((m) => tableModule(m, lignes(m.id, { toutesSaisons: true }), r)));
}

export function vueReglages() {
  const r = reglagesActifs();
  const total = MODULES.reduce((t, m) => t + lignes(m.id, { toutesSaisons: true }).length, 0);
  const poids = new Blob([exporterBase()]).size;

  const formulaire = h('form.formulaire', { onsubmit: (e) => e.preventDefault() },
    h('div.grille-champs', {}, CHAMPS_REGLAGES.map((c) => h('div.champ', {},
      h('label.champ-libelle', { for: `reglage-${c.id}`, text: c.libelle }),
      h('input.saisie', {
        id: `reglage-${c.id}`, type: c.type, value: r[c.id], min: c.type === 'number' ? '0' : null,
        onchange: (e) => {
          const valeur = c.type === 'number' ? Number(e.target.value) || 0 : e.target.value.trim();
          majReglages({ [c.id]: valeur });
          toast('Réglage enregistré.');
        },
      }),
      c.aide ? h('p.champ-aide', { text: c.aide }) : null))));

  const restaurationFichier = h('input', { type: 'file', accept: 'application/json,.json', class: 'saisie' });
  restaurationFichier.addEventListener('change', async () => {
    const f = restaurationFichier.files[0];
    if (!f) return;
    try {
      const nb = restaurer(await f.text());
      toast(`Sauvegarde restaurée : ${nb} modules.`);
    } catch (e) {
      toast(e.message || 'Fichier illisible.', 'erreur');
    }
    restaurationFichier.value = '';
  });

  return h('div.page', {},
    h('header.page-tete', {},
      h('a.lien-retour', { href: '#/' }, 'Tableau de bord'),
      h('h1.page-titre', { text: 'Réglages et données' }),
      h('p.page-resume', { text: 'Identité de l’association, objectifs de la saison, et gestion de la base.' })),

    h('div.grille-deux', {},
      carte({ titre: 'Association et objectifs', sousTitre: 'les objectifs alimentent les jauges du tableau de bord', contenu: formulaire }),

      carte({
        titre: 'Base de données',
        sousTitre: stockageDisponible() ? 'enregistrée dans ce navigateur' : 'stockage indisponible — session en mémoire',
        contenu: h('div.pile', {},
          h('dl.definitions', {},
            h('dt', { text: 'Lignes enregistrées' }), h('dd', { text: nombre(total) }),
            h('dt', { text: 'Saisons couvertes' }), h('dd', { text: saisons().join(', ') }),
            h('dt', { text: 'Poids de la base' }), h('dd', { text: `${(poids / 1024).toFixed(0)} Ko` }),
            h('dt', { text: 'Jeu de données' }), h('dd', { text: estDemo() ? 'démonstration' : 'données de l’association' })),
          h('div.choix-export', {},
            bouton('Classeur Excel complet', { variante: 'primaire', icone: TRACE_ICONES.exporter, onclick: () => livrerFichier(nomHorodate('five-league-base', 'xlsx'), classeurComplet()) }),
            bouton('Sauvegarde JSON', { icone: TRACE_ICONES.exporter, onclick: () => livrerFichier(nomHorodate('five-league-sauvegarde', 'json'), exporterBase(), 'application/json') })),
          h('p.champ-libelle', { text: 'Restaurer une sauvegarde' }),
          restaurationFichier,
          h('p.texte-doux.petit', { text: 'La restauration remplace intégralement la base actuelle.' })),
      })),

    carte({
      titre: 'Saison et apparence',
      contenu: h('div.pile', {},
        h('div.champ', {},
          h('label.champ-libelle', { for: 'reglage-saison', text: 'Saison affichée' }),
          h('select.saisie', { id: 'reglage-saison', onchange: (e) => definirSaison(e.target.value) },
            [...new Set([...SAISONS, ...saisons()])].sort().map((s) => h('option', { value: s, text: s, selected: s === saisonActive() })))),
        h('div.champ', {},
          h('label.champ-libelle', { for: 'reglage-theme', text: 'Thème' }),
          h('select.saisie', { id: 'reglage-theme', onchange: (e) => definirTheme(e.target.value) },
            [['auto', 'Selon le système'], ['clair', 'Clair'], ['sombre', 'Sombre']].map(([v, t]) => h('option', { value: v, text: t, selected: themeEnregistre() === v }))))),
    }),

    carte({
      titre: 'Opérations sensibles',
      classe: 'carte--danger',
      contenu: h('div.pile', {},
        h('p.texte-doux', { text: 'Ces actions remplacent la base entière. Exportez une sauvegarde avant de les lancer.' }),
        h('div.choix-export', {},
          bouton('Recharger le jeu de démonstration', {
            onclick: async () => {
              if (await confirmer('Recharger la démonstration ?', 'Les données actuelles seront remplacées par l’association fictive de démonstration.')) {
                reinitialiser({ demo: true });
                toast('Jeu de démonstration rechargé.');
              }
            },
          }),
          bouton('Vider la base', {
            variante: 'danger',
            onclick: async () => {
              if (await confirmer('Vider toute la base ?', 'Les sept modules seront remis à zéro pour toutes les saisons.')) {
                reinitialiser({ demo: false });
                toast('Base vidée.', 'neutre');
              }
            },
          }))),
    }),

    carte({
      titre: 'Ce que l’outil ne fait pas (encore)',
      contenu: h('ul.liste-notes', {},
        h('li', { text: 'Les données vivent dans ce navigateur, sur cet appareil. Deux personnes qui saisissent chacune de leur côté travaillent sur deux bases distinctes : la sauvegarde JSON sert à les transmettre.' }),
        h('li', { text: 'Aucun compte ni mot de passe : un écran de connexion posé sur des données locales protégerait de la curiosité, pas d’un accès à la machine. Une vraie authentification suppose un serveur, et c’est l’étape suivante.' }),
        h('li', { text: 'La boutique décrit un catalogue, pas un journal de ventes daté : le chiffre d’affaires est donc annuel, non ventilé par mois.' })),
    }));
}

export function ouvrirAide() {
  modale({
    titre: 'Prise en main',
    large: true,
    corps: h('div.pile', {},
      h('p', { text: 'Chaque domaine du modèle socio-économique a sa page : cliquez sur un secteur du hub, ou utilisez le menu en haut.' }),
      h('ul.liste-notes', {},
        h('li', { text: 'Ajouter, modifier, supprimer : les boutons se trouvent dans la barre d’outils de chaque module et au bout de chaque ligne.' }),
        h('li', { text: 'Tout est enregistré dans le navigateur au fil de la saisie ; aucune connexion n’est nécessaire.' }),
        h('li', { text: 'La saison se change en haut à droite : les tableaux et les indicateurs suivent.' }),
        h('li', { text: 'Exports : CSV et Excel par module, classeur complet et sauvegarde JSON dans les réglages, PDF par l’impression du rapport de saison.' })),
      h('p.texte-doux', { text: `Valorisation du bénévolat au taux de ${euros(reglagesActifs().tauxHoraire)} de l’heure — modifiable dans les réglages.` })),
    actions: [{ libelle: 'Fermer' }],
  });
}
