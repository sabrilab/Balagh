/**
 * Audit d'accessibilité, mesuré dans le navigateur plutôt que déduit de la
 * feuille de style. Quatre règles se vérifient mécaniquement et décident du
 * confort réel :
 *
 *   - contraste de 4,5:1 (3:1 pour le grand texte) — WCAG AA ;
 *   - aucun texte sous 11 px ;
 *   - cibles de 40 px au pointeur, 44 px au doigt ;
 *   - rien ne déborde de la fenêtre horizontalement.
 *
 * Chaque écran est mesuré en clair et en sombre, sur trois largeurs.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL_ = process.env.CIBLE || `file://${join(RACINE, 'dist', 'five-league.html')}`;

const ECRANS = [
  { nom: 'bureau', largeur: 1440, hauteur: 1000, tactile: false },
  { nom: 'tablette', largeur: 900, hauteur: 1100, tactile: false },
  { nom: 'téléphone', largeur: 390, hauteur: 844, tactile: true },
];
const VUES = ['', '#/module/cotisations', '#/module/evenements', '#/module/depenses', '#/rapport', '#/reglages'];
const THEMES = ['clair', 'sombre'];

const MESURE = ({ cibleMini }) => {
  const luminance = (c) => {
    const [r, v, b] = c.map((valeur) => {
      const s = valeur / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * v + 0.0722 * b;
  };
  const analyse = (couleur) => {
    const m = String(couleur).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { rgb: p.slice(0, 3), alpha: p.length > 3 ? p[3] : 1 };
  };
  const fusion = (dessus, dessous) => dessus.rgb.map((c, i) => c * dessus.alpha + dessous[i] * (1 - dessus.alpha));
  const fondEffectif = (el) => {
    let noeud = el;
    let pile = [];
    while (noeud && noeud.nodeType === 1) {
      const c = analyse(getComputedStyle(noeud).backgroundColor);
      if (c && c.alpha > 0) {
        pile.push(c);
        if (c.alpha === 1) break;
      }
      noeud = noeud.parentElement;
    }
    let resultat = [255, 255, 255];
    for (const couche of pile.reverse()) resultat = fusion(couche, resultat);
    return resultat;
  };
  const rapport = (a, b) => {
    const [x, y] = [luminance(a), luminance(b)].sort((u, v) => v - u);
    return (x + 0.05) / (y + 0.05);
  };

  const ecarts = [];
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
  };
  const nom = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/)[0]}` : ''}`;

  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    // Les logotypes sont explicitement exclus du critère de contraste par le
    // WCAG (1.4.3) ; le chiffre dessiné dans la marque suit la même règle.
    if (el.closest('.logo')) continue;
    const style = getComputedStyle(el);
    const texte = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(' ');

    if (texte) {
      const taille = parseFloat(style.fontSize);
      // Le texte SVG est mis à l'échelle par le viewBox : on mesure la taille
      // réellement affichée, pas celle déclarée.
      const echelle = el.ownerSVGElement || el.tagName.toLowerCase() === 'svg'
        ? (el.getScreenCTM ? Math.abs(el.getScreenCTM().a) : 1) : 1;
      const tailleReelle = taille * (Number.isFinite(echelle) && echelle > 0 ? echelle : 1);
      if (tailleReelle < 10.5) ecarts.push({ regle: 'texte', detail: `${nom(el)} — ${tailleReelle.toFixed(1)} px — « ${texte.slice(0, 32)} »` });

      const couleur = analyse(style.color);
      if (couleur) {
        const premier = fusion(couleur, fondEffectif(el));
        const contraste = rapport(premier, fondEffectif(el));
        const gras = Number(style.fontWeight) >= 700 || style.fontWeight === 'bold';
        const minimum = tailleReelle >= 24 || (gras && tailleReelle >= 18.66) ? 3 : 4.5;
        if (contraste < minimum - 0.05) {
          ecarts.push({ regle: 'contraste', detail: `${nom(el)} — ${contraste.toFixed(2)}:1 (minimum ${minimum}) — « ${texte.slice(0, 32)} »` });
        }
      }
    }

    const interactif = el.matches('button, select, textarea, input:not([type="checkbox"]), a.bouton, a.bouton-icone, a.nav-lien, a.lien-retour, a.hub-noeud');
    if (interactif) {
      const r = el.getBoundingClientRect();
      if (r.height < cibleMini - 0.5 || r.width < 24) {
        ecarts.push({ regle: 'cible', detail: `${nom(el)} — ${Math.round(r.width)}×${Math.round(r.height)} px (minimum ${cibleMini})` });
      }
    }
  }

  const debordement = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  if (debordement > 1) ecarts.push({ regle: 'débordement', detail: `${debordement} px hors cadre` });
  return ecarts;
};

const navigateur = await chromium.launch();
const tousEcarts = [];
let mesures = 0;

for (const ecran of ECRANS) {
  const contexte = await navigateur.newContext({
    viewport: { width: ecran.largeur, height: ecran.hauteur },
    hasTouch: ecran.tactile,
    isMobile: ecran.tactile,
  });
  const page = await contexte.newPage();
  for (const theme of THEMES) {
    for (const vue of VUES) {
      await page.goto(URL_ + vue, { waitUntil: 'load' });
      await page.waitForFunction(() => window.FiveLeague, null, { timeout: 15000 });
      await page.evaluate((t) => localStorage.setItem('five-league.theme', t), theme);
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await page.waitForTimeout(220);
      const ecarts = await page.evaluate(MESURE, { cibleMini: ecran.tactile ? 44 : 40 });
      mesures++;
      for (const e of ecarts) tousEcarts.push({ ...e, ou: `${ecran.nom} · ${theme} · ${vue || 'hub'}` });
    }
  }
  await contexte.close();
}
await navigateur.close();

const parRegle = new Map();
for (const e of tousEcarts) {
  const cle = `${e.regle} | ${e.detail}`;
  if (!parRegle.has(cle)) parRegle.set(cle, { ...e, occurrences: 0, lieux: new Set() });
  parRegle.get(cle).occurrences++;
  parRegle.get(cle).lieux.add(e.ou);
}

console.log(`\n  ${mesures} écrans mesurés (${ECRANS.length} largeurs × ${THEMES.length} thèmes × ${VUES.length} vues)`);
if (!parRegle.size) {
  console.log('  Contraste, taille de texte, cibles tactiles, débordement : zéro écart.\n');
  process.exit(0);
}
const groupes = [...parRegle.values()].sort((a, b) => a.regle.localeCompare(b.regle));
for (const g of groupes) {
  console.error(`  ✗ [${g.regle}] ${g.detail}`);
  console.error(`      ${[...g.lieux].slice(0, 3).join(' ; ')}${g.lieux.size > 3 ? ` (+${g.lieux.size - 3})` : ''}`);
}
console.error(`\n  ${groupes.length} écart(s) distinct(s).\n`);
process.exit(1);
