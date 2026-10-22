// Cartes de révision : même logique que le planificateur par défaut d'Anki (SM-2, « v3 »), réécrite ici.
// - Nouvelle carte : étapes d'apprentissage 1 min → 10 min, puis 1 jour (Facile : 4 jours directement).
// - Carte apprise : l'intervalle est multiplié par sa « facilité » (2,5 au départ) ; Difficile ×1,2 ; Facile ×facilité×1,3.
// - Oubli (À revoir) : facilité −0,20, réapprentissage 10 min, puis 1 jour.
// - Une carte ratée pendant l'apprentissage revient toujours le lendemain (jamais 4 jours d'un coup).
// - Les journées changent à 4 h du matin, comme dans Anki.

export const CFG = { learn: [1, 10], relearn: [10], gradIvl: 1, easyIvl: 4, startEase: 2.5, minEase: 1.3, hardMult: 1.2, easyBonus: 1.3, lapseMult: 0, newPerDay: 20, maxIvl: 36500, learnAhead: 20 };
export const NEW = 0, LEARN = 1, REVIEW = 2, RELEARN = 3;
const MIN = 60000;

/** Jour « Anki » (bascule à 4 h) au format AAAA-MM-JJ. */
export function ankiDay(now = Date.now()) { const d = new Date(now - 4 * 3600e3); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
const addDays = (s, n) => { const z = new Date(s + "T12:00:00Z"); z.setUTCDate(z.getUTCDate() + n); return z.toISOString().slice(0, 10); };
const gapDays = (a, b) => Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 864e5);

export function newCard(chapId, subjId, q, a) {
  return { id: "k" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), chapId, subjId, q: q.trim(), a: (a || "").trim(), type: NEW, step: 0, due: null, ivl: 0, ease: CFG.startEase, reps: 0, lapses: 0, created: ankiDay() };
}

/** La carte est-elle à voir maintenant ? (révision : date passée ; apprentissage : heure passée, ou dans les 20 min) */
export function isDue(c, now = Date.now(), ahead = 0) {
  if (c.suspended) return false;
  if (c.type === LEARN || c.type === RELEARN) return c.due <= now + ahead;
  if (c.type === REVIEW) return c.due <= ankiDay(now);
  return false;
}

/** File du jour : apprentissage dû d'abord, puis révisions, puis nouvelles (dans la limite du jour). */
export function queue(cards, stats, { now = Date.now(), filter = null, ignoreLimits = false } = {}) {
  const pool = cards.filter((c) => !c.suspended && (!filter || filter(c)));
  const today = ankiDay(now);
  const newDone = stats && stats.d === today ? stats.n : 0;
  const learn = pool.filter((c) => (c.type === LEARN || c.type === RELEARN) && c.due <= now).sort((a, b) => a.due - b.due);
  const rev = pool.filter((c) => c.type === REVIEW && c.due <= today).sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
  const left = ignoreLimits ? Infinity : Math.max(0, CFG.newPerDay - newDone);
  const nw = pool.filter((c) => c.type === NEW).slice(0, left);
  const ahead = pool.filter((c) => (c.type === LEARN || c.type === RELEARN) && c.due > now && c.due <= now + CFG.learnAhead * MIN).sort((a, b) => a.due - b.due);
  return { learn, rev, nw, ahead, next: learn[0] || rev[0] || nw[0] || null, nextAhead: ahead[0] || null, counts: { n: nw.length, l: learn.length, r: rev.length } };
}

const clampIvl = (x) => Math.max(1, Math.min(CFG.maxIvl, Math.round(x)));

/** Ce que donnerait chaque bouton (1 À revoir, 2 Difficile, 3 Correct, 4 Facile), sans modifier la carte. */
export function preview(c, now = Date.now()) { return [1, 2, 3, 4].map((b) => answer({ ...c }, b, now)); }

