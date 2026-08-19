/**
 * Le schéma décrit les sept domaines du modèle socio-économique. Il est la
 * seule source de vérité de l'application : les formulaires, les tableaux,
 * les exports, les indicateurs et les alertes en sont tous dérivés. Ajouter
 * un champ à un module, c'est ajouter une ligne ici — rien d'autre.
 *
 * Types de champ : texte, zone, courriel, tel, date, liste, montant, nombre,
 * heures. `calcules` décrit les colonnes déduites (jamais saisies).
 */

import { euros, eurosCourt, heures, nombre, pourcent, joursRestants } from './format.js';

/** Taux de valorisation du bénévolat : le SMIC horaire brut, comme le
 *  recommande le plan comptable associatif pour les contributions
 *  volontaires en nature. Modifiable dans les réglages. */
export const TAUX_HORAIRE_DEFAUT = 12;

export const REGLAGES_DEFAUT = {
  association: 'Five League',
  ligue: 'Sunday Five League',
  territoire: 'Hauts-de-France',
  tauxHoraire: TAUX_HORAIRE_DEFAUT,
  objectifProduits: 55000,
  adherentsAttendus: 140,
};

/** Tonalité des pastilles d'état, commune à tous les modules. */
export const TONS = {
  Actif: 'vert', Ponctuel: 'bleu', Inactif: 'gris',
  Payée: 'vert', Partielle: 'ambre', 'En attente': 'gris', Relancée: 'rouge',
  'À déposer': 'gris', Déposé: 'bleu', 'En instruction': 'ambre', Accordée: 'violet', Versée: 'vert', Refusée: 'rouge',
  Planifié: 'gris', Confirmé: 'bleu', Réalisé: 'vert', Annulé: 'rouge',
  'Devis envoyé': 'gris', Confirmée: 'bleu', Facturée: 'ambre', Annulée: 'rouge',
  'En négociation': 'ambre', 'À renouveler': 'rouge', Terminé: 'gris',
  'En stock': 'vert', 'Stock faible': 'ambre', Rupture: 'rouge',
};

const somme = (lignes, champ) => lignes.reduce((t, l) => t + (Number(l[champ]) || 0), 0);
const parmi = (lignes, champ, ...valeurs) => lignes.filter((l) => valeurs.includes(l[champ]));

/** État d'une cotisation : déduit des montants, jamais saisi — deux sources
 *  de vérité pour la même information finissent toujours par diverger. */
export function etatCotisation(l) {
  const du = Number(l.montant) || 0;
  const regle = Number(l.regle) || 0;
  if (regle >= du && du > 0) return 'Payée';
  if (regle > 0) return 'Partielle';
  if (l.echeance && joursRestants(l.echeance) < 0) return 'Relancée';
  return 'En attente';
}

export function etatStock(l) {
  const stock = Number(l.stock) || 0;
  if (stock <= 0) return 'Rupture';
  if (stock <= (Number(l.seuil) || 0)) return 'Stock faible';
  return 'En stock';
}

const SAISONS_LISTE = ['2024-2025', '2025-2026', '2026-2027'];
export const SAISONS = SAISONS_LISTE;

const champSaison = { id: 'saison', libelle: 'Saison', type: 'liste', options: SAISONS_LISTE, requis: true };

