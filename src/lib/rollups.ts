import { sql } from "@/lib/db";
import { GRP } from "@/lib/methods";

import { BIRDWEATHER_PAUSED } from "@/lib/sources";

const ENDPOINT = "https://app.birdweather.com/graphql";
const CELL = 5;

/** 5-degree cells that contain at least one known BirdWeather station. Fetched from BirdWeather's station list. */
export async function birdweatherCells(): Promise<{ lat: number; lon: number }[]> {
  const cells = new Set<string>();
  let after: string | null = null;
  for (let page = 0; page < 80; page++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `query($after: String) { stations(first: 500, after: $after) { pageInfo { hasNextPage endCursor } nodes { coords { lat lon } } } }`,
        variables: { after },
      }),
    });
    const json = (await res.json()) as { data: { stations: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: { coords: { lat: number; lon: number } | null }[] } } };
    for (const n of json.data.stations.nodes) {
      if (!n.coords) continue;
      cells.add(`${Math.floor(n.coords.lat / CELL) * CELL},${Math.floor(n.coords.lon / CELL) * CELL}`);
    }
    if (!json.data.stations.pageInfo.hasNextPage) break;
    after = json.data.stations.pageInfo.endCursor;
  }
  return [...cells].map((s) => { const [lat, lon] = s.split(",").map(Number); return { lat, lon }; });
}

interface TopSpecies { count: number; breakdown: { almostCertain: number; veryLikely: number } | null; species: { scientificName: string; commonName: string; classification: string | null } }

/** Rollup one BirdWeather cell for one day via topSpecies aggregate (no raw events). */
export function rollupBirdweatherCellDay(cell: { lat: number; lon: number }, day: string): Promise<number> {
  return rollupBirdweatherCell(cell, day, 1);
}

/** Same, for the 7 days starting at `week` (a Monday), into species_weekly. */
export function rollupBirdweatherCellWeek(cell: { lat: number; lon: number }, week: string): Promise<number> {
  return rollupBirdweatherCell(cell, week, 7);
}

async function rollupBirdweatherCell(cell: { lat: number; lon: number }, day: string, spanDays: 1 | 7): Promise<number> {
  if (BIRDWEATHER_PAUSED) throw new Error("BirdWeather collection is paused (see src/lib/sources.ts)");
  const next = new Date(Date.parse(day) + spanDays * 86400_000).toISOString().slice(0, 10);
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: `query($from: ISO8601Date!, $to: ISO8601Date!, $sw: InputLocation!, $ne: InputLocation!) {
        topSpecies(limit: 300, period: {from: $from, to: $to}, sw: $sw, ne: $ne) {
          count breakdown { almostCertain veryLikely } species { scientificName commonName classification }
        } }`,
      variables: { from: day, to: next, sw: { lat: cell.lat, lon: cell.lon }, ne: { lat: cell.lat + CELL, lon: cell.lon + CELL } },
    }),
  });
  if (!res.ok) throw new Error(`birdweather ${res.status}`);
  const json = (await res.json()) as { data?: { topSpecies: TopSpecies[] }; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(json.errors[0].message);
  const rows = (json.data?.topSpecies ?? []).filter((t) => t.count > 0).map((t) => ({
    day,
    source_system: "birdweather",
    scientific_name: t.species.scientificName,
    vernacular_name: t.species.commonName,
    cell_lat: cell.lat,
    cell_lon: cell.lon,
    count: t.count,
    high_conf_count: t.breakdown ? t.breakdown.almostCertain + t.breakdown.veryLikely : null,
    sites: null,
  }));
  if (rows.length === 0) return 0;
  await upsertGroups((json.data?.topSpecies ?? []).map((t) => ({ name: t.species.scientificName, grp: t.species.classification ?? "avian" })));
  if (spanDays === 7) {
    const weekly = rows.map((r) => ({ week: r.day, source_system: r.source_system, scientific_name: r.scientific_name, vernacular_name: r.vernacular_name, cell_lat: r.cell_lat, cell_lon: r.cell_lon, count: r.count, high_conf_count: r.high_conf_count }));
    await sql`
      INSERT INTO species_weekly ${sql(weekly)}
      ON CONFLICT (week, source_system, scientific_name, cell_lat, cell_lon) DO UPDATE SET
        count = EXCLUDED.count, high_conf_count = EXCLUDED.high_conf_count, vernacular_name = EXCLUDED.vernacular_name
    `;
    return rows.length;
  }
  await sql`
    INSERT INTO species_daily ${sql(rows)}
    ON CONFLICT (day, source_system, scientific_name, cell_lat, cell_lon) DO UPDATE SET
      count = EXCLUDED.count, high_conf_count = EXCLUDED.high_conf_count, vernacular_name = EXCLUDED.vernacular_name
  `;
  return rows.length;
}

