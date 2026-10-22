// Fusion à 3 voies de l'état de l'appli, pour utiliser l'appli sur deux appareils sans perdre d'action.
// base = dernière version synchronisée, mine = cet appareil, theirs = la version en ligne (autre appareil).

/** JSON à clés triées : Postgres (jsonb) réordonne les clés, il faut comparer le contenu, pas l'ordre. */
export function stable(v) {
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
  return JSON.stringify(v === undefined ? null : v);
}
const eq = (a, b) => stable(a) === stable(b);

/** Réglages propres à l'appareil (onglet ouvert, minuteur en cours…) : on garde ceux de cet appareil. */
const LOCAL = new Set(["tab", "sub", "mapSubj", "weekDay", "openCh", "timer", "step"]);
// « music » se fusionne champ par champ (réglage partagé), le reste suit les règles générales.

/** Fusion champ par champ d'un objet ; en cas de conflit sur un même champ, cet appareil gagne. */
function mergeObj(b, m, t, special = {}) {
  b = b || {}; m = m || {}; t = t || {};
  const out = {};
  for (const k of new Set([...Object.keys(t), ...Object.keys(m)])) {
    if (special[k]) { out[k] = special[k](b[k], m[k], t[k]); continue; }
    if (eq(m[k], b[k])) out[k] = t[k];
    else if (eq(t[k], b[k])) out[k] = m[k];
    else out[k] = m[k];
    if (out[k] === undefined) delete out[k];
  }
  return out;
}

/** Listes d'objets avec un `id` (chapitres, matières, créneaux…) : fusion élément par élément. */
export function mergeById(b, m, t) {
  b = b || []; m = m || []; t = t || [];
  const B = new Map(b.map((x) => [x.id, x])), M = new Map(m.map((x) => [x.id, x])), T = new Map(t.map((x) => [x.id, x]));
  // ordre : celui de cet appareil (c'est là qu'on réordonne), puis les ajouts de l'autre appareil à leur place relative
  const order = m.map((x) => x.id);
  t.forEach((x, i) => { if (!M.has(x.id) && !B.has(x.id)) { const prev = t[i - 1] && order.indexOf(t[i - 1].id); order.splice(prev >= 0 ? prev + 1 : order.length, 0, x.id); } });
  const out = [];
  for (const id of order.concat(t.map((x) => x.id).filter((id) => !order.includes(id)))) {
    if (out.some((x) => x.id === id)) continue;
    const bi = B.get(id), mi = M.get(id), ti = T.get(id);
    if (!mi && !ti) continue;
    if (!mi) { if (bi && eq(ti, bi)) continue; out.push(ti); continue; }       // supprimé ici, pas modifié là-bas
    if (!ti) { if (bi && eq(mi, bi)) continue; out.push(mi); continue; }       // supprimé là-bas, pas modifié ici
    out.push(mergeObj(bi, mi, ti));
  }
  return out;
}

/** Journal d'XP : ensemble d'entrées sans id ; on garde les ajouts des deux côtés et les suppressions des deux côtés. */
const logKey = (e) => [e.d, e.m, e.sid || "", e.bonus || "", e.t ?? ""].join("|");
export function mergeLog(b, m, t) {
  b = b || []; m = m || []; t = t || [];
  if (!Array.isArray(m)) return t; if (!Array.isArray(t)) return m;
  const kb = new Set(b.map(logKey)), km = new Set(m.map(logKey)), kt = new Set(t.map(logKey));
  const out = [], seen = new Set();
  for (const e of t.concat(m)) {
    const k = logKey(e);
    if (seen.has(k)) continue;
    if (kb.has(k) && (!km.has(k) || !kt.has(k))) continue; // supprimé d'un côté
    seen.add(k); out.push(e);
  }
  return out;
}

function mergePlan(b, m, t) {
  if (!m) return t; if (!t) return m;
  if (m.weekStart !== t.weekStart) return (m.weekStart || "") > (t.weekStart || "") ? m : t; // nouvelle semaine : la plus récente gagne
  return mergeObj(b && b.weekStart === m.weekStart ? b : {}, m, t, { sessions: mergeById });
}

const unionObj = (b, m, t) => Object.assign({}, t || {}, m || {});

export function merge3(base, mine, theirs) {
  if (!theirs) return mine;
  if (!base) base = {};
  const out = mergeObj(base, mine, theirs, {
    chapters: mergeById, subjects: mergeById, constraints: mergeById, cards: mergeById,
    plan: mergePlan, log: mergeLog, ach: unionObj, bossHist: unionObj,
    off: (b, m, t) => [...new Set([...(t || []).filter((d) => !(b || []).includes(d) || (m || []).includes(d)), ...(m || [])])].sort(),
  });
  for (const k of LOCAL) { if (k in mine) out[k] = mine[k]; else delete out[k]; }
  return out;
}
