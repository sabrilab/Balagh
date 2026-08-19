/**
 * Coquille et routage. L'adresse porte l'état de navigation (`#/module/rh`) :
 * une page de module se partage par lien, le bouton « précédent » du
 * navigateur fonctionne, et l'impression d'un rapport garde son adresse.
 */

import { h, remplacer, icone, toast } from './dom.js';
import { MODULES, SAISONS } from './schema.js';
import { logo, TRACE_ICONES } from './composants.js';
import { vueHub } from './vue-hub.js';
import { vueModule, quitterModule } from './vue-module.js';
import { vueRapport } from './vue-rapport.js';
import { vueReglages, ouvrirAide } from './vue-reglages.js';
import { abonner, ajouterLigne, appliquerTheme, definirSaison, definirTheme, demarrerBase, estDemo, exporterBase, laBase, lignes, reglagesActifs, reinitialiser, saisonActive, saisons, stockageDisponible, supprimerLigne, themeEnregistre } from './store.js';
import { synthese, alertes, fluxMensuels } from './stats.js';
import { versXLSX, versCSV, tableModule } from './echange.js';

const MODULE_PAR_ROUTE = Object.fromEntries(MODULES.map((m) => [m.route, m]));

function routeCourante() {
  const brut = (window.location.hash || '#/').replace(/^#/, '');
  const morceaux = brut.split('/').filter(Boolean);
  if (morceaux[0] === 'module' && MODULE_PAR_ROUTE[morceaux[1]]) return { nom: 'module', module: MODULE_PAR_ROUTE[morceaux[1]] };
  if (morceaux[0] === 'rapport') return { nom: 'rapport' };
  if (morceaux[0] === 'reglages') return { nom: 'reglages' };
  return { nom: 'hub' };
}

function enTete() {
  const selecteurSaison = h('select.saisie.saisie--saison', {
    'aria-label': 'Saison affichée',
    onchange: (e) => definirSaison(e.target.value),
  }, [...new Set([...SAISONS, ...saisons()])].sort().map((s) => h('option', { value: s, text: s, selected: s === saisonActive() })));

  const boutonTheme = h('button.bouton-icone', {
    type: 'button',
    'aria-label': 'Changer de thème',
    title: 'Clair, sombre ou automatique',
    onclick: () => {
      const suite = { auto: 'clair', clair: 'sombre', sombre: 'auto' };
      const suivant = suite[themeEnregistre()] || 'clair';
      definirTheme(suivant);
      toast(`Thème : ${{ auto: 'automatique', clair: 'clair', sombre: 'sombre' }[suivant]}.`, 'neutre');
      rendre();
    },
  }, icone(themeEnregistre() === 'sombre' ? TRACE_ICONES.lune : TRACE_ICONES.soleil, 20));

  const route = routeCourante();
  return h('header.entete', {},
    h('a.marque', { href: '#/', 'aria-label': 'Tableau de bord Five League' },
      logo(38),
      h('span.marque-texte', {},
        h('span.marque-nom', { text: reglagesActifs().association }),
        h('span.marque-ligue', { text: reglagesActifs().ligue }))),
    h('nav.nav-modules', { 'aria-label': 'Domaines' },
      h('a.nav-lien', { href: '#/', class: route.nom === 'hub' ? 'nav-lien--actif' : '' }, icone(TRACE_ICONES.grille, 17), h('span', { text: 'Hub' })),
      MODULES.map((m) => h('a.nav-lien', {
        href: `#/module/${m.route}`,
        class: route.nom === 'module' && route.module.id === m.id ? 'nav-lien--actif' : '',
        style: { '--couleur-module': m.couleur },
      }, icone(m.icone, 17), h('span', { text: m.court })))),
    h('div.entete-outils', {},
      selecteurSaison,
      h('button.bouton-icone', { type: 'button', 'aria-label': 'Aide', title: 'Prise en main', onclick: ouvrirAide }, icone('M12 17h.01M9.5 9.2a2.6 2.6 0 1 1 3.3 2.5c-.6.2-.8.7-.8 1.3v.5M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 20)),
      boutonTheme,
      h('a.bouton-icone', { href: '#/reglages', 'aria-label': 'Réglages', title: 'Réglages et données' }, icone(TRACE_ICONES.reglages, 20))));
}

function bandeaux() {
  const messages = [];
  if (!stockageDisponible()) {
    messages.push(h('div.bandeau.bandeau--alerte', {}, icone(TRACE_ICONES.alerte, 18),
      h('span', { text: 'Ce navigateur refuse le stockage local : les saisies de cette session ne seront pas conservées. Exportez une sauvegarde avant de fermer l’onglet.' })));
  }
  if (estDemo()) {
    messages.push(h('div.bandeau', {}, icone(TRACE_ICONES.alerte, 18),
      h('span', {}, 'Données de démonstration — une association fictive, pour explorer l’outil. '),
      h('a', { href: '#/reglages', text: 'Vider la base et saisir les vôtres' })));
  }
  return messages.length ? h('div.bandeaux', {}, messages) : null;
}

function corps() {
  const route = routeCourante();
  if (route.nom !== 'module') quitterModule();
  switch (route.nom) {
    case 'module': return vueModule(route.module.id);
    case 'rapport': return vueRapport();
    case 'reglages': return vueReglages();
    default: return vueHub();
  }
}

let racine = null;

function rendre({ hautDePage = false } = {}) {
  const route = routeCourante();
  document.title = route.nom === 'module'
    ? `${route.module.titre} — ${reglagesActifs().association}`
    : `${reglagesActifs().association} — ${reglagesActifs().ligue}`;
  remplacer(racine, enTete(), bandeaux(), h('main.contenu', { id: 'contenu' }, corps()), piedDePage());
  if (hautDePage) window.scrollTo({ top: 0, behavior: 'instant' });
}

function piedDePage() {
  return h('footer.pied', {},
    h('p', { text: `${reglagesActifs().association} — outil de gestion interne. Données enregistrées sur cet appareil.` }),
    h('p', {}, h('a', { href: '#/rapport', text: 'Rapport de saison' }), ' · ', h('a', { href: '#/reglages', text: 'Réglages et données' })));
}

export function demarrerApplication() {
  appliquerTheme(themeEnregistre());
  demarrerBase();
  racine = h('div.application');
  document.body.appendChild(racine);
  rendre();
  window.addEventListener('hashchange', () => rendre({ hautDePage: true }));
  abonner(() => rendre());
  /* Point d'entrée unique pour les bancs d'essai : ils pilotent l'application
     par cette surface plutôt que par le DOM, qui change avec le design. */
  window.FiveLeague = {
    MODULES, rendre, route: routeCourante,
    laBase, lignes, ajouterLigne, supprimerLigne, reinitialiser, exporterBase,
    saisonActive, saisons, definirSaison, reglagesActifs, estDemo, stockageDisponible,
    synthese, alertes, fluxMensuels, versXLSX, versCSV, tableModule,
  };
}
