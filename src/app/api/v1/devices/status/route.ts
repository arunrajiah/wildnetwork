import { authenticate } from "@/lib/auth";
import { sql } from "@/lib/db";
import { STATUS_KEEP_DAYS, STATUS_MIN_SECONDS } from "@/lib/devices";
import { validateStatus } from "@/lib/wdx/validate";

/**
 * Health reports (WDX device status) from a registered device. Auth: the device's own key. Body: one record or an array.
 * deviceId must be the key's device. The latest report is kept on the device; history is kept STATUS_KEEP_DAYS days,
 * at most one report per STATUS_MIN_SECONDS.
 */
export async function POST(req: Request) {
  const key = await authenticate(req);
  if (!key) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!key.deviceId) return Response.json({ error: "this key is not a device key: register the device at /api/v1/devices" }, { status: 403 });
  if (Number(req.headers.get("content-length") ?? 0) > 200_000) return Response.json({ error: "body too large" }, { status: 413 });
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: "body must be JSON" }, { status: 400 }); }
  const items = (Array.isArray(body) ? body : [body]).slice(0, 100);
  let stored = 0;
  const rejected: { index: number; errors: string[] }[] = [];
  for (const [index, item] of items.entries()) {
    const v = validateStatus(item);
    if (!v.ok) { rejected.push({ index, errors: v.errors ?? [] }); continue; }
    const st = item as { deviceId: string; at: string };
    if (st.deviceId !== key.deviceId) { rejected.push({ index, errors: [`deviceId must be ${key.deviceId}`] }); continue; }
    const at = new Date(st.at);
    if (Number.isNaN(at.getTime()) || at.getTime() > Date.now() + 3600_000) { rejected.push({ index, errors: ["at is not a valid past time"] }); continue; }
    await sql`UPDATE devices SET last_status = ${sql.json(item as never)}, last_status_at = ${at}
              WHERE id = ${key.deviceId} AND (last_status_at IS NULL OR last_status_at <= ${at})`;
    const r = await sql`
      INSERT INTO device_status (device_id, at, status)
      SELECT ${key.deviceId}, ${at}, ${sql.json(item as never)}
      WHERE NOT EXISTS (SELECT 1 FROM device_status WHERE device_id = ${key.deviceId}
                        AND at > ${at}::timestamptz - make_interval(secs => ${STATUS_MIN_SECONDS})
                        AND at < ${at}::timestamptz + make_interval(secs => ${STATUS_MIN_SECONDS}))
      ON CONFLICT DO NOTHING`;
    stored += r.count;
  }
  await sql`DELETE FROM device_status WHERE device_id = ${key.deviceId} AND at < now() - make_interval(days => ${STATUS_KEEP_DAYS})`;
  return Response.json({ received: items.length, stored, rejected: rejected.length, rejectedDetails: rejected.slice(0, 10) });
}
