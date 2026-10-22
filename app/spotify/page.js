"use client";
// Retour de la connexion Spotify : on échange le code puis on revient à l'appli.
import { useEffect, useState } from "react";
import { handleCallback } from "@/lib/spotify";

export default function SpotifyCallback() {
  const [msg, setMsg] = useState("Connexion à Spotify…");
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    handleCallback(p)
      .then(() => { setMsg("Spotify est connecté. Retour à l'appli…"); location.replace("/"); })
      .catch((e) => setMsg("Spotify n'a pas pu se connecter : " + (e.message || e) + " Retourne dans Réglages pour réessayer."));
  }, []);
  return (
    <div className="wrap" style={{ paddingTop: 60, maxWidth: 440 }}>
      <section className="panel"><h2>Spotify</h2><p className="muted">{msg}</p><a className="btn" href="/">Retour à l'appli</a></section>
    </div>
  );
}
