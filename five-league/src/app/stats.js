/**
 * Agrégats du modèle socio-économique. Chaque module sait calculer sa
 * contribution (`economie`) et ses flux datés (`flux`) ; ce fichier assemble
 * ces réponses en une lecture d'ensemble : d'où vient l'argent, où il part,
 * ce qui reste attendu, et ce qui demande une action cette semaine.
 */

import { MODULES, MODULE_PAR_ID, etatCotisation, etatStock } from './schema.js';
import { bornesSaison, joursRestants, moisDe, euros, nombre, dateCourte } from './format.js';
import { lignes, reglagesActifs, saisonActive } from './store.js';

/** Synthèse d'une saison, module par module. */
export function synthese(saison = saisonActive()) {
  const r = reglagesActifs();
  const parModule = MODULES.map((m) => {
    const donnees = lignes(m.id, { saison });
    const eco = { produits: 0, charges: 0, attendu: 0, engage: 0, valorisation: 0, ...(m.economie ? m.economie(donnees, r) : {}) };
    return { module: m, lignes: donnees.length, ...eco };
  });
  const total = (cle) => parModule.reduce((t, p) => t + (p[cle] || 0), 0);
  const produits = total('produits');
  const charges = total('charges');
  return {
    saison,
    parModule,
    produits,
    charges,
    resultat: produits - charges,
    attendu: total('attendu'),
    engage: total('engage'),
    valorisation: total('valorisation'),
    sources: parModule.filter((p) => p.produits > 0).sort((a, b) => b.produits - a.produits),
    postes: parModule.filter((p) => p.charges > 0).sort((a, b) => b.charges - a.charges),
  };
}

export function saisonPrecedente(saison) {
  const a = Number(String(saison).split('-')[0]);
  return `${a - 1}-${a}`;
}

/** Écart de produits avec la saison précédente, en pourcentage. */
export function evolutionProduits(saison = saisonActive()) {
  const avant = synthese(saisonPrecedente(saison)).produits;
  const maintenant = synthese(saison).produits;
  if (!avant) return null;
  return { avant, maintenant, ecart: ((maintenant - avant) / avant) * 100 };
}

/** Flux datés d'une saison, agrégés par mois — la boutique n'a pas de date
 *  de vente et n'y figure donc pas (voir docs/architecture.md). */
export function fluxMensuels(saison = saisonActive()) {
  const { debut, fin } = bornesSaison(saison);
  const seaux = new Map();
  for (let d = new Date(`${debut}T12:00:00Z`); d.toISOString().slice(0, 10) <= fin; d.setUTCMonth(d.getUTCMonth() + 1)) {
    seaux.set(d.toISOString().slice(0, 7), { cle: d.toISOString().slice(0, 7), produits: 0, charges: 0 });
  }
  for (const m of MODULES) {
    if (!m.flux) continue;
    for (const l of lignes(m.id, { saison })) {
      for (const f of m.flux(l)) {
        if (!f.date || !f.montant) continue;
        const seau = seaux.get(moisDe(f.date));
        if (!seau) continue;
        seau[f.sens === 'charge' ? 'charges' : 'produits'] += f.montant;
      }
    }
  }
  return [...seaux.values()];
}

/** Dégradé d'ardoise pour les postes de charges : les dépenses de
 *  fonctionnement forment une même famille, les deux domaines qui portent
 *  aussi des charges gardent leur couleur propre. */
const TONS_CHARGES = ['#4B5A69', '#5F7183', '#78889A', '#93A0AE', '#AEB8C3', '#C7CED6'];

/**
 * Structure des charges : les postes de dépenses de fonctionnement, plus les
 * charges portées par les autres domaines (achats de la boutique, coûts
 * d'organisation des événements). Les six premiers postes sont détaillés, le
 * reste est regroupé — au-delà, l'anneau devient illisible.
 */
