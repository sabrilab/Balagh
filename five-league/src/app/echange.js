/**
 * Imports et exports.
 *
 * Le CSV est écrit au format que les tableurs français attendent : point-
 * virgule en séparateur, BOM en tête, retours CRLF — sans quoi Excel colle
 * toute la ligne dans la première colonne et casse les accents.
 *
 * Le XLSX est produit ici, sans bibliothèque : un classeur est une archive
 * ZIP de quelques fichiers XML. L'archive est écrite en mode « stocké »
 * (aucune compression), ce qui évite d'embarquer un compresseur pour des
 * fichiers qui pèsent quelques dizaines de kilo-octets.
 */

import { toast } from './dom.js';
import { CHAMPS_TOUS, champParId } from './schema.js';

/* ------------------------------------------------------------------- CSV */

const echapper = (valeur) => {
  const texte = valeur === null || valeur === undefined ? '' : String(valeur);
  return /[";\n\r]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte;
};

export function versCSV(entetes, lignes) {
  const corps = [entetes, ...lignes].map((ligne) => ligne.map(echapper).join(';')).join('\r\n');
  return `\ufeff${corps}\r\n`;
}

/** Analyse un CSV en tolérant les deux séparateurs courants et les guillemets. */
export function depuisCSV(texte) {
  const propre = texte.replace(/^\ufeff/, '');
  const premiereLigne = propre.split(/\r?\n/)[0] || '';
  const separateur = premiereLigne.split(';').length >= premiereLigne.split(',').length ? ';' : ',';
  const lignes = [];
  let champ = '';
  let ligne = [];
  let entreGuillemets = false;
  for (let i = 0; i < propre.length; i++) {
    const c = propre[i];
    if (entreGuillemets) {
      if (c === '"' && propre[i + 1] === '"') { champ += '"'; i++; }
      else if (c === '"') entreGuillemets = false;
      else champ += c;
      continue;
    }
    if (c === '"') entreGuillemets = true;
    else if (c === separateur) { ligne.push(champ); champ = ''; }
    else if (c === '\n') { ligne.push(champ); lignes.push(ligne); ligne = []; champ = ''; }
    else if (c !== '\r') champ += c;
  }
  if (champ || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  return lignes.filter((l) => l.some((v) => v.trim() !== ''));
}

/* ------------------------------------------------------------------- ZIP */

const TABLE_CRC = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(octets) {
  let c = 0xffffffff;
  for (let i = 0; i < octets.length; i++) c = TABLE_CRC[(c ^ octets[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Archive ZIP sans compression : en-tête local, données, annuaire central. */
function archiveZip(fichiers) {
  const encodeur = new TextEncoder();
  const maintenant = new Date();
  const heureDos = (maintenant.getHours() << 11) | (maintenant.getMinutes() << 5) | (maintenant.getSeconds() >> 1);
  const dateDos = ((maintenant.getFullYear() - 1980) << 9) | ((maintenant.getMonth() + 1) << 5) | maintenant.getDate();
  const entrees = fichiers.map((f) => ({ nom: encodeur.encode(f.nom), donnees: encodeur.encode(f.contenu) }));
  const tailleTotale = entrees.reduce((t, e) => t + 30 + e.nom.length + e.donnees.length + 46 + e.nom.length, 0) + 22;
  const tampon = new Uint8Array(tailleTotale);
  const vue = new DataView(tampon.buffer);
  let position = 0;
  const ecrire32 = (v) => { vue.setUint32(position, v, true); position += 4; };
  const ecrire16 = (v) => { vue.setUint16(position, v, true); position += 2; };
  const ecrireOctets = (o) => { tampon.set(o, position); position += o.length; };

  for (const e of entrees) {
    e.decalage = position;
    e.crc = crc32(e.donnees);
    ecrire32(0x04034b50); ecrire16(20); ecrire16(0x0800); ecrire16(0);
    ecrire16(heureDos); ecrire16(dateDos);
    ecrire32(e.crc); ecrire32(e.donnees.length); ecrire32(e.donnees.length);
    ecrire16(e.nom.length); ecrire16(0);
    ecrireOctets(e.nom); ecrireOctets(e.donnees);
  }
  const debutAnnuaire = position;
  for (const e of entrees) {
    ecrire32(0x02014b50); ecrire16(20); ecrire16(20); ecrire16(0x0800); ecrire16(0);
    ecrire16(heureDos); ecrire16(dateDos);
    ecrire32(e.crc); ecrire32(e.donnees.length); ecrire32(e.donnees.length);
    ecrire16(e.nom.length); ecrire16(0); ecrire16(0); ecrire16(0); ecrire16(0);
    ecrire32(0); ecrire32(e.decalage);
    ecrireOctets(e.nom);
  }
  const tailleAnnuaire = position - debutAnnuaire;
  ecrire32(0x06054b50); ecrire16(0); ecrire16(0);
  ecrire16(entrees.length); ecrire16(entrees.length);
  ecrire32(tailleAnnuaire); ecrire32(debutAnnuaire); ecrire16(0);
  return new Blob([tampon.subarray(0, position)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/* ------------------------------------------------------------------ XLSX */

const ENTITES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const xmlSafe = (v) => String(v === null || v === undefined ? '' : v)
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  .replace(/[&<>"]/g, (c) => ENTITES[c]);

function colonne(index) {
  let nom = '';
  let n = index;
  do { nom = String.fromCharCode(65 + (n % 26)) + nom; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return nom;
}

const nomFeuille = (nom) => (nom || 'Feuille').replace(/[\\/*?:[\]]/g, ' ').slice(0, 31);

function feuilleXML(entetes, lignes) {
  const rangee = (cellules, numero) => `<row r="${numero}">${cellules.map((valeur, i) => {
    const ref = `${colonne(i)}${numero}`;
    if (typeof valeur === 'number' && Number.isFinite(valeur)) return `<c r="${ref}"><v>${valeur}</v></c>`;
    const texte = xmlSafe(valeur);
    return texte === '' ? `<c r="${ref}"/>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${texte}</t></is></c>`;
  }).join('')}</row>`;
  const corps = [rangee(entetes, 1), ...lignes.map((l, i) => rangee(l, i + 2))].join('');
  const largeurs = entetes.map((e, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(38, Math.max(12, String(e).length + 4))}" customWidth="1"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${largeurs}</cols><sheetData>${corps}</sheetData></worksheet>`;
}

/** Classeur multi-feuilles. `feuilles` : [{ nom, entetes, lignes }]. */
export function versXLSX(feuilles) {
  const utiles = feuilles.filter((f) => f.entetes && f.entetes.length);
  const types = ['<Default Extension="xml" ContentType="application/xml"/>',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    ...utiles.map((f, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)].join('');
  const fichiers = [
    { nom: '[Content_Types].xml', contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${types}</Types>` },
    { nom: '_rels/.rels', contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { nom: 'xl/workbook.xml', contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${utiles.map((f, i) => `<sheet name="${xmlSafe(nomFeuille(f.nom))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { nom: 'xl/_rels/workbook.xml.rels', contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${utiles.map((f, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>` },
    ...utiles.map((f, i) => ({ nom: `xl/worksheets/sheet${i + 1}.xml`, contenu: feuilleXML(f.entetes, f.lignes) })),
  ];
  return archiveZip(fichiers);
}

/* ---------------------------------------------------- Tables d'un module */

/** Entêtes et lignes d'un module, prêtes pour le CSV comme pour le XLSX. */
export function tableModule(module, lignes, reglages) {
  const champs = CHAMPS_TOUS(module);
  const entetes = champs.map((c) => c.libelle);
  const corps = lignes.map((l) => champs.map((c) => {
    const valeur = c.calcul ? c.calcul(l, reglages) : l[c.id];
    if (['montant', 'nombre', 'heures'].includes(c.type)) return Number(valeur) || 0;
    return valeur === null || valeur === undefined ? '' : valeur;
  }));
  return { nom: module.titre, entetes, lignes: corps, champs };
}

/* -------------------------------------------------------------- Livraison */

export function telecharger(nomFichier, contenu, type = 'text/plain;charset=utf-8') {
  const blob = contenu instanceof Blob ? contenu : new Blob([contenu], { type });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomFichier;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Certains hôtes affichent la page dans un cadre où un lien de
 * téléchargement reste inerte, et proposent à la place une passerelle
 * d'enregistrement. On la demande une fois ; absente, on retombe sur le
 * téléchargement ordinaire.
 */
let passerelle;
async function passerelleHote() {
  if (passerelle !== undefined) return passerelle;
  passerelle = null;
  try {
    if (window.claude && typeof window.claude.use === 'function') passerelle = await window.claude.use('downloads');
  } catch (e) {
    passerelle = null;
  }
  return passerelle;
}

const RAISONS = {
  declined: 'Enregistrement annulé.',
  rejected_extension: 'Ce format n’est pas accepté ici : passez par le CSV, ou copiez les données.',
  extension_not_enabled: 'Ce format n’est pas accepté ici : passez par la sauvegarde JSON, ou copiez les données.',
  too_large: 'Fichier trop volumineux pour être enregistré depuis cette page.',
  rate_limited: 'Un enregistrement est déjà en cours : réessayez dans un instant.',
};

/** Livre un fichier par le meilleur chemin disponible, et dit ce qui s'est
 *  passé — un export silencieux qui échoue est pire que pas d'export. */
export async function livrerFichier(nomFichier, contenu, type = 'text/plain;charset=utf-8') {
  const hote = await passerelleHote();
  if (!hote) {
    telecharger(nomFichier, contenu, type);
    toast(`${nomFichier} téléchargé.`);
    return { statut: 'lance' };
  }
  try {
    await hote.save({ filename: nomFichier, data: contenu instanceof Blob ? contenu : String(contenu) });
    toast(`${nomFichier} enregistré.`);
    return { statut: 'enregistre' };
  } catch (e) {
    const code = (e && e.code) || 'unavailable';
    toast(RAISONS[code] || 'Enregistrement impossible ici : copiez les données à la place.', code === 'declined' ? 'neutre' : 'erreur');
    return { statut: 'refuse', code };
  }
}

export async function copier(texte) {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch (e) {
    return false;
  }
}

export const nomHorodate = (base, extension) => `${base}-${new Date().toISOString().slice(0, 10)}.${extension}`;

/* ------------------------------------------------------------ Import CSV */

const plier = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Rapproche les entêtes d'un fichier importé des champs du module. */
export function correspondance(module, entetes) {
  return entetes.map((entete) => {
    const cible = plier(entete);
    const trouve = module.champs.find((c) => plier(c.libelle) === cible) || module.champs.find((c) => plier(c.id) === cible);
    return trouve ? trouve.id : null;
  });
}

/** Convertit une ligne de fichier en enregistrement, selon la correspondance. */
export function ligneImportee(module, colonnes, valeurs) {
  const ligne = {};
  colonnes.forEach((champId, i) => {
    if (!champId) return;
    const champ = champParId(module, champId);
    const brut = String(valeurs[i] === undefined ? '' : valeurs[i]).trim();
    if (!champ || brut === '') return;
    if (['montant', 'nombre', 'heures'].includes(champ.type)) {
      const n = Number(brut.replace(/[\s\u20ac]/g, '').replace(',', '.'));
      ligne[champId] = Number.isFinite(n) ? n : 0;
    } else if (champ.type === 'date') {
      const fr = brut.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
      ligne[champId] = fr ? `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}` : brut;
    } else {
      ligne[champId] = brut;
    }
  });
  return ligne;
}
