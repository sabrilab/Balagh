/**
 * Jeu de démonstration. Une association qui ouvre l'outil sur des tableaux
 * vides ne peut rien juger : elle a besoin de voir à quoi ressemblent des
 * données réalistes avant d'y mettre les siennes. Un bouton des réglages
 * vide tout d'un coup.
 *
 * Le tirage est déterministe (générateur mulberry32 amorcé sur une
 * constante) : deux installations montrent la même association fictive, et
 * les captures d'écran de la documentation restent valables.
 *
 * Les noms de personnes, d'entreprises et de clients sont inventés.
 */

import { identifiant, bornesSaison } from './format.js';
import { REGLAGES_DEFAUT } from './schema.js';

function alea(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRENOMS = ['Karim', 'Julien', 'Sofiane', 'Mathieu', 'Anaïs', 'Lucas', 'Nadia', 'Thomas', 'Inès', 'Antoine', 'Camille', 'Youssef', 'Léa', 'Maxime', 'Sarah', 'Baptiste', 'Ilyes', 'Manon', 'Quentin', 'Fatima', 'Romain', 'Chloé', 'Adrien', 'Amine', 'Émilie', 'Nicolas', 'Jade', 'Farid', 'Clara', 'Damien', 'Océane', 'Hugo', 'Sabrina', 'Vincent', 'Élodie', 'Mehdi'];
const NOMS = ['Delcroix', 'Vandamme', 'Lefebvre', 'Bouchard', 'Dubois', 'Carpentier', 'Leroy', 'Ben Ali', 'Descamps', 'Mercier', 'Dhaene', 'Fournier', 'Lemaire', 'Blondel', 'Verhaeghe', 'Caron', 'Delattre', 'Mahieu', 'Bonnet', 'Sadaoui', 'Duthoit', 'Renard', 'Wattiez', 'Lecomte', 'Bertin', 'Hamdi', 'Vasseur', 'Danjou', 'Pollet', 'Lammens'];
const EQUIPES = ['Lille Futsal Club', 'Roubaix Five', 'Tourcoing Ballers', "Villeneuve United", 'Wattrelos FC5', 'Marcq Athletic', 'Armentières Five', 'Croix Sporting', 'Lambersart FC', 'Seclin Five', 'Hem Athletic', 'Wasquehal Five'];
const SALLES = ['Halle Vauban, Roubaix', 'Complexe Léo-Lagrange, Tourcoing', 'Gymnase des Quatre-Vents, Lille', 'Salle Jean-Jaurès, Wattrelos', 'Palais des sports, Villeneuve-d’Ascq', 'Gymnase du Blanc-Seau, Tourcoing'];

const ROLES = [
  ['Président', 'Bureau', 210], ['Trésorière', 'Bureau', 180], ['Secrétaire général', 'Bureau', 150],
  ['Vice-président', 'Bureau', 120], ['Responsable arbitrage', 'Arbitrage', 140], ['Arbitre', 'Arbitrage', 90],
  ['Arbitre', 'Arbitrage', 75], ['Arbitre', 'Arbitrage', 60], ['Responsable logistique', 'Logistique', 130],
  ['Responsable buvette', 'Logistique', 95], ['Intendance matériel', 'Logistique', 70],
  ['Community manager', 'Communication', 110], ['Photographe', 'Communication', 45],
  ['Responsable communication', 'Communication', 100], ['Coach jeunes', 'Encadrement', 160],
  ['Éducateur sportif', 'Encadrement', 140], ['Éducateur sportif', 'Encadrement', 85],
  ['Responsable des équipes', 'Encadrement', 120], ['Délégué de journée', 'Logistique', 55],
  ['Bénévole accueil', 'Logistique', 40], ['Bénévole accueil', 'Logistique', 30],
  ['Référent jeunes', 'Encadrement', 75], ['Chargé de partenariats', 'Bureau', 105],
  ['Webmestre', 'Communication', 50], ['Bénévole buvette', 'Logistique', 35], ['Arbitre stagiaire', 'Arbitrage', 25],
];

const FINANCEURS = [
  ['Agence nationale du Sport', 'Projet Sportif Fédéral — pratiques nouvelles', 4500],
  ['Ville de Roubaix', 'Subvention de fonctionnement aux clubs', 2600],
  ['Département du Nord', 'Aide aux associations sportives', 2100],
  ['Région Hauts-de-France', 'Appel à projets Sport et citoyenneté', 3600],
  ['Métropole Européenne de Lille', 'Soutien aux manifestations sportives', 1600],
  ['FDVA', 'FDVA 2 — fonctionnement et innovation', 3000],
  ['CAF du Nord', 'Vacances sportives pour tous', 1300],
  ['Ville de Wattrelos', 'Sport dans les quartiers prioritaires', 1100],
  ['ANCT', 'Contrat de ville — cohésion sociale', 1800],
];

const ARTICLES = [
  ['Maillot domicile SFL', 'Maillot', 32, 18, 34, 24],
  ['Maillot extérieur SFL', 'Maillot', 32, 18, 22, 12],
  ['Short d’entraînement', 'Textile', 18, 9.5, 28, 30],
  ['Survêtement club', 'Textile', 55, 34, 14, 9],
  ['Sweat à capuche SFL', 'Textile', 42, 23, 19, 16],
  ['Chaussettes de match (lot de 2)', 'Textile', 12, 5, 42, 44],
  ['Ballon futsal taille 4', 'Équipement', 28, 16, 16, 11],
  ['Sac de sport SFL', 'Accessoire', 26, 14, 13, 6],
  ['Gourde 750 ml', 'Accessoire', 9, 3.8, 33, 48],
  ['Écharpe supporter', 'Accessoire', 14, 6, 17, 3],
  ['Casquette SFL', 'Goodies', 15, 6.5, 14, 21],
  ['Porte-clés ballon', 'Goodies', 5, 1.6, 46, 62],
  ['Coupe-vent encadrement', 'Textile', 48, 29, 8, 4],
  ['Serviette microfibre', 'Goodies', 11, 4.5, 10, 17],
];

const PARTENAIRES = [
  ['Garage Delcroix', 'Sponsor maillot', 2000, 'Logo face avant du maillot, panneau, publications réseaux'],
  ['Brasserie du Beffroi', 'Panneau terrain', 700, 'Panneau 3 m, mention sur les affiches de journée'],
  ['Optique Vandamme', 'Panneau terrain', 500, 'Panneau 2 m, invitation à la finale'],
  ['Nord Isolation', 'Mécénat', 1400, 'Reçu fiscal, logo sur le site, tournoi entreprise offert'],
  ['Auto-école Horizon', 'Visibilité digitale', 400, 'Publications mensuelles, story de journée'],
  ['Menuiserie Lemaire', 'Dotation matériel', 800, 'Fourniture des bancs de touche et rangements'],
  ['Ambulances du Ferrain', 'Panneau terrain', 600, 'Panneau 2 m, présence secours sur les finales'],
  ['Pizzeria Bella Nonna', 'Dotation matériel', 350, 'Repas des bénévoles sur les journées'],
  ['Assurances Cauchy', 'Sponsor maillot', 1600, 'Logo dos du maillot, encart newsletter'],
  ['Espace Sport Roubaix', 'Dotation matériel', 1000, 'Équipements arbitres et ballons de match'],
  ['Multitech Services', 'Visibilité digitale', 500, 'Bandeau site, écran de la halle'],
];

const CLIENTS = [
  ['Groupe Verlinde', "Animation d'entreprise", 900],
  ['CCAS de Wattrelos', 'Formation encadrants', 600],
  ['Comité d’entreprise Vandelle', "Animation d'entreprise", 750],
  ['Mairie de Croix', 'Location de créneau', 400],
  ['Collège Jean-Zay', 'Coaching', 500],
  ['Résidence Les Tilleuls', "Animation d'entreprise", 320],
  ['Ligue régionale de futsal', 'Arbitrage extérieur', 700],
  ['Nord Isolation', "Animation d'entreprise", 1000],
  ['Maison de quartier du Pile', 'Formation encadrants', 450],
  ['Multitech Services', "Animation d'entreprise", 800],
  ['Centre social de l’Alma', 'Coaching', 550],
  ['Association Sport et Cité', 'Formation encadrants', 620],
];

/** Dimanches d'une saison, du premier de septembre au dernier de juin. */
function dimanches(saison) {
  const { debut } = bornesSaison(saison);
  const d = new Date(`${debut}T12:00:00Z`);
  while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1);
  const sorties = [];
  const limite = `${Number(saison.split('-')[1])}-06-30`;
  while (d.toISOString().slice(0, 10) <= limite) {
    const iso = d.toISOString().slice(0, 10);
    const mois = iso.slice(5, 7);
    if (mois !== '12' || Number(iso.slice(8)) < 20) sorties.push(iso);
    d.setUTCDate(d.getUTCDate() + 14);
  }
  return sorties;
}

