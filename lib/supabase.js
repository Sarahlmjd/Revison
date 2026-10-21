import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Client navigateur (clé publique). `null` si les variables d'environnement manquent. */
export const supabase = url && anon ? createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

/** Lit la ligne de l'utilisatrice ; la crée au premier passage. */
export async function loadOrCreatePlan(user, seed) {
  const { data, error } = await supabase.from("plans").select("state, ics_token, updated_at").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  if (data) return data;
  const seedEmail = (process.env.NEXT_PUBLIC_SEED_EMAIL || "").trim().toLowerCase();
  const state = seed && seedEmail && user.email && user.email.toLowerCase() === seedEmail ? seed : null;
  const ins = await supabase.from("plans").insert({ user_id: user.id, state }).select("state, ics_token, updated_at").single();
  if (ins.error) throw ins.error;
  return ins.data;
}

/**
 * Lecture / écriture de l'état. L'écriture est conditionnelle : elle échoue (conflict) si un autre appareil
 * a enregistré entre-temps, pour que l'appli fusionne au lieu d'écraser.
 */
export function makeStore(user) {
  return {
    async load() {
      const { data, error } = await supabase.from("plans").select("state, updated_at").eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      return data ? { state: data.state, at: data.updated_at } : null;
    },
    async save(state, expectedAt) {
      const at = new Date().toISOString();
      let q = supabase.from("plans").update({ state, updated_at: at }).eq("user_id", user.id);
      if (expectedAt) q = q.eq("updated_at", expectedAt);
      const { data, error } = await q.select("updated_at");
      if (error) throw error;
      if (!data || !data.length) { const e = new Error("conflict"); e.conflict = true; throw e; }
      return data[0].updated_at;
    },
  };
}
