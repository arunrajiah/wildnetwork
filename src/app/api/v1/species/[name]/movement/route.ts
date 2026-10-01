import { sql } from "@/lib/db";

export const revalidate = 3600;

const REGION = sql`CASE
  WHEN cell_lon < -30 AND cell_lat >= 10 THEN 'North America'
  WHEN cell_lon < -30 THEN 'South America'
  WHEN cell_lon < 60 AND cell_lat >= 35 THEN 'Europe'
  WHEN cell_lon < 60 THEN 'Africa'
  WHEN cell_lon >= 110 AND cell_lat < -10 THEN 'Oceania'
  ELSE 'Asia' END`;

/** Weekly frames for one species over the last year: cells with counts, and a centroid per continent. */
export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const name = decodeURIComponent((await ctx.params).name);
  const rows = await sql`
    SELECT week::text AS week, cell_lat, cell_lon, SUM(count)::int AS n, ${REGION} AS region
    FROM species_weekly
    WHERE scientific_name = ${name} AND week >= CURRENT_DATE - 371 AND week <= CURRENT_DATE - 7
    GROUP BY week, cell_lat, cell_lon
    ORDER BY week
  `;
  const frames = new Map<string, { week: string; total: number; cells: [number, number, number][]; regions: Map<string, { n: number; lat: number; lon: number }> }>();
  for (const r of rows) {
    let f = frames.get(r.week);
    if (!f) frames.set(r.week, (f = { week: r.week, total: 0, cells: [], regions: new Map() }));
    f.total += r.n;
    f.cells.push([r.cell_lat, r.cell_lon, r.n]);
    const g = f.regions.get(r.region) ?? { n: 0, lat: 0, lon: 0 };
    g.n += r.n; g.lat += r.n * (r.cell_lat + 2.5); g.lon += r.n * (r.cell_lon + 2.5);
    f.regions.set(r.region, g);
  }
  return Response.json({
    scientificName: name,
    frames: [...frames.values()].map((f) => ({
      week: f.week,
      total: f.total,
      cells: f.cells,
      centroids: [...f.regions.entries()].map(([region, g]) => ({ region, n: g.n, lat: g.lat / g.n, lon: g.lon / g.n })),
    })),
  });
}
