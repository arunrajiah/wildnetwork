import { sql } from "@/lib/db";
import { METHODS_VERSION, MIN_EFFORT_WEEK, OBSERVED } from "@/lib/methods";

export const revalidate = 3600;

/**
 * Where the data is good enough to use: each 5-degree cell, averaged over four weeks ending two weeks ago
 * (sightings reach GBIF a week or two late). A cell is watched by recordings at MIN_EFFORT_WEEK bird detections
 * a week, by sightings at OBSERVED.MIN_EFFORT_WEEK bird records a week. See /methods#coverage.
 */
export async function GET() {
  const rows = await sql<{ cell_lat: number; cell_lon: number; acoustic: number; observed: number; species: number }[]>`
    SELECT cell_lat, cell_lon,
           COALESCE(SUM(detections) FILTER (WHERE source_system = 'birdweather'), 0)::float / 4 AS acoustic,
           COALESCE(SUM(detections) FILTER (WHERE source_system = 'gbif'), 0)::float / 4 AS observed,
           MAX(species)::int AS species
    FROM effort_weekly_source
    WHERE grp = 'avian' AND week > CURRENT_DATE - 42 AND week <= CURRENT_DATE - 14
    GROUP BY 1, 2`;
  const cells = rows.map((r) => {
    const a = r.acoustic >= MIN_EFFORT_WEEK, o = r.observed >= OBSERVED.MIN_EFFORT_WEEK;
    return { lat: r.cell_lat, lon: r.cell_lon, acoustic: Math.round(r.acoustic), observed: Math.round(r.observed), status: a && o ? "both" : a ? "acoustic" : o ? "observed" : "thin" };
  });
  const count = (s: string) => cells.filter((c) => c.status === s).length;
  return Response.json({
    methods: METHODS_VERSION,
    thresholds: { acousticPerWeek: MIN_EFFORT_WEEK, observedPerWeek: OBSERVED.MIN_EFFORT_WEEK },
    summary: { both: count("both"), acoustic: count("acoustic"), observed: count("observed"), thin: count("thin") },
    cells,
  }, { headers: { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
