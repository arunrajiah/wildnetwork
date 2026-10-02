import { sql } from "@/lib/db";
import { ingestEvents } from "@/lib/wdx/ingest";
import { validateWdx } from "@/lib/wdx/validate";
import { birdweather } from "./birdweather";
import { inaturalist } from "./inaturalist";
import { BIRDWEATHER_PAUSED } from "@/lib/sources";
import type { PullConnector } from "./types";

export const connectors: Record<string, PullConnector> = BIRDWEATHER_PAUSED ? { inaturalist } : { birdweather, inaturalist };

export interface RunResult {
  connector: string;
  pulled: number;
  inserted: number;
  updated: number;
  invalid: number;
  cursor: string | null;
  error?: string;
}

export async function runConnector(c: PullConnector): Promise<RunResult> {
  const [state] = await sql<{ cursor: string | null }[]>`SELECT cursor FROM pull_state WHERE connector = ${c.name}`;
  try {
    const { events, cursor } = await c.pull(state?.cursor ?? null);
    const valid = events.filter((e) => validateWdx(e).ok);
    const r = await ingestEvents(valid, { keepRaw: false });
    await sql`
      INSERT INTO pull_state (connector, cursor, last_run_at, last_count, last_error)
      VALUES (${c.name}, ${cursor}, now(), ${r.received}, NULL)
      ON CONFLICT (connector) DO UPDATE SET cursor = EXCLUDED.cursor, last_run_at = now(), last_count = EXCLUDED.last_count, last_error = NULL
    `;
    return { connector: c.name, pulled: events.length, inserted: r.inserted, updated: r.updated, invalid: events.length - valid.length, cursor };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await sql`
      INSERT INTO pull_state (connector, last_run_at, last_error) VALUES (${c.name}, now(), ${msg})
      ON CONFLICT (connector) DO UPDATE SET last_run_at = now(), last_error = EXCLUDED.last_error
    `;
    return { connector: c.name, pulled: 0, inserted: 0, updated: 0, invalid: 0, cursor: state?.cursor ?? null, error: msg };
  }
}

/**
 * Storage budget: raw events are only a live window. History lives in the rollup tables.
 * BirdWeather 3 hours, other pulled sources 7 days, device pushes 30 days, daily rollups 28 days.
 * Sized for Neon's free 512 MB: about 225 MB weekly history, 125 MB daily, 15 MB live events (500 newest BirdWeather detections per pull).
 */
export async function prune(): Promise<void> {
  // Bats are sparse and nocturnal, so they stay for a day; everything else from BirdWeather for 3 hours.
  await sql`DELETE FROM events e WHERE e.source_system = 'birdweather' AND e.event_start < now() - interval '3 hours'
    AND (e.event_start < now() - interval '24 hours' OR NOT EXISTS (SELECT 1 FROM species_group g WHERE g.scientific_name = e.scientific_name AND g.grp = 'bat'))`;
  await sql`DELETE FROM events WHERE source_system = 'inaturalist' AND event_start < now() - interval '7 days'`;
  await sql`DELETE FROM events WHERE source_system NOT IN ('birdweather', 'inaturalist') AND event_start < now() - interval '30 days'`;
  await sql`DELETE FROM species_daily WHERE day < CURRENT_DATE - 28`;
}

export async function pullAll(only?: string | null): Promise<RunResult[]> {
  const targets = Object.values(connectors).filter((c) => !only || c.name === only);
  const results = await Promise.all(targets.map(runConnector));
  await prune();
  return results;
}
