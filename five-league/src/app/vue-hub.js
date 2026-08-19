/**
 * Tableau de bord. Le hub radiatif est la porte d'entrée : sept domaines
 * disposés autour de la marque, chacun portant son indicateur clé, pour que
 * l'état du modèle socio-économique se lise avant tout clic.
 *
 * Sous 900 px le cercle devient une grille : sur un téléphone, sept pastilles
 * en rosace seraient trop petites pour être touchées de façon fiable.
 */

import { h, icone } from './dom.js';
import { MODULES } from './schema.js';
import { synthese, fluxMensuels, alertes, evolutionProduits, saisonPrecedente } from './stats.js';
import { euros, eurosCourt, pourcent, moisEtiquette } from './format.js';
import { carteKPI, carte, logo, bouton, TRACE_ICONES } from './composants.js';
import { anneau, legende, histogramme } from './graphes.js';
import { lignes, reglagesActifs } from './store.js';

/** Positions du hub : sept sommets d'un cercle, le premier au nord. */
function positions(nombreModules, rayon = 37) {
  return Array.from({ length: nombreModules }, (_, i) => {
    const angle = (i / nombreModules) * Math.PI * 2 - Math.PI / 2;
    return { x: 50 + Math.cos(angle) * rayon, y: 50 + Math.sin(angle) * rayon };
  });
}

function hubRadiatif(bilan) {
  const points = positions(MODULES.length);
  const liens = h('svg.hub-liens', { viewBox: '0 0 100 100', 'aria-hidden': 'true', preserveAspectRatio: 'none' });
  points.forEach((p, i) => {
    liens.appendChild(h('line', { x1: 50, y1: 50, x2: p.x, y2: p.y, stroke: MODULES[i].couleur, 'stroke-width': 0.4, 'stroke-dasharray': '1.6 1.6', opacity: 0.55 }));
  });
  liens.appendChild(h('circle', { cx: 50, cy: 50, r: 37, fill: 'none', stroke: 'var(--trait-graphe)', 'stroke-width': 0.3 }));

  const noeuds = MODULES.map((module, i) => {
    const donnees = lignes(module.id);
    return h('a.hub-noeud', {
      href: `#/module/${module.route}`,
      style: { '--x': `${points[i].x}%`, '--y': `${points[i].y}%`, '--couleur-module': module.couleur },
      'aria-label': `${module.titre} — ${module.pastille(donnees)}`,
    },
      h('span.hub-noeud-icone', {}, icone(module.icone, 22)),
      h('span.hub-noeud-titre', { text: module.court }),
      h('span.hub-noeud-valeur', { text: module.pastille(donnees) }));
  });

  return h('div.hub', {},
    liens,
    h('div.hub-centre', {},
      logo(52),
      h('p.hub-centre-nom', { text: reglagesActifs().association }),
      h('p.hub-centre-ligue', { text: reglagesActifs().ligue }),
      h('p.hub-centre-valeur', { text: euros(bilan.produits) }),
      h('p.hub-centre-detail', { text: `produits · ${bilan.saison}` })),
    noeuds);
}

function bandeauAlertes() {
  const liste = alertes();
  if (!liste.length) {
    return carte({ titre: 'Points d’attention', contenu: h('p.texte-doux', { text: 'Rien à signaler : cotisations à jour, échéances tenues, stocks suffisants.' }) });
  }
  return carte({
    titre: 'Points d’attention',
    sousTitre: `${liste.length} sujets à traiter`,
    contenu: h('ul.alertes', {}, liste.map((a) => h('li', {},
      h('a.alerte', { href: `#/module/${a.moduleObjet.route}`, class: `alerte--${a.gravite}`, style: { '--couleur-module': a.moduleObjet.couleur } },
        h('span.alerte-icone', {}, icone(TRACE_ICONES.alerte, 18)),
        h('span.alerte-texte', {}, h('span.alerte-titre', { text: a.titre }), h('span.alerte-detail', { text: a.detail })),
        h('span.alerte-module', { text: a.moduleObjet.court }))))),
  });
}

