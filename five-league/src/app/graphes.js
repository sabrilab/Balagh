/**
 * Graphiques. Du SVG écrit à la main : trois formes suffisent au besoin
 * (anneau, histogramme, barres horizontales), elles se redimensionnent
 * seules par le `viewBox`, s'impriment nettement et suivent le thème sombre
 * parce que les couleurs de texte et de grille viennent des variables CSS.
 *
 * Chaque graphique est doublé d'un résumé textuel pour les lecteurs d'écran :
 * un dessin sans équivalent n'informe personne.
 */

import { h } from './dom.js';
import { euros, eurosCourt, nombre, pourcent } from './format.js';

const TAU = Math.PI * 2;

/** Anneau de répartition. Les segments sont dessinés au trait pointillé :
 *  une seule primitive, aucun calcul d'arc, et un rendu net à toute taille. */
export function anneau(segments, { titre = 'Répartition', centreValeur, centreLibelle, taille = 240 } = {}) {
  const total = segments.reduce((t, s) => t + s.valeur, 0);
  const rayon = 70;
  const circonference = TAU * rayon;
  let depart = 0;
  const svg = h('svg.graphe-anneau', { viewBox: '0 0 200 200', width: taille, height: taille, role: 'img', 'aria-label': `${titre} : ${segments.map((s) => `${s.libelle} ${pourcent(s.valeur, total)}`).join(', ')}` });
  svg.appendChild(h('circle', { cx: 100, cy: 100, r: rayon, fill: 'none', stroke: 'var(--trait-graphe)', 'stroke-width': 26 }));
  for (const s of segments) {
    if (s.valeur <= 0) continue;
    const part = total ? s.valeur / total : 0;
    const arc = h('circle.anneau-part', {
      cx: 100, cy: 100, r: rayon, fill: 'none', stroke: s.couleur, 'stroke-width': 26,
      'stroke-dasharray': `${(part * circonference).toFixed(2)} ${circonference.toFixed(2)}`,
      'stroke-dashoffset': (-depart * circonference).toFixed(2),
      transform: 'rotate(-90 100 100)',
    });
    arc.appendChild(h('title', { text: `${s.libelle} — ${euros(s.valeur)} (${pourcent(s.valeur, total)})` }));
    svg.appendChild(arc);
    depart += part;
  }
  if (centreValeur !== undefined) {
    svg.appendChild(h('text.anneau-valeur', { x: 100, y: 97, 'text-anchor': 'middle', text: centreValeur }));
    svg.appendChild(h('text.anneau-libelle', { x: 100, y: 116, 'text-anchor': 'middle', text: centreLibelle || '' }));
  }
  return svg;
}

export function legende(segments, total) {
  return h('ul.legende', {}, segments.map((s) => h('li.legende-item', {},
    h('span.legende-pastille', { style: { background: s.couleur } }),
    h('span.legende-nom', { text: s.libelle }),
    h('span.legende-valeur', { text: `${euros(s.valeur)}${total ? ` · ${pourcent(s.valeur, total)}` : ''}` }))));
}

/** Échelle « ronde » : on préfère 0 / 2 500 / 5 000 à 0 / 2 317 / 4 634. */
function palier(max) {
  if (max <= 0) return { haut: 100, pas: 25 };
  const vise = max / 5;
  const magnitude = 10 ** Math.floor(Math.log10(vise));
  const pas = [1, 2, 2.5, 5, 10].map((f) => f * magnitude).find((p) => vise <= p) || magnitude * 10;
  return { haut: Math.ceil(max / pas) * pas, pas };
}

/**
 * Histogramme groupé. `series` : [{ libelle, couleur, valeurs: number[] }],
 * `categories` : les étiquettes de l'axe horizontal.
 *
 * Le dessin est refait à la largeur réelle du conteneur plutôt qu'étiré
 * depuis un `viewBox` fixe : une unité SVG vaut un pixel, donc les
 * étiquettes d'axe gardent leur taille lisible sur un téléphone comme sur
 * un écran large, et les barres ne se déforment pas.
 */
