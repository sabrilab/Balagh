/**
 * Page d'un module. Une seule vue sert les sept domaines : tout ce qui les
 * distingue — champs, colonnes, indicateurs, états — vient du schéma. Une
 * page par module aurait signifié sept formulaires à corriger à chaque
 * évolution.
 */

import { h, icone, modale, confirmer, toast, remplacer } from './dom.js';
import { MODULE_PAR_ID, CHAMPS_TOUS, champParId } from './schema.js';
import { euros, nombre, heures, dateCourte, contient, comparer } from './format.js';
import { carteKPI, pastille, carte, etatVide, bouton, champFichier, TRACE_ICONES } from './composants.js';
import { barresHorizontales } from './graphes.js';
import { versCSV, depuisCSV, versXLSX, tableModule, telecharger, copier, nomHorodate, correspondance, ligneImportee } from './echange.js';
import { ajouterLigne, ajouterLignes, lignes, modifierLigne, reglagesActifs, saisonActive, supprimerLigne } from './store.js';

/** L'état de tri et de filtre survit à la navigation, le temps de la session. */
const etats = new Map();
const etatDe = (id) => {
  if (!etats.has(id)) etats.set(id, { recherche: '', filtre: '', tri: null, sens: 1, toutesSaisons: false });
  return etats.get(id);
};

const valeurAffichee = (ligne, champ, reglages) => {
  const brute = champ.calcul ? champ.calcul(ligne, reglages) : ligne[champ.id];
  switch (champ.type) {
    case 'montant': return euros(brute);
    case 'nombre': return nombre(brute);
    case 'heures': return heures(brute);
    case 'date': return dateCourte(brute);
    default: return brute === undefined || brute === null || brute === '' ? '—' : String(brute);
  }
};

const valeurTri = (ligne, champ, reglages) => (champ.calcul ? champ.calcul(ligne, reglages) : ligne[champ.id]);

/* ------------------------------------------------------------ Formulaire */

function champFormulaire(champ, valeur) {
  const identifiantChamp = `champ-${champ.id}`;
  let saisie;
  if (champ.type === 'liste') {
    saisie = h('select.saisie', { id: identifiantChamp, name: champ.id },
      champ.requis ? null : h('option', { value: '', text: '—' }),
      champ.options.map((o) => h('option', { value: o, text: o, selected: String(valeur) === o })));
  } else if (champ.type === 'zone') {
    saisie = h('textarea.saisie', { id: identifiantChamp, name: champ.id, rows: 3, value: valeur ?? '' });
  } else {
    const types = { montant: 'number', nombre: 'number', heures: 'number', date: 'date', courriel: 'email', tel: 'tel' };
    saisie = h('input.saisie', {
      id: identifiantChamp, name: champ.id, type: types[champ.type] || 'text',
      value: valeur ?? '',
      step: champ.type === 'montant' ? '0.01' : champ.type === 'nombre' || champ.type === 'heures' ? '1' : null,
      min: ['montant', 'nombre', 'heures'].includes(champ.type) ? '0' : null,
      inputmode: ['montant', 'nombre', 'heures'].includes(champ.type) ? 'decimal' : null,
    });
  }
  if (champ.requis) saisie.setAttribute('required', '');
  return h(`div.champ${champ.type === 'zone' ? '.champ--large' : ''}`, {},
    h('label.champ-libelle', { for: identifiantChamp }, champ.libelle, champ.requis ? h('span.requis', { text: ' *', 'aria-hidden': 'true' }) : null),
    saisie,
    champ.aide ? h('p.champ-aide', { id: `${identifiantChamp}-aide`, text: champ.aide }) : null);
}