export function repartitionCharges(saison = saisonActive()) {
  const postes = new Map();
  for (const l of lignes('depenses', { saison })) {
    if (l.statut !== 'Payée') continue;
    const cle = l.categorie || 'Autre';
    postes.set(cle, (postes.get(cle) || 0) + (Number(l.montant) || 0));
  }
  const classes = [...postes.entries()].map(([libelle, valeur]) => ({ libelle, valeur })).sort((a, b) => b.valeur - a.valeur);
  const detailles = classes.slice(0, 5).map((p, i) => ({ ...p, couleur: TONS_CHARGES[i] }));
  const restant = classes.slice(5).reduce((t, p) => t + p.valeur, 0);
  if (restant > 0) detailles.push({ libelle: `Autres postes (${classes.length - 5})`, valeur: restant, couleur: TONS_CHARGES[5] });

  const bilan = synthese(saison);
  for (const p of bilan.parModule) {
    if (p.module.id === 'depenses' || !p.charges) continue;
    detailles.push({
      libelle: p.module.id === 'boutique' ? 'Achats de la boutique' : `Organisation d'événements`,
      valeur: p.charges,
      couleur: p.module.couleur,
    });
  }
  return detailles.sort((a, b) => b.valeur - a.valeur);
}

/** Répartition d'un module par valeur d'un champ (camembert des modules). */
export function repartition(moduleId, champ, mesure) {
  const groupes = new Map();
  for (const l of lignes(moduleId)) {
    const cle = l[champ] || '—';
    groupes.set(cle, (groupes.get(cle) || 0) + (mesure ? mesure(l) : 1));
  }
  return [...groupes.entries()].map(([libelle, valeur]) => ({ libelle, valeur })).sort((a, b) => b.valeur - a.valeur);
}

const AJOUT = (liste, alerte) => { if (alerte) liste.push(alerte); };

/**
 * Points d'attention. Les échéances sont cherchées sur toutes les saisons :
 * en juillet, les dates limites qui comptent sont celles de la saison
 * suivante.
 */
