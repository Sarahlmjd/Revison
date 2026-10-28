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
  { id: "2026-10-23-fatigue", run(S) { // fatiguée : on s'arrête après psycho cognitive, la séance de stats est replanifiée plus tard
    if (S.plan && S.plan.weekStart === "2026-10-19") S.plan.sessions = S.plan.sessions.filter((x) => !(x.id === "p4-ch19-25" && x.status === "todo"));
  } },
  { id: "2026-10-23-rappel-3j", run(S) { if (S.plan) S.plan.lockedDay = null; } }, // limite des rappels passée à 3 jours : on recalcule la journée
  { id: "2026-10-24-replan", run(S) { if (S.plan) S.plan.lockedDay = null; } }, // créneaux de 30 min récupérés : on recalcule la journée
  { id: "2026-10-25-semaine-realiste", run(S) { // bilan de la semaine : 3 h en semaine, 1 h 30 samedi, dimanche libre ; chapitres vus il y a un mois → découverte
    S.avail = [180, 180, 180, 180, 180, 90, 0];
    // Stats CM/TD 1 : à refaire (base de CM/TD 2) ; Systémique Ch.1 : repart « à commencer », il sera rouvert une fois TCC Ch.1 fini (un seul chapitre en découverte par matière)
    const ch = (id) => (S.chapters || []).find((k) => k.id === id);
    if (ch("ch19")) Object.assign(ch("ch19"), { status: "decouverte", rappel: false, step: 0, next: "2026-10-26" });
    if (ch("ch16")) Object.assign(ch("ch16"), { status: "pas", rappel: false, step: 0, next: null });
    // ses priorités : Neuro > Psy dev > Cognitive > Méthodo, Stats > Sociale, Psychopatho (jamais à zéro)
    const PR = { jys3ygz: 2.3, "2sr2k7u": 1.2, p5nm4a9: 1.1, "2k4cj4o": 1.6, tn4wiv2: 1.6, v7bujfw: 0.75, "39womm4": 0.75 };
    for (const sj of S.subjects || []) if (PR[sj.id]) sj.prio = PR[sj.id];
    if (S.plan) S.plan.lockedDay = null;
  } },
  { id: "2026-10-25-stats-td3", run(S) { // Stats : les 3 CM sont vus, c'est de la pratique → CM/TD 1 en entraînement espacé, TD 3 en cours (priorité : le finir)
    const ch = (id) => (S.chapters || []).find((k) => k.id === id);
    if (ch("ch19")) Object.assign(ch("ch19"), { status: "apprentissage", rappel: false, step: 1, next: "2026-11-02" });
    if (ch("n23")) Object.assign(ch("n23"), { status: "decouverte", rappel: false, step: 0, next: "2026-10-26", last: ch("n23").last || "2026-10-25", hist: ch("n23").hist && ch("n23").hist.length ? ch("n23").hist : ["2026-10-25"] });
    if (S.plan) S.plan.lockedDay = null;
  } },
  { id: "2026-10-26-stats-td3-maintenant", run(S) { // la 2e séance de Stats du jour devient la suite du TD 3, à faire tout de suite
    const x = S.plan && S.plan.weekStart === "2026-10-26" && S.plan.sessions.find((k) => k.id === "p0-ch20-3");
    if (x && x.status === "todo") Object.assign(x, { chapId: "n23", kind: "disc", blk: "a0z" });
  } },
  { id: "2026-10-28-cartes-cours-hier", run(S) { // les cartes des cours d'hier (Cognitive, Petite enfance 3/4) dès aujourd'hui
    if (S.cardStats && S.cardStats.d === "2026-10-28") S.cardStats.n = Math.min(S.cardStats.n || 0, 5);
  } },
];
