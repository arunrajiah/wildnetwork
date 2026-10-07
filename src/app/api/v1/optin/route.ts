import { hashIp } from "@/lib/auth";
import { sql } from "@/lib/db";
import { encryptToken, verifyToken, withdraw } from "@/lib/optin";

const LICENSES = ["CC-BY-4.0", "CC0-1.0"];
const PRECISIONS = [1, 10, 50];
const PER_IP_PER_DAY = 10;

/**
 * BirdWeather station opt-in. Body: { action: "join" | "withdraw", token, displayName?, license?, precisionKm?, inReleases?, contact?, consent }.
 * The token is checked with BirdWeather (read only), stored encrypted, and never returned or logged.
 */
export async function POST(req: Request) {
  let b: { action?: string; token?: string; displayName?: string; license?: string; precisionKm?: number; inReleases?: boolean; contact?: string; consent?: boolean };
  try { b = await req.json(); } catch { return Response.json({ error: "Body must be JSON." }, { status: 400 }); }
  const token = (b.token ?? "").trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(token)) return Response.json({ error: "That does not look like a BirdWeather station token." }, { status: 400 });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ipHash = hashIp("optin", ip);
  const [{ n }] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM bw_optin WHERE created_ip_hash = ${ipHash} AND created_at > now() - interval '1 day'`;
  if (n >= PER_IP_PER_DAY) return Response.json({ error: "Too many requests today. Please email arunrajiah@gmail.com." }, { status: 429 });

  let station;
  try { station = await verifyToken(token); } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return Response.json({ error: msg.includes("token not accepted") ? "BirdWeather did not accept that token. Please copy it again from your station's settings." : msg || "Could not check the token with BirdWeather. Please try again." }, { status: 400 });
  }

  if (b.action === "withdraw") {
    await withdraw(station.stationId);
    return Response.json({ ok: true, stationId: station.stationId, status: "withdrawn", message: "Withdrawn. The token is forgotten and this station's data has been deleted." });
  }

  if (b.consent !== true) return Response.json({ error: "Please confirm that you own or run this station and agree to share it." }, { status: 400 });
  const license = LICENSES.includes(b.license ?? "") ? b.license! : "CC-BY-4.0";
  const precision = PRECISIONS.includes(Number(b.precisionKm)) ? Number(b.precisionKm) : 10;
  const displayName = (b.displayName ?? "").trim().slice(0, 80) || null;
  const contact = (b.contact ?? "").trim().slice(0, 120) || null;
  await sql`
    INSERT INTO bw_optin (station_id, token_enc, display_name, station_type, lat, lon, precision_km, license, in_releases, contact, status, created_ip_hash)
    VALUES (${station.stationId}, ${encryptToken(token)}, ${displayName}, ${station.type}, ${station.lat}, ${station.lon}, ${precision}, ${license}, ${b.inReleases !== false}, ${contact}, 'active', ${ipHash})
    ON CONFLICT (station_id) DO UPDATE SET token_enc = EXCLUDED.token_enc, display_name = EXCLUDED.display_name, station_type = EXCLUDED.station_type,
      lat = EXCLUDED.lat, lon = EXCLUDED.lon, precision_km = EXCLUDED.precision_km, license = EXCLUDED.license, in_releases = EXCLUDED.in_releases,
      contact = EXCLUDED.contact, status = 'active', last_error = NULL`;
  return Response.json({
    ok: true, stationId: station.stationId, birdweatherName: station.name, status: "active",
    message: "Thank you. Your station's daily counts will start appearing within the hour, and its history back to a year over the following days.",
  });
}
