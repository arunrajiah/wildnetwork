import { sql } from "@/lib/db";
import { METHODS_VERSION, minEffortDay } from "@/lib/methods";
import { getClimate, getYearSpan, speciesStory, type DayPoint } from "@/lib/story";


/**
 * One species over time, effort corrected: daily index, share-weighted range centre, per-cell change, and weather at the centre.
 * Weather is Open-Meteo ERA5 (archive, ~5 day lag) patched with the forecast API's past_days for recent days.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const name = decodeURIComponent((await ctx.params).name);

  // Effort is taken from the species' own class (a bat is measured against bat detections).
  const [{ grp } = { grp: "avian" }] = await sql<{ grp: string }[]>`SELECT grp FROM species_group WHERE scientific_name = ${name}`;
  const [daily, cells, info] = await Promise.all([
    // Daily series over the species' range (cells where it was detected in the window), effort corrected:
    // index = detections per 1,000 detections of all species; centre = weighted by per-cell share.
    sql`
      WITH range AS (
        SELECT DISTINCT cell_lat, cell_lon FROM species_daily WHERE scientific_name = ${name} AND day >= CURRENT_DATE - 30
      ), sp AS (
        SELECT day, cell_lat, cell_lon, SUM(count)::float AS n, SUM(high_conf_count) AS high
        FROM species_daily WHERE scientific_name = ${name} AND day >= CURRENT_DATE - 30 AND day < CURRENT_DATE
        GROUP BY 1, 2, 3
      ), ef AS (
        SELECT e.day, e.cell_lat, e.cell_lon, e.detections::float AS effort
        FROM effort_daily e JOIN range USING (cell_lat, cell_lon)
        WHERE e.day >= CURRENT_DATE - 30 AND e.day < CURRENT_DATE AND e.grp = ${grp} AND e.detections >= ${minEffortDay()}
      )
      SELECT ef.day::text AS day, COALESCE(SUM(sp.n), 0)::int AS n, COALESCE(SUM(sp.high), 0)::int AS high,
             SUM(ef.effort)::bigint AS effort,
             1000 * COALESCE(SUM(sp.n), 0) / SUM(ef.effort) AS idx,
             SUM(sp.n / ef.effort * (cell_lat + 2.5)) / NULLIF(SUM(sp.n / ef.effort), 0) AS lat,
             SUM(sp.n / ef.effort * (cell_lon + 2.5)) / NULLIF(SUM(sp.n / ef.effort), 0) AS lon,
             COUNT(sp.n)::int AS cells
      FROM ef LEFT JOIN sp USING (day, cell_lat, cell_lon)
      GROUP BY ef.day ORDER BY ef.day
    `,
    // Per-cell rates for the change squares: share in the last 3 days against days 8 to 14 ago.
    sql`
      WITH sp AS (
        SELECT cell_lat, cell_lon, SUM(count)::int AS n,
               COALESCE(SUM(count) FILTER (WHERE day >= CURRENT_DATE - 3), 0)::float AS recent,
               COALESCE(SUM(count) FILTER (WHERE day < CURRENT_DATE - 7), 0)::float AS earlier
        FROM species_daily WHERE scientific_name = ${name} AND day >= CURRENT_DATE - 14 AND day < CURRENT_DATE
        GROUP BY 1, 2
      ), ef AS (
        SELECT cell_lat, cell_lon,
               COALESCE(SUM(detections) FILTER (WHERE day >= CURRENT_DATE - 3), 0)::float AS e_recent,
               COALESCE(SUM(detections) FILTER (WHERE day < CURRENT_DATE - 7), 0)::float AS e_earlier
        FROM effort_daily WHERE day >= CURRENT_DATE - 14 AND day < CURRENT_DATE AND grp = ${grp} GROUP BY 1, 2
      )
      SELECT cell_lat, cell_lon, sp.n,
             CASE WHEN ef.e_recent >= ${grp === "avian" ? 600 : 90} THEN 1000 * sp.recent / ef.e_recent END AS recent,
             CASE WHEN ef.e_earlier >= ${grp === "avian" ? 600 : 90} THEN 1000 * sp.earlier / ef.e_earlier END AS earlier
      FROM sp JOIN ef USING (cell_lat, cell_lon)
      ORDER BY sp.n DESC LIMIT 200
    `,
    // Name and sources from the weekly history as well: some sources (GBIF) only reach the daily tables in part.
    sql`SELECT MIN(vernacular_name) vernacular_name, array_agg(DISTINCT source_system) sources FROM (
          SELECT vernacular_name, source_system FROM species_daily WHERE scientific_name = ${name}
          UNION ALL SELECT vernacular_name, source_system FROM species_weekly WHERE scientific_name = ${name} AND week >= CURRENT_DATE - 371) x`,
  ]);

  // Weather at each day's centroid. Group days by 1-degree cell so repeated centroids share one request.
  const weather: Record<string, { tmax: number | null; tmin: number | null; precip: number | null; wind: number | null; windDir: number | null }> = {};
  const byCell = new Map<string, string[]>();
  for (const d of daily) {
    if (d.lat == null) continue;
    const key = `${Math.round(Number(d.lat))},${Math.round(Number(d.lon))}`;
    byCell.set(key, [...(byCell.get(key) ?? []), String(d.day)]);
  }
  await Promise.all([...byCell.entries()].slice(0, 12).map(async ([key, days]) => {
    const [lat, lon] = key.split(",").map(Number);
    const start = days[0], end = days[days.length - 1];
    const u = new URL("https://archive-api.open-meteo.com/v1/archive");
    u.search = new URLSearchParams({
      latitude: String(lat), longitude: String(lon), start_date: start, end_date: end,
      daily: "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_direction_10m_dominant", timezone: "UTC",
    }).toString();
    try {
      const r = await fetch(u, { next: { revalidate: 3600 } });
      if (!r.ok) return;
      const j = (await r.json()) as { daily: { time: string[]; temperature_2m_max: (number | null)[]; temperature_2m_min: (number | null)[]; precipitation_sum: (number | null)[]; wind_speed_10m_max: (number | null)[]; wind_direction_10m_dominant: (number | null)[] } };
      j.daily.time.forEach((t, i) => {
        if (!days.includes(t)) return;
        weather[t] = { tmax: j.daily.temperature_2m_max[i], tmin: j.daily.temperature_2m_min[i], precip: j.daily.precipitation_sum[i], wind: j.daily.wind_speed_10m_max[i], windDir: j.daily.wind_direction_10m_dominant[i] };
      });
    } catch { /* weather is optional */ }
  }));

  const days: DayPoint[] = daily.map((d) => ({ day: String(d.day), n: d.n, index: Number(d.idx), lat: d.lat == null ? null : Number(d.lat), weather: weather[String(d.day)] ?? null }));
  const [climate, span] = await Promise.all([getClimate(name).catch(() => null), getYearSpan(name, grp).catch(() => null)]);

  return Response.json({
    scientificName: name,
    vernacularName: info[0]?.vernacular_name ?? null,
    sources: info[0]?.sources ?? [],
    methods: METHODS_VERSION,
    group: grp,
    // Plain language summary; each sentence comes from a fixed template, see /methods.
    story: speciesStory(name, days, climate, span, grp === "avian" ? 50 : 10),
    arrivalTemperature: climate,
    daily: daily.map((d) => ({ day: d.day, n: d.n, high: d.high, effort: Number(d.effort), index: Number(d.idx), lat: d.lat == null ? null : Number(d.lat), lon: d.lon == null ? null : Number(d.lon), cells: d.cells, weather: weather[String(d.day)] ?? null })),
    // recent / earlier are per-1,000 shares; null when the cell was not observed enough in that period
    cells: cells.map((c) => ({ lat: c.cell_lat, lon: c.cell_lon, n: c.n, recent: c.recent == null ? null : Number(c.recent), earlier: c.earlier == null ? null : Number(c.earlier) })),
  }, { headers: { "cache-control": "public, s-maxage=600, stale-while-revalidate=3600" } });
}
