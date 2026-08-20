/**
 * Banc de fumée : charge le fichier construit dans Chromium et vérifie que
 * l'outil fait ce qu'il promet — navigation, saisie, persistance, exports.
 *
 * Les vérifications passent par l'interface réelle (clics, formulaires) et
 * non par les fonctions internes : c'est ce chemin-là que suit une
 * gestionnaire d'association.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL_ = process.env.CIBLE || `file://${join(RACINE, 'dist', 'five-league.html')}`;

const reussites = [];
const echecs = [];
const t = (nom, condition, detail) => (condition ? reussites : echecs).push(nom + (detail ? ` — ${detail}` : ''));

const navigateur = await chromium.launch();
const contexte = await navigateur.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await contexte.newPage();
const erreurs = [];
page.on('console', (m) => { if (m.type() === 'error') erreurs.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => erreurs.push(`pageerror: ${e.message}`));

const aller = async (fragment = '') => {
  await page.goto(URL_ + fragment, { waitUntil: 'load' });
  await page.waitForFunction(() => window.FiveLeague, null, { timeout: 15000 });
  await page.waitForTimeout(180);
};

await aller();

/* ------------------------------------------------------------- Démarrage */

t('la page se charge sans erreur', erreurs.length === 0, erreurs.join(' | '));
t('le stockage local est disponible', await page.evaluate(() => window.FiveLeague.stockageDisponible()));
t('la base de démonstration est chargée', await page.evaluate(() => window.FiveLeague.estDemo()));

const modules = await page.evaluate(() => window.FiveLeague.MODULES.map((m) => ({ id: m.id, route: m.route, titre: m.titre, colonnes: m.colonnes.length })));
t('huit domaines sont décrits', modules.length === 8, `${modules.length} modules`);

const bilan = await page.evaluate(() => {
  const s = window.FiveLeague.synthese();
  return { saison: s.saison, produits: s.produits, charges: s.charges, valorisation: s.valorisation, sources: s.sources.length, parModule: s.parModule.length };
});
t('la synthèse couvre les huit domaines', bilan.parModule === 8);
t('les produits de la saison sont cohérents', bilan.produits > 20000 && bilan.produits < 200000, `${Math.round(bilan.produits)} €`);
t('le bénévolat est valorisé', bilan.valorisation > 0, `${Math.round(bilan.valorisation)} €`);

/* ------------------------------------------------------------------- Hub */

t('le hub affiche huit portes d’entrée', await page.locator('.hub-noeud').count() === 8);
t('le médaillon central annonce les produits', (await page.locator('.hub-centre-valeur').textContent()).includes('€'));
t('les indicateurs d’ensemble sont présents', await page.locator('.kpi').count() === 5);
t('la répartition des produits est dessinée', await page.locator('.graphe-anneau .anneau-part').count() >= 5);
t('l’histogramme mensuel est dessiné', await page.locator('.graphe-barres .barre').count() > 10);
t('les points d’attention remontent', await page.locator('.alerte').count() > 0);
t('la structure des charges est dessinée', await page.locator('.graphe-anneau').count() === 2);
const charges = await page.evaluate(() => {
  const s = window.FiveLeague.synthese();
  const postes = window.FiveLeague.repartitionCharges();
  return { charges: s.charges, resultat: s.resultat, postes: postes.length, sommePostes: postes.reduce((t, p) => t + p.valeur, 0) };
});
t('les charges de la saison sont chiffrées', charges.charges > 0, `${Math.round(charges.charges)} €`);
t('la répartition des charges couvre le total', Math.abs(charges.sommePostes - charges.charges) < 1, `${Math.round(charges.sommePostes)} vs ${Math.round(charges.charges)}`);
t('le résultat est la différence produits – charges', Math.abs((bilan.produits - charges.charges) - charges.resultat) < 1);

const lienAvantClic = await page.locator('.hub-noeud').first().getAttribute('href');
await page.locator('.hub-noeud').first().click();
await page.waitForTimeout(220);
t('un clic sur le hub ouvre le domaine', page.url().includes(lienAvantClic.replace('#', '')), page.url());

/* --------------------------------------------------------- Chaque domaine */

for (const module of modules) {
  await aller(`#/module/${module.route}`);
  const titre = await page.locator('.page-titre').textContent();
  const lignes = await page.locator('.tableau tbody tr').count();
  const kpis = await page.locator('.kpi').count();
  t(`${module.id} : la page s’ouvre`, titre.trim() === module.titre, titre);
  t(`${module.id} : les indicateurs sont calculés`, kpis === 4, `${kpis} indicateurs`);
  t(`${module.id} : des lignes de démonstration existent`, lignes > 0, `${lignes} lignes`);
  const colonnes = await page.locator('.tableau thead th').count();
  t(`${module.id} : toutes les colonnes sont rendues`, colonnes === module.colonnes + 1, `${colonnes} colonnes`);
}

