/**
 * Fabrique de DOM. Pas de moteur de gabarits : `h()` suffit, et une fonction
 * de 30 lignes se relit plus vite qu'une dépendance de 40 Ko.
 *
 *   h('article.carte', { role: 'group' }, h('h3', {}, 'Titre'), 'texte')
 *
 * Le sélecteur du premier argument accepte les classes et l'identifiant :
 * `'button.puce.puce--vert#tri'`.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const BALISES_SVG = new Set(['svg', 'g', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'text', 'tspan', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'title', 'use', 'ellipse']);

export function h(selecteur, attributs = {}, ...enfants) {
  const [balise, ...reste] = String(selecteur).split(/(?=[.#])/);
  const nom = balise || 'div';
  const el = BALISES_SVG.has(nom) ? document.createElementNS(SVG_NS, nom) : document.createElement(nom);
  for (const morceau of reste) {
    if (morceau[0] === '#') el.id = morceau.slice(1);
    else el.classList.add(morceau.slice(1));
  }
  for (const [cle, valeur] of Object.entries(attributs || {})) {
    if (valeur === null || valeur === undefined || valeur === false) continue;
    if (cle === 'class') { for (const c of String(valeur).split(' ')) if (c) el.classList.add(c); }
    else if (cle === 'text') el.textContent = valeur;
    else if (cle === 'style' && typeof valeur === 'object') appliquerStyle(el, valeur);
    else if (cle === 'dataset') Object.assign(el.dataset, valeur);
    else if (cle.startsWith('on') && typeof valeur === 'function') el.addEventListener(cle.slice(2).toLowerCase(), valeur);
    else if (cle in el && !BALISES_SVG.has(nom) && typeof valeur !== 'object' && cle !== 'list') el[cle] = valeur;
    else el.setAttribute(cle, valeur === true ? '' : valeur);
  }
  ajouter(el, enfants);
  return el;
}

/** Les propriétés personnalisées (`--x`) échappent à l'affectation directe :
 *  `style['--x'] = …` est ignoré, seul `setProperty` les enregistre. */
function appliquerStyle(el, style) {
  for (const [propriete, valeur] of Object.entries(style)) {
    if (valeur === null || valeur === undefined) continue;
    if (propriete.startsWith('--')) el.style.setProperty(propriete, String(valeur));
    else el.style[propriete] = valeur;
  }
}

export function ajouter(parent, enfants) {
  for (const enfant of enfants.flat(4)) {
    if (enfant === null || enfant === undefined || enfant === false) continue;
    parent.appendChild(enfant instanceof Node ? enfant : document.createTextNode(String(enfant)));
  }
  return parent;
}

export const $ = (selecteur, racine = document) => racine.querySelector(selecteur);
export const $$ = (selecteur, racine = document) => Array.from(racine.querySelectorAll(selecteur));

export function vider(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export const remplacer = (el, ...enfants) => ajouter(vider(el), enfants);

/** Icône : un tracé unique sur une grille de 24, trait rond. */
export function icone(trace, taille = 24) {
  return h('svg.icone', { viewBox: '0 0 24 24', width: taille, height: taille, fill: 'none', 'aria-hidden': 'true' },
    h('path', { d: trace, stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
}

/* ------------------------------------------------------------- Superposés */

let fermerCourant = null;

/**
 * Fenêtre modale. Le focus est piégé tant qu'elle est ouverte et rendu à
 * l'élément qui l'a ouverte à la fermeture — sans quoi la navigation au
 * clavier repart du haut du document à chaque enregistrement.
 */
export function modale({ titre, corps, actions = [], large = false }) {
  if (fermerCourant) fermerCourant();
  const ouvreur = document.activeElement;
  const fond = h('div.modale-fond', { role: 'presentation' });
  const boite = h(`div.modale${large ? '.modale--large' : ''}`, { role: 'dialog', 'aria-modal': 'true', 'aria-label': titre });
  const fermer = () => {
    document.removeEventListener('keydown', auClavier, true);
    fond.remove();
    fermerCourant = null;
    if (ouvreur && ouvreur.focus) ouvreur.focus();
  };
  const auClavier = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); fermer(); return; }
    if (e.key !== 'Tab') return;
    const cibles = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', boite).filter((el) => !el.disabled && el.offsetParent !== null);
    if (!cibles.length) return;
    const premier = cibles[0];
    const dernier = cibles[cibles.length - 1];
    if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
    else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
  };
  ajouter(boite, [
    h('header.modale-tete', {}, h('h2', { text: titre }), h('button.bouton-icone', { type: 'button', 'aria-label': 'Fermer la fenêtre', onclick: fermer }, icone('M6 6l12 12M18 6L6 18', 20))),
    h('div.modale-corps', {}, corps),
    actions.length ? h('footer.modale-pied', {}, actions.map((a) => h(`button.bouton${a.variante ? `.bouton--${a.variante}` : ''}`, { type: a.type || 'button', text: a.libelle, onclick: a.action ? () => a.action(fermer) : fermer }))) : null,
  ]);
  fond.appendChild(boite);
  fond.addEventListener('mousedown', (e) => { if (e.target === fond) fermer(); });
  document.body.appendChild(fond);
  document.addEventListener('keydown', auClavier, true);
  fermerCourant = fermer;
  requestAnimationFrame(() => ($('input, select, textarea, button', boite) || boite).focus());
  return { fermer, boite };
}

export function confirmer(question, detail) {
  return new Promise((resoudre) => {
    modale({
      titre: question,
      corps: h('p.texte-doux', { text: detail || 'Cette action est définitive.' }),
      actions: [
        { libelle: 'Annuler', action: (fermer) => { fermer(); resoudre(false); } },
        { libelle: 'Supprimer', variante: 'danger', action: (fermer) => { fermer(); resoudre(true); } },
      ],
    });
  });
}

let pileToasts = null;
export function toast(message, variante = 'succes') {
  if (!pileToasts) {
    pileToasts = h('div.toasts', { role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(pileToasts);
  }
  const el = h(`div.toast.toast--${variante}`, { text: message });
  pileToasts.appendChild(el);
  setTimeout(() => { el.classList.add('toast--sortie'); setTimeout(() => el.remove(), 300); }, 3400);
}