export const MODULES = [
  {
    id: 'rh',
    route: 'rh',
    titre: 'Ressources humaines',
    court: 'RH',
    resume: 'Bénévoles, dirigeants et arbitres : qui fait tourner la ligue, et combien de temps cela représente.',
    couleur: '#4F8DF7',
    icone: 'M15.5 20v-1.5a3.5 3.5 0 0 0-3.5-3.5H7a3.5 3.5 0 0 0-3.5 3.5V20M9.5 11.8a3.9 3.9 0 1 0 0-7.8 3.9 3.9 0 0 0 0 7.8M20.5 20v-1.5a3.5 3.5 0 0 0-2.7-3.4M15.5 4.3a3.9 3.9 0 0 1 0 7.2',
    singulier: 'bénévole',
    pluriel: 'bénévoles',
    champCle: 'nom',
    champDate: 'depuis',
    champs: [
      { id: 'nom', libelle: 'Nom et prénom', type: 'texte', requis: true },
      { id: 'role', libelle: 'Rôle', type: 'texte', aide: 'Président, arbitre, responsable buvette…' },
      { id: 'categorie', libelle: 'Pôle', type: 'liste', options: ['Bureau', 'Encadrement', 'Arbitrage', 'Logistique', 'Communication'], defaut: 'Logistique' },
      { id: 'statut', libelle: 'Engagement', type: 'liste', options: ['Actif', 'Ponctuel', 'Inactif'], defaut: 'Actif' },
      { id: 'heures', libelle: 'Heures sur la saison', type: 'heures' },
      { id: 'courriel', libelle: 'Courriel', type: 'courriel' },
      { id: 'telephone', libelle: 'Téléphone', type: 'tel' },
      { id: 'depuis', libelle: 'Engagé depuis', type: 'date' },
      champSaison,
      { id: 'notes', libelle: 'Disponibilités et notes', type: 'zone' },
    ],
    calcules: [
      { id: 'valorisation', libelle: 'Valorisation', type: 'montant', calcul: (l, r) => (Number(l.heures) || 0) * (r.tauxHoraire || TAUX_HORAIRE_DEFAUT) },
    ],
    colonnes: ['nom', 'role', 'categorie', 'heures', 'valorisation', 'statut'],
    etat: (l) => l.statut,
    kpis: (lignes, ctx) => {
      const actifs = parmi(lignes, 'statut', 'Actif', 'Ponctuel');
      const h = somme(lignes, 'heures');
      return [
        { libelle: 'Bénévoles actifs', valeur: nombre(actifs.length), detail: `${lignes.length} personnes recensées` },
        { libelle: 'Heures contribuées', valeur: heures(h), detail: actifs.length ? `${Math.round(h / actifs.length)} h par bénévole en moyenne` : 'aucun bénévole actif' },
        { libelle: 'Valorisation du bénévolat', valeur: euros(h * ctx.reglages.tauxHoraire), detail: `au taux de ${euros(ctx.reglages.tauxHoraire)} de l'heure` },
        { libelle: 'Bureau directeur', valeur: nombre(parmi(lignes, 'categorie', 'Bureau').length), detail: 'membres du bureau' },
      ];
    },
    groupe: { champ: 'categorie', titre: 'Heures par pôle', mesure: (l) => Number(l.heures) || 0, format: heures },
    pastille: (lignes) => `${nombre(parmi(lignes, 'statut', 'Actif', 'Ponctuel').length)} bénévoles`,
    economie: (lignes, r) => ({ produits: 0, charges: 0, attendu: 0, valorisation: somme(lignes, 'heures') * r.tauxHoraire }),
  },

  {
    id: 'cotisations',
    route: 'cotisations',
    titre: 'Cotisations',
    court: 'Cotisations',
    resume: 'Adhésions de la saison, encaissements, relances et taux de règlement.',
    couleur: '#2ECC71',
    icone: 'M3 8.5A2.5 2.5 0 0 1 5.5 6h13A2.5 2.5 0 0 1 21 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 15.5zM3 10.5h18M6.5 14.5h3.5',
    singulier: 'adhésion',
    pluriel: 'adhésions',
    champCle: 'adherent',
    champDate: 'datePaiement',
    champs: [
      { id: 'adherent', libelle: 'Adhérent', type: 'texte', requis: true },
      { id: 'categorie', libelle: 'Catégorie', type: 'liste', options: ['Joueur senior', 'Joueur jeune', 'Dirigeant', 'Arbitre', 'Membre bienfaiteur'], defaut: 'Joueur senior' },
      { id: 'equipe', libelle: 'Équipe', type: 'texte' },
      { id: 'montant', libelle: 'Montant dû', type: 'montant', requis: true },
      { id: 'regle', libelle: 'Montant réglé', type: 'montant' },
      { id: 'moyen', libelle: 'Moyen de paiement', type: 'liste', options: ['Virement', 'Carte (HelloAsso)', 'Espèces', 'Chèque', "Pass'Sport"], defaut: 'Virement' },
      { id: 'datePaiement', libelle: 'Date de règlement', type: 'date' },
      { id: 'echeance', libelle: 'Échéance', type: 'date' },
      { id: 'courriel', libelle: 'Courriel', type: 'courriel' },
      champSaison,
      { id: 'notes', libelle: 'Notes', type: 'zone' },
    ],
    calcules: [
      { id: 'reste', libelle: 'Reste dû', type: 'montant', calcul: (l) => Math.max(0, (Number(l.montant) || 0) - (Number(l.regle) || 0)) },
      { id: 'etat', libelle: 'État', type: 'etat', calcul: etatCotisation },
    ],
    colonnes: ['adherent', 'categorie', 'equipe', 'montant', 'regle', 'reste', 'etat', 'echeance'],
    etat: etatCotisation,
    kpis: (lignes, ctx) => {
      const du = somme(lignes, 'montant');
      const encaisse = somme(lignes, 'regle');
      const payees = lignes.filter((l) => etatCotisation(l) === 'Payée');
      return [
        { libelle: 'Encaissé', valeur: euros(encaisse), detail: `sur ${euros(du)} appelés`, jauge: du ? encaisse / du : 0 },
        { libelle: 'Taux de règlement', valeur: pourcent(payees.length, lignes.length), detail: `${payees.length} adhésions soldées sur ${lignes.length}` },
        { libelle: 'Reste à recouvrer', valeur: euros(du - encaisse), detail: `${lignes.length - payees.length} adhésions incomplètes`, ton: du - encaisse > 0 ? 'alerte' : null },
        { libelle: 'Adhérents', valeur: nombre(lignes.length), detail: `objectif ${nombre(ctx.reglages.adherentsAttendus)}`, jauge: ctx.reglages.adherentsAttendus ? lignes.length / ctx.reglages.adherentsAttendus : 0 },
      ];
    },
    groupe: { champ: 'categorie', titre: 'Encaissé par catégorie', mesure: (l) => Number(l.regle) || 0, format: euros },
    pastille: (lignes) => `${eurosCourt(somme(lignes, 'regle'))} encaissés`,
    economie: (lignes) => ({ produits: somme(lignes, 'regle'), charges: 0, attendu: Math.max(0, somme(lignes, 'montant') - somme(lignes, 'regle')), valorisation: 0 }),
    flux: (l) => [{ date: l.datePaiement, montant: Number(l.regle) || 0, sens: 'produit' }],
  },

  {
    id: 'subventions',
    route: 'subventions',
    titre: 'Subventions publiques',
    court: 'Subventions',
    resume: 'Dossiers déposés auprès des collectivités et de l’État, échéances des appels à projets.',
    couleur: '#9B6DE0',
    icone: 'M3 21h18M4.5 21V9.8L12 4.5l7.5 5.3V21M9.5 21v-6h5v6M8 12h.01M16 12h.01',
    singulier: 'dossier',
    pluriel: 'dossiers',
    champCle: 'financeur',
    champDate: 'dateVersement',
    champs: [
      { id: 'financeur', libelle: 'Financeur', type: 'texte', requis: true, aide: 'Ville, département, région, ANS, CAF…' },
      { id: 'dispositif', libelle: 'Dispositif', type: 'texte', aide: "Fonds de développement de la vie associative, Pass'Sport…" },
      { id: 'demande', libelle: 'Montant demandé', type: 'montant', requis: true },
      { id: 'accorde', libelle: 'Montant accordé', type: 'montant' },
      { id: 'statut', libelle: 'Statut du dossier', type: 'liste', options: ['À déposer', 'Déposé', 'En instruction', 'Accordée', 'Versée', 'Refusée'], defaut: 'À déposer' },
      { id: 'echeance', libelle: 'Date limite de dépôt', type: 'date' },
      { id: 'dateDepot', libelle: 'Déposé le', type: 'date' },
      { id: 'dateVersement', libelle: 'Versé le', type: 'date' },
      { id: 'referent', libelle: 'Référent du dossier', type: 'texte' },
      champSaison,
      { id: 'notes', libelle: 'Pièces et suivi', type: 'zone' },
    ],
    colonnes: ['financeur', 'dispositif', 'demande', 'accorde', 'statut', 'echeance'],
    etat: (l) => l.statut,
    kpis: (lignes) => {
      const versees = parmi(lignes, 'statut', 'Versée');
      const enCours = parmi(lignes, 'statut', 'Déposé', 'En instruction', 'Accordée');
      const arbitrees = parmi(lignes, 'statut', 'Versée', 'Accordée', 'Refusée');
      return [
        { libelle: 'Reçu cette saison', valeur: euros(somme(versees, 'accorde')), detail: `${versees.length} subventions versées` },
        { libelle: 'Dossiers en cours', valeur: nombre(enCours.length), detail: `${euros(somme(enCours, 'accorde') || somme(enCours, 'demande'))} attendus` },
        { libelle: 'Taux de réussite', valeur: pourcent(parmi(arbitrees, 'statut', 'Versée', 'Accordée').length, arbitrees.length), detail: `${arbitrees.length} dossiers arbitrés` },
        { libelle: 'Demandé', valeur: euros(somme(lignes, 'demande')), detail: `${lignes.length} dossiers ouverts` },
      ];
    },
    groupe: { champ: 'statut', titre: 'Montants par statut de dossier', mesure: (l) => Number(l.accorde) || Number(l.demande) || 0, format: euros },
    pastille: (lignes) => `${eurosCourt(somme(parmi(lignes, 'statut', 'Versée'), 'accorde'))} reçus`,
    economie: (lignes) => ({
      produits: somme(parmi(lignes, 'statut', 'Versée'), 'accorde'),
      charges: 0,
      attendu: somme(parmi(lignes, 'statut', 'Accordée'), 'accorde') + somme(parmi(lignes, 'statut', 'Déposé', 'En instruction'), 'demande'),
      valorisation: 0,
    }),
    flux: (l) => [{ date: l.dateVersement, montant: l.statut === 'Versée' ? Number(l.accorde) || 0 : 0, sens: 'produit' }],
  },

  {
    id: 'boutique',
    route: 'boutique',
    titre: 'Merchandising',
    court: 'Boutique',
    resume: 'Catalogue, stocks et marges des maillots, textiles et équipements aux couleurs de la ligue.',
    couleur: '#E67E22',
    icone: 'M5.5 8h13l1 12h-15zM9 8V6.2a3 3 0 0 1 6 0V8',
    singulier: 'article',
    pluriel: 'articles',
    champCle: 'produit',
    champs: [
      { id: 'produit', libelle: 'Article', type: 'texte', requis: true },
      { id: 'categorie', libelle: 'Catégorie', type: 'liste', options: ['Maillot', 'Textile', 'Équipement', 'Accessoire', 'Goodies'], defaut: 'Textile' },
      { id: 'prixVente', libelle: 'Prix de vente', type: 'montant', requis: true },
      { id: 'coutUnitaire', libelle: 'Coût unitaire', type: 'montant' },
      { id: 'vendus', libelle: 'Unités vendues', type: 'nombre' },
      { id: 'stock', libelle: 'Stock restant', type: 'nombre' },
      { id: 'seuil', libelle: "Seuil d'alerte", type: 'nombre', defaut: 5 },
      { id: 'fournisseur', libelle: 'Fournisseur', type: 'texte' },
      champSaison,
      { id: 'notes', libelle: 'Notes', type: 'zone' },
    ],
    calcules: [
      { id: 'ca', libelle: "Chiffre d'affaires", type: 'montant', calcul: (l) => (Number(l.prixVente) || 0) * (Number(l.vendus) || 0) },
      { id: 'marge', libelle: 'Marge', type: 'montant', calcul: (l) => ((Number(l.prixVente) || 0) - (Number(l.coutUnitaire) || 0)) * (Number(l.vendus) || 0) },
      { id: 'etat', libelle: 'Stock', type: 'etat', calcul: etatStock },
    ],
    colonnes: ['produit', 'categorie', 'prixVente', 'vendus', 'ca', 'marge', 'stock', 'etat'],
    etat: etatStock,
    kpis: (lignes) => {
      const ca = lignes.reduce((t, l) => t + (Number(l.prixVente) || 0) * (Number(l.vendus) || 0), 0);
      const marge = lignes.reduce((t, l) => t + ((Number(l.prixVente) || 0) - (Number(l.coutUnitaire) || 0)) * (Number(l.vendus) || 0), 0);
      const dormant = lignes.reduce((t, l) => t + (Number(l.coutUnitaire) || 0) * (Number(l.stock) || 0), 0);
      const alertes = lignes.filter((l) => etatStock(l) !== 'En stock');
      return [
        { libelle: "Chiffre d'affaires", valeur: euros(ca), detail: `${nombre(somme(lignes, 'vendus'))} articles vendus` },
        { libelle: 'Marge dégagée', valeur: euros(marge), detail: ca ? `taux de marge ${pourcent(marge, ca)}` : 'aucune vente' },
        { libelle: 'Stock immobilisé', valeur: euros(dormant), detail: `${nombre(somme(lignes, 'stock'))} articles en réserve` },
        { libelle: 'Alertes de stock', valeur: nombre(alertes.length), detail: alertes.length ? alertes.map((l) => l.produit).slice(0, 2).join(', ') : 'aucune rupture', ton: alertes.length ? 'alerte' : null },
      ];
    },
    groupe: { champ: 'categorie', titre: 'Chiffre d’affaires par catégorie', mesure: (l) => (Number(l.prixVente) || 0) * (Number(l.vendus) || 0), format: euros },
    pastille: (lignes) => `${eurosCourt(lignes.reduce((t, l) => t + (Number(l.prixVente) || 0) * (Number(l.vendus) || 0), 0))} de CA`,
    economie: (lignes) => ({
      produits: lignes.reduce((t, l) => t + (Number(l.prixVente) || 0) * (Number(l.vendus) || 0), 0),
      charges: lignes.reduce((t, l) => t + (Number(l.coutUnitaire) || 0) * (Number(l.vendus) || 0), 0),
      attendu: 0,
      valorisation: 0,
    }),
  },

  {
    id: 'evenements',
    route: 'evenements',
    titre: 'Organisation d’événements',
    court: 'Événements',
    resume: 'Journées de championnat, tournois et plateaux : logistique, équipes engagées et équilibre financier.',
    couleur: '#E8455F',
    icone: 'M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5zM8 4v4M16 4v4M4 10.5h16M8 14.5h2M13.5 14.5h2',
    singulier: 'événement',
    pluriel: 'événements',
    champCle: 'intitule',
    champDate: 'date',
    champs: [
      { id: 'intitule', libelle: 'Intitulé', type: 'texte', requis: true },
      { id: 'type', libelle: 'Type', type: 'liste', options: ['Journée de championnat', 'Tournoi', 'Plateau jeunes', 'Stage', 'Assemblée générale', 'Événement partenaire'], defaut: 'Journée de championnat' },
      { id: 'date', libelle: 'Date', type: 'date', requis: true },
      { id: 'lieu', libelle: 'Lieu', type: 'texte' },
      { id: 'equipes', libelle: 'Équipes engagées', type: 'nombre' },
      { id: 'participants', libelle: 'Participants', type: 'nombre' },
      { id: 'recettes', libelle: 'Recettes', type: 'montant', aide: 'Engagements, buvette, entrées.' },
      { id: 'depenses', libelle: 'Dépenses', type: 'montant', aide: 'Location de terrain, arbitrage, récompenses.' },
      { id: 'statut', libelle: 'Statut', type: 'liste', options: ['Planifié', 'Confirmé', 'Réalisé', 'Annulé'], defaut: 'Planifié' },
      { id: 'responsable', libelle: 'Responsable', type: 'texte' },
      champSaison,
      { id: 'notes', libelle: 'Logistique', type: 'zone' },
    ],
    calcules: [
      { id: 'solde', libelle: 'Solde', type: 'montant', calcul: (l) => (Number(l.recettes) || 0) - (Number(l.depenses) || 0) },
    ],
    colonnes: ['intitule', 'type', 'date', 'lieu', 'equipes', 'recettes', 'depenses', 'solde', 'statut'],
    etat: (l) => l.statut,
    tri: 'date',
    kpis: (lignes) => {
      const realises = parmi(lignes, 'statut', 'Réalisé');
      const aVenir = lignes.filter((l) => l.statut !== 'Annulé' && l.date && joursRestants(l.date) >= 0);
      const equipes = Math.max(0, ...lignes.map((l) => Number(l.equipes) || 0));
      const solde = somme(lignes, 'recettes') - somme(lignes, 'depenses');
      return [
        { libelle: 'Événements réalisés', valeur: nombre(realises.length), detail: `${lignes.length} programmés sur la saison` },
        { libelle: 'Équipes engagées', valeur: nombre(equipes), detail: `${nombre(somme(realises, 'participants'))} participants accueillis` },
        { libelle: 'Solde des événements', valeur: euros(solde), detail: `${euros(somme(lignes, 'recettes'))} de recettes, ${euros(somme(lignes, 'depenses'))} de dépenses`, ton: solde < 0 ? 'alerte' : null },
        { libelle: 'À venir', valeur: nombre(aVenir.length), detail: aVenir.length ? `prochain : ${aVenir.slice().sort((a, b) => a.date.localeCompare(b.date))[0].intitule}` : 'rien de programmé' },
      ];
    },
    groupe: { champ: 'type', titre: 'Événements par type', mesure: () => 1, format: nombre },
    pastille: (lignes) => `${nombre(parmi(lignes, 'statut', 'Réalisé', 'Confirmé', 'Planifié').length)} événements`,
    economie: (lignes) => ({ produits: somme(parmi(lignes, 'statut', 'Réalisé'), 'recettes'), charges: somme(parmi(lignes, 'statut', 'Réalisé', 'Confirmé'), 'depenses'), attendu: somme(parmi(lignes, 'statut', 'Confirmé', 'Planifié'), 'recettes'), valorisation: 0 }),
    flux: (l) => (l.statut === 'Réalisé' ? [{ date: l.date, montant: Number(l.recettes) || 0, sens: 'produit' }, { date: l.date, montant: Number(l.depenses) || 0, sens: 'charge' }] : []),
  },

  {
    id: 'prestations',
    route: 'prestations',
    titre: 'Prestations',
    court: 'Prestations',
    resume: 'Animations d’entreprise, formations et locations facturées par l’association.',
    couleur: '#17BEBB',
    icone: 'M4 9.5A1.5 1.5 0 0 1 5.5 8h13A1.5 1.5 0 0 1 20 9.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5zM9 8V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V8M4 13h16',
    singulier: 'prestation',
    pluriel: 'prestations',
    champCle: 'client',
    champDate: 'date',
    champs: [
      { id: 'client', libelle: 'Client', type: 'texte', requis: true },
      { id: 'prestation', libelle: 'Prestation', type: 'liste', options: ["Animation d'entreprise", 'Formation encadrants', 'Coaching', 'Location de créneau', 'Arbitrage extérieur'], defaut: "Animation d'entreprise" },
      { id: 'date', libelle: 'Date', type: 'date' },
      { id: 'montant', libelle: 'Montant', type: 'montant', requis: true },
      { id: 'statut', libelle: 'Statut', type: 'liste', options: ['Devis envoyé', 'Confirmée', 'Facturée', 'Payée', 'Annulée'], defaut: 'Devis envoyé' },
      { id: 'echeance', libelle: 'Échéance de paiement', type: 'date' },
      { id: 'contact', libelle: 'Contact', type: 'texte' },
      { id: 'courriel', libelle: 'Courriel', type: 'courriel' },
      champSaison,
      { id: 'notes', libelle: 'Détail de la prestation', type: 'zone' },
    ],
    colonnes: ['client', 'prestation', 'date', 'montant', 'statut', 'echeance'],
    etat: (l) => l.statut,
    tri: 'date',
    kpis: (lignes) => {
      const payees = parmi(lignes, 'statut', 'Payée');
      const attente = parmi(lignes, 'statut', 'Facturée', 'Confirmée');
      const clients = new Set(lignes.filter((l) => l.statut !== 'Annulée').map((l) => l.client));
      const gagnees = parmi(lignes, 'statut', 'Payée', 'Facturée', 'Confirmée');
      return [
        { libelle: 'Chiffre d’affaires encaissé', valeur: euros(somme(payees, 'montant')), detail: `${payees.length} prestations payées` },
        { libelle: 'Clients', valeur: nombre(clients.size), detail: `${lignes.length} affaires suivies` },
        { libelle: 'En attente de paiement', valeur: euros(somme(attente, 'montant')), detail: `${attente.length} factures ouvertes`, ton: attente.length ? 'alerte' : null },
        { libelle: 'Taux de transformation', valeur: pourcent(gagnees.length, lignes.length), detail: 'des devis transformés' },
      ];
    },
    groupe: { champ: 'prestation', titre: 'Chiffre d’affaires par type de prestation', mesure: (l) => (l.statut === 'Annulée' ? 0 : Number(l.montant) || 0), format: euros },
    pastille: (lignes) => `${eurosCourt(somme(parmi(lignes, 'statut', 'Payée'), 'montant'))} de CA`,
    economie: (lignes) => ({ produits: somme(parmi(lignes, 'statut', 'Payée'), 'montant'), charges: 0, attendu: somme(parmi(lignes, 'statut', 'Facturée', 'Confirmée'), 'montant'), valorisation: 0 }),
    flux: (l) => (l.statut === 'Payée' ? [{ date: l.date, montant: Number(l.montant) || 0, sens: 'produit' }] : []),
  },

  {
    id: 'partenariats',
    route: 'partenariats',
    titre: 'Partenariats privés',
    court: 'Partenariats',
    resume: 'Entreprises partenaires, contrats de sponsoring, contreparties et échéances de renouvellement.',
    couleur: '#D4A017',
    icone: 'M10.5 13.5a3.6 3.6 0 0 0 5.1 0l2.9-2.9a3.6 3.6 0 0 0-5.1-5.1l-1.4 1.4M13.5 10.5a3.6 3.6 0 0 0-5.1 0l-2.9 2.9a3.6 3.6 0 0 0 5.1 5.1l1.4-1.4',
    singulier: 'partenaire',
    pluriel: 'partenaires',
    champCle: 'entreprise',
    champDate: 'debut',
    champs: [
      { id: 'entreprise', libelle: 'Entreprise', type: 'texte', requis: true },
      { id: 'type', libelle: 'Type de partenariat', type: 'liste', options: ['Sponsor maillot', 'Panneau terrain', 'Dotation matériel', 'Mécénat', 'Visibilité digitale'], defaut: 'Panneau terrain' },
      { id: 'montant', libelle: 'Montant annuel', type: 'montant', requis: true },
      { id: 'encaisse', libelle: 'Déjà encaissé', type: 'montant' },
      { id: 'statut', libelle: 'Statut', type: 'liste', options: ['En négociation', 'Actif', 'À renouveler', 'Terminé'], defaut: 'En négociation' },
      { id: 'debut', libelle: 'Début du contrat', type: 'date' },
      { id: 'fin', libelle: 'Fin du contrat', type: 'date' },
      { id: 'contact', libelle: 'Interlocuteur', type: 'texte' },
      { id: 'courriel', libelle: 'Courriel', type: 'courriel' },
      { id: 'nature', libelle: 'Contreparties', type: 'texte', aide: 'Logo maillot, panneau, publications, invitations…' },
      champSaison,
      { id: 'notes', libelle: 'Historique de la relation', type: 'zone' },
    ],
    calcules: [
      { id: 'reste', libelle: 'Reste à percevoir', type: 'montant', calcul: (l) => Math.max(0, (Number(l.montant) || 0) - (Number(l.encaisse) || 0)) },
    ],
    colonnes: ['entreprise', 'type', 'montant', 'encaisse', 'reste', 'fin', 'statut'],
    etat: (l) => l.statut,
    kpis: (lignes) => {
      const actifs = parmi(lignes, 'statut', 'Actif', 'À renouveler');
      const aRenouveler = lignes.filter((l) => l.statut === 'À renouveler' || (l.statut === 'Actif' && l.fin && joursRestants(l.fin) <= 90));
      const negociation = parmi(lignes, 'statut', 'En négociation');
      return [
        { libelle: 'Sponsoring encaissé', valeur: euros(somme(lignes, 'encaisse')), detail: `sur ${euros(somme(actifs, 'montant'))} contractualisés` },
        { libelle: 'Partenaires actifs', valeur: nombre(actifs.length), detail: `${lignes.length} relations suivies` },
        { libelle: 'À renouveler sous 90 j', valeur: nombre(aRenouveler.length), detail: aRenouveler.length ? aRenouveler.map((l) => l.entreprise).slice(0, 2).join(', ') : 'aucune échéance proche', ton: aRenouveler.length ? 'alerte' : null },
        { libelle: 'En négociation', valeur: euros(somme(negociation, 'montant')), detail: `${negociation.length} pistes ouvertes` },
      ];
    },
    groupe: { champ: 'type', titre: 'Sponsoring par type de partenariat', mesure: (l) => Number(l.montant) || 0, format: euros },
    pastille: (lignes) => `${eurosCourt(somme(lignes, 'encaisse'))} de sponsoring`,
    economie: (lignes) => ({ produits: somme(lignes, 'encaisse'), charges: 0, attendu: somme(parmi(lignes, 'statut', 'Actif', 'À renouveler'), 'montant') - somme(parmi(lignes, 'statut', 'Actif', 'À renouveler'), 'encaisse'), valorisation: 0 }),
    flux: (l) => [{ date: l.debut, montant: Number(l.encaisse) || 0, sens: 'produit' }],
  },
];

export const MODULE_PAR_ID = Object.fromEntries(MODULES.map((m) => [m.id, m]));
export const CHAMPS_TOUS = (module) => [...module.champs, ...(module.calcules || [])];
export const champParId = (module, id) => CHAMPS_TOUS(module).find((c) => c.id === id);