/* ------------------------------------------------- Création, édition, tri */

await aller('#/module/partenariats');
const avantAjout = await page.locator('.tableau tbody tr').count();
await page.getByRole('button', { name: 'Ajouter' }).click();
await page.waitForSelector('.modale');
await page.fill('#champ-entreprise', 'Boulangerie Saint-Éloi');
await page.fill('#champ-montant', '1250');
await page.selectOption('#champ-statut', 'Actif');
await page.getByRole('button', { name: 'Enregistrer' }).click();
await page.waitForTimeout(260);
const apresAjout = await page.locator('.tableau tbody tr').count();
t('un partenaire s’ajoute par le formulaire', apresAjout === avantAjout + 1, `${avantAjout} → ${apresAjout}`);
t('la ligne ajoutée est visible dans le tableau', await page.locator('.tableau tbody').getByText('Boulangerie Saint-Éloi').count() === 1);
t('le bandeau de démonstration disparaît après une saisie', !(await page.evaluate(() => window.FiveLeague.estDemo())));

// Champ obligatoire : le formulaire refuse et ne crée rien.
await page.getByRole('button', { name: 'Ajouter' }).click();
await page.waitForSelector('.modale');
await page.fill('#champ-montant', '400');
await page.getByRole('button', { name: 'Enregistrer' }).click();
await page.waitForTimeout(200);
t('un champ obligatoire vide bloque l’enregistrement', await page.locator('.modale').count() === 1);
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
t('la touche Échap ferme la fenêtre', await page.locator('.modale').count() === 0);

// Édition de la ligne créée.
const ligneCreee = page.locator('.tableau tbody tr', { hasText: 'Boulangerie Saint-Éloi' });
await ligneCreee.getByRole('button', { name: /Modifier/ }).click();
await page.waitForSelector('.modale');
await page.fill('#champ-encaisse', '600');
await page.getByRole('button', { name: 'Enregistrer' }).click();
await page.waitForTimeout(240);
t('la modification est enregistrée', (await page.locator('.tableau tbody tr', { hasText: 'Boulangerie Saint-Éloi' }).textContent()).includes('600'));

// Tri sur une colonne de montants.
await page.locator('.tableau thead .tri').nth(2).click();
await page.waitForTimeout(180);
const montants = await page.evaluate(() => [...document.querySelectorAll('.tableau tbody tr')].map((r) => Number(r.children[2].textContent.replace(/[^0-9]/g, ''))));
t('le tri par montant est croissant', montants.every((v, i) => i === 0 || montants[i - 1] <= v), montants.slice(0, 4).join(' / '));

// Recherche.
await page.fill('.saisie--recherche', 'Saint-Éloi');
await page.waitForTimeout(180);
t('la recherche filtre le tableau', await page.locator('.tableau tbody tr').count() === 1);
await page.fill('.saisie--recherche', '');
await page.waitForTimeout(150);

/* ----------------------------------------------------------- Persistance */

await aller('#/module/partenariats');
t('la saisie survit au rechargement', await page.locator('.tableau tbody').getByText('Boulangerie Saint-Éloi').count() === 1);

const compteAvantSuppression = await page.locator('.tableau tbody tr').count();
await page.locator('.tableau tbody tr', { hasText: 'Boulangerie Saint-Éloi' }).getByRole('button', { name: /Supprimer/ }).click();
await page.waitForSelector('.modale');
await page.getByRole('button', { name: 'Supprimer' }).last().click();
await page.waitForTimeout(240);
t('la suppression demande confirmation puis retire la ligne', await page.locator('.tableau tbody tr').count() === compteAvantSuppression - 1);

/* --------------------------------------------------------------- Saisons */

const saisons = await page.evaluate(() => window.FiveLeague.saisons());
t('plusieurs saisons sont disponibles', saisons.length >= 2, saisons.join(', '));
const parSaison = await page.evaluate((s) => {
  const avant = window.FiveLeague.lignes('cotisations').length;
  window.FiveLeague.definirSaison(s[0]);
  const apres = window.FiveLeague.lignes('cotisations').length;
  window.FiveLeague.definirSaison(s[s.length - 2] || s[0]);
  return { avant, apres };
}, saisons);
t('changer de saison change les données affichées', parSaison.avant !== parSaison.apres, `${parSaison.avant} puis ${parSaison.apres}`);

/* --------------------------------------------------------------- Exports */

const csv = await page.evaluate(() => {
  const m = window.FiveLeague.MODULES.find((x) => x.id === 'cotisations');
  const table = window.FiveLeague.tableModule(m, window.FiveLeague.lignes('cotisations'), window.FiveLeague.reglagesActifs());
  return window.FiveLeague.versCSV(table.entetes, table.lignes);
});
t('le CSV porte le BOM attendu par Excel', csv.charCodeAt(0) === 0xfeff);
t('le CSV sépare par point-virgule', csv.split('\r\n')[0].split(';').length > 8);
t('le CSV contient une ligne par adhésion', csv.trim().split('\r\n').length === (await page.evaluate(() => window.FiveLeague.lignes('cotisations').length)) + 1);

