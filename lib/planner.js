// Logique de planification, sans DOM : utilisée par l'appli (navigateur) et par le flux calendrier (serveur).
// Toutes les dates sont des chaînes "AAAA-MM-JJ". `today` est toujours passé explicitement.

export const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
export const DIFF_RANK = { r: 0, y: 1, g: 2 };
export const DIFF_MULT = { r: 1.15, y: 1, g: 0.85 };
export const CST = {
  pas: { t: "Pas commencé", d: null, h: "pas encore ouvert" },
  decouverte: { t: "Découverte", d: 1, h: "pas encore compris : nouvelle séance d'explication dès que possible" },
  arevoir: { t: "À revoir", d: 1, h: "moins de 70 % : revu le lendemain" },
  apprentissage: { t: "Apprentissage", d: 3, h: "70 à 90 % : revu dans 3 à 7 jours" },
  maitrise: { t: "Maîtrisé", d: 15, h: "plus de 90 % sans hésiter : revu dans 15 à 30 jours" },
};
export const BLOCK = 60, PAUSE = 10, HALF = 30, RAPPEL = 10, ANKI_MIN = 25;
/** Partiels par défaut (modifiable dans Réglages). */
export const EXAM_DEFAULT = "2026-12-14";
/** Pomodoro : tranches de 25 min, petite pause de 5 min ; grande pause de 20 min après 2 h. */
export const POMO = 25, MINI = 5, BIG_AFTER = 120, BIG_PAUSE = 20;
/** Découpage du travail d'un créneau en Pomodoros (ex. 50 min → 25 + 25). */
export const segsOf = (w) => [w]; // une séance = un seul bloc de travail (50 min), sans coupure au milieu
/** Pause en fin de créneau, une fois les petites pauses internes déduites. */
export const endPauseOf = (m) => Math.max(0, m - workOf(m) - MINI * (segsOf(workOf(m)).length - 1));
/** Temps de travail d'un créneau : les créneaux courts (rappel 10 min, Anki 15 min) n'ont pas de pause. */
export const workOf = (m) => (m <= ANKI_MIN ? m : m <= HALF ? m - 5 : m - PAUSE * Math.max(1, Math.round(m / BLOCK)));
/** Au-delà de 3 jours sans voir le chapitre, plus de mini feuille blanche : on refait une séance de découverte. */
export const RAPPEL_MAX = 3;
export const KINDS = { quiz: "quiz 25 min", quick: "test rapide", relearn: "à réapprendre", disc: "suite de la découverte", new: "nouveau chapitre", ahead: "en avance", review: "révision", rappel: "rappel J+1 · mini feuille blanche", anki: "revue des cartes" };
/** Anki : une « matière » virtuelle, ouverte chaque jour de révision avant tout le reste. */
export const ANKI = "__anki";
const ANKI_SUBJ = { id: ANKI, name: "Cartes du jour", diff: "g", coef: 0 };
/** Écarts entre deux révisions réussies : J+1 (rappel), J+3, J+7, J+15, puis tous les mois. */
export const GAPS = [1, 2, 4, 8, 15, 30];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/**
 * Note une séance sur un chapitre et calcule sa prochaine révision.
 * 1re séance comprise → rappel J+1 de 10 min ; ensuite l'escalier J+3, J+7, J+15, puis mensuel,
 * corrigé par l'étape cochée (Découverte → dès que possible, À revoir → J+1, Apprentissage → 3 à 7 j, Maîtrisé → 15 à 30 j).
 * Jamais au-delà de l'avant-veille des partiels.
 */
