import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { sql } from "@/lib/db";

/**
 * BirdWeather opt-in (see /stations/join): a station owner gives their station token; WildNetwork keeps it encrypted and uses it
 * only to read that station's own daily species counts, which may then go into open data releases under the owner's licence.
 */

const REST = "https://app.birdweather.com/api/v1";
const GQL = "https://app.birdweather.com/graphql";
const UA = "wildnetwork/0.1 (https://wildnetwork.arunrajiah.com; arunrajiah@gmail.com)";

const key = () => createHash("sha256").update(process.env.OPTIN_KEY ?? `optin:${process.env.CRON_SECRET ?? ""}`).digest();

export function encryptToken(token: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(token, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decryptToken(enc: string): string {
  const [iv, tag, data] = enc.split(".").map((s) => Buffer.from(s, "base64url"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}

async function rest<T>(token: string, path: string, params: Record<string, string> = {}): Promise<T> {
  const u = new URL(`${REST}/stations/${encodeURIComponent(token)}${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (r.status === 401 || r.status === 403 || r.status === 404) throw new Error("token not accepted by BirdWeather");
  if (!r.ok) throw new Error(`birdweather ${r.status}`);
  return (await r.json()) as T;
}

export interface StationInfo { stationId: number; name: string | null; type: string | null; lat: number | null; lon: number | null }

/** Check a token with BirdWeather and identify its station. Reads only; never posts. */
export async function verifyToken(token: string): Promise<StationInfo> {
  const j = await rest<{ success: boolean; detections: { stationId: number; lat: number; lon: number }[]; unfiltered_detections?: { stationId: number; lat: number; lon: number }[] }>(token, "/detections", { limit: "1" });
  const d = j.detections?.[0] ?? j.unfiltered_detections?.[0];
  if (!j.success || !d) throw new Error("this station has no detections yet, so it cannot be identified; try again once it has reported");
  // Public details from BirdWeather's own API: these already respect the owner's location privacy setting.
  let name: string | null = null, type: string | null = null, lat: number | null = d.lat, lon: number | null = d.lon;
  try {
    const g = await fetch(GQL, {
      method: "POST", headers: { "content-type": "application/json", "user-agent": UA },
      body: JSON.stringify({ query: `query($id: ID!) { station(id: $id) { name type coords { lat lon } } }`, variables: { id: String(d.stationId) } }),
      signal: AbortSignal.timeout(20_000),
    });
    const s = ((await g.json()) as { data?: { station?: { name: string; type: string; coords: { lat: number; lon: number } | null } } }).data?.station;
    if (s) { name = s.name; type = s.type; if (s.coords) { lat = s.coords.lat; lon = s.coords.lon; } }
  } catch { /* the token check above is what matters */ }
  return { stationId: d.stationId, name, type, lat, lon };
}

interface SpeciesRow { scientificName: string; commonName: string; classification: string | null; detections: { total: number; almostCertain: number } }

/** One day's species counts for a station (paged, 100 species a page). */
async function dayCounts(token: string, day: string): Promise<SpeciesRow[]> {
  const next = new Date(Date.parse(day) + 86400_000).toISOString().slice(0, 10);
  const out: SpeciesRow[] = [];
  for (let page = 1; page <= 10; page++) {
    const j = await rest<{ species: SpeciesRow[] }>(token, "/species", { from: day, to: next, limit: "100", page: String(page) });
    out.push(...(j.species ?? []));
    if ((j.species ?? []).length < 100) break;
  }
  return out;
}

/**
 * Keep each active station current: the last 2 days every run, then fill history backwards (up to a year) within the time budget.
 */
export async function refreshOptins(budgetMs = 120_000): Promise<{ stations: number; days: number; errors: number }> {
  const t0 = Date.now();
  const stations = await sql<{ station_id: number; token_enc: string; history_from: string | null }[]>`
    SELECT station_id, token_enc, history_from::text FROM bw_optin WHERE status = 'active' AND token_enc IS NOT NULL ORDER BY last_pull_at NULLS FIRST`;
  let days = 0, errors = 0;
  const today = new Date().toISOString().slice(0, 10);
  const minus = (d: string, n: number) => new Date(Date.parse(d) - n * 86400_000).toISOString().slice(0, 10);
  for (const s of stations) {
    if (Date.now() - t0 > budgetMs) break;
    let token: string;
    try { token = decryptToken(s.token_enc); } catch { errors++; continue; }
    const want = [today, minus(today, 1)];
    // History: 14 more days per run, back to one year.
    let from = s.history_from ?? minus(today, 1);
    for (let k = 0; k < 14 && from > minus(today, 365); k++) { from = minus(from, 1); want.push(from); }
    try {
      for (const day of want) {
        if (Date.now() - t0 > budgetMs) break;
        const rows = await dayCounts(token, day);
        if (rows.length) {
          await sql`
            INSERT INTO bw_optin_daily ${sql(rows.map((r) => ({ station_id: s.station_id, day, scientific_name: r.scientificName, common_name: r.commonName, classification: r.classification, count: r.detections.total, almost_certain: r.detections.almostCertain })))}
            ON CONFLICT (station_id, day, scientific_name) DO UPDATE SET count = EXCLUDED.count, almost_certain = EXCLUDED.almost_certain`;
        }
        days++;
        if (day < (s.history_from ?? today)) await sql`UPDATE bw_optin SET history_from = ${day} WHERE station_id = ${s.station_id}`;
      }
      await sql`UPDATE bw_optin SET last_pull_at = now(), last_error = NULL WHERE station_id = ${s.station_id}`;
    } catch (e) {
      errors++;
      const msg = e instanceof Error ? e.message : String(e);
      await sql`UPDATE bw_optin SET last_pull_at = now(), last_error = ${msg.slice(0, 300)} WHERE station_id = ${s.station_id}`;
      // A token the owner revoked at BirdWeather ends the opt-in, and its data is removed.
      if (msg.includes("token not accepted")) await withdraw(s.station_id);
    }
  }
  return { stations: stations.length, days, errors };
}

/** Withdraw: forget the token and delete the station's data. Releases already published keep the old copy; future ones leave it out. */
export async function withdraw(stationId: number): Promise<void> {
  await sql`DELETE FROM bw_optin_daily WHERE station_id = ${stationId}`;
  await sql`UPDATE bw_optin SET status = 'withdrawn', token_enc = NULL, contact = NULL, display_name = NULL, lat = NULL, lon = NULL WHERE station_id = ${stationId}`;
}

/** Round a coordinate so nothing finer than the owner's chosen precision is ever published. */
export function roundTo(v: number | null, km: number): number | null {
  if (v == null) return null;
  const step = km / 111;
  return Math.round(Math.round(v / step) * step * 1000) / 1000;
}
