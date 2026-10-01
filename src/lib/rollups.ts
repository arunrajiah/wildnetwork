import { sql } from "@/lib/db";

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

interface TopSpecies { count: number; breakdown: { almostCertain: number; veryLikely: number } | null; species: { scientificName: string; commonName: string } }

/** Rollup one BirdWeather cell for one day via topSpecies aggregate (no raw events). */
export async function rollupBirdweatherCellDay(cell: { lat: number; lon: number }, day: string): Promise<number> {
  const next = new Date(Date.parse(day) + 86400_000).toISOString().slice(0, 10);
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: `query($from: ISO8601Date!, $to: ISO8601Date!, $sw: InputLocation!, $ne: InputLocation!) {
        topSpecies(limit: 300, period: {from: $from, to: $to}, sw: $sw, ne: $ne) {
          count breakdown { almostCertain veryLikely } species { scientificName commonName }
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
