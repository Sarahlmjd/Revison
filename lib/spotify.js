// Spotify (Premium) : connexion PKCE + lecteur Web Playback SDK dans le navigateur (ordinateur).
// Les jetons restent sur cet appareil (localStorage), jamais sur le serveur.

const TOK = "sp-tok", VER = "sp-verifier", CID = "sp-client";
const SCOPES = "streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state playlist-read-private";
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} } };

export const redirectUri = () => location.origin + "/spotify";
export const clientId = () => ls.get(CID) || "";
export const setClientId = (id) => ls.set(CID, (id || "").trim() || null);
export const connected = () => !!ls.get(TOK);
export function disconnect() { ls.set(TOK, null); try { player && player.disconnect(); } catch {} player = null; deviceId = null; }

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export async function login() {
  const id = clientId(); if (!id) throw new Error("Client ID manquant");
  const rnd = crypto.getRandomValues(new Uint8Array(48)), verifier = b64url(rnd);
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  ls.set(VER, verifier);
  const q = new URLSearchParams({ client_id: id, response_type: "code", redirect_uri: redirectUri(), code_challenge_method: "S256", code_challenge: challenge, scope: SCOPES });
  location.href = "https://accounts.spotify.com/authorize?" + q;
}

async function tokenRequest(body) {
  const r = await fetch("https://accounts.spotify.com/api/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description || j.error || "Spotify a refusé la connexion");
  const old = JSON.parse(ls.get(TOK) || "{}");
  ls.set(TOK, JSON.stringify({ access: j.access_token, refresh: j.refresh_token || old.refresh, exp: Date.now() + (j.expires_in - 60) * 1000 }));
}
/** Page /spotify : échange du code contre les jetons. */
export async function handleCallback(params) {
  if (params.get("error")) throw new Error(params.get("error") === "access_denied" ? "Connexion annulée." : params.get("error"));
  await tokenRequest({ grant_type: "authorization_code", code: params.get("code"), redirect_uri: redirectUri(), client_id: clientId(), code_verifier: ls.get(VER) || "" });
  ls.set(VER, null);
}
export async function token() {
  const t = JSON.parse(ls.get(TOK) || "null"); if (!t) return null;
  if (Date.now() < t.exp) return t.access;
  await tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh, client_id: clientId() });
  return JSON.parse(ls.get(TOK)).access;
}
async function api(path, opt = {}) {
  const t = await token();
  const r = await fetch("https://api.spotify.com/v1" + path, { ...opt, headers: { Authorization: "Bearer " + t, "Content-Type": "application/json", ...(opt.headers || {}) } });
  if (r.status === 204) return null;
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error((j && j.error && j.error.message) || "Erreur Spotify " + r.status);
  return j;
}

let player = null, deviceId = null, readyP = null, onState = null, started = false;
export const onTrack = (cb) => (onState = cb);
/** Charge le SDK et crée le lecteur « Révisions » (à faire tôt pour pouvoir l'activer au clic). */
export function init(volume = 0.35) {
  if (readyP) return readyP;
  readyP = new Promise((res, rej) => {
    const make = () => {
      player = new window.Spotify.Player({ name: "Révisions", getOAuthToken: (cb) => token().then(cb).catch(() => cb("")), volume });
      player.addListener("ready", ({ device_id }) => { deviceId = device_id; res(); });
      player.addListener("not_ready", () => { deviceId = null; });
      ["initialization_error", "authentication_error", "account_error"].forEach((ev) => player.addListener(ev, ({ message }) => rej(new Error(ev === "account_error" ? "Spotify Premium est nécessaire." : message))));
      player.addListener("player_state_changed", (s) => { if (onState && s && s.track_window && s.track_window.current_track) { const t = s.track_window.current_track; onState({ name: t.name, artist: (t.artists[0] || {}).name, paused: s.paused }); } });
      player.connect();
    };
    if (window.Spotify && window.Spotify.Player) make();
    else { window.onSpotifyWebPlaybackSDKReady = make; if (!document.getElementById("spsdk")) { const s = document.createElement("script"); s.id = "spsdk"; s.src = "https://sdk.scdn.co/spotify-player.js"; document.head.appendChild(s); } }
  });
  readyP.catch(() => { readyP = null; });
  return readyP;
}
/** À appeler pendant le clic (autorise le son dans le navigateur). */
export function activate() { try { player && player.activateElement && player.activateElement(); } catch {} }

const playlistId = (u) => { const m = (u || "").match(/playlist[/:]([A-Za-z0-9]{22})/); return m ? m[1] : null; };
async function autoPlaylist() {
  const r = await api("/search?type=playlist&limit=10&q=" + encodeURIComponent("jazz instrumental study"));
  const p = ((r && r.playlists && r.playlists.items) || []).find((x) => x && x.owner && x.owner.id !== "spotify");
  return p ? p.id : null;
}
/** Lance (ou relance) la musique sur le lecteur de l'appli. */
export async function play(playlistUrl) {
  await init();
  if (started) { try { const s = await player.getCurrentState(); if (s) { await player.resume(); return; } } catch {} }
  const id = playlistId(playlistUrl) || (await autoPlaylist());
  if (!id) throw new Error("Aucune playlist trouvée");
  await api("/me/player/shuffle?state=true&device_id=" + deviceId, { method: "PUT" }).catch(() => {});
  await api("/me/player/play?device_id=" + deviceId, { method: "PUT", body: JSON.stringify({ context_uri: "spotify:playlist:" + id }) });
  started = true;
}
export async function pause() { try { player && (await player.pause()); } catch {} }
export async function next() { try { player && (await player.nextTrack()); } catch {} }
export async function setVolume(v) { try { player && (await player.setVolume(v)); } catch {} }
export const restart = () => { started = false; };
