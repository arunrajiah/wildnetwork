import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

/** A pull or rollup older than this means the scheduler, the connectors or the database has stopped. */
const STALE_MINUTES = 45;

/**
 * Health check for uptime monitors: 200 when the database answers and data is still arriving, 503 otherwise.
 * Never cached. Says only what a monitor needs; no errors from connectors, no secrets.
 */
export async function GET() {
  const t0 = Date.now();
  try {
    const [row] = await sql<{ last_pull: string | null; last_event: string | null; size_mb: number }[]>`
      SELECT (SELECT MAX(last_run_at) FROM pull_state WHERE connector NOT LIKE '\\_%')::text AS last_pull,
             (SELECT MAX(received_at) FROM events)::text AS last_event,
             (pg_database_size(current_database()) / 1048576)::int AS size_mb`;
    const ms = Date.now() - t0;
    const pullAge = row.last_pull ? (Date.now() - Date.parse(row.last_pull)) / 60_000 : Infinity;
    const stale = pullAge > STALE_MINUTES;
    const body = {
      ok: !stale,
      checkedAt: new Date().toISOString(),
      database: { ok: true, ms, sizeMb: row.size_mb },
      lastPullAt: row.last_pull ? new Date(row.last_pull).toISOString() : null,
      lastEventAt: row.last_event ? new Date(row.last_event).toISOString() : null,
      stale,
      staleAfterMinutes: STALE_MINUTES,
    };
    return Response.json(body, { status: stale ? 503 : 200, headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false, checkedAt: new Date().toISOString(), database: { ok: false, ms: Date.now() - t0 } },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
}