function ouvrirFormulaire(module, ligneExistante) {
  const edition = Boolean(ligneExistante);
  const valeurs = ligneExistante || Object.fromEntries(module.champs.filter((c) => c.defaut !== undefined).map((c) => [c.id, c.defaut]));
  if (!edition) valeurs.saison = valeurs.saison || saisonActive();
  const formulaire = h('form.formulaire', { id: 'formulaire-module', novalidate: true },
    h('div.grille-champs', {}, module.champs.map((c) => champFormulaire(c, valeurs[c.id]))));

  const enregistrer = (fermer) => {
    const donnees = {};
    for (const champ of module.champs) {
      const saisie = formulaire.elements[champ.id];
      let valeur = saisie ? saisie.value : '';
      if (['montant', 'nombre', 'heures'].includes(champ.type)) valeur = valeur === '' ? 0 : Number(valeur);
      donnees[champ.id] = valeur;
      if (champ.requis && (valeur === '' || valeur === null || (typeof valeur === 'number' && Number.isNaN(valeur)))) {
        saisie.focus();
        saisie.setAttribute('aria-invalid', 'true');
        toast(`${champ.libelle} : ce champ est obligatoire.`, 'erreur');
        return;
      }
    }
    if (edition) modifierLigne(module.id, ligneExistante.id, donnees);
    else ajouterLigne(module.id, donnees);
    fermer();
    toast(edition ? 'Modification enregistrée.' : `${module.singulier.charAt(0).toUpperCase()}${module.singulier.slice(1)} ajouté${module.singulier.endsWith('e') ? 'e' : ''}.`);
  };

  const { boite } = modale({
    titre: edition ? `Modifier — ${ligneExistante[module.champCle] || module.singulier}` : `Nouvel élément — ${module.titre}`,
    corps: formulaire,
    large: true,
    actions: [
      { libelle: 'Annuler' },
      { libelle: 'Enregistrer', variante: 'primaire', action: enregistrer },
    ],
  });
  formulaire.addEventListener('submit', (e) => { e.preventDefault(); });
  boite.style.setProperty('--accent-module', module.couleur);
}

/* ---------------------------------------------------------------- Tableau */

function tableau(module, lignes, etat, reglages) {
  const colonnes = module.colonnes.map((id) => champParId(module, id)).filter(Boolean);
  const tri = etat.tri ? champParId(module, etat.tri) : null;
  const triees = lignes.slice();
  if (tri) triees.sort((a, b) => comparer(valeurTri(a, tri, reglages), valeurTri(b, tri, reglages), tri.type) * etat.sens);

  const enTete = h('tr', {}, colonnes.map((c) => {
    const actif = etat.tri === c.id;
    return h('th', { scope: 'col', class: ['montant', 'nombre', 'heures'].includes(c.type) ? 'aligne-droite' : '', 'aria-sort': actif ? (etat.sens === 1 ? 'ascending' : 'descending') : 'none' },
      h('button.tri', {
        type: 'button',
        onclick: () => {
          if (etat.tri === c.id) etat.sens = -etat.sens;
          else { etat.tri = c.id; etat.sens = 1; }
          rafraichir(module.id);
        },
      }, h('span', { text: c.libelle }), actif ? h('span.tri-fleche', { text: etat.sens === 1 ? '▲' : '▼' }) : null));
  }).concat([h('th.colonne-actions', { scope: 'col' }, h('span.visuellement-cache', { text: 'Actions' }))]));

  const corps = triees.map((ligne) => h('tr', {}, [
    ...colonnes.map((c) => {
      const cellule = h('td', { 'data-libelle': c.libelle, class: ['montant', 'nombre', 'heures'].includes(c.type) ? 'aligne-droite' : '' });
      if (c.type === 'etat') cellule.appendChild(pastille(c.calcul(ligne)));
      else if (c.id === module.champCle) cellule.appendChild(h('span.cellule-cle', { text: valeurAffichee(ligne, c, reglages) }));
      else cellule.textContent = valeurAffichee(ligne, c, reglages);
      return cellule;
    }),
    h('td.colonne-actions', {},
      h('button.bouton-icone', { type: 'button', title: 'Modifier', 'aria-label': `Modifier ${ligne[module.champCle] || ''}`, onclick: () => ouvrirFormulaire(module, ligne) }, icone(TRACE_ICONES.crayon, 18)),
      h('button.bouton-icone.bouton-icone--danger', {
        type: 'button', title: 'Supprimer', 'aria-label': `Supprimer ${ligne[module.champCle] || ''}`,
        onclick: async () => {
          if (await confirmer(`Supprimer « ${ligne[module.champCle] || module.singulier} » ?`, 'La ligne sera retirée définitivement de la base.')) {
            supprimerLigne(module.id, ligne.id);
            toast('Ligne supprimée.', 'neutre');
          }
        },
      }, icone(TRACE_ICONES.poubelle, 18))),
  ]));

  return h('div.tableau-cadre', {}, h('table.tableau', {},
    h('caption.visuellement-cache', { text: `${module.titre} — ${lignes.length} ${module.pluriel}` }),
    h('thead', {}, enTete),
    h('tbody', {}, corps)));
}