const octets = await page.evaluate(async () => {
  const feuilles = window.FiveLeague.MODULES.map((m) => window.FiveLeague.tableModule(m, window.FiveLeague.lignes(m.id, { toutesSaisons: true }), window.FiveLeague.reglagesActifs()));
  const blob = window.FiveLeague.versXLSX(feuilles);
  return [...new Uint8Array(await blob.arrayBuffer())];
});
const classeur = Buffer.from(octets);
t('le classeur est une archive ZIP', classeur.subarray(0, 4).toString('hex') === '504b0304');
const annuaire = classeur.lastIndexOf(Buffer.from('504b0506', 'hex'));
const nbEntrees = annuaire > 0 ? classeur.readUInt16LE(annuaire + 10) : 0;
t('le classeur contient une feuille par domaine', nbEntrees === 12, `${nbEntrees} fichiers dans l'archive`);
t('le classeur déclare les sept feuilles', classeur.includes('Ressources humaines') && classeur.includes('Partenariats privés'));

/* CRC de chaque entrée : une archive acceptée par Excel n'a pas le droit de
   mentir sur ses sommes de contrôle. */
const table = (() => { const t32 = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t32[i] = c >>> 0; } return t32; })();
const crc32 = (b) => { let c = 0xffffffff; for (const o of b) c = table[(c ^ o) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
let position = 0;
let entreesVerifiees = 0;
let crcJustes = 0;
while (classeur.readUInt32LE(position) === 0x04034b50) {
  const tailleNom = classeur.readUInt16LE(position + 26);
  const tailleExtra = classeur.readUInt16LE(position + 28);
  const taille = classeur.readUInt32LE(position + 18);
  const debut = position + 30 + tailleNom + tailleExtra;
  if (crc32(classeur.subarray(debut, debut + taille)) === classeur.readUInt32LE(position + 14)) crcJustes++;
  entreesVerifiees++;
  position = debut + taille;
}
t('chaque entrée de l’archive a une somme de contrôle juste', entreesVerifiees > 0 && crcJustes === entreesVerifiees, `${crcJustes}/${entreesVerifiees}`);

/* Le chemin réel de l'utilisatrice : le bouton, la fenêtre, le fichier qui
   arrive dans le dossier des téléchargements. */
await aller('#/module/prestations');
await page.getByRole('button', { name: 'Exporter' }).click();
await page.waitForSelector('.modale');
const [fichierExcel] = await Promise.all([
  page.waitForEvent('download', { timeout: 10000 }),
  page.getByRole('button', { name: /Classeur Excel/ }).click(),
]);
t('le bouton d’export livre un classeur', /^five-league-prestations-\d{4}-\d{2}-\d{2}\.xlsx$/.test(fichierExcel.suggestedFilename()), fichierExcel.suggestedFilename());
const [fichierCsv] = await Promise.all([
  page.waitForEvent('download', { timeout: 10000 }),
  page.getByRole('button', { name: /Tableur CSV/ }).click(),
]);
t('le bouton d’export livre un CSV', fichierCsv.suggestedFilename().endsWith('.csv'), fichierCsv.suggestedFilename());
await page.keyboard.press('Escape');

/* ----------------------------------------------------------- Import CSV */

await aller('#/module/subventions');
const avantImport = await page.locator('.tableau tbody tr').count();
await page.getByRole('button', { name: 'Importer' }).click();
await page.waitForSelector('.modale');
await page.fill('.saisie--code', 'Financeur;Dispositif;Montant demandé;Statut\nVille de Lille;Appel à projets test;2 500;Déposé\n');
await page.waitForTimeout(150);
await page.getByRole('button', { name: 'Importer', exact: true }).last().click();
await page.waitForTimeout(260);
t('un CSV collé est importé', await page.locator('.tableau tbody tr').count() === avantImport + 1);
// Intl sépare les milliers par une espace fine insécable : la comparaison
// doit la ramener à une espace ordinaire.
const ligneImportee_ = (await page.locator('.tableau tbody tr', { hasText: 'Ville de Lille' }).textContent()).replace(/\s/g, ' ');
t('les montants importés sont interprétés', ligneImportee_.includes('2 500'), ligneImportee_.slice(0, 60));

/* ------------------------------------------------------------- Réglages */

await aller('#/reglages');
t('la page des réglages s’ouvre', (await page.locator('.page-titre').textContent()).includes('Réglages'));
await page.fill('#reglage-tauxHoraire', '15');
await page.locator('#reglage-tauxHoraire').blur();
await page.waitForTimeout(220);
t('le taux de valorisation se règle', await page.evaluate(() => window.FiveLeague.reglagesActifs().tauxHoraire === 15));

await page.getByRole('button', { name: 'Vider la base' }).click();
await page.waitForSelector('.modale');
await page.getByRole('button', { name: 'Supprimer' }).last().click();
await page.waitForTimeout(260);
t('la base peut être vidée', await page.evaluate(() => window.FiveLeague.MODULES.every((m) => window.FiveLeague.lignes(m.id, { toutesSaisons: true }).length === 0)));

await page.getByRole('button', { name: 'Recharger le jeu de démonstration' }).click();
await page.waitForSelector('.modale');
await page.getByRole('button', { name: 'Supprimer' }).last().click();
await page.waitForTimeout(300);
t('la démonstration se recharge', await page.evaluate(() => window.FiveLeague.lignes('cotisations').length > 50));

/* -------------------------------------------------------------- Rapport */

await aller('#/rapport');
t('le rapport de saison se compose', await page.locator('.rapport-section').count() >= 5);
t('le rapport détaille les huit domaines', await page.locator('.rapport-bloc').count() === 8);
t('le rapport chiffre l’équilibre', (await page.locator('.rapport-chiffre-valeur').first().textContent()).includes('€'));

/* --------------------------------------------------------------- Mobile */

const mobile = await navigateur.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const pageMobile = await mobile.newPage();
await pageMobile.goto(URL_, { waitUntil: 'load' });
await pageMobile.waitForFunction(() => window.FiveLeague);
await pageMobile.waitForTimeout(300);
const debordement = await pageMobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
t('aucun débordement horizontal sur téléphone', debordement <= 0, `${debordement} px`);
const grille = await pageMobile.evaluate(() => {
  const noeuds = [...document.querySelectorAll('.hub-noeud')].map((n) => n.getBoundingClientRect());
  return { nombre: noeuds.length, alignes: new Set(noeuds.map((r) => Math.round(r.top))).size < noeuds.length };
});
t('le hub devient une grille sur téléphone', grille.nombre === 8 && grille.alignes);
await pageMobile.goto(`${URL_}#/module/cotisations`);
await pageMobile.waitForTimeout(400);
t('les tableaux deviennent des fiches sur téléphone', await pageMobile.evaluate(() => getComputedStyle(document.querySelector('.tableau thead')).display === 'none'));

/* ------------------------------------------------------- Version en ligne */

/* Le fragment publié est enveloppé par la plateforme dans sa propre coquille.
   On refait ici cet emballage : c'est le seul moyen de vérifier qu'il démarre
   ailleurs que dans le fichier autonome. */
const fragment = await readFile(join(RACINE, 'dist', 'five-league-artifact.html'), 'utf8');
const enveloppe = join(tmpdir(), 'five-league-enveloppe.html');
await writeFile(enveloppe, `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${fragment}</body></html>`);
const contexteHote = await navigateur.newContext({ viewport: { width: 1280, height: 900 } });
const pageHote = await contexteHote.newPage();
const erreursHote = [];
pageHote.on('pageerror', (e) => erreursHote.push(e.message));
pageHote.on('console', (m) => { if (m.type() === 'error') erreursHote.push(m.text()); });
await pageHote.goto(`file://${enveloppe}`, { waitUntil: 'load' });
await pageHote.waitForFunction(() => window.FiveLeague, null, { timeout: 15000 });
await pageHote.waitForTimeout(300);
t('le fragment en ligne démarre sans erreur', erreursHote.length === 0, erreursHote.slice(0, 2).join(' | '));
t('le fragment affiche le hub complet', await pageHote.locator('.hub-noeud').count() === 8);
t('le fragment ne contient aucune balise de document', !/<(!doctype|html|head|body)\b/i.test(fragment));

/* Le thème de l'hôte utilise « dark » / « light » là où l'application dit
   « sombre » / « clair » : la palette doit répondre aux deux. */
await pageHote.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await pageHote.waitForTimeout(180);
const fondSombre = await pageHote.evaluate(() => getComputedStyle(document.body).backgroundColor);
await pageHote.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
await pageHote.waitForTimeout(180);
const fondClair = await pageHote.evaluate(() => getComputedStyle(document.body).backgroundColor);
t('la page suit le thème de l’hôte', fondSombre !== fondClair, `${fondSombre} vs ${fondClair}`);

t('aucune erreur console pendant le parcours', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));

await navigateur.close();

console.log(`\n  ${reussites.length} vérifications passées`);
for (const e of echecs) console.error(`  ✗ ${e}`);
if (echecs.length) {
  console.error(`\n  ${echecs.length} échec(s).`);
  process.exit(1);
}
console.log('  Banc de fumée : tout est vert.\n');