/** Rollup our own raw events (every source except birdweather, which uses the aggregate above) for a day. */
export async function rollupEventsDay(day: string): Promise<void> {
  await sql`
    INSERT INTO species_daily (day, source_system, scientific_name, vernacular_name, cell_lat, cell_lon, count, high_conf_count, sites)
    SELECT ${day}::date, source_system, scientific_name, MIN(vernacular_name),
           FLOOR(latitude / ${CELL}) * ${CELL}, FLOOR(longitude / ${CELL}) * ${CELL},
           COUNT(*), COUNT(*) FILTER (WHERE confidence >= 0.85), COUNT(DISTINCT deployment_id)
    FROM events
    WHERE event_start >= ${day}::date AND event_start < ${day}::date + 1
      AND scientific_name IS NOT NULL AND review_status <> 'rejected' AND source_system <> 'birdweather'
    GROUP BY 2, 3, 5, 6
    ON CONFLICT (day, source_system, scientific_name, cell_lat, cell_lon) DO UPDATE SET
      count = EXCLUDED.count, high_conf_count = EXCLUDED.high_conf_count, sites = EXCLUDED.sites, vernacular_name = EXCLUDED.vernacular_name
  `;
}

/** Refresh today's and yesterday's rollups from all sources. About a minute of work. */
export async function refreshRollups(): Promise<{ days: string[]; cells: number; rows: number; errors: number }> {
  const days = [0, 1].map((d) => new Date(Date.now() - d * 86400_000).toISOString().slice(0, 10));
  const cells = BIRDWEATHER_PAUSED ? [] : await birdweatherCells();
  let rows = 0, errors = 0;
  const jobs = days.flatMap((day) => cells.map((cell) => ({ cell, day })));
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (jobs.length) {
      const j = jobs.shift()!;
      try { rows += await rollupBirdweatherCellDay(j.cell, j.day); } catch { errors++; }
    }
  }));
  for (const day of days) await rollupEventsDay(day);
  await refreshDerived();
  return { days, cells: cells.length, rows, errors };
}

/**
 * Keep the derived tables in step with species_daily:
 * - species_weekly for the current and previous week (summed from daily, so no extra upstream queries)
 * - effort_daily / effort_weekly: total detections of all species per cell, the denominator for effort correction
 */