/* ----------------------------------------------------------------- Export */

function menuExport(module, lignes, reglages) {
  const table = tableModule(module, lignes, reglages);
  const nom = `five-league-${module.id}`;
  const csv = versCSV(table.entetes, table.lignes);
  modale({
    titre: `Exporter — ${module.titre}`,
    corps: h('div.pile', {},
      h('p.texte-doux', { text: `${lignes.length} ${module.pluriel} sur la sélection en cours, ${table.entetes.length} colonnes.` }),
      h('div.choix-export', {},
        bouton('Classeur Excel (.xlsx)', { variante: 'primaire', icone: TRACE_ICONES.exporter, onclick: () => telecharger(nomHorodate(nom, 'xlsx'), versXLSX([table])) }),
        bouton('Tableur CSV (.csv)', { icone: TRACE_ICONES.exporter, onclick: () => telecharger(nomHorodate(nom, 'csv'), csv, 'text/csv;charset=utf-8') }),
        bouton('Imprimer ou enregistrer en PDF', { icone: TRACE_ICONES.imprimer, onclick: () => window.print() }),
        bouton('Copier au format CSV', { onclick: async () => toast(await copier(csv) ? 'Données copiées dans le presse-papiers.' : 'Copie impossible sur ce navigateur.', 'neutre') })),
      h('p.texte-doux.petit', { text: 'Le CSV est encodé en UTF-8 avec séparateur point-virgule : Excel et LibreOffice l’ouvrent sans réglage.' })),
    actions: [{ libelle: 'Fermer' }],
  });
}

function ouvrirImport(module) {
  const zone = h('textarea.saisie.saisie--code', { rows: 6, placeholder: `${module.champs.slice(0, 3).map((c) => c.libelle).join(';')}\n…` });
  const fichier = champFichier('Choisir un fichier CSV', '.csv,text/csv,text/plain', async (f) => { zone.value = await f.text(); apercu(); });
  const resume = h('p.texte-doux', { text: 'Les colonnes sont reconnues par leur intitulé, dans n’importe quel ordre.' });
  let aInserer = [];
  const apercu = () => {
    const lignes = depuisCSV(zone.value);
    if (lignes.length < 2) { aInserer = []; resume.textContent = 'Collez un fichier CSV avec une ligne d’entêtes puis les données.'; return; }
    const colonnes = correspondance(module, lignes[0]);
    const reconnues = colonnes.filter(Boolean).length;
    aInserer = lignes.slice(1).map((l) => ligneImportee(module, colonnes, l)).filter((l) => l[module.champCle]);
    resume.textContent = `${reconnues} colonnes reconnues sur ${lignes[0].length}, ${aInserer.length} lignes prêtes à être ajoutées à la saison ${saisonActive()}.`;
  };
  zone.addEventListener('input', apercu);
  modale({
    titre: `Importer des ${module.pluriel}`,
    large: true,
    corps: h('div.pile', {},
      h('p.texte-doux', { text: 'Exportez d’abord un fichier depuis ce module pour connaître les colonnes attendues : le format d’export est aussi le format d’import.' }),
      fichier, zone, resume),
    actions: [
      { libelle: 'Annuler' },
      { libelle: 'Importer', variante: 'primaire', action: (fermer) => {
        if (!aInserer.length) { toast('Aucune ligne exploitable dans ce fichier.', 'erreur'); return; }
        ajouterLignes(module.id, aInserer);
        fermer();
        toast(`${aInserer.length} lignes importées.`);
      } },
    ],
  });
}

/* -------------------------------------------------------------------- Vue */

let cadreCourant = null;
let moduleCourant = null;

export function rafraichir(moduleId) {
  if (!cadreCourant || moduleCourant !== moduleId) return;
  remplacer(cadreCourant, contenu(MODULE_PAR_ID[moduleId]));
}

