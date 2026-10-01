import { sql } from "@/lib/db";
import { METHODS_VERSION, MIN_CELL_DETECTIONS, MIN_EFFORT_DAY, REGION } from "@/lib/methods";

export const revalidate = 300;

/**
 * What is changing, effort corrected. See /methods for the definitions.
 * Every measure uses a species' share of all detections in a cell, never its raw count,
 * so more stations or more uptime in a cell does not look like more birds.
 */
export async function GET() {
  const [movers, drift, arrivals, meta] = await Promise.all([
    // Surging and fading: global share of detections yesterday against the mean share of the 7 days before.
    sql`
      WITH e AS (
        SELECT day, SUM(detections)::float AS tot FROM effort_daily
        WHERE day >= CURRENT_DATE - 8 AND day < CURRENT_DATE AND detections >= ${MIN_EFFORT_DAY} GROUP BY 1
      ), d AS (
        SELECT sd.scientific_name, MIN(sd.vernacular_name) AS vernacular_name, sd.day, SUM(sd.count) AS n
        FROM species_daily sd JOIN effort_daily ef USING (day, cell_lat, cell_lon)
        WHERE sd.day >= CURRENT_DATE - 8 AND sd.day < CURRENT_DATE AND ef.detections >= ${MIN_EFFORT_DAY}
        GROUP BY 1, 3
      ), s AS (SELECT d.*, d.n / e.tot AS share FROM d JOIN e USING (day)),
      last AS (SELECT * FROM s WHERE day = CURRENT_DATE - 1),
      base AS (SELECT scientific_name, AVG(share) AS share, AVG(n) AS avg_n, COUNT(*) AS days FROM s WHERE day < CURRENT_DATE - 1 GROUP BY 1)
      SELECT l.scientific_name, l.vernacular_name, l.n::int AS yesterday, ROUND(b.avg_n)::int AS avg7, l.share / NULLIF(b.share, 0) AS ratio
      FROM last l JOIN base b USING (scientific_name)
      WHERE b.days >= 5 AND b.avg_n >= 100 AND l.n >= 100
      ORDER BY ABS(LN(l.share / NULLIF(b.share, 0))) DESC
      LIMIT 12
    `,
    // Moving: shift of the share-weighted range centre within one continent, last 3 days against days 8 to 10 ago,
    // using only cells observed in both periods.
    sql`
      WITH obs AS (
        SELECT scientific_name, MIN(vernacular_name) AS vernacular_name, cell_lat, cell_lon,
               (day >= CURRENT_DATE - 3) AS recent, SUM(count) AS n
        FROM species_daily
        WHERE day < CURRENT_DATE AND (day >= CURRENT_DATE - 3 OR (day >= CURRENT_DATE - 10 AND day < CURRENT_DATE - 7))
        GROUP BY 1, 3, 4, 5
        HAVING SUM(count) >= ${MIN_CELL_DETECTIONS}
      ), eff AS (
        SELECT cell_lat, cell_lon,
               SUM(detections) FILTER (WHERE day >= CURRENT_DATE - 3)::float AS e_recent,
               SUM(detections) FILTER (WHERE day < CURRENT_DATE - 7)::float AS e_earlier
        FROM effort_daily
        WHERE day < CURRENT_DATE AND (day >= CURRENT_DATE - 3 OR (day >= CURRENT_DATE - 10 AND day < CURRENT_DATE - 7))
        GROUP BY 1, 2
        HAVING COALESCE(SUM(detections) FILTER (WHERE day >= CURRENT_DATE - 3), 0) >= ${3 * MIN_EFFORT_DAY}
           AND COALESCE(SUM(detections) FILTER (WHERE day < CURRENT_DATE - 7), 0) >= ${3 * MIN_EFFORT_DAY}
      ), r AS (
        SELECT o.scientific_name, MIN(o.vernacular_name) AS vernacular_name, ${REGION} AS region, o.recent,
               SUM(o.n) AS n, COUNT(*) AS cells,
               SUM(o.n / (CASE WHEN o.recent THEN e.e_recent ELSE e.e_earlier END) * (cell_lat + 2.5))
                 / SUM(o.n / (CASE WHEN o.recent THEN e.e_recent ELSE e.e_earlier END)) AS lat
        FROM obs o JOIN eff e USING (cell_lat, cell_lon)
        GROUP BY 1, 3, 4
      )
      SELECT a.scientific_name, a.vernacular_name, a.region, ROUND((a.lat - b.lat)::numeric, 1) AS drift_deg,
             ROUND(a.lat::numeric, 1) AS lat_now, a.n::int AS n, LEAST(a.cells, b.cells)::int AS cells
      FROM r a JOIN r b ON b.scientific_name = a.scientific_name AND b.region = a.region AND a.recent AND NOT b.recent
      WHERE a.n >= 300 AND b.n >= 300 AND a.cells >= 3 AND b.cells >= 3 AND ABS(a.lat - b.lat) >= 1
      ORDER BY ABS(a.lat - b.lat) DESC
      LIMIT 12
    `,
    // New arrivals: present in the last 2 days, absent for the 12 days before,
    // in a cell that was actually being observed on at least 8 of those 12 days.
    sql`
      WITH recent AS (
        SELECT scientific_name, MIN(vernacular_name) AS vernacular_name, cell_lat, cell_lon, SUM(count) AS n
        FROM species_daily WHERE day >= CURRENT_DATE - 1 GROUP BY 1, 3, 4
      ), watched AS (
        SELECT cell_lat, cell_lon FROM effort_daily
        WHERE day >= CURRENT_DATE - 13 AND day < CURRENT_DATE - 1 AND detections >= ${MIN_EFFORT_DAY}
        GROUP BY 1, 2 HAVING COUNT(*) >= 8
      )
      SELECT r.scientific_name, r.vernacular_name, r.cell_lat, r.cell_lon, r.n::int AS n
      FROM recent r JOIN watched w USING (cell_lat, cell_lon)
      WHERE r.n >= 20 AND NOT EXISTS (
        SELECT 1 FROM species_daily p
        WHERE p.scientific_name = r.scientific_name AND p.cell_lat = r.cell_lat AND p.cell_lon = r.cell_lon
          AND p.day < CURRENT_DATE - 1 AND p.day >= CURRENT_DATE - 13
      )
      ORDER BY r.n DESC
      LIMIT 12
    `,
    sql`SELECT MIN(day)::text first_day, MAX(day)::text last_day, COUNT(DISTINCT scientific_name) species, SUM(count) detections FROM species_daily`,
  ]);
  return Response.json({
    methods: METHODS_VERSION,
    coverage: { from: meta[0].first_day, to: meta[0].last_day, species: Number(meta[0].species), detections: Number(meta[0].detections) },
    movers: movers.map((r) => ({ scientificName: r.scientific_name, vernacularName: r.vernacular_name, yesterday: r.yesterday, avg7: r.avg7, ratio: Number(r.ratio) })),
    drift: drift.map((r) => ({ scientificName: r.scientific_name, vernacularName: r.vernacular_name, region: r.region, driftDeg: Number(r.drift_deg), latNow: Number(r.lat_now), n: r.n, cells: r.cells })),
    arrivals: arrivals.map((r) => ({ scientificName: r.scientific_name, vernacularName: r.vernacular_name, cellLat: r.cell_lat, cellLon: r.cell_lon, n: r.n })),
  });
}
