/**
 * Rapport de saison. Une seule page, pensée pour l'impression : c'est le
 * document que l'on joint à un dossier de subvention ou que l'on projette
 * en assemblée générale. « Enregistrer en PDF » depuis la boîte d'impression
 * du navigateur produit un fichier propre, sans dépendance à un générateur
 * de PDF embarqué.
 */

import { h } from './dom.js';
import { MODULES } from './schema.js';
import { synthese, alertes, evolutionProduits, saisonPrecedente, repartitionCharges } from './stats.js';
import { euros, nombre, pourcent, dateCourte, aujourdhui } from './format.js';
import { logo, bouton, TRACE_ICONES } from './composants.js';
import { anneau, legende } from './graphes.js';
import { lignes, reglagesActifs } from './store.js';

export function vueRapport() {
  const bilan = synthese();
  const r = reglagesActifs();
  const evolution = evolutionProduits();
  const segments = bilan.sources.map((s) => ({ libelle: s.module.titre, valeur: s.produits, couleur: s.module.couleur }));
  const attention = alertes();

  return h('div.page.page--rapport', {},
    h('div.rapport-actions', {},
      h('a.lien-retour', { href: '#/' }, 'Retour au tableau de bord'),
      bouton('Imprimer ou enregistrer en PDF', { variante: 'primaire', icone: TRACE_ICONES.imprimer, onclick: () => window.print() })),

    h('article.rapport', {},
      h('header.rapport-tete', {},
        logo(56),
        h('div', {},
          h('h1', { text: `${r.association} — rapport de saison` }),
          h('p.rapport-sous-titre', { text: `${r.ligue} · saison ${bilan.saison} · ${r.territoire}` }),
          h('p.rapport-date', { text: `Édité le ${dateCourte(aujourdhui())}` }))),

      h('section.rapport-section', {},
        h('h2', { text: 'Équilibre de la saison' }),
        h('div.rapport-chiffres', {},
          h('div.rapport-chiffre', {}, h('span.rapport-chiffre-valeur', { text: euros(bilan.produits) }), h('span.rapport-chiffre-libelle', { text: 'produits' })),
          h('div.rapport-chiffre', {}, h('span.rapport-chiffre-valeur', { text: euros(bilan.charges) }), h('span.rapport-chiffre-libelle', { text: 'charges directes' })),
          h('div.rapport-chiffre', {}, h('span.rapport-chiffre-valeur', { text: euros(bilan.resultat) }), h('span.rapport-chiffre-libelle', { text: 'résultat' })),
          h('div.rapport-chiffre', {}, h('span.rapport-chiffre-valeur', { text: euros(bilan.attendu) }), h('span.rapport-chiffre-libelle', { text: 'reste à percevoir' })),
          h('div.rapport-chiffre', {}, h('span.rapport-chiffre-valeur', { text: euros(bilan.valorisation) }), h('span.rapport-chiffre-libelle', { text: 'bénévolat valorisé' }))),
        h('p.rapport-texte', {
          text: evolution
            ? `Les produits de la saison ${bilan.saison} s'établissent à ${euros(bilan.produits)}, contre ${euros(evolution.avant)} en ${saisonPrecedente(bilan.saison)}, soit une évolution de ${evolution.ecart >= 0 ? '+' : ''}${evolution.ecart.toFixed(1).replace('.', ',')} %. Le bénévolat, valorisé au taux de ${euros(r.tauxHoraire)} de l'heure, représente ${euros(bilan.valorisation)} de contribution volontaire en nature, à mentionner en annexe des comptes.`
            : `Les produits de la saison ${bilan.saison} s'établissent à ${euros(bilan.produits)}. Le bénévolat, valorisé au taux de ${euros(r.tauxHoraire)} de l'heure, représente ${euros(bilan.valorisation)} de contribution volontaire en nature.`,
        })),

      h('section.rapport-section.rapport-section--repartition', {},
        h('h2', { text: 'Répartition des produits' }),
        h('div.rapport-anneau', {},
          anneau(segments, { titre: 'Répartition des produits', centreValeur: euros(bilan.produits), centreLibelle: 'produits', taille: 200 }),
          legende(segments, bilan.produits))),

      bilan.charges ? h('section.rapport-section.rapport-section--repartition', {},
        h('h2', { text: 'Structure des charges' }),
        h('div.rapport-anneau', {},
          anneau(repartitionCharges(bilan.saison), { titre: 'Répartition des charges', centreValeur: euros(bilan.charges), centreLibelle: 'charges', taille: 200 }),
          legende(repartitionCharges(bilan.saison), bilan.charges))) : null,

      h('section.rapport-section', {},
        h('h2', { text: 'Détail par domaine' }),
        h('table.tableau.tableau--rapport', {},
          h('thead', {}, h('tr', {},
            h('th', { scope: 'col', text: 'Domaine' }),
            h('th', { scope: 'col', text: 'Volume' }),
            h('th.aligne-droite', { scope: 'col', text: 'Produits' }),
            h('th.aligne-droite', { scope: 'col', text: 'Charges' }),
            h('th.aligne-droite', { scope: 'col', text: 'Part' }))),
          h('tbody', {}, bilan.parModule.map((p) => h('tr', {},
            h('th', { scope: 'row' }, h('span.point', { style: { background: p.module.couleur } }), h('span', { text: p.module.titre })),
            h('td', { text: `${nombre(p.lignes)} ${p.lignes > 1 ? p.module.pluriel : p.module.singulier}` }),
            h('td.aligne-droite', { text: euros(p.produits) }),
            h('td.aligne-droite', { text: p.charges ? euros(p.charges) : '—' }),
            h('td.aligne-droite', { text: pourcent(p.produits, bilan.produits) })))))),

      h('section.rapport-section', {},
        h('h2', { text: 'Indicateurs clés' }),
        h('div.rapport-grille', {}, MODULES.map((module) => {
          const kpis = module.kpis(lignes(module.id), { reglages: r, saison: bilan.saison });
          return h('div.rapport-bloc', { style: { '--couleur-module': module.couleur } },
            h('h3', { text: module.titre }),
            h('ul.rapport-liste', {}, kpis.map((k) => h('li', {}, h('span.rapport-liste-libelle', { text: k.libelle }), h('span.rapport-liste-valeur', { text: k.valeur })))));
        }))),

      attention.length ? h('section.rapport-section', {},
        h('h2', { text: 'Points de vigilance' }),
        h('ul.rapport-vigilance', {}, attention.map((a) => h('li', {}, h('strong', { text: `${a.titre} — ` }), a.detail)))) : null,

      h('footer.rapport-pied', {},
        h('p', { text: `${r.association} · ${r.ligue} · document généré depuis l'outil de gestion interne.` }))));
}