function contenu(module) {
  const etat = etatDe(module.id);
  const reglages = reglagesActifs();
  const toutes = lignes(module.id, { toutesSaisons: etat.toutesSaisons });
  const etatsPossibles = [...new Set(toutes.map((l) => module.etat && module.etat(l)).filter(Boolean))];
  const filtrees = toutes.filter((l) => {
    if (etat.filtre && module.etat(l) !== etat.filtre) return false;
    if (!etat.recherche) return true;
    return CHAMPS_TOUS(module).some((c) => contient(c.calcul ? c.calcul(l, reglages) : l[c.id], etat.recherche));
  });

  const recherche = h('input.saisie.saisie--recherche', {
    type: 'search', value: etat.recherche, placeholder: `Rechercher parmi ${toutes.length} ${module.pluriel}…`, 'aria-label': 'Rechercher',
    oninput: (e) => { etat.recherche = e.target.value; rafraichir(module.id); },
  });

  const groupes = module.groupe ? (() => {
    const paniers = new Map();
    for (const l of filtrees) {
      const cle = l[module.groupe.champ] || '—';
      paniers.set(cle, (paniers.get(cle) || 0) + module.groupe.mesure(l, reglages));
    }
    return [...paniers.entries()].map(([libelle, valeur]) => ({ libelle, valeur })).sort((a, b) => b.valeur - a.valeur);
  })() : [];

  return h('div.page', {},
    h('header.page-tete', { style: { '--accent-module': module.couleur } },
      h('div.page-tete-haut', {},
        h('a.lien-retour', { href: '#/', 'aria-label': 'Retour au tableau de bord' }, icone(TRACE_ICONES.retour, 18), h('span', { text: 'Tableau de bord' })),
        h('span.puce-module', {}, icone(module.icone, 18), h('span', { text: module.court }))),
      h('h1.page-titre', { text: module.titre }),
      h('p.page-resume', { text: module.resume })),

    h('div.kpis', {}, module.kpis(lignes(module.id), { reglages, saison: saisonActive() }).map((k) => carteKPI({ ...k, couleur: module.couleur }))),

    h('div.barre-outils', {},
      h('div.barre-outils-gauche', {}, recherche,
        etatsPossibles.length > 1 ? h('select.saisie.saisie--filtre', { 'aria-label': 'Filtrer par état', onchange: (e) => { etat.filtre = e.target.value; rafraichir(module.id); } },
          h('option', { value: '', text: 'Tous les états', selected: !etat.filtre }),
          etatsPossibles.map((s) => h('option', { value: s, text: s, selected: etat.filtre === s }))) : null,
        h('label.bascule', {},
          h('input', { type: 'checkbox', checked: etat.toutesSaisons, onchange: (e) => { etat.toutesSaisons = e.target.checked; rafraichir(module.id); } }),
          h('span', { text: 'Toutes saisons' }))),
      h('div.barre-outils-droite', {},
        bouton('Importer', { icone: TRACE_ICONES.importer, onclick: () => ouvrirImport(module) }),
        bouton('Exporter', { icone: TRACE_ICONES.exporter, onclick: () => menuExport(module, filtrees, reglages) }),
        bouton('Ajouter', { variante: 'primaire', icone: TRACE_ICONES.plus, onclick: () => ouvrirFormulaire(module) }))),

    filtrees.length
      ? h('div.colonnes-module', {},
        carte({ titre: `${nombre(filtrees.length)} ${filtrees.length > 1 ? module.pluriel : module.singulier}`, sousTitre: etat.toutesSaisons ? 'toutes saisons confondues' : `saison ${saisonActive()}`, contenu: tableau(module, filtrees, etat, reglages), classe: 'carte--tableau' }),
        module.groupe && groupes.length ? carte({ titre: module.groupe.titre, contenu: barresHorizontales(groupes, { couleur: module.couleur, format: module.groupe.format }), classe: 'carte--cote' }) : null)
      : carte({ contenu: etatVide({
        titre: toutes.length ? 'Aucun résultat pour cette recherche' : `Aucune donnée pour la saison ${saisonActive()}`,
        detail: toutes.length ? 'Modifiez la recherche ou le filtre d’état.' : `Ajoutez ${module.pluriel} une à une, ou importez un fichier CSV existant.`,
        action: toutes.length ? null : bouton(`Ajouter ${module.singulier}`, { variante: 'primaire', icone: TRACE_ICONES.plus, onclick: () => ouvrirFormulaire(module) }),
      }) }));
}

export function vueModule(moduleId) {
  const module = MODULE_PAR_ID[moduleId];
  moduleCourant = moduleId;
  cadreCourant = h('div.cadre-module');
  remplacer(cadreCourant, contenu(module));
  return cadreCourant;
}

export function quitterModule() {
  cadreCourant = null;
  moduleCourant = null;
}
