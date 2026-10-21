"use client";
import { useEffect, useRef, useState } from "react";
import { supabase, loadOrCreatePlan, makeStore } from "@/lib/supabase";
import { startApp } from "@/lib/app";
import seed from "@/seed/initial-state.json";

export default function Page() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    if (!supabase) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!supabase) return <Notice title="Configuration manquante">Ajoute les variables NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY dans Vercel, puis redéploie (voir le README).</Notice>;
  if (session === undefined) return <Notice title="Chargement…" />;
  if (!session) return <Login />;
  return <AppShell user={session.user} />;
}

function Notice({ title, children }) {
  return (
    <div className="wrap" style={{ paddingTop: 40 }}>
      <section className="panel"><h2>{title}</h2>{children ? <p className="muted">{children}</p> : null}</section>
    </div>
  );
}

/* Connexion par code à 6 chiffres reçu par e-mail : fonctionne aussi dans l'appli installée sur l'iPhone,
   où un lien magique s'ouvrirait dans Safari au lieu de l'appli. */
function Login() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState("email");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendCode(e) {
    e.preventDefault(); setBusy(true); setMsg("");
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) setMsg("Envoi impossible : " + error.message);
    else { setStep("code"); setMsg("Code envoyé. Regarde tes e-mails (et les spams)."); }
  }
  async function verify(e) {
    e.preventDefault(); setBusy(true); setMsg("");
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) setMsg("Code incorrect ou expiré. Redemande un code.");
  }

  return (
    <div className="wrap" style={{ paddingTop: 40, maxWidth: 440 }}>
      <section className="panel">
        <h1>Mon plan de révision</h1>
        {step === "email" ? (
          <form onSubmit={sendCode} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label htmlFor="email" className="muted">Ton e-mail : tu reçois un code de connexion.</label>
            <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@exemple.fr" />
            <button className="btn primary" disabled={busy}>{busy ? "Envoi…" : "Recevoir mon code"}</button>
          </form>
        ) : (
          <form onSubmit={verify} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label htmlFor="code" className="muted">Code reçu à {email}</label>
            <input id="code" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" style={{ fontSize: "1.4rem", letterSpacing: ".3em", textAlign: "center" }} />
            <button className="btn primary" disabled={busy}>{busy ? "Vérification…" : "Me connecter"}</button>
            <button type="button" className="btn ghost" onClick={() => { setStep("email"); setCode(""); }}>Changer d'e-mail</button>
          </form>
        )}
        {msg ? <p className="muted" style={{ fontSize: ".9rem" }}>{msg}</p> : null}
      </section>
    </div>
  );
}

function AppShell({ user }) {
  const [error, setError] = useState("");
  const booted = useRef(false);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    (async () => {
      try {
        const row = await loadOrCreatePlan(user, seed);
        const icsUrl = `${window.location.origin}/api/ics/${row.ics_token}`;
        startApp({ initial: row.state, store: makeStore(user), icsUrl });
      } catch (e) {
        setError(e.message || String(e));
      }
    })();
  }, [user]);

  return (
    <>
      <div className="wrap">
        <div id="timer" className="timerbar" hidden></div>
        <header className="top">
          <div>
            <h1>Mon plan de révision</h1>
            <p className="sub muted">L2 psycho · Semestre 3 · <span id="saveState" className="save">chargement…</span></p>
          </div>
          <div className="budget" aria-live="polite">
            <div className="budget-row"><span>Réparti cette semaine</span><span className="mono" id="budgetTxt">–</span></div>
            <div className="bar"><i id="budgetBar" style={{ width: 0 }}></i></div>
            <div className="row-actions" style={{ justifyContent: "flex-end" }}>
              <button className="btn small" id="calBtn" type="button">📅 Calendrier</button>
              <button className="btn small ghost" type="button" onClick={() => supabase.auth.signOut().then(() => location.reload())}>Se déconnecter</button>
            </div>
          </div>
        </header>
        {error ? <div className="warn">Impossible de charger tes données : {error}</div> : null}
        <nav className="steps" id="steps" aria-label="Étapes"></nav>
        <main id="main"></main>
      </div>
      <div id="modal" className="modal" hidden></div>
    </>
  );
}