export async function refreshDerived(days = 7): Promise<void> {
  // Species first seen through another source have no class yet: birds if BirdWeather reports them, else "other".
  await sql`
    INSERT INTO species_group (scientific_name, grp, is_species)
    SELECT scientific_name, CASE WHEN bool_or(source_system = 'birdweather') THEN 'avian' ELSE 'other' END, position(' ' in scientific_name) > 0
    FROM species_daily WHERE day >= CURRENT_DATE - 2 GROUP BY scientific_name
    ON CONFLICT (scientific_name) DO NOTHING`;
  // Devices do not say what class a species is, but a bat classifier only reports bats.
  await sql`
    INSERT INTO species_group (scientific_name, grp, is_species)
    SELECT DISTINCT scientific_name, 'bat', position(' ' in scientific_name) > 0 FROM events
    WHERE classifier_name ILIKE '%bat%' AND scientific_name IS NOT NULL
    ON CONFLICT (scientific_name) DO UPDATE SET grp = 'bat' WHERE species_group.grp = 'other'`;
  await sql`
    INSERT INTO species_weekly (week, source_system, scientific_name, vernacular_name, cell_lat, cell_lon, count, high_conf_count)
    SELECT date_trunc('week', day)::date, source_system, scientific_name, MIN(vernacular_name), cell_lat, cell_lon, SUM(count), SUM(high_conf_count)
    FROM species_daily
    WHERE day >= date_trunc('week', CURRENT_DATE)::date - 7
      -- GBIF weeks come from its facets (src/lib/gbif.ts) and already contain iNaturalist's licensed records
      AND source_system NOT IN ('gbif', 'inaturalist')
    GROUP BY 1, 2, 3, 5, 6
    ON CONFLICT (week, source_system, scientific_name, cell_lat, cell_lon) DO UPDATE SET
      count = EXCLUDED.count, high_conf_count = EXCLUDED.high_conf_count, vernacular_name = EXCLUDED.vernacular_name
  `;
  // Weekly rows with a count of 1 or 2 are a quarter of the table and 0.01% of detections; they can never pass a threshold.
  await sql`DELETE FROM species_weekly WHERE count < 3 AND week < CURRENT_DATE - 21`;
  await sql`
    INSERT INTO effort_daily (day, cell_lat, cell_lon, grp, detections, species)
    SELECT s.day, s.cell_lat, s.cell_lon, ${GRP()}, SUM(s.count), COUNT(DISTINCT s.scientific_name)
    FROM species_daily s LEFT JOIN species_group g USING (scientific_name)
    WHERE s.day >= CURRENT_DATE - ${days}::int GROUP BY 1, 2, 3, 4
    ON CONFLICT (day, cell_lat, cell_lon, grp) DO UPDATE SET detections = EXCLUDED.detections, species = EXCLUDED.species
  `;
  await sql`
    INSERT INTO effort_weekly (week, cell_lat, cell_lon, grp, detections, species)
    SELECT s.week, s.cell_lat, s.cell_lon, ${GRP()}, SUM(s.count), COUNT(DISTINCT s.scientific_name)
    FROM species_weekly s LEFT JOIN species_group g USING (scientific_name)
    WHERE s.week >= date_trunc('week', CURRENT_DATE)::date - ${days}::int GROUP BY 1, 2, 3, 4
    ON CONFLICT (week, cell_lat, cell_lon, grp) DO UPDATE SET detections = EXCLUDED.detections, species = EXCLUDED.species
  `;
}

/** Remember each species' class. A name without a space is a genus, family or order, not a species. */
export async function upsertGroups(items: { name: string; grp: string }[]): Promise<void> {
  const seen = new Map(items.map((i) => [i.name, i.grp]));
  if (seen.size === 0) return;
  const rows = [...seen.entries()].map(([scientific_name, grp]) => ({ scientific_name, grp, is_species: scientific_name.trim().includes(" ") }));
  await sql`INSERT INTO species_group ${sql(rows)} ON CONFLICT (scientific_name) DO UPDATE SET grp = EXCLUDED.grp, is_species = EXCLUDED.is_species`;
}

/** One-off and occasional: list every non-bird taxon BirdWeather has heard in a year, then mark the rest. */
export async function classifyAll(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const c of ["bat", "insect", "amphibian", "mammal"]) {
    const res = await fetch(ENDPOINT, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: `{ topSpecies(limit: 500, period: {count: 365, unit: "day"}, classifications: ["${c}"]) { species { scientificName } } }` }),
    });
    const names = ((await res.json()) as { data: { topSpecies: { species: { scientificName: string } }[] } }).data.topSpecies.map((t) => t.species.scientificName);
    await upsertGroups(names.map((name) => ({ name, grp: c })));
    out[c] = names.length;
  }
  // Everything else BirdWeather reports is a bird; species that only come from other sources are "other".
  const birds = await sql`
    INSERT INTO species_group (scientific_name, grp, is_species)
    SELECT DISTINCT scientific_name, 'avian', position(' ' in scientific_name) > 0 FROM (
      SELECT scientific_name FROM species_weekly WHERE source_system = 'birdweather'
      UNION SELECT scientific_name FROM species_daily WHERE source_system = 'birdweather') x
    ON CONFLICT (scientific_name) DO NOTHING RETURNING 1`;
  out.avian = birds.length;
  const other = await sql`
    INSERT INTO species_group (scientific_name, grp, is_species)
    SELECT DISTINCT scientific_name, 'other', position(' ' in scientific_name) > 0 FROM species_daily
    ON CONFLICT (scientific_name) DO NOTHING RETURNING 1`;
  out.other = other.length;
  // Rebuild effort for the whole history now that classes are known.
  await sql`TRUNCATE effort_daily, effort_weekly`;
  await refreshDerived(4000);
  return out;
}
