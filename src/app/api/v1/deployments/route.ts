import { sql } from "@/lib/db";

/** All known sensor locations with 24h activity counts. */
export async function GET() {
  const rows = await sql`
    SELECT d.id, d.name, d.source_system, d.sensor_type, d.latitude, d.longitude, d.last_seen,
           COUNT(e.event_id) FILTER (WHERE e.event_start > now() - interval '24 hours') AS events_24h
    FROM deployments d
    LEFT JOIN events e ON e.deployment_id = d.id AND e.event_start > now() - interval '24 hours'
    GROUP BY d.id
  `;
  return Response.json({
    type: "FeatureCollection",
    features: rows.map((r) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [r.longitude, r.latitude] },
      properties: {
        id: r.id,
        name: r.name,
        source: r.source_system,
        sensorType: r.sensor_type,
        lastSeen: r.last_seen,
        events24h: Number(r.events_24h),
      },
    })),
  }, { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
