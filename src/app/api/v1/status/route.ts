import { after } from "next/server";
import { pullAll } from "@/lib/connectors";
import { sql } from "@/lib/db";
import { recomputePhenology } from "@/lib/phenology";
import { refreshRollups } from "@/lib/rollups";
import { BIRDWEATHER_PAUSED } from "@/lib/sources";

export const maxDuration = 300;

/** Live health: last connector runs and totals, for the top-bar status dot. */
export async function GET() {
  const [pulls, totals] = await Promise.all([
    sql`SELECT connector, last_run_at, last_count, last_error FROM pull_state WHERE connector NOT LIKE '!_%' ESCAPE '!' ${BIRDWEATHER_PAUSED ? sql`AND connector <> 'birdweather'` : sql``} ORDER BY connector`,
    sql`SELECT (SELECT COUNT(*) FROM events WHERE event_start > now() - interval '1 hour') AS events_1h,
               (SELECT COUNT(*) FROM deployments) AS sensors,
               (SELECT SUM(count) FROM species_daily) AS detections,
               (SELECT COUNT(DISTINCT scientific_name) FROM species_daily) AS species`,
  ]);
  const newest = pulls.reduce<number>((m, p) => Math.max(m, p.last_run_at ? new Date(p.last_run_at).getTime() : 0), 0);
  // Self-healing ingest: if no scheduler has pulled recently, a visit triggers one in the background.
  // The conditional UPDATE is the lock, so concurrent visitors start at most one pull.
  if (newest < Date.now() - 4 * 60_000) {
    after(async () => {
      const claimed = await sql`
        INSERT INTO pull_state (connector, last_run_at) VALUES ('_visit_lock', now())
        ON CONFLICT (connector) DO UPDATE SET last_run_at = now() WHERE pull_state.last_run_at < now() - interval '4 minutes'
        RETURNING connector`;
      if (claimed.length) await pullAll();
    });
  }
  // Hourly rollups ride on the same trigger, with their own lock, so any uptime pinger keeps insights fresh.
  after(async () => {
    const claimed = await sql`
      INSERT INTO pull_state (connector, last_run_at) VALUES ('_rollup_lock', now())
      ON CONFLICT (connector) DO UPDATE SET last_run_at = now() WHERE pull_state.last_run_at < now() - interval '55 minutes'
      RETURNING connector`;
    if (claimed.length) await refreshRollups();
    // Arrival dates are recomputed once a day from the weekly history.
    const daily = await sql`
      INSERT INTO pull_state (connector, last_run_at) VALUES ('_phenology_lock', now())
      ON CONFLICT (connector) DO UPDATE SET last_run_at = now() WHERE pull_state.last_run_at < now() - interval '23 hours'
      RETURNING connector`;
    if (daily.length) await recomputePhenology();
  });
  return Response.json({
    ask: process.env.ASK_ENABLED === "true" && !BIRDWEATHER_PAUSED,
    paused: BIRDWEATHER_PAUSED ? ["birdweather"] : [],
    live: newest > Date.now() - 15 * 60_000,
    lastPullAt: newest ? new Date(newest).toISOString() : null,
    connectors: pulls.map((p) => ({ name: p.connector, lastRunAt: p.last_run_at, lastCount: p.last_count, error: p.last_error })),
    events1h: Number(totals[0].events_1h), sensors: Number(totals[0].sensors), detections: Number(totals[0].detections ?? 0), species: Number(totals[0].species),
  });
}
