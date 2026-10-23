// Corrections ponctuelles demandées à Claude, appliquées une seule fois (suivies dans S.patched).
export const PATCHES = [
  { id: "2026-10-23-tcc-decouverte", run(S) { // TCC Ch.1 : plus aucun souvenir → retour en découverte
    const c = (S.chapters || []).find((k) => k.id === "ch17"); if (!c) return;
    Object.assign(c, { status: "decouverte", rappel: false, step: 0, next: "2026-10-23" });
    if (S.plan) { S.plan.sessions = S.plan.sessions.filter((x) => !(x.chapId === "ch17" && x.kind === "rappel" && x.status === "todo")); S.plan.lockedDay = null; }
    if (S.timer && /ch17/.test(S.timer.sid || "")) S.timer = null;
  } },
  { id: "2026-10-23-fatigue-25min", run(S) { // fatiguée : dernière séance du jour réduite à 25 min de travail (+5 min de pause)
    const x = S.plan && S.plan.sessions.find((k) => k.id === "p4-ch7-24");
    if (x && x.status === "todo") { x.mins = 30; x.blk = x.blk + "s"; if (S.timer && S.timer.sid === x.id) S.timer = null; }
  } },
  { id: "2026-10-23-rappel-3j", run(S) { if (S.plan) S.plan.lockedDay = null; } }, // limite des rappels passée à 3 jours : on recalcule la journée
];
