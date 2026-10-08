import { generateKey, hashIp, hashKey } from "@/lib/auth";
import { sql } from "@/lib/db";
import { PER_IP_PER_DAY, SOURCES, clientIp, newDeviceId } from "@/lib/devices";

/**
 * Register a device (a WildNetwork Base, or any other recorder). Body: { name, model?, source?, hardwareId?, contact? }.
 * A Base (model "wildnetwork-base") pushes as source "wildnetwork-base". Returns the device id and a push key, shown once.
 * Shares the per-address daily limit with /api/v1/register.
 */
export async function POST(req: Request) {
  let b: { name?: string; model?: string; source?: string; hardwareId?: string; contact?: string };
  try { b = await req.json(); } catch { return Response.json({ error: "body must be JSON" }, { status: 400 }); }
  const name = (b.name ?? "").trim().slice(0, 80);
  const model = (b.model ?? "wildnetwork-base").trim().toLowerCase().slice(0, 40);
  const source = model === "wildnetwork-base" ? "wildnetwork-base" : (b.source ?? "").trim();
  if (name.length < 3) return Response.json({ error: "name must be at least 3 characters" }, { status: 400 });
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(model)) return Response.json({ error: "model must be letters, digits, dot, dash or underscore" }, { status: 400 });
  if (!SOURCES.includes(source)) return Response.json({ error: `source must be one of: ${SOURCES.join(", ")}` }, { status: 400 });

  const ipHash = hashIp("ip", clientIp(req));
  const [{ n }] = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM api_keys WHERE created_ip_hash = ${ipHash} AND created_at > now() - interval '1 day'`;
  if (n >= PER_IP_PER_DAY) return Response.json({ error: "too many registrations from this address today" }, { status: 429 });

  const id = newDeviceId();
  const key = generateKey();
  const contact = (b.contact ?? "").trim().slice(0, 120) || null;
  await sql.begin(async (tx) => {
    await tx`INSERT INTO devices (id, name, model, source_system, hardware_id, contact, created_ip_hash)
             VALUES (${id}, ${name}, ${model}, ${source}, ${(b.hardwareId ?? "").trim().slice(0, 64) || null}, ${contact}, ${ipHash})`;
    await tx`INSERT INTO api_keys (key_hash, name, source_system, created_ip_hash, contact, device_id)
             VALUES (${hashKey(key)}, ${name}, ${source}, ${ipHash}, ${contact}, ${id})`;
  });
  const u = (p: string) => new URL(p, req.url).toString();
  return Response.json({
    deviceId: id, apiKey: key, source, eventsEndpoint: u("/api/v1/events"), statusEndpoint: u("/api/v1/devices/status"),
    note: "Store this key now. It is not shown again.",
  });
}

/** Registered devices and their latest health report. No hardware ids, contacts or locations. */
export async function GET() {
  const rows = await sql`
    SELECT id, name, model, source_system, created_at, last_status, last_status_at FROM devices
    WHERE created_at > now() - interval '365 days' ORDER BY last_status_at DESC NULLS LAST, created_at DESC LIMIT 500`;
  return Response.json({
    devices: rows.map((d) => {
      const s = (d.last_status ?? {}) as Record<string, Record<string, unknown> | number | string | undefined>;
      return {
        id: d.id, name: d.name, model: d.model, source: d.source_system, registered: d.created_at, lastReport: d.last_status_at,
        battery: s.battery ?? null, storage: s.storage ?? null, temperatureC: s.temperatureC ?? null, network: s.network ?? null,
        queue: s.queue ?? null, software: s.software ?? null,
      };
    }),
  }, { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
