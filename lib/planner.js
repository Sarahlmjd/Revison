// Logique de planification, sans DOM : utilisée par l'appli (navigateur) et par le flux calendrier (serveur).
// Toutes les dates sont des chaînes "AAAA-MM-JJ". `today` est toujours passé explicitement.

export const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
export const DIFF_RANK = { r: 0, y: 1, g: 2 };
export const DIFF_MULT = { r: 1.15, y: 1, g: 0.85 };
export const CST = {
  pas: { t: "Pas commencé", d: null, h: "pas encore ouvert" },
  decouverte: { t: "Découverte", d: 1, h: "pas encore compris" },
  arevoir: { t: "À revoir", d: 2, h: "compris, mais au test je retrouve moins de 70 %" },
  apprentissage: { t: "Apprentissage", d: 5, h: "au test je retrouve 70 à 90 %" },
  maitrise: { t: "Maîtrisé", d: 14, h: "au test je retrouve plus de 90 %, sans hésiter" },
};
export const BLOCK = 60, PAUSE = 10, HALF = 30;
export const workOf = (m) => (m <= HALF ? m - 5 : m - PAUSE * Math.max(1, Math.round(m / BLOCK)));
export const KINDS = { quick: "test rapide", relearn: "à réapprendre", disc: "suite de la découverte", new: "nouveau chapitre", ahead: "en avance", review: "révision" };

