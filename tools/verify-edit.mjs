/**
 * Prouve l'algèbre du montage.
 *
 * C'est la partie du code où une erreur ne se voit pas : le son sort, la vidéo
 * sort, et le texte est décalé d'une seconde. Chaque propriété est donc
 * vérifiée sur des cas construits à la main, avec des nombres qu'on peut
 * recompter de tête.
 */
import {
  cutSpan, editedToSource, moveRegion, newRegion, playSchedule, regionLength,
  removeRegion, sourceToEdited, splitAt, totalDuration,
} from '../core/edit.mjs';

const ok = [], bad = [];
const t = (nom, cond, detail) => (cond ? ok : bad).push(nom + (detail ? ` — ${detail}` : ''));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const bornes = (rs) => rs.map((r) => [+r.start.toFixed(3), +r.end.toFixed(3)]);
const prog = (rs, cues) => playSchedule(rs, cues).map((e) => [+e.start.toFixed(3), +e.end.toFixed(3), e.index]);

/* --- une prise de 12 s, trois segments à 0, 4 et 8 ----------------------- */
const CUES = [0, 4, 8];
const pleine = [newRegion(0, 12)];

t('durée totale', totalDuration(pleine) === 12);
t('programme intact', eq(prog(pleine, CUES), [[0, 4, 0], [4, 8, 1], [8, 12, 2]]));

/* --- couper au milieu ne change ni le son ni le programme ---------------- */
const coupee = splitAt(pleine, 6);
t('la coupe fait deux morceaux', eq(bornes(coupee), [[0, 6], [6, 12]]));
t('couper ne change pas la durée', totalDuration(coupee) === 12);
t('couper ne change pas le programme', eq(prog(coupee, CUES), [[0, 4, 0], [4, 8, 1], [8, 12, 2]]),
  JSON.stringify(prog(coupee, CUES)));

/* --- supprimer le premier morceau : le reste remonte --------------------- */
const sansTete = removeRegion(coupee, coupee[0].id);
t('suppression : il reste un morceau', eq(bornes(sansTete), [[6, 12]]));
t('suppression : durée réduite', totalDuration(sansTete) === 6);
t('suppression : le programme commence au segment 1',
  eq(prog(sansTete, CUES), [[0, 2, 1], [2, 6, 2]]), JSON.stringify(prog(sansTete, CUES)));

/* --- déplacer : le texte suit le son, c'est le point délicat -------------- */
const inverse = moveRegion(coupee, 0, 1);
t('déplacement : ordre inversé', eq(bornes(inverse), [[6, 12], [0, 6]]));
t('déplacement : durée inchangée', totalDuration(inverse) === 12);
t('déplacement : le texte suit le son',
  eq(prog(inverse, CUES), [[0, 2, 1], [2, 6, 2], [6, 10, 0], [10, 12, 1]]),
  JSON.stringify(prog(inverse, CUES)));

/* --- retirer un blanc au milieu ------------------------------------------ */
const sansBlanc = cutSpan(pleine, 3, 5);
t('blanc retiré', eq(bornes(sansBlanc), [[0, 3], [5, 12]]));
t('blanc retiré : durée', totalDuration(sansBlanc) === 10);
t('blanc retiré : le segment 1 démarre à 3 s',
  eq(prog(sansBlanc, CUES), [[0, 3, 0], [3, 6, 1], [6, 10, 2]]), JSON.stringify(prog(sansBlanc, CUES)));
t('un blanc à cheval sur deux morceaux les rogne tous les deux',
  eq(bornes(cutSpan(coupee, 5, 7)), [[0, 5], [7, 12]]));
t('retirer tout ne laisse pas un montage vide', eq(bornes(cutSpan(pleine, -1, 13)), [[0, 12]]));

/* --- correspondance des temps -------------------------------------------- */
t('source → montage dans un morceau conservé', sourceToEdited(sansBlanc, 7) === 5);
t('source → montage dans un passage supprimé', sourceToEdited(sansBlanc, 4) === 3);
t('montage → source', editedToSource(sansBlanc, 5) === 7);
t('aller-retour', editedToSource(sansBlanc, sourceToEdited(sansBlanc, 9)) === 9);

/* --- garde-fous ----------------------------------------------------------- */
t('on ne coupe pas au ras d’une bordure', splitAt(pleine, 0.01) === pleine);
t('on ne supprime pas le dernier morceau', removeRegion(pleine, pleine[0].id) === pleine);
t('un déplacement hors bornes ne fait rien', moveRegion(coupee, 0, 5) === coupee);
t('une région vide ne dure pas', regionLength({ start: 5, end: 3 }) === 0);
t('sans repères, le programme reste d’un bloc',
  eq(playSchedule(coupee, []).map((e) => [e.start, e.end, e.index]), [[0, 12, 0]]));

console.log('\nRéussis :');
for (const x of ok) console.log('  ok   ' + x);
if (bad.length) { console.log('\nÉchecs :'); for (const x of bad) console.log('  KO   ' + x); }
console.log(`\n${ok.length} ok, ${bad.length} échec(s)`);
process.exit(bad.length ? 1 : 0);
