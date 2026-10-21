// Flux calendrier (.ics) : l'iPhone s'y abonne et récupère les créneaux tout seul.
import { createClient } from "@supabase/supabase-js";
import { planWeek, forecastNextWeek, dayLayout, addDays, todayIn, workOf, CST, KINDS } from "@/lib/planner";

export const dynamic = "force-dynamic";

const TZ = process.env.APP_TIMEZONE || "Europe/Paris";

/** Décalage (ms) du fuseau à un instant donné. */
function tzOffset(ts) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ts;
}
/** Heure locale (date + minutes depuis minuit) -> instant UTC au format iCalendar. */
function icsTime(date, minutes) {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  const ts = guess - tzOffset(guess - tzOffset(guess));
  return new Date(ts).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const fold = (line) => { const out = []; let s = line; while (Buffer.byteLength(s) > 74) { let i = 74; while (Buffer.byteLength(s.slice(0, i)) > 74) i--; out.push(s.slice(0, i)); s = " " + s.slice(i); } out.push(s); return out.join("\r\n"); };

export async function GET(_req, { params }) {
  const { token } = await params;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !/^[a-f0-9]{32,80}$/.test(token || "")) return new Response("Introuvable", { status: 404 });

  // Lecture par jeton via une fonction SQL dédiée (voir supabase/schema.sql) : aucune clé secrète nécessaire.
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data } = await db.rpc("plan_by_ics_token", { t: token });
  if (!data) return new Response("Introuvable", { status: 404 });

  const S = structuredClone(data);
  S.chapters = S.chapters || [];
  const today = todayIn(TZ);
  planWeek(S, today, { lock: false }); // ne fige rien : seule l'appli fige la journée
  const ws = S.plan.weekStart;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//plan-revision//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Plan de révision", "X-WR-TIMEZONE:" + TZ, "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"];

  const emit = (W, d, firm) => {
    const date = addDays(W.plan.weekStart, d);
    const subjW = (id) => W.subjects.find((s) => s.id === id);
    const chapW = (id) => W.chapters.find((c) => c.id === id);
    for (const { x, a, w } of dayLayout(W, d)) {
      if (x.status === "skipped" || x.status === "off") continue;
      const s = subjW(x.subjId), c = x.chapId && chapW(x.chapId);
      if (!s) continue;
      const kind = x.kind && KINDS[x.kind] ? KINDS[x.kind] : "";
      const done = x.status === "done" ? "✓ " : "";
      const title = `${done}📖 ${s.name}${c ? " · " + c.name : ""}${firm ? "" : " (prévu)"}`;
      const desc = [kind && kind[0].toUpperCase() + kind.slice(1), c ? "Étape actuelle : " + CST[c.status].t : "", `${workOf(x.mins)} min de travail puis pause.`, firm ? "" : "Prévision : peut encore changer selon ce que tu coches."].filter(Boolean).join("\n");
      lines.push("BEGIN:VEVENT", `UID:${date}-${x.id}@plan-revision`, `DTSTAMP:${stamp}`, `DTSTART:${icsTime(date, a)}`, `DTEND:${icsTime(date, w)}`,
        fold("SUMMARY:" + esc(title)), fold("DESCRIPTION:" + esc(desc)), "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + esc("C'est parti : " + s.name), "TRIGGER:PT0M", "END:VALARM",
        // fin du travail : sur iPhone le minuteur de l'appli s'arrête quand l'écran est verrouillé, le calendrier prend le relais
        "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + esc(`Fin de la quête ${s.name} : défi feuille blanche puis pause`), "TRIGGER;RELATED=END:PT0M", "END:VALARM", "END:VEVENT");
    }
  };

  // semaine en cours : aujourd'hui (figé) puis les jours suivants (prévus)
  for (let d = 0; d < 7; d++) {
    const date = addDays(ws, d);
    if (date < today) continue;
    emit(S, d, date === today || S.plan.lockedDay === date);
  }
  // semaine suivante : toujours en prévision
  const N = forecastNextWeek(S);
  for (let d = 0; d < 7; d++) emit(N, d, false);

  lines.push("END:VCALENDAR");
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store", "Content-Disposition": 'inline; filename="plan-revision.ics"' },
  });
}
