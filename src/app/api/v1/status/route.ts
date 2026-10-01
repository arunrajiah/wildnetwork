import { sql } from "@/lib/db";

/** Live health: last connector runs and totals, for the top-bar status dot. */
export async function GET() {
  const [pulls, totals] = await Promise.all([
    sql`SELECT connector, last_run_at, last_count, last_error FROM pull_state ORDER BY connector`,
    sql`SELECT (SELECT COUNT(*) FROM events WHERE event_start > now() - interval '1 hour') AS events_1h,
               (SELECT COUNT(*) FROM deployments) AS sensors,
               (SELECT SUM(count) FROM species_daily) AS detections,
               (SELECT COUNT(DISTINCT scientific_name) FROM species_daily) AS species`,
  ]);
  const newest = pulls.reduce<number>((m, p) => Math.max(m, p.last_run_at ? new Date(p.last_run_at).getTime() : 0), 0);
  return Response.json({
    live: newest > Date.now() - 15 * 60_000,
    lastPullAt: newest ? new Date(newest).toISOString() : null,
    connectors: pulls.map((p) => ({ name: p.connector, lastRunAt: p.last_run_at, lastCount: p.last_count, error: p.last_error })),
    events1h: Number(totals[0].events_1h), sensors: Number(totals[0].sensors), detections: Number(totals[0].detections ?? 0), species: Number(totals[0].species),
  });
}