/** Applique une réponse et renvoie la carte modifiée + un libellé lisible du prochain passage. */
export function answer(c, b, now = Date.now()) {
  const today = ankiDay(now);
  const learning = (steps) => {
    // b : 1 recommence, 2 répète l'étape (1re étape : moyenne des deux premières), 3 étape suivante, 4 sort de l'apprentissage
    if (b === 1) { c.failed = true; c.step = 0; c.due = now + steps[0] * MIN; return { mins: steps[0] }; }
    if (b === 2) { const d = c.step === 0 && steps.length > 1 ? (steps[0] + steps[1]) / 2 : steps[c.step]; c.due = now + d * MIN; return { mins: d }; }
    if (b === 3 && c.step + 1 < steps.length) { c.step += 1; c.due = now + steps[c.step] * MIN; return { mins: steps[c.step] }; }
    return null; // diplômée
  };
  c.reps = (c.reps || 0) + 1;
  if (c.type === NEW) c.type = LEARN, c.step = 0;
  if (c.type === LEARN) {
    const r = b === 4 ? null : learning(CFG.learn);
    if (r) return { card: c, label: lbl(r.mins) };
    // ratée pendant l'apprentissage : elle revient le lendemain, même avec « Facile »
    c.type = REVIEW; c.ivl = b === 4 && !c.failed ? CFG.easyIvl : CFG.gradIvl; c.due = addDays(today, c.ivl); c.step = 0; c.failed = false;
    return { card: c, label: lbl(c.ivl * 1440) };
  }
  if (c.type === RELEARN) {
    const r = b === 4 ? null : learning(CFG.relearn);
    if (r) return { card: c, label: lbl(r.mins) };
    c.type = REVIEW; if (b === 4 && !c.failed) c.ivl = clampIvl(c.ivl + 1); c.due = addDays(today, c.ivl); c.step = 0; c.failed = false;
    return { card: c, label: lbl(c.ivl * 1440) };
  }
  // révision
  const late = Math.max(0, gapDays(c.due, today)), ivl = c.ivl || 1;
  if (b === 1) {
    c.lapses = (c.lapses || 0) + 1; c.ease = Math.max(CFG.minEase, c.ease - 0.2);
    c.ivl = clampIvl(ivl * CFG.lapseMult); c.failed = false; c.type = RELEARN; c.step = 0; c.due = now + CFG.relearn[0] * MIN;
    return { card: c, label: lbl(CFG.relearn[0]) };
  }
  const hard = clampIvl(Math.max(ivl + 1, ivl * CFG.hardMult));
  const good = clampIvl(Math.max(hard + 1, (ivl + late / 2) * c.ease));
  const easy = clampIvl(Math.max(good + 1, (ivl + late) * c.ease * CFG.easyBonus));
  if (b === 2) { c.ivl = hard; c.ease = Math.max(CFG.minEase, c.ease - 0.15); }
  else if (b === 3) c.ivl = good;
  else { c.ivl = easy; c.ease += 0.15; }
  c.due = addDays(today, c.ivl);
  return { card: c, label: lbl(c.ivl * 1440) };
}

/** « <1 min », « 10 min », « 1 j », « 3 mois »… comme sous les boutons d'Anki. */
export function lbl(mins) {
  if (mins < 1) return "<1 min";
  if (mins < 60) return Math.round(mins) + " min";
  if (mins < 1440) return Math.round(mins / 60) + " h";
  const d = mins / 1440;
  if (d < 30) return Math.round(d) + " j";
  if (d < 365) return (Math.round((d / 30) * 10) / 10).toString().replace(".", ",") + " mois";
  return (Math.round((d / 365) * 10) / 10).toString().replace(".", ",") + " an";
}

/** Texte collé (par le tuteur ou à la main) → cartes. Une carte par ligne : « Question :: Réponse » (ou « Question ; Réponse »). */
export function parseCards(text) {
  return String(text || "").split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim()).filter(Boolean)
    .map((l) => { const m = l.split(/\s*(?:::|\t| ; | → )\s*/); return m.length >= 2 ? { q: m[0], a: m.slice(1).join(" ") } : null; })
    .filter((x) => x && x.q && x.a);
}

/** Petit état de la carte pour l'affichage. */
export const stateOf = (c) => (c.type === NEW ? "nouvelle" : c.type === LEARN || c.type === RELEARN ? "à apprendre" : c.ivl >= 21 ? "mûre" : "jeune");
