import { sql } from "@/lib/db";

export const revalidate = 600;

/**
 * One species over time: daily counts, detection-weighted centroid, top cells, and the weather at the centroid.
 * Weather is Open-Meteo ERA5 (archive, ~5 day lag) patched with the forecast API's past_days for recent days.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const name = decodeURIComponent((await ctx.params).name);

  const [daily, cells, info] = await Promise.all([
    sql`
      SELECT day::text AS day, SUM(count)::int n, SUM(high_conf_count)::int high,
             SUM(count * (cell_lat + 2.5)) / SUM(count) lat, SUM(count * (cell_lon + 2.5)) / SUM(count) lon,
             COUNT(*)::int cells
      FROM species_daily WHERE scientific_name = ${name} AND day >= CURRENT_DATE - 30 AND day < CURRENT_DATE
      GROUP BY day ORDER BY day
    `,
    sql`
      SELECT cell_lat, cell_lon, SUM(count)::int n,
             SUM(count) FILTER (WHERE day >= CURRENT_DATE - 3)::int recent,
             SUM(count) FILTER (WHERE day < CURRENT_DATE - 7)::int earlier
      FROM species_daily WHERE scientific_name = ${name} AND day >= CURRENT_DATE - 14
      GROUP BY 1, 2 ORDER BY n DESC LIMIT 200
    `,
    sql`SELECT MIN(vernacular_name) vernacular_name, array_agg(DISTINCT source_system) sources FROM species_daily WHERE scientific_name = ${name}`,
  ]);

  // Weather at each day's centroid. Group days by 1-degree cell so repeated centroids share one request.
  const weather: Record<string, { tmax: number | null; tmin: number | null; precip: number | null; wind: number | null; windDir: number | null }> = {};
  const byCell = new Map<string, string[]>();
  for (const d of daily) {
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

  return Response.json({
    scientificName: name,
    vernacularName: info[0]?.vernacular_name ?? null,
    sources: info[0]?.sources ?? [],
    daily: daily.map((d) => ({ day: d.day, n: d.n, high: d.high, lat: Number(d.lat), lon: Number(d.lon), cells: d.cells, weather: weather[String(d.day)] ?? null })),
    cells: cells.map((c) => ({ lat: c.cell_lat, lon: c.cell_lon, n: c.n, recent: c.recent ?? 0, earlier: c.earlier ?? 0 })),
  });
}
