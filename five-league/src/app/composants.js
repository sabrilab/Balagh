/**
 * Briques d'interface partagées par le tableau de bord et les sept pages :
 * cartes d'indicateur, pastilles d'état, en-têtes, états vides.
 */

import { h, icone } from './dom.js';
import { TONS } from './schema.js';
import { jaugeGraphe } from './graphes.js';

export function carteKPI({ libelle, valeur, detail, jauge, ton, couleur }) {
  return h(`article.kpi${ton === 'alerte' ? '.kpi--alerte' : ''}`, { style: couleur ? { '--kpi-accent': couleur } : null },
    h('p.kpi-libelle', { text: libelle }),
    h('p.kpi-valeur', { text: valeur }),
    jauge !== undefined && jauge !== null ? jaugeGraphe(jauge, { couleur: couleur || 'var(--accent)' }) : null,
    detail ? h('p.kpi-detail', { text: detail }) : null);
}

export function pastille(etat) {
  if (!etat) return h('span.pastille.pastille--gris', { text: '—' });
  return h(`span.pastille.pastille--${TONS[etat] || 'gris'}`, { text: etat });
}

export function carte({ titre, sousTitre, actions, contenu, classe = '' }) {
  return h('section.carte', { class: classe },
    titre ? h('header.carte-tete', {},
      h('div', {}, h('h2.carte-titre', { text: titre }), sousTitre ? h('p.carte-sous-titre', { text: sousTitre }) : null),
      actions ? h('div.carte-actions', {}, actions) : null) : null,
    h('div.carte-corps', {}, contenu));
}

export function etatVide({ titre, detail, action }) {
  return h('div.vide', {},
    icone('M12 3.5 20 8v8l-8 4.5L4 16V8zM4 8l8 4.5M20 8l-8 4.5M12 12.5V21', 34),
    h('p.vide-titre', { text: titre }),
    detail ? h('p.vide-detail', { text: detail }) : null,
    action || null);
}

export function bouton(libelle, { variante = '', icone: tracé, onclick, titre, type = 'button' } = {}) {
  return h(`button.bouton${variante ? `.bouton--${variante}` : ''}`, { type, onclick, title: titre || null },
    tracé ? icone(tracé, 18) : null, h('span', { text: libelle }));
}

/** Sélecteur de fichier. Le contrôle natif affiche « Choose File » dans la
 *  langue du navigateur : le champ est masqué derrière un bouton étiqueté,
 *  qui reste accessible au clavier puisque le label le pilote. */
export function champFichier(libelle, accepte, surFichier) {
  const saisie = h('input.champ-fichier', { type: 'file', accept: accepte });
  const nom = h('span.champ-fichier-nom', { text: 'Aucun fichier choisi' });
  saisie.addEventListener('change', async () => {
    const fichier = saisie.files[0];
    if (!fichier) return;
    nom.textContent = fichier.name;
    await surFichier(fichier);
    saisie.value = '';
  });
  return h('label.selecteur-fichier', {}, saisie, h('span.bouton', {}, icone(TRACE_ICONES.importer, 18), h('span', { text: libelle })), nom);
}

/** Marque de la ligue : un ballon stylisé, dessiné plutôt qu'importé. */
export function logo(taille = 44) {
  const svg = h('svg.logo', { viewBox: '0 0 64 64', width: taille, height: taille, role: 'img', 'aria-label': 'Five League — Sunday Five League' });
  svg.appendChild(h('circle', { cx: 32, cy: 32, r: 30, fill: 'var(--marque-fond)' }));
  svg.appendChild(h('path', { d: 'M32 12.5 45.5 22.3 40.3 38.2H23.7L18.5 22.3z', fill: 'var(--marque-accent)' }));
  svg.appendChild(h('path', { d: 'M32 12.5V4M45.5 22.3l8-2.7M40.3 38.2l5 6.6M23.7 38.2l-5 6.6M18.5 22.3l-8-2.7', stroke: 'var(--marque-accent)', 'stroke-width': 2.4, 'stroke-linecap': 'round', fill: 'none', opacity: 0.55 }));
  svg.appendChild(h('text', { x: 32, y: 33.5, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 700, fill: 'var(--marque-fond)', 'font-family': 'inherit', text: '5' }));
  svg.appendChild(h('path', { d: 'M20 48.5h24', stroke: 'var(--marque-accent)', 'stroke-width': 2, 'stroke-linecap': 'round' }));
  return svg;
}

export const TRACE_ICONES = {
  plus: 'M12 5v14M5 12h14',
  recherche: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  exporter: 'M12 4v11M8 11l4 4 4-4M4 18v2h16v-2',
  importer: 'M12 15V4M8 8l4-4 4 4M4 18v2h16v-2',
  imprimer: 'M7 9V4h10v5M7 18H5v-6h14v6h-2M7 14h10v6H7z',
  crayon: 'M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z',
  poubelle: 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  retour: 'M15 5l-7 7 7 7',
  reglages: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 13.5a7.6 7.6 0 0 0 0-3l1.7-1.3-2-3.4-2 .8a7.6 7.6 0 0 0-2.6-1.5L14.2 3H9.8l-.3 2.1a7.6 7.6 0 0 0-2.6 1.5l-2-.8-2 3.4 1.7 1.3a7.6 7.6 0 0 0 0 3l-1.7 1.3 2 3.4 2-.8a7.6 7.6 0 0 0 2.6 1.5l.3 2.1h4.4l.3-2.1a7.6 7.6 0 0 0 2.6-1.5l2 .8 2-3.4z',
  rapport: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  alerte: 'M12 4.5 21 20H3zM12 10v4M12 17h.01',
  grille: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  soleil: 'M12 6.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  lune: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z',
};