function syntheseTableau(bilan) {
  const rangs = bilan.parModule.slice().sort((a, b) => b.produits - a.produits);
  return h('div.tableau-cadre', {}, h('table.tableau.tableau--synthese', {},
    h('caption.visuellement-cache', { text: `Synthèse par domaine, saison ${bilan.saison}` }),
    h('thead', {}, h('tr', {},
      h('th', { scope: 'col', text: 'Domaine' }),
      h('th.aligne-droite', { scope: 'col', text: 'Produits' }),
      h('th.aligne-droite', { scope: 'col', text: 'Attendu' }),
      h('th.aligne-droite', { scope: 'col', text: 'Charges' }),
      h('th.aligne-droite', { scope: 'col', text: 'Part' }))),
    h('tbody', {}, rangs.map((p) => h('tr', {},
      h('td', { 'data-libelle': 'Domaine' }, h('a.lien-domaine', { href: `#/module/${p.module.route}` },
        h('span.point', { style: { background: p.module.couleur } }), h('span', { text: p.module.titre }))),
      h('td.aligne-droite', { 'data-libelle': 'Produits', text: euros(p.produits) }),
      h('td.aligne-droite', { 'data-libelle': 'Attendu', text: p.attendu ? euros(p.attendu) : '—' }),
      h('td.aligne-droite', { 'data-libelle': 'Charges', text: p.charges ? euros(p.charges) : '—' }),
      h('td.aligne-droite', { 'data-libelle': 'Part', text: pourcent(p.produits, bilan.produits) })))),
    h('tfoot', {}, h('tr', {},
      h('th', { scope: 'row', text: 'Total' }),
      h('td.aligne-droite', { text: euros(bilan.produits) }),
      h('td.aligne-droite', { text: euros(bilan.attendu) }),
      h('td.aligne-droite', { text: euros(bilan.charges) }),
      h('td.aligne-droite', { text: '100 %' })))));
}

export function vueHub() {
  const bilan = synthese();
  const evolution = evolutionProduits();
  const flux = fluxMensuels();
  const segments = bilan.sources.map((s) => ({ libelle: s.module.court, valeur: s.produits, couleur: s.module.couleur }));

  const indicateurs = [
    { libelle: 'Produits de la saison', valeur: euros(bilan.produits), detail: evolution ? `${evolution.ecart >= 0 ? '+' : ''}${evolution.ecart.toFixed(0).replace('-0', '0')} % par rapport à ${saisonPrecedente(bilan.saison)}` : 'première saison suivie', jauge: reglagesActifs().objectifProduits ? bilan.produits / reglagesActifs().objectifProduits : null },
    { libelle: 'Charges directes', valeur: euros(bilan.charges), detail: 'achats boutique et organisation des événements' },
    { libelle: 'Résultat', valeur: euros(bilan.resultat), detail: bilan.resultat >= 0 ? 'excédent avant frais généraux' : 'déficit avant frais généraux', ton: bilan.resultat < 0 ? 'alerte' : null },
    { libelle: 'Reste à percevoir', valeur: euros(bilan.attendu), detail: 'subventions accordées, factures et cotisations en attente' },
    { libelle: 'Bénévolat valorisé', valeur: euros(bilan.valorisation), detail: `contribution volontaire, hors budget monétaire` },
  ];

  return h('div.page.page--hub', {},
    h('header.hub-tete', {},
      h('div', {},
        h('p.sur-titre', { text: `Saison ${bilan.saison} · ${reglagesActifs().territoire}` }),
        h('h1.page-titre', { text: 'Modèle socio-économique' }),
        h('p.page-resume', { text: 'Sept domaines, une seule lecture : ce que la ligue produit, ce qu’elle dépense, et ce qui reste à sécuriser.' })),
      h('div.hub-tete-actions', {},
        bouton('Rapport de saison', { icone: TRACE_ICONES.rapport, onclick: () => { window.location.hash = '#/rapport'; } }),
        bouton('Réglages et données', { icone: TRACE_ICONES.reglages, onclick: () => { window.location.hash = '#/reglages'; } }))),

    h('div.kpis.kpis--large', {}, indicateurs.map(carteKPI)),

    hubRadiatif(bilan),

    h('div.grille-deux', {},
      carte({
        titre: 'Répartition des produits',
        sousTitre: `${bilan.sources.length} sources actives`,
        contenu: h('div.anneau-bloc', {},
          anneau(segments, { titre: 'Répartition des produits par domaine', centreValeur: eurosCourt(bilan.produits), centreLibelle: 'produits' }),
          legende(segments, bilan.produits)),
      }),
      carte({
        titre: 'Encaissements et dépenses par mois',
        sousTitre: 'flux datés de la saison',
        contenu: h('div.pile', {},
          histogramme({
            categories: flux.map((f) => moisEtiquette(f.cle)),
            series: [
              { libelle: 'Produits', couleur: 'var(--accent)', valeurs: flux.map((f) => f.produits) },
              { libelle: 'Charges', couleur: 'var(--rouge)', valeurs: flux.map((f) => f.charges) },
            ],
          }),
          h('div.legende-plate', {},
            h('span.legende-item', {}, h('span.legende-pastille', { style: { background: 'var(--accent)' } }), h('span', { text: 'Produits' })),
            h('span.legende-item', {}, h('span.legende-pastille', { style: { background: 'var(--rouge)' } }), h('span', { text: 'Charges' }))),
          h('p.texte-doux.petit', { text: 'La boutique n’est pas datée à la vente : son chiffre d’affaires figure dans la répartition annuelle, pas dans ce graphique.' })),
      })),

    h('div.grille-deux.grille-deux--inverse', {},
      bandeauAlertes(),
      carte({ titre: 'Synthèse par domaine', sousTitre: `saison ${bilan.saison}`, contenu: syntheseTableau(bilan), classe: 'carte--tableau' })));
}