export function grade(c, k, date, S) {
  const wasNew = c.status === "pas" || !(c.hist && c.hist.length);
  let gap, step = c.step || 0;
  if (k === "decouverte") { gap = 1; step = 0; c.rappel = false; }
  else if (wasNew) { gap = 1; step = 0; c.rappel = true; }
  else if (k === "arevoir") { gap = 1; step = 0; c.rappel = false; }
  else if (k === "apprentissage") { step += 1; gap = clamp(GAPS[Math.min(step, 5)], 2, 7); c.rappel = false; }
  else { step = Math.max(step + 1, 4); gap = clamp(GAPS[Math.min(step, 5)], 15, 30); c.rappel = false; }
  let next = addDays(date, gap);
  const ex = S && S.examStart;
  if (ex && next >= ex && date < addDays(ex, -2)) next = addDays(ex, -2);
  Object.assign(c, { status: k, last: date, next, step });
  c.revs = (c.revs || 0) + 1; (c.hist = c.hist || []).push(date);
  return c;
}

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
const subjOf = (S, id) => (id === ANKI ? ANKI_SUBJ : S.subjects.find((s) => s.id === id));
export { subjOf };
export const chaps = (S) => S.chapters || (S.chapters = []);
export const budget = (S) => S.avail.reduce((a, b) => a + b, 0);
export const subjW = (s) => (Number(s.coef) > 0 ? Number(s.coef) : 1) * DIFF_MULT[s.diff] * (s.master ? 1.3 : 1) * (s.exam ? 2 : 1) * (Number(s.prio) > 0 ? Number(s.prio) : 1);

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
  if (v.status === "pas") Object.assign(v, { status: "decouverte", next: addDays(date, 1), step: 0 });
  else if (v.status === "decouverte") Object.assign(v, { status: "arevoir", next: addDays(date, 1), step: 0 }); // découverte finie → quiz dès le lendemain
  else if (v.rappel) Object.assign(v, { rappel: false, step: 1, next: addDays(date, GAPS[1]) });
  else if (v.status === "maitrise") { v.step = Math.max((v.step || 0) + 1, 4); v.next = addDays(date, clamp(GAPS[Math.min(v.step, 5)], 15, 30)); }
  else { v.step = (v.step || 0) + 1; Object.assign(v, { status: "apprentissage", next: addDays(date, clamp(GAPS[Math.min(v.step, 5)], 2, 7)) }); }
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
  const V = {}; chaps(S).forEach((c) => (V[c.id] = { status: c.status, next: c.next, last: c.last, step: c.step || 0, rappel: !!c.rappel }));
  const live = chaps(S).filter((c) => subj(c.subjId) && subj(c.subjId).name.trim());
  const weekMins = {}; keep.forEach((x) => (weekMins[x.subjId] = (weekMins[x.subjId] || 0) + x.mins));
  const out = keep.slice();
  for (let d = td; d < 7; d++) {
    const date = addDays(ws, d);
    // Règle 4 : chaque jour de révision commence par 15 min de cartes (Anki), avant tout contenu nouveau.
    if (S.anki !== false && (S.cards || []).length && S.avail[d] > 0 && !out.some((x) => x.day === d && x.kind === "anki"))
      out.push({ id: "anki-" + d, subjId: ANKI, chapId: null, mins: ANKI_MIN, day: d, status: "todo", note: "", kind: "anki", blk: "a" + d });
    // Règles 1 et 5 : les rappels J+1 (10 min, mini feuille blanche) dus ou en retard passent avant tout le reste.
    const dayC0 = new Set(out.filter((x) => x.day === d).map((x) => x.chapId));
    // un rappel n'a de sens que si le chapitre a été vu il y a 7 jours ou moins : au-delà, on réapprend (séance complète)
    live.forEach((c) => { const v = V[c.id], ls = v.last || (c.hist || []).slice().sort().pop(); if (v.rappel && (!ls || dayGap(ls, date) > RAPPEL_MAX)) { v.rappel = false; if (!v.last) v.last = ls; } });
    live.filter((c) => V[c.id].rappel && V[c.id].next && V[c.id].next <= date && !dayC0.has(c.id))
      .sort((a, b) => (V[a.id].next < V[b.id].next ? -1 : 1))
      .forEach((c) => { out.push({ id: "r" + d + "-" + c.id, subjId: c.subjId, chapId: c.id, mins: RAPPEL, day: d, status: "todo", note: "", kind: "rappel", blk: "r" + d + c.id }); advanceV(V[c.id], date); });
    const dayS = new Set(out.filter((x) => x.day === d && x.subjId !== ANKI).map((x) => x.subjId));
    const dayC = new Set(out.filter((x) => x.day === d).map((x) => x.chapId));
    let free = S.avail[d] - out.filter((x) => x.day === d).reduce((t, x) => t + x.mins, 0);
    // Méthode : d'abord COUVRIR le programme (découvertes), puis CONSOLIDER par des quiz courts.
    // À partir de 13 jours avant les partiels : plus de nouveau chapitre, uniquement des quiz.
    const exam = S.examStart || EXAM_DEFAULT, revMode = date >= addDays(exam, -13);
    const push = (c, mins, kind) => {
      out.push({ id: "p" + d + "-" + c.id + "-" + out.length, subjId: c.subjId, chapId: c.id, mins, day: d, status: "todo", note: "", kind, blk: "b" + d + "-" + out.length });
      advanceV(V[c.id], date); dayS.add(c.subjId); dayC.add(c.id); free -= mins; weekMins[c.subjId] = (weekMins[c.subjId] || 0) + mins;
    };
    const pickDisc = () => {
      let best = null;
      const take = (c, kind, sc) => { if (!best || sc > best.sc) best = { c, kind, sc }; };
      live.forEach((c) => {
        const v = V[c.id], s = subj(c.subjId); if (dayC.has(c.id) || v.rappel) return;
        const same = dayS.has(c.subjId) ? 0.3 : 1;
        if (v.status === "decouverte") take(c, "disc", 1e3 * subjW(s) * same); // finir ce qui est commencé
      });
      if (!best && !revMode) S.subjects.filter((s) => s.name.trim()).forEach((s) => {
        const cs = live.filter((c) => c.subjId === s.id);
        if (!cs.length || cs.some((c) => V[c.id].status === "decouverte")) return; // un seul chapitre en découverte par matière
        const n = cs.find((c) => V[c.id].status === "pas" && !dayC.has(c.id)); if (!n) return;
        const left = cs.filter((c) => V[c.id].status === "pas").length;
        take(n, "new", (subjW(s) * left / cs.length) * (dayS.has(s.id) ? 0.3 : 1) / (1 + (weekMins[s.id] || 0) / 120));
      });
      return best;
    };
    // 1) découvertes : 2 blocs par jour en semaine (1 si la journée est courte)
    for (let k = 0, max = S.avail[d] >= 150 ? 2 : 1; k < max && free >= BLOCK; k++) { const p = pickDisc(); if (!p) break; push(p.c, BLOCK, p.kind); }
    // 2) quiz de 25 min sur les chapitres dus — priorité à ceux découverts cette semaine
    while (free >= HALF) {
      let best = null;
      live.forEach((c) => {
        const v = V[c.id], s = subj(c.subjId);
        if (dayC.has(c.id) || v.rappel || v.status === "pas" || v.status === "decouverte") return;
        const due = v.next && v.next <= date; if (!due && !revMode) return;
        const recent = v.last && dayGap(v.last, date) <= 7 ? 3 : 1;
        const od = due ? 1 + Math.log2(dayGap(v.next, date) + 1) : 0.5 + (v.last ? dayGap(v.last, date) / 7 : 2);
        const sc = subjW(s) * recent * od * (dayS.has(c.subjId) ? 0.3 : 1);
        if (!best || sc > best.sc) best = { c, sc };
      });
      if (!best) break;
      push(best.c, HALF, "quiz");
    }
    // 3) s'il reste un créneau d'1 h sans quiz à faire : une découverte de plus
    while (free >= BLOCK) { const p = pickDisc(); if (!p) break; push(p.c, BLOCK, p.kind); }
  }
  S.plan.sessions = out;
  if (lock) S.plan.lockedDay = today;
  return S.plan;
}

