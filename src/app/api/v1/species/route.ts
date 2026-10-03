import { sql } from "@/lib/db";

/** Species seen in the window, ranked by count. ?hours=24 ?q=robin */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const hours = Math.min(Number(p.get("hours") ?? 24), 24 * 30);
  const q = p.get("q");
  const group = p.get("group");
  // A search looks through every species in the daily history, not only what was heard in the live window.
  const rows = q
    ? await sql`
        SELECT scientific_name, MIN(vernacular_name) AS vernacular_name, SUM(count) AS n, COUNT(DISTINCT (cell_lat, cell_lon)) AS deployments
        FROM (SELECT scientific_name, vernacular_name, count, cell_lat, cell_lon FROM species_daily
              UNION ALL SELECT scientific_name, vernacular_name, count, cell_lat, cell_lon FROM species_weekly WHERE week >= CURRENT_DATE - 60) x
        WHERE scientific_name ILIKE ${"%" + q + "%"} OR vernacular_name ILIKE ${"%" + q + "%"}
        GROUP BY scientific_name
        ORDER BY (MIN(vernacular_name) ILIKE ${q + "%"}) DESC, n DESC
        LIMIT 30
      `
    : await sql`
        SELECT e.scientific_name, MIN(e.vernacular_name) AS vernacular_name,
               COUNT(*) AS n, COUNT(DISTINCT e.deployment_id) AS deployments
        FROM events e ${group ? sql`JOIN species_group g ON g.scientific_name = e.scientific_name AND g.grp = ${group}` : sql``}
        WHERE e.event_start > now() - (${hours} || ' hours')::interval
          AND e.scientific_name IS NOT NULL AND e.review_status <> 'rejected'
        GROUP BY e.scientific_name
        ORDER BY n DESC
        LIMIT 200
      `;
  return Response.json(
    rows.map((r) => ({
      scientificName: r.scientific_name,
      vernacularName: r.vernacular_name,
      count: Number(r.n),
      deployments: Number(r.deployments),
    })),
    { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
