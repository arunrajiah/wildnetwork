import { sql } from "@/lib/db";

/** Species seen in the window, ranked by count. ?hours=24 ?q=robin */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const hours = Math.min(Number(p.get("hours") ?? 24), 24 * 30);
  const q = p.get("q");
  const rows = await sql`
    SELECT scientific_name, MIN(vernacular_name) AS vernacular_name,
           COUNT(*) AS n, COUNT(DISTINCT deployment_id) AS deployments
    FROM events
    WHERE event_start > now() - (${hours} || ' hours')::interval
      AND scientific_name IS NOT NULL AND review_status <> 'rejected'
      ${q ? sql`AND (scientific_name ILIKE ${"%" + q + "%"} OR vernacular_name ILIKE ${"%" + q + "%"})` : sql``}
    GROUP BY scientific_name
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
  );
}