const decalage = (iso, jours) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
};

/**
 * Construit la base de démonstration : deux saisons complètes et l'amorce de
 * la suivante. `jour` fixe la date de référence — les événements passés sont
 * réalisés, les suivants restent planifiés.
 */
export function baseDemo(jour = new Date().toISOString().slice(0, 10)) {
  const r = alea(20260419);
  const entier = (min, max) => min + Math.floor(r() * (max - min + 1));
  const choix = (liste) => liste[Math.floor(r() * liste.length)];
  const chance = (p) => r() < p;
  const donnees = { rh: [], cotisations: [], subventions: [], boutique: [], evenements: [], prestations: [], partenariats: [] };
  const ajoute = (cle, ligne) => donnees[cle].push({ id: identifiant(cle.slice(0, 3)), creeLe: jour, majLe: jour, ...ligne });

  const saisons = [
    { saison: '2024-2025', part: 0.74, close: true },
    { saison: '2025-2026', part: 1, close: false },
  ];

  for (const { saison, part, close } of saisons) {
    const an = Number(saison.split('-')[0]);
    const { debut } = bornesSaison(saison);

    /* -------- Ressources humaines */
    const effectif = Math.round(ROLES.length * part);
    const benevoles = [];
    for (let i = 0; i < effectif; i++) {
      const [role, pole, heuresBase] = ROLES[i];
      const nom = `${PRENOMS[(i * 5 + an) % PRENOMS.length]} ${NOMS[(i * 7 + an) % NOMS.length]}`;
      const h = Math.round(heuresBase * (0.8 + r() * 0.4) * part);
      benevoles.push(nom);
      ajoute('rh', {
        saison, nom, role, categorie: pole,
        statut: h > 60 ? 'Actif' : chance(0.7) ? 'Ponctuel' : 'Inactif',
        heures: h,
        courriel: `${nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]+/g, '.')}@fiveleague.fr`,
        telephone: `06 ${entier(10, 99)} ${entier(10, 99)} ${entier(10, 99)} ${entier(10, 99)}`,
        depuis: `${an - entier(0, 4)}-09-${String(entier(1, 28)).padStart(2, '0')}`,
        notes: pole === 'Arbitrage' ? 'Disponible les dimanches matin.' : '',
      });
    }

    /* -------- Cotisations */
    const tarifs = { 'Joueur senior': 120, 'Joueur jeune': 70, Dirigeant: 40, Arbitre: 30, 'Membre bienfaiteur': 150 };
    const effectifs = { 'Joueur senior': Math.round(84 * part), 'Joueur jeune': Math.round(24 * part), Dirigeant: Math.round(11 * part), Arbitre: Math.round(8 * part), 'Membre bienfaiteur': Math.round(5 * part) };
    let n = 0;
    for (const [categorie, total] of Object.entries(effectifs)) {
      for (let i = 0; i < total; i++, n++) {
        const montant = tarifs[categorie] + (categorie === 'Membre bienfaiteur' ? entier(0, 4) * 50 : 0);
        const solde = close ? chance(0.97) : chance(0.84);
        const partiel = !solde && chance(0.35);
        const regle = solde ? montant : partiel ? Math.round(montant / 2) : 0;
        const datePaiement = regle ? decalage(debut, entier(0, 160)) : '';
        ajoute('cotisations', {
          saison,
          adherent: `${PRENOMS[(n * 3 + an * 2) % PRENOMS.length]} ${NOMS[(n * 11 + an) % NOMS.length]}`,
          categorie,
          equipe: categorie.startsWith('Joueur') ? EQUIPES[n % EQUIPES.length] : '',
          montant, regle,
          moyen: regle ? choix(['Virement', 'Carte (HelloAsso)', 'Espèces', 'Chèque', "Pass'Sport"]) : 'Virement',
          datePaiement,
          echeance: decalage(debut, 60),
          courriel: '',
          notes: !solde && !close ? 'Relance à faire.' : '',
        });
      }
    }

    /* -------- Subventions */
    const dossiers = Math.round(FINANCEURS.length * part);
    for (let i = 0; i < dossiers; i++) {
      const [financeur, dispositif, base] = FINANCEURS[i];
      const demande = Math.round((base * (0.9 + r() * 0.3)) / 50) * 50;
      const issue = close ? (chance(0.72) ? 'Versée' : 'Refusée') : i % 5 === 0 ? 'En instruction' : i % 7 === 3 ? 'Refusée' : chance(0.7) ? 'Versée' : 'Accordée';
      const accorde = issue === 'Refusée' ? 0 : Math.round((demande * (0.6 + r() * 0.4)) / 50) * 50;
      const depot = decalage(debut, entier(5, 90));
      ajoute('subventions', {
        saison, financeur, dispositif, demande, accorde,
        statut: issue,
        echeance: decalage(depot, entier(3, 20)),
        dateDepot: depot,
        dateVersement: issue === 'Versée' ? decalage(depot, entier(60, 190)) : '',
        referent: choix(benevoles.slice(0, 4)),
        notes: issue === 'Refusée' ? 'Dossier non retenu — à redéposer avec un budget prévisionnel détaillé.' : '',
      });
    }

    /* -------- Boutique */
    for (const [produit, categorie, prix, cout, vendusBase, stockBase] of ARTICLES.slice(0, Math.round(ARTICLES.length * part))) {
      ajoute('boutique', {
        saison, produit, categorie,
        prixVente: prix, coutUnitaire: cout,
        vendus: Math.round(vendusBase * part * (0.85 + r() * 0.3)),
        stock: Math.round(stockBase * (0.7 + r() * 0.6)),
        seuil: categorie === 'Maillot' ? 10 : 8,
        fournisseur: categorie === 'Goodies' ? 'Objets Pub Nord' : 'Textile Pro Lille',
        notes: '',
      });
    }

    /* -------- Événements */
    const journees = dimanches(saison);
    journees.forEach((date, i) => {
      const passe = date <= jour;
      const equipes = 10 + Math.round(r() * 2);
      ajoute('evenements', {
        saison,
        intitule: `Journée ${i + 1} — championnat SFL`,
        type: 'Journée de championnat',
        date,
        lieu: SALLES[i % SALLES.length],
        equipes,
        participants: equipes * entier(8, 11),
        recettes: entier(180, 330),
        depenses: entier(150, 290),
        statut: passe ? 'Réalisé' : chance(0.6) ? 'Confirmé' : 'Planifié',
        responsable: choix(benevoles.slice(0, 8)),
        notes: '',
      });
    });
    const speciaux = [
      ['Tournoi de Noël', 'Tournoi', `${an}-12-21`, 16, 1200, 800],
      ['Plateau jeunes U11', 'Plateau jeunes', `${an + 1}-02-15`, 12, 320, 280],
      ['Stage de perfectionnement', 'Stage', `${an + 1}-04-19`, 8, 850, 680],
      ['Finale de la Sunday Five League', 'Tournoi', `${an + 1}-06-14`, 12, 1600, 1150],
      ['Assemblée générale ordinaire', 'Assemblée générale', `${an + 1}-06-26`, 0, 0, 150],
    ];
    for (const [intitule, type, date, equipes, recettes, depenses] of speciaux) {
      if (!close && date > decalage(jour, 120)) continue;
      ajoute('evenements', {
        saison, intitule, type, date,
        lieu: type === 'Assemblée générale' ? 'Maison des associations, Roubaix' : SALLES[0],
        equipes, participants: equipes * 9 + entier(20, 60),
        recettes: Math.round(recettes * (0.9 + r() * 0.2)),
        depenses: Math.round(depenses * (0.9 + r() * 0.2)),
        statut: date <= jour ? 'Réalisé' : 'Confirmé',
        responsable: choix(benevoles.slice(0, 6)),
        notes: '',
      });
    }

    /* -------- Prestations */
    const affaires = Math.round(CLIENTS.length * part);
    for (let i = 0; i < affaires; i++) {
      const [client, prestation, base] = CLIENTS[i];
      const date = decalage(debut, entier(20, 300));
      const montant = Math.round((base * (0.9 + r() * 0.25)) / 10) * 10;
      const statut = close ? (chance(0.9) ? 'Payée' : 'Annulée')
        : date > jour ? (chance(0.5) ? 'Devis envoyé' : 'Confirmée')
          : chance(0.7) ? 'Payée' : chance(0.6) ? 'Facturée' : 'Annulée';
      ajoute('prestations', {
        saison, client, prestation, date, montant, statut,
        echeance: decalage(date, 30),
        contact: `${choix(PRENOMS)} ${choix(NOMS)}`,
        courriel: '',
        notes: prestation === "Animation d'entreprise" ? 'Tournoi interne, 3 h, encadrement et arbitrage inclus.' : '',
      });
    }

    /* -------- Partenariats */
    const contrats = Math.round(PARTENAIRES.length * part);
    for (let i = 0; i < contrats; i++) {
      const [entreprise, type, base, nature] = PARTENAIRES[i];
      const montant = Math.round((base * (0.9 + r() * 0.2)) / 50) * 50;
      const enNego = !close && i % 6 === 5;
      const fin = `${an + 1}-08-31`;
      ajoute('partenariats', {
        saison, entreprise, type, montant,
        encaisse: enNego ? 0 : close ? montant : Math.round((montant * (chance(0.7) ? 1 : 0.5)) / 10) * 10,
        statut: enNego ? 'En négociation' : close ? 'Terminé' : chance(0.35) ? 'À renouveler' : 'Actif',
        debut: `${an}-09-01`, fin,
        contact: `${choix(PRENOMS)} ${choix(NOMS)}`,
        courriel: '',
        nature,
        notes: '',
      });
    }
  }

  /* -------- Amorce de la saison suivante : ce qui se prépare dès l'été. */
  const suivante = '2026-2027';
  ajoute('subventions', { saison: suivante, financeur: 'Agence nationale du Sport', dispositif: 'Projet Sportif Fédéral 2026-2027', demande: 4800, accorde: 0, statut: 'Déposé', echeance: '2026-09-15', dateDepot: '2026-08-04', dateVersement: '', referent: 'Karim Delcroix', notes: 'Accusé de réception reçu.' });
  ajoute('subventions', { saison: suivante, financeur: 'Ville de Roubaix', dispositif: 'Subvention de fonctionnement 2027', demande: 2800, accorde: 0, statut: 'À déposer', echeance: '2026-10-31', dateDepot: '', dateVersement: '', referent: 'Nadia Bouchard', notes: 'Dossier à retirer en mairie début septembre.' });
  ajoute('partenariats', { saison: suivante, entreprise: 'Garage Delcroix', type: 'Sponsor maillot', montant: 2400, encaisse: 0, statut: 'En négociation', debut: '2026-09-01', fin: '2027-08-31', contact: 'Julien Delcroix', courriel: '', nature: 'Reconduction avec logo dos du maillot en plus', notes: 'Rendez-vous fixé fin août.' });
  ajoute('evenements', { saison: suivante, intitule: 'Tournoi de rentrée', type: 'Tournoi', date: '2026-09-06', lieu: SALLES[0], equipes: 12, participants: 120, recettes: 620, depenses: 430, statut: 'Confirmé', responsable: 'Karim Delcroix', notes: 'Ouverture de la saison, inscriptions ouvertes.' });

  return { version: 1, saison: '', reglages: { ...REGLAGES_DEFAUT }, demo: true, donnees };
}
