import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Client navigateur (clé publique). `null` si les variables d'environnement manquent. */
export const supabase = url && anon ? createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

/** Lit la ligne de l'utilisatrice ; la crée au premier passage. */
export async function loadOrCreatePlan(user, seed) {
  const { data, error } = await supabase.from("plans").select("state, ics_token").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  if (data) return data;
  const seedEmail = (process.env.NEXT_PUBLIC_SEED_EMAIL || "").trim().toLowerCase();
  const state = seed && seedEmail && user.email && user.email.toLowerCase() === seedEmail ? seed : null;
  const ins = await supabase.from("plans").insert({ user_id: user.id, state }).select("state, ics_token").single();
  if (ins.error) throw ins.error;
  return ins.data;
}

export function makeStore(user) {
  return {
    async load() {
      const { data, error } = await supabase.from("plans").select("state").eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      return data ? data.state : null;
    },
    async save(state) {
      const { error } = await supabase.from("plans").update({ state, updated_at: new Date().toISOString() }).eq("user_id", user.id);
      if (error) throw error;
    },
  };
}
