import { sql } from "@/lib/db";

export const revalidate = 300;

/** Coarse continent from a 5-degree cell, so centroid drift is never a mix of hemispheres. */
const REGION = sql`CASE
  WHEN cell_lon < -30 AND cell_lat >= 10 THEN 'North America'
  WHEN cell_lon < -30 THEN 'South America'
  WHEN cell_lon < 60 AND cell_lat >= 35 THEN 'Europe'
  WHEN cell_lon < 60 THEN 'Africa'
  WHEN cell_lon >= 110 AND cell_lat < -10 THEN 'Oceania'
  ELSE 'Asia' END`;

/**
 * What is happening right now, derived from species_daily.
 * - movers: species whose last complete day is far above/below their prior 7-day average
 * - drift: species whose detection-weighted centroid moved north/south over the last week
 * - arrivals: species seen in a cell for the first time in 10 days
 */
export async function GET() {
  const [movers, drift, arrivals, meta] = await Promise.all([
    sql`
      WITH d AS (
        SELECT scientific_name, MIN(vernacular_name) vernacular_name, day, SUM(count) n
        FROM species_daily WHERE day >= CURRENT_DATE - 8 AND day < CURRENT_DATE
        GROUP BY 1, 3
      ), last AS (SELECT * FROM d WHERE day = CURRENT_DATE - 1),
      base AS (SELECT scientific_name, AVG(n) avg_n, COUNT(*) days FROM d WHERE day < CURRENT_DATE - 1 GROUP BY 1)
      SELECT l.scientific_name, l.vernacular_name, l.n::int AS yesterday, ROUND(b.avg_n)::int AS avg7, (l.n / NULLIF(b.avg_n, 0)) AS ratio
      FROM last l JOIN base b USING (scientific_name)
      WHERE b.days >= 5 AND b.avg_n >= 100 AND l.n >= 100
      ORDER BY ABS(LN(l.n / NULLIF(b.avg_n, 0))) DESC
      LIMIT 12
    `,
    sql`
      WITH d AS (
        SELECT scientific_name, MIN(vernacular_name) vernacular_name, day, ${REGION} AS region,
               SUM(count) n, SUM(count * (cell_lat + 2.5)) / SUM(count) lat
        FROM species_daily WHERE day >= CURRENT_DATE - 10 AND day < CURRENT_DATE
        GROUP BY 1, 3, 4
      ), recent AS (SELECT scientific_name, region, MIN(vernacular_name) vernacular_name, SUM(n) n, SUM(n * lat) / SUM(n) lat FROM d WHERE day >= CURRENT_DATE - 3 GROUP BY 1, 2),
      earlier AS (SELECT scientific_name, region, SUM(n) n, SUM(n * lat) / SUM(n) lat FROM d WHERE day < CURRENT_DATE - 7 GROUP BY 1, 2)
      SELECT r.scientific_name, r.vernacular_name, r.region, ROUND((r.lat - e.lat)::numeric, 1) AS drift_deg, ROUND(r.lat::numeric, 1) AS lat_now, r.n::int AS n
      FROM recent r JOIN earlier e USING (scientific_name, region)
      WHERE r.n >= 300 AND e.n >= 300 AND ABS(r.lat - e.lat) >= 1
      ORDER BY ABS(r.lat - e.lat) DESC
      LIMIT 12
    `,
    sql`
      WITH recent AS (
        SELECT scientific_name, MIN(vernacular_name) vernacular_name, cell_lat, cell_lon, SUM(count) n
        FROM species_daily WHERE day >= CURRENT_DATE - 1 GROUP BY 1, 3, 4
      )
      SELECT r.scientific_name, r.vernacular_name, r.cell_lat, r.cell_lon, r.n::int AS n
      FROM recent r
      WHERE r.n >= 20 AND NOT EXISTS (
        SELECT 1 FROM species_daily p
        WHERE p.scientific_name = r.scientific_name AND p.cell_lat = r.cell_lat AND p.cell_lon = r.cell_lon
          AND p.day < CURRENT_DATE - 1 AND p.day >= CURRENT_DATE - 12
      )
      ORDER BY r.n DESC
      LIMIT 12
    `,
    sql`SELECT MIN(day)::text first_day, MAX(day)::text last_day, COUNT(DISTINCT scientific_name) species, SUM(count) detections FROM species_daily`,
  ]);
  return Response.json({
    coverage: { from: meta[0].first_day, to: meta[0].last_day, species: Number(meta[0].species), detections: Number(meta[0].detections) },
    movers: movers.map((r) => ({ scientificName: r.scientific_name, vernacularName: r.vernacular_name, yesterday: r.yesterday, avg7: r.avg7, ratio: Number(r.ratio) })),
    drift: drift.map((r) => ({ scientificName: r.scientific_name, vernacularName: r.vernacular_name, region: r.region, driftDeg: Number(r.drift_deg), latNow: Number(r.lat_now), n: r.n })),
    arrivals: arrivals.map((r) => ({ scientificName: r.scientific_name, vernacularName: r.vernacular_name, cellLat: r.cell_lat, cellLon: r.cell_lon, n: r.n })),
  });
}
