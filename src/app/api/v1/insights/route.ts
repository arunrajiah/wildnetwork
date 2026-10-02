import { sql } from "@/lib/db";
import { overview } from "@/lib/story";
import { GROUPS, METHODS_VERSION, MIN_CELL_DETECTIONS, REGION, minEffortDay, scaled, type Group } from "@/lib/methods";

/**
 * What is changing, effort corrected within each taxon class. See /methods for the definitions.
 * ?group=bat limits the lists to one class (avian, bat, amphibian, insect, mammal).
 * Every measure uses a species' share of its class's detections in a cell, never a raw count,
 * so more stations, or more ultrasonic stations, do not look like more animals.
 */
export async function GET(req: Request) {
  const g = new URL(req.url).searchParams.get("group");
  const group = GROUPS.includes(g as Group) ? (g as Group) : null;
  const only = group ? sql`AND g.grp = ${group}` : sql``;

  const [movers, drift, arrivals, meta] = await Promise.all([
    // Surging and fading: share of the class's detections yesterday against the mean share of the 7 days before.
    sql`
      WITH e AS (
        SELECT e.day, e.grp, SUM(e.detections)::float AS tot FROM effort_daily e
        WHERE e.day >= CURRENT_DATE - 8 AND e.day < CURRENT_DATE AND e.detections >= ${minEffortDay()} GROUP BY 1, 2
      ), d AS (
        SELECT sd.scientific_name, MIN(sd.vernacular_name) AS vernacular_name, g.grp, sd.day, SUM(sd.count) AS n
        FROM species_daily sd JOIN species_group g USING (scientific_name)
        JOIN effort_daily e ON e.day = sd.day AND e.cell_lat = sd.cell_lat AND e.cell_lon = sd.cell_lon AND e.grp = g.grp
        WHERE sd.day >= CURRENT_DATE - 8 AND sd.day < CURRENT_DATE AND e.detections >= ${minEffortDay()} AND g.is_species ${only}
        GROUP BY 1, 3, 4
      ), s AS (SELECT d.*, d.n / e.tot AS share FROM d JOIN e USING (day, grp)),
      last AS (SELECT * FROM s WHERE day = CURRENT_DATE - 1),
      base AS (SELECT scientific_name, AVG(share) AS share, AVG(n) AS avg_n, COUNT(*) AS days FROM s WHERE day < CURRENT_DATE - 1 GROUP BY 1)
      SELECT l.scientific_name, l.vernacular_name, l.grp, l.n::int AS yesterday, ROUND(b.avg_n)::int AS avg7, l.share / NULLIF(b.share, 0) AS ratio
      FROM last l JOIN base b USING (scientific_name)
      WHERE b.days >= 5 AND b.avg_n >= ${scaled(100, sql`l.grp`)} AND l.n >= ${scaled(100, sql`l.grp`)}
      ORDER BY ABS(LN(l.share / NULLIF(b.share, 0))) DESC
      LIMIT 12
    `,
    // Moving: shift of the share-weighted range centre within one continent, last 3 days against days 8 to 10 ago,
    // using only cells observed for that class in both periods.
    sql`
      WITH obs AS (
        SELECT sd.scientific_name, MIN(sd.vernacular_name) AS vernacular_name, g.grp, sd.cell_lat, sd.cell_lon,
               (sd.day >= CURRENT_DATE - 3) AS recent, SUM(sd.count) AS n
        FROM species_daily sd JOIN species_group g USING (scientific_name)
        WHERE sd.day < CURRENT_DATE AND (sd.day >= CURRENT_DATE - 3 OR (sd.day >= CURRENT_DATE - 10 AND sd.day < CURRENT_DATE - 7))
          AND g.is_species ${only}
        GROUP BY 1, 3, 4, 5, 6
        HAVING SUM(sd.count) >= (CASE WHEN g.grp = 'avian' THEN ${MIN_CELL_DETECTIONS}::int ELSE 2 END)
      ), eff AS (
        SELECT e.cell_lat, e.cell_lon, e.grp,
               SUM(e.detections) FILTER (WHERE e.day >= CURRENT_DATE - 3)::float AS e_recent,
               SUM(e.detections) FILTER (WHERE e.day < CURRENT_DATE - 7)::float AS e_earlier
        FROM effort_daily e
        WHERE e.day < CURRENT_DATE AND (e.day >= CURRENT_DATE - 3 OR (e.day >= CURRENT_DATE - 10 AND e.day < CURRENT_DATE - 7))
        GROUP BY 1, 2, 3
        HAVING COALESCE(SUM(e.detections) FILTER (WHERE e.day >= CURRENT_DATE - 3), 0) >= 3 * ${minEffortDay()}
           AND COALESCE(SUM(e.detections) FILTER (WHERE e.day < CURRENT_DATE - 7), 0) >= 3 * ${minEffortDay()}
      ), r AS (
        SELECT o.scientific_name, MIN(o.vernacular_name) AS vernacular_name, grp, ${REGION} AS region, o.recent,
               SUM(o.n) AS n, COUNT(*) AS cells,
               SUM(o.n / (CASE WHEN o.recent THEN e.e_recent ELSE e.e_earlier END) * (cell_lat + 2.5))
                 / SUM(o.n / (CASE WHEN o.recent THEN e.e_recent ELSE e.e_earlier END)) AS lat
        FROM obs o JOIN eff e USING (cell_lat, cell_lon, grp)
        GROUP BY 1, 3, 4, 5
      )
      SELECT a.scientific_name, a.vernacular_name, a.grp, a.region, ROUND((a.lat - b.lat)::numeric, 1) AS drift_deg,
             ROUND(a.lat::numeric, 1) AS lat_now, a.n::int AS n, LEAST(a.cells, b.cells)::int AS cells
      FROM r a JOIN r b ON b.scientific_name = a.scientific_name AND b.region = a.region AND a.recent AND NOT b.recent
      WHERE a.n >= ${scaled(300, sql`a.grp`)} AND b.n >= ${scaled(300, sql`a.grp`)}
        AND a.cells >= (CASE WHEN a.grp = 'avian' THEN 3 ELSE 2 END) AND b.cells >= (CASE WHEN a.grp = 'avian' THEN 3 ELSE 2 END)
        AND ABS(a.lat - b.lat) >= 1
      ORDER BY ABS(a.lat - b.lat) DESC
      LIMIT 12
    `,
    // New arrivals: present in the last 2 days, absent for the 12 days before,
    // in a cell that was observed for that class on at least 8 of those 12 days.
    sql`
      WITH recent AS (
        SELECT sd.scientific_name, MIN(sd.vernacular_name) AS vernacular_name, g.grp, sd.cell_lat, sd.cell_lon, SUM(sd.count) AS n
        FROM species_daily sd JOIN species_group g USING (scientific_name)
        WHERE sd.day >= CURRENT_DATE - 1 AND g.is_species ${only} GROUP BY 1, 3, 4, 5
      ), watched AS (
        SELECT e.cell_lat, e.cell_lon, e.grp FROM effort_daily e
        WHERE e.day >= CURRENT_DATE - 13 AND e.day < CURRENT_DATE - 1 AND e.detections >= ${minEffortDay()}
        GROUP BY 1, 2, 3 HAVING COUNT(*) >= 8
      )
      SELECT r.scientific_name, r.vernacular_name, r.grp, r.cell_lat, r.cell_lon, r.n::int AS n
      FROM recent r JOIN watched w USING (cell_lat, cell_lon, grp)
      WHERE r.n >= (CASE WHEN r.grp = 'avian' THEN 20 ELSE 10 END) AND NOT EXISTS (
        SELECT 1 FROM species_daily p
        WHERE p.scientific_name = r.scientific_name AND p.cell_lat = r.cell_lat AND p.cell_lon = r.cell_lon
          AND p.day < CURRENT_DATE - 1 AND p.day >= CURRENT_DATE - 13
      )
      ORDER BY r.n DESC
      LIMIT 12
    `,
    sql`
      SELECT MIN(sd.day)::text AS first_day, MAX(sd.day)::text AS last_day, COUNT(DISTINCT sd.scientific_name) AS species, SUM(sd.count) AS detections
      FROM species_daily sd ${group ? sql`JOIN species_group g ON g.scientific_name = sd.scientific_name AND g.grp = ${group}` : sql``}`,
  ]);
  const driftOut = drift.map((r) => ({ scientificName: r.scientific_name as string, vernacularName: r.vernacular_name as string | null, group: r.grp as string, region: r.region as string, driftDeg: Number(r.drift_deg), latNow: Number(r.lat_now), n: r.n as number, cells: r.cells as number }));
  const moversOut = movers.map((r) => ({ scientificName: r.scientific_name as string, vernacularName: r.vernacular_name as string | null, group: r.grp as string, yesterday: r.yesterday as number, avg7: r.avg7 as number, ratio: Number(r.ratio) }));
  return Response.json({
    methods: METHODS_VERSION,
    group: group ?? "all",
    coverage: { from: meta[0].first_day, to: meta[0].last_day, species: Number(meta[0].species), detections: Number(meta[0].detections ?? 0) },
    summary: overview(driftOut, moversOut),
    movers: moversOut,
    drift: driftOut,
    arrivals: arrivals.map((r) => ({ scientificName: r.scientific_name, vernacularName: r.vernacular_name, group: r.grp, cellLat: r.cell_lat, cellLon: r.cell_lon, n: r.n })),
  }, { headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