export function alertes() {
  const liste = [];
  const r = reglagesActifs();

  const impayees = lignes('cotisations').filter((l) => etatCotisation(l) !== 'Payée');
  const enRetard = impayees.filter((l) => l.echeance && joursRestants(l.echeance) < 0);
  const du = impayees.reduce((t, l) => t + Math.max(0, (Number(l.montant) || 0) - (Number(l.regle) || 0)), 0);
  if (impayees.length) {
    AJOUT(liste, {
      module: 'cotisations',
      gravite: enRetard.length ? 'haute' : 'moyenne',
      titre: `${nombre(impayees.length)} cotisation${impayees.length > 1 ? 's' : ''} à recouvrer`,
      detail: `${euros(du)} restent dus, dont ${nombre(enRetard.length)} au-delà de l'échéance.`,
    });
  }

  for (const l of lignes('subventions', { toutesSaisons: true })) {
    if (!l.echeance || ['Versée', 'Refusée'].includes(l.statut)) continue;
    const j = joursRestants(l.echeance);
    if (j < 0 && l.statut === 'À déposer') {
      AJOUT(liste, { module: 'subventions', gravite: 'haute', titre: `Dépôt manqué : ${l.financeur}`, detail: `${l.dispositif || 'Dossier'} — date limite dépassée depuis ${-j} jours.` });
    } else if (j >= 0 && j <= 60 && l.statut === 'À déposer') {
      AJOUT(liste, { module: 'subventions', gravite: j <= 21 ? 'haute' : 'moyenne', titre: `Dossier à déposer : ${l.financeur}`, detail: `${l.dispositif || 'Dossier'} — clôture dans ${j} jours (${euros(l.demande)} demandés).` });
    }
  }
  const accordees = lignes('subventions', { toutesSaisons: true }).filter((l) => l.statut === 'Accordée');
  if (accordees.length) {
    AJOUT(liste, { module: 'subventions', gravite: 'basse', titre: `${nombre(accordees.length)} subvention${accordees.length > 1 ? 's' : ''} accordée${accordees.length > 1 ? 's' : ''} non versée${accordees.length > 1 ? 's' : ''}`, detail: `${euros(accordees.reduce((t, l) => t + (Number(l.accorde) || 0), 0))} à recevoir.` });
  }

  const stock = lignes('boutique').filter((l) => etatStock(l) !== 'En stock');
  if (stock.length) {
    AJOUT(liste, {
      module: 'boutique',
      gravite: stock.some((l) => etatStock(l) === 'Rupture') ? 'moyenne' : 'basse',
      titre: `${nombre(stock.length)} article${stock.length > 1 ? 's' : ''} en tension de stock`,
      detail: stock.map((l) => l.produit).slice(0, 3).join(', ') + (stock.length > 3 ? '…' : ''),
    });
  }

  const prochains = lignes('evenements', { toutesSaisons: true })
    .filter((l) => l.date && l.statut !== 'Annulé' && l.statut !== 'Réalisé' && joursRestants(l.date) >= 0 && joursRestants(l.date) <= 30)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (prochains.length) {
    const p = prochains[0];
    AJOUT(liste, { module: 'evenements', gravite: 'basse', titre: `${nombre(prochains.length)} événement${prochains.length > 1 ? 's' : ''} sous 30 jours`, detail: `Prochain : ${p.intitule}, dans ${joursRestants(p.date)} jours à ${p.lieu || 'lieu à confirmer'}.` });
  }

  const facturesDues = lignes('prestations', { toutesSaisons: true }).filter((l) => l.statut === 'Facturée' && l.echeance && joursRestants(l.echeance) < 0);
  if (facturesDues.length) {
    AJOUT(liste, { module: 'prestations', gravite: 'haute', titre: `${nombre(facturesDues.length)} facture${facturesDues.length > 1 ? 's' : ''} échue${facturesDues.length > 1 ? 's' : ''}`, detail: `${euros(facturesDues.reduce((t, l) => t + (Number(l.montant) || 0), 0))} à relancer : ${facturesDues.map((l) => l.client).slice(0, 3).join(', ')}.` });
  }

  const aRenouveler = lignes('partenariats', { toutesSaisons: true }).filter((l) => (l.statut === 'Actif' || l.statut === 'À renouveler') && l.fin && joursRestants(l.fin) <= 90 && joursRestants(l.fin) >= -30);
  if (aRenouveler.length) {
    AJOUT(liste, { module: 'partenariats', gravite: 'moyenne', titre: `${nombre(aRenouveler.length)} partenariat${aRenouveler.length > 1 ? 's' : ''} arrive${aRenouveler.length > 1 ? 'nt' : ''} à échéance`, detail: `${euros(aRenouveler.reduce((t, l) => t + (Number(l.montant) || 0), 0))} de sponsoring à sécuriser avant le ${dateCourte(aRenouveler.map((l) => l.fin).sort()[0])}.` });
  }

  const aRegler = lignes('depenses', { toutesSaisons: true }).filter((l) => l.statut === 'Engagée' || l.statut === 'Prévue');
  const enRetardDepenses = aRegler.filter((l) => l.echeance && joursRestants(l.echeance) < 0);
  if (enRetardDepenses.length) {
    AJOUT(liste, {
      module: 'depenses',
      gravite: 'haute',
      titre: `${nombre(enRetardDepenses.length)} dépense${enRetardDepenses.length > 1 ? 's' : ''} à régler en retard`,
      detail: `${euros(enRetardDepenses.reduce((t, l) => t + (Number(l.montant) || 0), 0))} dont l'échéance est passée : ${enRetardDepenses.map((l) => l.intitule).slice(0, 2).join(', ')}.`,
    });
  } else if (aRegler.length) {
    AJOUT(liste, {
      module: 'depenses',
      gravite: 'moyenne',
      titre: `${nombre(aRegler.length)} dépense${aRegler.length > 1 ? 's' : ''} engagée${aRegler.length > 1 ? 's' : ''} non réglée${aRegler.length > 1 ? 's' : ''}`,
      detail: `${euros(aRegler.reduce((t, l) => t + (Number(l.montant) || 0), 0))} à décaisser prochainement.`,
    });
  }

  /* Un résultat négatif est le signal le plus important du tableau de bord :
     il passe avant les échéances de détail. */
  const bilan = synthese();
  if (bilan.charges > bilan.produits) {
    liste.unshift({
      module: 'depenses',
      gravite: 'haute',
      titre: `Résultat déficitaire de ${euros(bilan.charges - bilan.produits)}`,
      detail: `${euros(bilan.charges)} de charges pour ${euros(bilan.produits)} de produits encaissés sur la saison.`,
    });
  }

  const heuresSaisies = lignes('rh').reduce((t, l) => t + (Number(l.heures) || 0), 0);
  if (lignes('rh').length && !heuresSaisies) {
    AJOUT(liste, { module: 'rh', gravite: 'basse', titre: 'Aucune heure de bénévolat saisie', detail: `Les heures valorisées à ${euros(r.tauxHoraire)} pèsent dans les dossiers de subvention.` });
  }

  const ordre = { haute: 0, moyenne: 1, basse: 2 };
  return liste.sort((a, b) => ordre[a.gravite] - ordre[b.gravite]).map((a) => ({ ...a, moduleObjet: MODULE_PAR_ID[a.module] }));
}
