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

/* Connexion par e-mail + mot de passe : fonctionne aussi dans l'appli installée sur l'iPhone. */
function Login() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault(); setBusy(true); setMsg("");
    if (mode === "signup") {
      const owner = (process.env.NEXT_PUBLIC_SEED_EMAIL || "").trim().toLowerCase();
      if (owner && email.trim().toLowerCase() !== owner) { setBusy(false); return setMsg("Les inscriptions sont fermées : cette appli est privée."); }
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: pwd, options: { emailRedirectTo: window.location.origin } });
      setBusy(false);
      if (error) return setMsg(traduire(error.message));
      if (!data.session) { setMode("login"); setMsg("Compte créé. Ouvre l'e-mail de Supabase et appuie sur le lien de confirmation (même s'il affiche une page d'erreur, c'est bon), puis reviens ici et connecte-toi."); }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pwd });
      setBusy(false);
      if (error) setMsg(traduire(error.message));
    }
  }

  return (
    <div className="wrap login" style={{ paddingTop: 40, maxWidth: 440 }}>
      <p className="kicker">L2 PSYCHO · SEMESTRE 3</p>
      <h1 className="mega">RÉVI<span>S</span>IONS</h1>
      <section className="panel">
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label htmlFor="email" className="muted">E-mail</label>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@exemple.fr" />
          <label htmlFor="pwd" className="muted">Mot de passe {mode === "signup" ? "(6 caractères minimum)" : ""}</label>
          <input id="pwd" type="password" required minLength={6} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={pwd} onChange={(e) => setPwd(e.target.value)} />
          <button className="btn primary big" disabled={busy}>{busy ? "UN INSTANT…" : mode === "signup" ? "CRÉER MON COMPTE" : "JOUER"}</button>
          <button type="button" className="btn ghost" onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setMsg(""); }}>
            {mode === "signup" ? "J'ai déjà un compte" : "Première fois ? Créer mon compte"}
          </button>
        </form>
        {msg ? <p className="muted" style={{ fontSize: ".9rem" }}>{msg}</p> : null}
      </section>
    </div>
  );
}

function traduire(m) {
  if (/Invalid login credentials/i.test(m)) return "E-mail ou mot de passe incorrect.";
  if (/Email not confirmed/i.test(m)) return "Confirme d'abord ton compte avec le lien reçu par e-mail.";
  if (/already registered/i.test(m)) return "Ce compte existe déjà : connecte-toi.";
  if (/Inscriptions fermées|Database error saving new user/i.test(m)) return "Les inscriptions sont fermées : cette appli est privée.";
  if (/at least 6/i.test(m)) return "Le mot de passe doit faire au moins 6 caractères.";
  return m;
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
        startApp({ initial: row.state, initialAt: row.updated_at, store: makeStore(user), icsUrl, onSignOut: () => supabase.auth.signOut().then(() => location.reload()) });
      } catch (e) {
        setError(e.message || String(e));
      }
    })();
  }, [user]);

  return (
    <>
      <div className="wrap app">
        <header className="appbar">
          <h1>Mon plan de révision</h1>
          <span id="saveState" className="save muted">chargement…</span>
        </header>
        {error ? <div className="warn">Impossible de charger tes données : {error}</div> : null}
        <main id="main"><div className="skeleton" aria-hidden="true"><i></i><i></i><i></i></div></main>
      </div>
      <nav id="tabs" className="tabs" aria-label="Navigation"></nav>
      <div id="timer" hidden></div>
      <div id="modal" className="modal" hidden></div>
    </>
  );
}

