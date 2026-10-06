import { sql } from "@/lib/db";

/** All known sensor locations with 24h activity counts. Cached 10 minutes: this is the largest response and the map only needs it once per visit. */
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
      geometry: { type: "Point", coordinates: [Math.round(r.longitude * 1e4) / 1e4, Math.round(r.latitude * 1e4) / 1e4] },
      properties: {
        id: r.id,
        name: r.name,
        source: r.source_system,
        sensorType: r.sensor_type,
        lastSeen: r.last_seen ? new Date(r.last_seen).toISOString().slice(0, 10) : null,
        events24h: Number(r.events_24h),
      },
    })),
  }, { headers: { "cache-control": "public, s-maxage=600, stale-while-revalidate=3600" } });
}
