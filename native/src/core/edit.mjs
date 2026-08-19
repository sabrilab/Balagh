/**
 * Montage audio non destructif.
 *
 * La prise enregistrée n'est jamais modifiée. Le montage est une liste de
 * régions — des intervalles dans la source — lues dans l'ordre du tableau.
 * Couper, supprimer, déplacer ne font que réécrire cette liste : on peut
 * toujours revenir en arrière, et le fichier d'origine reste intact.
 *
 * Le point qui demande de l'attention : les repères de versets sont datés
 * dans la SOURCE. Dès qu'on coupe, ils ne correspondent plus au montage. Sans
 * remappage, la vidéo se désynchroniserait sans rien signaler.
 */

export const regionLength = (r) => Math.max(0, r.end - r.start);
export const totalDuration = (regions) => regions.reduce((a, r) => a + regionLength(r), 0);

/**
 * Instant du montage correspondant à un instant de la source.
 *
 * Quand l'instant tombe dans un passage supprimé, on le rabat sur le début du
 * morceau conservé qui le suit dans la source : le repère se pose là où le
 * contenu reprend, ce qui est le comportement attendu quand on coupe un blanc.
 */
export function sourceToEdited(regions, t) {
  let acc = 0;
  for (const r of regions) {
    if (t >= r.start && t < r.end) return acc + (t - r.start);
    acc += regionLength(r);
  }
  // Passage supprimé : on cherche, dans l'ordre de la SOURCE, la première
  // région qui commence après — puis sa position dans le montage.
  const suivante = regions
    .filter((r) => r.start > t)
    .sort((a, b) => a.start - b.start)[0];
  if (!suivante) return totalDuration(regions);
  let pos = 0;
  for (const r of regions) {
    if (r === suivante) return pos;
    pos += regionLength(r);
  }
  return pos;
}

/**
 * Programme de lecture : quel segment est à l écran, et quand.
 *
 * Un simple remappage des repères ne suffit pas. Il supposerait que l ordre
 * des versets ne change jamais — or déplacer une région change précisément
 * cela. On reconstruit donc le programme depuis les régions : pour chaque
 * morceau lu, on retrouve d où il vient dans la source, donc quel segment il
 * porte. Une région qui chevauche deux repères est scindée d autant.
 *
 * @returns {{start:number,end:number,index:number}[]} en temps de montage
 */
export function playSchedule(regions, cues) {
  if (!cues || !cues.length) {
    return [{ start: 0, end: totalDuration(regions), index: 0 }];
  }
  const segmentAt = (t) => {
    let i = 0;
    for (let k = 0; k < cues.length; k++) if (t >= cues[k] - 1e-6) i = k;
    return i;
  };

  const out = [];
  let pos = 0;
  for (const r of regions) {
    // Bornes internes : les repères qui tombent à l intérieur de la région.
    const coupures = cues.filter((c) => c > r.start + 1e-6 && c < r.end - 1e-6).sort((a, b) => a - b);
    let from = r.start;
    for (const c of [...coupures, r.end]) {
      const len = c - from;
      if (len > 1e-6) {
        out.push({ start: pos, end: pos + len, index: segmentAt(from) });
        pos += len;
      }
      from = c;
    }
  }

  // Morceaux voisins portant le même segment : on les fond en un seul.
  const fusionne = [];
  for (const e of out) {
    const last = fusionne[fusionne.length - 1];
    if (last && last.index === e.index && Math.abs(last.end - e.start) < 1e-6) last.end = e.end;
    else fusionne.push({ ...e });
  }
  return fusionne;
}

/** Instant de montage de chaque repère, sans hypothèse d ordre. */
export const remapCues = (regions, cues) =>
  (cues && cues.length ? cues.map((c) => sourceToEdited(regions, c)) : cues);

/** Instant de la source correspondant à un instant du montage. */
export function editedToSource(regions, t) {
  let acc = 0;
  for (const r of regions) {
    const len = regionLength(r);
    if (t < acc + len) return r.start + (t - acc);
    acc += len;
  }
  const last = regions[regions.length - 1];
  return last ? last.end : 0;
}

let seq = 0;
export const newRegion = (start, end) => ({ id: ++seq, start, end });

/** Coupe à un instant du montage. La région concernée devient deux régions. */
export function splitAt(regions, editedTime) {
  let acc = 0;
  const out = [];
  let coupe = false;
  for (const r of regions) {
    const len = regionLength(r);
    if (!coupe && editedTime > acc + 0.02 && editedTime < acc + len - 0.02) {
      const at = r.start + (editedTime - acc);
      out.push(newRegion(r.start, at), newRegion(at, r.end));
      coupe = true;
    } else {
      out.push(r);
    }
    acc += len;
  }
  return coupe ? out : regions;
}

export const removeRegion = (regions, id) =>
  (regions.length <= 1 ? regions : regions.filter((r) => r.id !== id));

/** Déplace une région dans l'ordre de lecture. */
export function moveRegion(regions, from, to) {
  if (from === to || from < 0 || to < 0 || from >= regions.length || to >= regions.length) return regions;
  const out = regions.slice();
  const [r] = out.splice(from, 1);
  out.splice(to, 0, r);
  return out;
}

/**
 * Assemble les régions en un tampon continu.
 *
 * Un fondu de quelques millisecondes à chaque jointure évite le claquement
 * qu'produirait une discontinuité de forme d'onde.
 */
export function renderRegions(ctx, source, regions, fadeMs = 6) {
  const sr = source.sampleRate;
  const canaux = source.numberOfChannels;
  const total = Math.max(1, Math.round(totalDuration(regions) * sr));
  const out = ctx.createBuffer(canaux, total, sr);
  const fade = Math.max(1, Math.round((sr * fadeMs) / 1000));

  for (let c = 0; c < canaux; c++) {
    const src = source.getChannelData(c);
    const dst = out.getChannelData(c);
    let pos = 0;
    for (const r of regions) {
      const from = Math.max(0, Math.round(r.start * sr));
      const to = Math.min(src.length, Math.round(r.end * sr));
      const len = Math.max(0, to - from);
      for (let i = 0; i < len && pos + i < total; i++) {
        let g = 1;
        if (i < fade) g = i / fade;
        else if (i > len - fade) g = Math.max(0, (len - i) / fade);
        dst[pos + i] = src[from + i] * g;
      }
      pos += len;
    }
  }
  return out;
}

/**
 * Retire un intervalle de la SOURCE du montage.
 *
 * Sert à supprimer un blanc : la plage est datée dans la prise d'origine, pas
 * dans le montage, car c'est là que l'analyse l'a trouvée. Une région qui
 * l'enjambe se scinde ; une région entièrement dedans disparaît.
 */
export function cutSpan(regions, a, b) {
  if (!(b > a)) return regions;
  const out = [];
  for (const r of regions) {
    if (b <= r.start || a >= r.end) { out.push(r); continue; }
    if (a > r.start) out.push(newRegion(r.start, a));
    if (b < r.end) out.push(newRegion(b, r.end));
  }
  return out.length ? out : regions;
}
