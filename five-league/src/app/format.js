/**
 * Formatage. Tout l'affichage chiffré passe par ici : une seule règle par
 * type de valeur, appliquée partout, évite les tableaux où deux colonnes
 * écrivent les euros différemment.
 */

const FMT_EUROS = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const FMT_EUROS_CENT = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
const FMT_NOMBRE = new Intl.NumberFormat('fr-FR');

/** Les montants d'un tableau de bord se lisent à l'euro près, pas au centime. */
export const euros = (n, precis = false) => (precis ? FMT_EUROS_CENT : FMT_EUROS).format(Number(n) || 0);

/** Version compacte pour les pastilles du hub, où la place manque. */
export function eurosCourt(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 10000) return `${FMT_NOMBRE.format(Math.round(v / 1000))} k€`;
  return FMT_EUROS.format(v);
}

export const nombre = (n) => FMT_NOMBRE.format(Number(n) || 0);

export function pourcent(part, total, decimales = 0) {
  if (!total) return '0 %';
  return `${((part / total) * 100).toFixed(decimales).replace('.', ',')} %`;
}

export const heures = (n) => `${FMT_NOMBRE.format(Math.round(Number(n) || 0))} h`;

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const MOIS_LONG = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

/** Les dates sont stockées en ISO (`2026-03-08`) : comparables comme du texte. */
export function dateCourte(iso) {
  if (!iso) return '—';
  const [a, m, j] = String(iso).split('-');
  if (!j) return iso;
  return `${Number(j)} ${MOIS[Number(m) - 1]} ${a}`;
}

export function moisEtiquette(cle) {
  const [a, m] = cle.split('-');
  return `${MOIS[Number(m) - 1]} ${String(a).slice(2)}`;
}

export const moisDe = (iso) => (iso ? String(iso).slice(0, 7) : '');
export const aujourdhui = () => new Date().toISOString().slice(0, 10);

/** Nombre de jours d'ici la date donnée : négatif si elle est passée. */
export const joursRestants = (iso) =>
  Math.round((Date.parse(`${iso}T00:00:00`) - Date.parse(`${aujourdhui()}T00:00:00`)) / 86400000);

export function delaiHumain(iso) {
  const j = joursRestants(iso);
  if (j === 0) return "aujourd'hui";
  if (j === 1) return 'demain';
  if (j > 0) return `dans ${j} j`;
  return `il y a ${-j} j`;
}

let compteur = 0;
export const identifiant = (prefixe = 'r') => `${prefixe}-${Date.now().toString(36)}-${(compteur++).toString(36)}`;

/** Comparaison insensible à la casse et aux accents, pour le tri et la recherche. */
const plie = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const normalise = plie;
export const contient = (valeur, requete) => plie(valeur).includes(plie(requete));

const TYPES_CHIFFRES = ['montant', 'nombre', 'heures'];

export function comparer(a, b, type) {
  if (TYPES_CHIFFRES.includes(type)) return (Number(a) || 0) - (Number(b) || 0);
  return plie(a).localeCompare(plie(b), 'fr');
}

/** Bornes d'une saison sportive : du 1er septembre au 31 août. */
export function bornesSaison(saison) {
  const [debut] = String(saison).split('-');
  const a = Number(debut);
  return { debut: `${a}-09-01`, fin: `${a + 1}-08-31` };
}

/** Saison en cours à la date du jour. */
export function saisonDuJour(date = new Date()) {
  const a = date.getFullYear();
  return date.getMonth() >= 8 ? `${a}-${a + 1}` : `${a - 1}-${a}`;
}

export const dansSaison = (iso, saison) => {
  if (!iso) return false;
  const { debut, fin } = bornesSaison(saison);
  return iso >= debut && iso <= fin;
};
