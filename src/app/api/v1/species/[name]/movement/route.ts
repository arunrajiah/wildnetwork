import { sql } from "@/lib/db";
import { METHODS_VERSION, REGION, minEffortWeek } from "@/lib/methods";

export const revalidate = 3600;

/**
 * Weekly frames for one species over the past year, effort corrected.
 * Each cell carries the species' share of all detections there that week (per 1,000),
 * and each continent gets a range centre weighted by that share. See /methods.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const name = decodeURIComponent((await ctx.params).name);
  const [{ grp } = { grp: "avian" }] = await sql<{ grp: string }[]>`SELECT grp FROM species_group WHERE scientific_name = ${name}`;
  const rows = await sql`
    SELECT s.week::text AS week, cell_lat, cell_lon, SUM(s.count)::int AS n, e.detections::float AS effort, ${REGION} AS region
    FROM species_weekly s JOIN effort_weekly e USING (week, cell_lat, cell_lon)
    WHERE s.scientific_name = ${name} AND s.week >= CURRENT_DATE - 371 AND s.week <= CURRENT_DATE - 7
      AND e.grp = ${grp} AND e.detections >= ${minEffortWeek()}
    GROUP BY s.week, cell_lat, cell_lon, e.detections
    ORDER BY s.week
  `;
  const frames = new Map<string, { week: string; total: number; effort: number; cells: [number, number, number, number][]; regions: Map<string, { n: number; w: number; lat: number; lon: number }> }>();
  for (const r of rows) {
    let f = frames.get(r.week);
    if (!f) frames.set(r.week, (f = { week: r.week, total: 0, effort: 0, cells: [], regions: new Map() }));
    const share = r.n / r.effort;
    f.total += r.n;
    f.effort += r.effort;
    f.cells.push([r.cell_lat, r.cell_lon, r.n, Math.round(share * 1e5) / 100]);
    const g = f.regions.get(r.region) ?? { n: 0, w: 0, lat: 0, lon: 0 };
    g.n += r.n; g.w += share; g.lat += share * (r.cell_lat + 2.5); g.lon += share * (r.cell_lon + 2.5);
    f.regions.set(r.region, g);
  }
  return Response.json({
    scientificName: name,
    methods: METHODS_VERSION,
    group: grp,
    frames: [...frames.values()].map((f) => ({
      week: f.week,
      total: f.total,
      index: Math.round((1000 * f.total / f.effort) * 100) / 100,
      cells: f.cells, // [lat, lon, detections, per-1000 share]
      centroids: [...f.regions.entries()].map(([region, g]) => ({ region, n: g.n, lat: g.lat / g.w, lon: g.lon / g.w })),
    })),
  });
}