/** Créneaux d'un jour, dans l'ordre d'affichage, avec leurs horaires (minutes depuis minuit). */
export function dayLayout(S, d, { from = null } = {}) {
  const subj = (id) => subjOf(S, id);
  const ss0 = S.plan.sessions.filter((x) => x.day === d && subj(x.subjId));
  const bk = (x) => x.blk || x.id, br = {};
  ss0.forEach((x) => { const r = DIFF_RANK[subj(x.subjId).diff]; br[bk(x)] = Math.min(br[bk(x)] ?? 9, r); });
  const pri = (x) => (x.kind === "anki" ? -2 : x.kind === "rappel" ? -1 : br[bk(x)]); // Anki d'abord, puis les rappels
  const ss = ss0.slice().sort((a, b) => (a.status === "todo") - (b.status === "todo") || pri(a) - pri(b) || (bk(a) < bk(b) ? -1 : bk(a) > bk(b) ? 1 : 0));
  let t = toMin(S.dayStart || "09:00");
  const cs = S.constraints.filter((c) => c.day === d);
  let run = 0; // minutes enchaînées depuis la dernière vraie coupure
  return ss.map((x) => {
    if (from != null && x.status === "todo" && t < from) { t = Math.ceil(from / 5) * 5; run = 0; } // aujourd'hui : rien avant l'heure actuelle
    let gp = false;
    if (run >= BIG_AFTER) { t += BIG_PAUSE; run = 0; gp = true; } // grande pause après ~2 h (4 Pomodoros)
    let moved = true;
    while (moved) { moved = false; for (const c of cs) { const a = toMin(c.start), b = toMin(c.end); if (t < b && t + x.mins > a) { t = b; moved = true; run = 0; gp = false; } } }
    const r = { x, a: t, w: t + workOf(x.mins), e: t + x.mins, gp };
    t += x.mins; run += x.mins;
    return r;
  });
}

/** Prévision de la semaine suivante : on fait « comme si » les créneaux prévus de la semaine en cours étaient faits. */
export function forecastNextWeek(S) {
  const N = structuredClone(S);
  const ws = N.plan.weekStart;
  N.plan.sessions.filter((x) => x.status === "todo" && x.chapId).sort((a, b) => a.day - b.day).forEach((x) => {
    const c = N.chapters.find((c) => c.id === x.chapId);
    if (c) { const v = { status: c.status, next: c.next, last: c.last, step: c.step || 0, rappel: !!c.rappel }; advanceV(v, addDays(ws, x.day)); Object.assign(c, v); }
  });
  N.plan = null; N.timer = null;
  planWeek(N, addDays(ws, 7), { lock: false });
  return N;
}
