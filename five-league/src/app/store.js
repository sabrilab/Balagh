/**
 * Persistance. Toute la base tient dans une clé de `localStorage` : une
 * association de cette taille manipule quelques milliers de lignes, très
 * en deçà des 5 Mo du quota, et le prix à payer — aucun serveur, aucun
 * compte, fonctionne hors ligne — est le bon à ce stade.
 *
 * Si le stockage est indisponible (navigation privée, page ouverte depuis
 * un fichier local sur certains navigateurs), l'application continue de
 * fonctionner en mémoire et le dit franchement plutôt que de laisser
 * croire que les saisies sont conservées.
 */

import { saisonDuJour, identifiant, aujourdhui } from './format.js';
import { MODULES, REGLAGES_DEFAUT, SAISONS } from './schema.js';
import { baseDemo } from './demo.js';

const CLE = 'five-league.base.v1';
const CLE_THEME = 'five-league.theme';

let etatBase = null;
let stockageActif = true;
const abonnes = new Set();

const baseVide = () => ({
  version: 1,
  saison: saisonDuJour(),
  reglages: { ...REGLAGES_DEFAUT },
  demo: false,
  donnees: Object.fromEntries(MODULES.map((m) => [m.id, []])),
});

/** Complète une base lue sur disque : une version antérieure peut ignorer un
 *  module ou un réglage ajouté depuis. */
function normaliser(brute) {
  const propre = baseVide();
  if (!brute || typeof brute !== 'object') return propre;
  propre.reglages = { ...REGLAGES_DEFAUT, ...(brute.reglages || {}) };
  propre.demo = Boolean(brute.demo);
  for (const m of MODULES) {
    const lignes = Array.isArray(brute.donnees?.[m.id]) ? brute.donnees[m.id] : [];
    propre.donnees[m.id] = lignes.filter((l) => l && typeof l === 'object').map((l) => ({ ...l, id: l.id || identifiant(m.id.slice(0, 3)) }));
  }
  propre.saison = brute.saison && saisonsConnues(propre).includes(brute.saison) ? brute.saison : saisonParDefaut(propre);
  return propre;
}

function saisonsConnues(source = etatBase) {
  const vues = new Set(SAISONS);
  for (const m of MODULES) for (const l of source.donnees[m.id]) if (l.saison) vues.add(l.saison);
  return [...vues].sort();
}

/** La saison ouverte par défaut est celle du jour si elle contient des
 *  données, sinon la plus récente qui en contient. */
function saisonParDefaut(source = etatBase) {
  const courante = saisonDuJour();
  const peuplees = new Set();
  for (const m of MODULES) for (const l of source.donnees[m.id]) if (l.saison) peuplees.add(l.saison);
  if (peuplees.has(courante) || !peuplees.size) return courante;
  return [...peuplees].sort().pop();
}

export function demarrerBase() {
  let brute = null;
  try {
    const texte = localStorage.getItem(CLE);
    brute = texte ? JSON.parse(texte) : null;
  } catch (e) {
    stockageActif = false;
  }
  if (!brute) {
    etatBase = normaliser(baseDemo(aujourdhui()));
    etatBase.saison = saisonParDefaut();
    ecrire();
  } else {
    etatBase = normaliser(brute);
  }
  return etatBase;
}

function ecrire() {
  if (!stockageActif) return false;
  try {
    localStorage.setItem(CLE, JSON.stringify(etatBase));
    return true;
  } catch (e) {
    stockageActif = false;
    return false;
  }
}

export const stockageDisponible = () => stockageActif;
export const laBase = () => etatBase;
export const reglagesActifs = () => etatBase.reglages;
export const estDemo = () => etatBase.demo;
export const saisons = () => saisonsConnues();
export const saisonActive = () => etatBase.saison;

export function abonner(fonction) {
  abonnes.add(fonction);
  return () => abonnes.delete(fonction);
}

function publier() {
  ecrire();
  for (const f of abonnes) f(etatBase);
}

/** Lignes d'un module, filtrées sur la saison ouverte sauf demande contraire. */
export function lignes(moduleId, { toutesSaisons = false, saison: choisie } = {}) {
  const brutes = etatBase.donnees[moduleId] || [];
  if (toutesSaisons) return brutes.slice();
  const cible = choisie || etatBase.saison;
  return brutes.filter((l) => (l.saison || etatBase.saison) === cible);
}

export function ligneParId(moduleId, id) {
  return (etatBase.donnees[moduleId] || []).find((l) => l.id === id) || null;
}

export function ajouterLigne(moduleId, valeurs) {
  const nouvelle = { id: identifiant(moduleId.slice(0, 3)), saison: etatBase.saison, ...valeurs, creeLe: aujourdhui(), majLe: aujourdhui() };
  etatBase.donnees[moduleId].push(nouvelle);
  etatBase.demo = false;
  publier();
  return nouvelle;
}

export function modifierLigne(moduleId, id, valeurs) {
  const cible = ligneParId(moduleId, id);
  if (!cible) return null;
  Object.assign(cible, valeurs, { majLe: aujourdhui() });
  publier();
  return cible;
}

export function supprimerLigne(moduleId, id) {
  const avant = etatBase.donnees[moduleId].length;
  etatBase.donnees[moduleId] = etatBase.donnees[moduleId].filter((l) => l.id !== id);
  if (etatBase.donnees[moduleId].length !== avant) publier();
  return avant - etatBase.donnees[moduleId].length;
}

export function ajouterLignes(moduleId, listeValeurs) {
  for (const valeurs of listeValeurs) {
    etatBase.donnees[moduleId].push({ id: identifiant(moduleId.slice(0, 3)), saison: etatBase.saison, ...valeurs, creeLe: aujourdhui(), majLe: aujourdhui() });
  }
  etatBase.demo = false;
  publier();
  return listeValeurs.length;
}

export function definirSaison(valeur) {
  etatBase.saison = valeur;
  publier();
}

export function majReglages(patch) {
  Object.assign(etatBase.reglages, patch);
  publier();
}

export function reinitialiser({ demo = false } = {}) {
  etatBase = demo ? normaliser(baseDemo(aujourdhui())) : baseVide();
  etatBase.saison = saisonParDefaut();
  publier();
}

/** Restauration d'une sauvegarde. Refuse un fichier qui n'a pas la forme
 *  attendue plutôt que d'écraser la base par du vide. */
export function restaurer(texte) {
  const brute = JSON.parse(texte);
  if (!brute || typeof brute !== 'object' || !brute.donnees || typeof brute.donnees !== 'object') {
    throw new Error('Ce fichier n’est pas une sauvegarde Five League.');
  }
  const connus = MODULES.filter((m) => Array.isArray(brute.donnees[m.id]));
  if (!connus.length) throw new Error('Aucun module reconnu dans cette sauvegarde.');
  etatBase = normaliser(brute);
  publier();
  return connus.length;
}

export const exporterBase = () => JSON.stringify({ ...etatBase, exporteLe: new Date().toISOString() }, null, 2);

/* -------------------------------------------------------------- Apparence */

export function themeEnregistre() {
  try { return localStorage.getItem(CLE_THEME) || 'auto'; } catch (e) { return 'auto'; }
}

export function definirTheme(valeur) {
  try { localStorage.setItem(CLE_THEME, valeur); } catch (e) { /* sans stockage, le choix vaut pour la session */ }
  appliquerTheme(valeur);
}

export function appliquerTheme(valeur) {
  const racine = document.documentElement;
  if (valeur === 'auto') racine.removeAttribute('data-theme');
  else racine.setAttribute('data-theme', valeur);
}