// ---- dates (calcul en UTC à midi pour éviter les décalages d'heure d'été) ----
const D = (s) => new Date(s + "T12:00:00Z");
const S10 = (d) => d.toISOString().slice(0, 10);
export const addDays = (s, n) => { const z = D(s); z.setUTCDate(z.getUTCDate() + n); return S10(z); };
export const dow = (s) => (D(s).getUTCDay() + 6) % 7; // 0 = lundi
export const mondayOf = (s) => addDays(s, -dow(s));
export const dayGap = (a, b) => Math.round((D(b) - D(a)) / 864e5);
export const toMin = (t) => { const [h, m] = (t || "0:0").split(":").map(Number); return h * 60 + (m || 0); };
/** Date du jour dans un fuseau donné (ex. Europe/Paris), au format AAAA-MM-JJ. */
export function todayIn(timeZone, now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
/** Date du jour sur l'appareil. */
export const localToday = () => { const z = new Date(); z.setMinutes(z.getMinutes() - z.getTimezoneOffset()); return z.toISOString().slice(0, 10); };

// ---- état ----
const subjOf = (S, id) => S.subjects.find((s) => s.id === id);
export const chaps = (S) => S.chapters || (S.chapters = []);
export const budget = (S) => S.avail.reduce((a, b) => a + b, 0);
export const subjW = (s) => (Number(s.coef) > 0 ? Number(s.coef) : 1) * DIFF_MULT[s.diff] * (s.master ? 1.3 : 1) * (s.exam ? 2 : 1);

/** Volume horaire hebdomadaire visé par matière (coef × difficulté, bonus d'examen pris sur les autres). */
export function volumes(S) {
  const B = budget(S), subs = S.subjects.filter((s) => s.name.trim());
  const out = {};
  const fixed = subs.filter((s) => s.manual != null), autos = subs.filter((s) => s.manual == null);
  fixed.forEach((s) => (out[s.id] = { mins: s.manual, boost: 0 }));
  const rest = Math.max(0, B - fixed.reduce((a, s) => a + s.manual, 0));
  const w = (s) => (Number(s.coef) > 0 ? Number(s.coef) : 1) * DIFF_MULT[s.diff] * (s.master ? 1.3 : 1);
  const sw = autos.reduce((a, s) => a + w(s), 0) || 1;
  const raw = {}; autos.forEach((s) => (raw[s.id] = (rest * w(s)) / sw));
  const ex = autos.filter((s) => s.exam), non = autos.filter((s) => !s.exam);
  if (ex.length && non.length) {
    const pool = non.reduce((a, s) => a + raw[s.id], 0);
    const take = Math.min(S.examBoost * ex.length, pool * 0.6);
    non.forEach((s) => (raw[s.id] -= (take * raw[s.id]) / pool));
    ex.forEach((s) => { raw[s.id] += take / ex.length; out[s.id] = { boost: take / ex.length }; });
  }
  let sum = 0;
  autos.forEach((s) => { const m = Math.floor(Math.max(0, raw[s.id]) / BLOCK) * BLOCK; out[s.id] = Object.assign(out[s.id] || { boost: 0 }, { mins: m }); sum += m; });
  let left = Math.round(rest) - sum;
  const byFrac = autos.slice().sort((a, b) => raw[b.id] - out[b.id].mins - (raw[a.id] - out[a.id].mins));
  for (const s of byFrac) { if (left < BLOCK) break; out[s.id].mins += BLOCK; left -= BLOCK; }
  if (autos.length && left > 0) { const big = autos.reduce((a, s) => (out[s.id].mins > out[a.id].mins ? s : a), autos[0]); out[big.id].mins += left; }
  return out;
}

/** Prévision de la progression d'un chapitre après une séance (ta vraie note la remplace ensuite). */
export function advanceV(v, date) {
  if (v.status === "pas") Object.assign(v, { status: "decouverte", next: addDays(date, 1) });
  else if (v.status === "decouverte" || v.status === "arevoir") Object.assign(v, { status: "apprentissage", next: addDays(date, 3) });
  else v.next = addDays(date, CST[v.status].d);
  v.last = date;
}

/**
 * Calcule les créneaux de la semaine en cours, à partir d'aujourd'hui (modifie S.plan).
 * 1) ce qui est dû passe d'abord (découverte d'abord, puis le plus en retard, pondéré par le coef) ;
 * 2) un chapitre presque acquis = test rapide de 25 min (deux par session) ;
 * 3) un nouveau chapitre seulement quand plus rien n'est en retard, jamais si un autre de la matière est en découverte.
 * Le jour en cours est figé dès qu'il a été affiché (S.plan.lockedDay), sauf si `lock` vaut false.
 */
export function planWeek(S, today, { lock = true } = {}) {
  const ws = mondayOf(today), td = dow(today);
  const subj = (id) => subjOf(S, id);
  if (!S.plan || S.plan.weekStart !== ws) S.plan = { createdAt: Date.now(), weekStart: ws, sessions: [] };
  const keep = S.plan.sessions.filter((x) => x.day != null && subj(x.subjId) && (x.status !== "todo" || x.day < td || x.extra || (S.timer && S.timer.sid === x.id) || (x.day === td && S.plan.lockedDay === today)));
  const V = {}; chaps(S).forEach((c) => (V[c.id] = { status: c.status, next: c.next, last: c.last }));
  const live = chaps(S).filter((c) => subj(c.subjId) && subj(c.subjId).name.trim());
  const weekMins = {}; keep.forEach((x) => (weekMins[x.subjId] = (weekMins[x.subjId] || 0) + x.mins));
  const out = keep.slice();
  for (let d = td; d < 7; d++) {
    const date = addDays(ws, d);
    const dayS = new Set(out.filter((x) => x.day === d).map((x) => x.subjId));
    const dayC = new Set(out.filter((x) => x.day === d).map((x) => x.chapId));
    let free = S.avail[d] - out.filter((x) => x.day === d).reduce((t, x) => t + x.mins, 0), halfOpen = false;
    while (free >= HALF) {
      const cand = [];
      live.forEach((c) => {
        const v = V[c.id], s = subj(c.subjId); if (dayC.has(c.id)) return;
        if (v.status !== "pas" && v.next && v.next <= date) {
          const stale = !v.last || dayGap(v.last, date) > 14;
          const mins = (v.status === "apprentissage" || v.status === "maitrise") && !stale ? HALF : BLOCK;
          const kind = stale && v.status !== "decouverte" ? "relearn" : v.status === "decouverte" ? "disc" : mins === HALF ? "quick" : "review";
          const sl = live.filter((z) => z.subjId === c.subjId).map((z) => V[z.id].last).filter(Boolean).sort().pop();
          const ds = sl ? Math.max(0, dayGap(sl, date)) : 14;
          let sc = v.status === "decouverte" ? 1e3 * subjW(s) : (1 + Math.log2(dayGap(v.next, date) + 1)) * subjW(s) * (stale ? 1 : 2) * (1 + ds / 3);
          if (dayS.has(c.subjId)) sc *= 0.3;
          cand.push({ c, mins, kind, sc });
        }
      });
      let pick = null;
      const fit = cand.filter((x) => (halfOpen ? x.mins === HALF : x.mins <= free));
      if (fit.length) pick = fit.sort((a, b) => b.sc - a.sc)[0];
      else if (!halfOpen && !live.some((c) => V[c.id].status !== "pas" && V[c.id].next && V[c.id].next < date)) {
        const subs = S.subjects.filter((s) => s.name.trim() && live.some((c) => c.subjId === s.id));
        const opts = [];
        subs.forEach((s) => {
          const cs = live.filter((c) => c.subjId === s.id);
          const sc = (subjW(s) / (1 + (weekMins[s.id] || 0) / 60)) * (dayS.has(s.id) ? 0.3 : 1);
          if (!cs.some((c) => V[c.id].status === "decouverte")) { const n = cs.find((c) => V[c.id].status === "pas" && !dayC.has(c.id)); if (n) opts.push({ c: n, mins: BLOCK, kind: "new", sc }); }
          const a = cs.filter((c) => V[c.id].status === "apprentissage" && !dayC.has(c.id)).sort((x, y) => ((V[x.id].next || "") < (V[y.id].next || "") ? -1 : 1))[0];
          if (a) opts.push({ c: a, mins: BLOCK, kind: "ahead", sc: sc * 0.8 });
        });
        if (opts.length && free >= BLOCK) pick = opts.sort((a, b) => b.sc - a.sc)[0];
      }
      if (!pick && halfOpen) { const last = out[out.length - 1]; last.mins = BLOCK; last.kind = last.kind === "quick" ? "review" : last.kind; free -= BLOCK - HALF; halfOpen = false; continue; }
      if (!pick) break;
      const c = pick.c;
      const blk = pick.mins === HALF && halfOpen ? out[out.length - 1].blk : "b" + d + "-" + out.length;
      out.push({ id: "p" + d + "-" + c.id + "-" + out.length, subjId: c.subjId, chapId: c.id, mins: pick.mins, day: d, status: "todo", note: "", kind: pick.kind, blk });
      advanceV(V[c.id], date); dayS.add(c.subjId); dayC.add(c.id); free -= pick.mins; weekMins[c.subjId] = (weekMins[c.subjId] || 0) + pick.mins;
      if (pick.mins === HALF) halfOpen = !halfOpen;
    }
  }
  S.plan.sessions = out;
  if (lock) S.plan.lockedDay = today;
  return S.plan;
}

/** Créneaux d'un jour, dans l'ordre d'affichage, avec leurs horaires (minutes depuis minuit). */
export function dayLayout(S, d) {
  const subj = (id) => subjOf(S, id);
  const ss0 = S.plan.sessions.filter((x) => x.day === d && subj(x.subjId));
  const bk = (x) => x.blk || x.id, br = {};
  ss0.forEach((x) => { const r = DIFF_RANK[subj(x.subjId).diff]; br[bk(x)] = Math.min(br[bk(x)] ?? 9, r); });
  const ss = ss0.slice().sort((a, b) => (a.status === "todo") - (b.status === "todo") || br[bk(a)] - br[bk(b)] || (bk(a) < bk(b) ? -1 : bk(a) > bk(b) ? 1 : 0));
  let t = toMin(S.dayStart || "09:00");
  const cs = S.constraints.filter((c) => c.day === d);
  return ss.map((x) => {
    let moved = true;
    while (moved) { moved = false; for (const c of cs) { const a = toMin(c.start), b = toMin(c.end); if (t < b && t + x.mins > a) { t = b; moved = true; } } }
    const r = { x, a: t, w: t + workOf(x.mins), e: t + x.mins };
    t += x.mins;
    return r;
  });
}

/** Prévision de la semaine suivante : on fait « comme si » les créneaux prévus de la semaine en cours étaient faits. */
export function forecastNextWeek(S) {
  const N = structuredClone(S);
  const ws = N.plan.weekStart;
  N.plan.sessions.filter((x) => x.status === "todo" && x.chapId).sort((a, b) => a.day - b.day).forEach((x) => {
    const c = N.chapters.find((c) => c.id === x.chapId);
    if (c) { const v = { status: c.status, next: c.next, last: c.last }; advanceV(v, addDays(ws, x.day)); Object.assign(c, v); }
  });
  N.plan = null; N.timer = null;
  planWeek(N, addDays(ws, 7), { lock: false });
  return N;
}
