import { generateKey, hashKey, hashIp } from "@/lib/auth";
import { sql } from "@/lib/db";

const SOURCES = ["birdnet-pi", "birdnet-go", "birdecho", "speciesnet", "batdetect2", "megadetector", "wildecho-api", "speciesnet-studio", "animl", "frigate", "other"];
const PER_IP_PER_DAY = 5;

/**
 * Self-serve device registration. Body: { name, source, contact? }.
 * Returns an API key (shown once) restricted to that source system. Rate limited per IP.
 */
export async function POST(req: Request) {
  let body: { name?: string; source?: string; contact?: string };
  try { body = await req.json(); } catch { return Response.json({ error: "body must be JSON" }, { status: 400 }); }
  const name = (body.name ?? "").trim().slice(0, 80);
  const source = (body.source ?? "").trim();
  if (name.length < 3) return Response.json({ error: "name must be at least 3 characters" }, { status: 400 });
  if (!SOURCES.includes(source)) return Response.json({ error: `source must be one of: ${SOURCES.join(", ")}` }, { status: 400 });

  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const ipHash = hashIp("ip", ip);
  const [{ n }] = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM api_keys WHERE created_ip_hash = ${ipHash} AND created_at > now() - interval '1 day'`;
  if (n >= PER_IP_PER_DAY) return Response.json({ error: "too many registrations from this address today" }, { status: 429 });

  const key = generateKey();
  await sql`INSERT INTO api_keys (key_hash, name, source_system, created_ip_hash, contact)
            VALUES (${hashKey(key)}, ${name}, ${source}, ${ipHash}, ${(body.contact ?? "").trim().slice(0, 120) || null})`;
  return Response.json({ apiKey: key, source, endpoint: new URL("/api/v1/events", req.url).toString(), note: "Store this key now. It is not shown again." });
}
