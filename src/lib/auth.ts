import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { sql } from "@/lib/db";

export function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateKey(): string {
  return `wn_${randomBytes(24).toString("base64url")}`;
}

export interface ApiKeyInfo {
  id: number;
  name: string;
  sourceSystem: string | null;
  deviceId: string | null;
}

/** Returns key info or null. Accepts "Authorization: Bearer <key>" or "X-Api-Key". */
export async function authenticate(req: Request): Promise<ApiKeyInfo | null> {
  const auth = req.headers.get("authorization");
  const raw = auth?.startsWith("Bearer ") ? auth.slice(7) : req.headers.get("x-api-key");
  if (!raw) return null;
  const rows = await sql<{ id: number; name: string; source_system: string | null; device_id: string | null }[]>`
    UPDATE api_keys SET last_used_at = now()
    WHERE key_hash = ${hashKey(raw)} AND revoked_at IS NULL
    RETURNING id, name, source_system, device_id
  `;
  const r = rows[0];
  return r ? { id: r.id, name: r.name, sourceSystem: r.source_system, deviceId: r.device_id } : null;
}

/**
 * Visitor addresses are never stored. Rate limits use a keyed hash: without the secret, the hash cannot be reversed
 * by trying every IPv4 address. The secret is IP_SALT, or CRON_SECRET when IP_SALT is not set.
 */
export function hashIp(scope: string, ip: string): string {
  const salt = process.env.IP_SALT ?? process.env.CRON_SECRET ?? "";
  return createHash("sha256").update(`${scope}:${salt}:${ip}`).digest("hex");
}

/** Cron routes: closed when CRON_SECRET is unset, constant-time comparison otherwise. */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(req.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