export function histogramme(config) {
  const cadre = h('div.graphe-cadre');
  let largeurVue = 0;
  const dessiner = () => {
    const largeur = Math.max(300, Math.round(cadre.clientWidth || 720));
    if (largeur === largeurVue) return;
    largeurVue = largeur;
    cadre.replaceChildren(dessinHistogramme({ ...config, largeur }));
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver(dessiner).observe(cadre);
  requestAnimationFrame(dessiner);
  return cadre;
}

function dessinHistogramme({ categories, series, titre = 'Évolution', hauteur = 220, largeur = 720, format = eurosCourt }) {
  const L = largeur;
  const H = hauteur;
  const margeG = 52;
  const margeB = 24;
  const margeH = 10;
  const max = Math.max(0, ...series.flatMap((s) => s.valeurs));
  const { haut, pas } = palier(max);
  const aireH = H - margeB - margeH;
  const largeurCase = (L - margeG) / Math.max(1, categories.length);
  const largeurBarre = Math.max(3, Math.min(18, (largeurCase - 5) / series.length));
  const y = (v) => margeH + aireH - (v / haut) * aireH;
  // Une seule unité sur toute la graduation : mélanger « 2 500 € » et
  // « 13 k€ » sur le même axe oblige le lecteur à convertir de tête.
  const formatAxe = haut >= 10000
    ? (v) => (v === 0 ? '0' : `${(v / 1000).toLocaleString('fr-FR')} k€`)
    : format;
  // Une étiquette sur deux, ou sur trois, quand la place manque.
  const saut = Math.ceil(52 / Math.max(1, largeurCase));

  const svg = h('svg.graphe-barres', { viewBox: `0 0 ${L} ${H}`, width: L, height: H, role: 'img', 'aria-label': `${titre} : ${series.map((s) => `${s.libelle}, total ${format(s.valeurs.reduce((a, b) => a + b, 0))}`).join(' ; ')}` });
  for (let v = 0; v <= haut + 1; v += pas) {
    svg.appendChild(h('line', { x1: margeG - 6, x2: L, y1: y(v), y2: y(v), stroke: 'var(--trait-graphe)', 'stroke-width': 1 }));
    svg.appendChild(h('text.graphe-axe', { x: margeG - 10, y: y(v) + 4, 'text-anchor': 'end', text: formatAxe(v) }));
  }
  categories.forEach((cat, i) => {
    const base = margeG + i * largeurCase + (largeurCase - largeurBarre * series.length) / 2;
    series.forEach((s, j) => {
      const valeur = s.valeurs[i] || 0;
      const hauteurBarre = Math.max(valeur > 0 ? 2 : 0, aireH * (valeur / haut));
      const rect = h('rect.barre', { x: base + j * largeurBarre, y: margeH + aireH - hauteurBarre, width: Math.max(2, largeurBarre - 2), height: hauteurBarre, rx: 2, fill: s.couleur });
      rect.appendChild(h('title', { text: `${cat} — ${s.libelle} : ${format(valeur)}` }));
      svg.appendChild(rect);
    });
    if (i % saut === 0) {
      svg.appendChild(h('text.graphe-axe', { x: margeG + i * largeurCase + largeurCase / 2, y: H - 7, 'text-anchor': 'middle', text: cat }));
    }
  });
  return svg;
}

/** Barres horizontales : pour comparer des catégories nommées. */
export function barresHorizontales(entrees, { couleur = 'var(--accent)', format = nombre, hauteurLigne = 30 } = {}) {
  const max = Math.max(1, ...entrees.map((e) => e.valeur));
  return h('ul.barres-h', {}, entrees.map((e) => h('li.barre-h', {},
    h('span.barre-h-nom', { text: e.libelle }),
    h('span.barre-h-piste', {}, h('span.barre-h-remplissage', { style: { width: `${Math.max(2, (e.valeur / max) * 100)}%`, background: e.couleur || couleur } })),
    h('span.barre-h-valeur', { text: format(e.valeur) }))));
}

/** Jauge de progression vers un objectif. */
export function jaugeGraphe(part, { couleur = 'var(--accent)' } = {}) {
  const p = Math.max(0, Math.min(1, part || 0));
  return h('span.jauge', { role: 'img', 'aria-label': `${Math.round(p * 100)} %` },
    h('span.jauge-remplissage', { style: { width: `${p * 100}%`, background: couleur } }));
}
