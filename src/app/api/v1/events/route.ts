import { authenticate } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ingestEvents } from "@/lib/wdx/ingest";
import type { WdxEvent } from "@/lib/wdx/types";
import { parseEventsBody, validateWdx } from "@/lib/wdx/validate";

const MAX_BATCH = 5000;

/** Push WDX events. Body: one JSON object, a JSON array, or NDJSON. */
export async function POST(req: Request) {
  const key = await authenticate(req);
  if (!key) return Response.json({ error: "unauthorized" }, { status: 401 });

  if (Number(req.headers.get("content-length") ?? 0) > 10_000_000) return Response.json({ error: "body larger than 10 MB" }, { status: 413 });
  let items: unknown[];
  try {
    items = parseEventsBody(await req.text());
  } catch {
    return Response.json({ error: "body is not valid JSON or NDJSON" }, { status: 400 });
  }
  if (items.length > MAX_BATCH) {
    return Response.json({ error: `max ${MAX_BATCH} events per request` }, { status: 413 });
  }

  const valid: WdxEvent[] = [];
  const rejected: { index: number; errors: string[] }[] = [];
  items.forEach((item, index) => {
    const v = validateWdx(item);
    if (!v.ok) return rejected.push({ index, errors: v.errors ?? [] });
    const ev = item as WdxEvent;
    if (key.sourceSystem && ev.source.system !== key.sourceSystem) {
      return rejected.push({ index, errors: [`key is restricted to source.system=${key.sourceSystem}`] });
    }
    valid.push(ev);
  });

  const result = await ingestEvents(valid);
  return Response.json({ ...result, rejected: rejected.length, rejectedDetails: rejected.slice(0, 20) });
}

/**
 * Query events for the map.
 * ?bbox=w,s,e,n  ?from=ISO ?to=ISO ?species=Scientific+name ?source=birdweather ?group=bat ?minConfidence=0.7 ?limit=5000
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const limit = Math.max(1, Math.min(Math.trunc(Number(p.get("limit") ?? 5000)) || 5000, 20000));
  // Round the window start to the minute so identical requests share one CDN cache entry.
  const to = p.get("to") ? new Date(p.get("to")!) : new Date();
  const from = p.get("from") ? new Date(p.get("from")!) : new Date(to.getTime() - 24 * 3600 * 1000);
  const species = p.get("species");
  const source = p.get("source");
  const group = p.get("group");
  const minConf = Number(p.get("minConfidence") ?? 0) || 0;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return Response.json({ error: "from and to must be ISO dates" }, { status: 400 });
  const bbox = p.get("bbox")?.split(",").map(Number);
  const hasBbox = bbox?.length === 4 && bbox.every((n) => Number.isFinite(n));

  const rows = await sql`
    SELECT e.event_id, e.event_start, e.scientific_name, e.vernacular_name, e.confidence,
           e.latitude, e.longitude, e.source_system, e.deployment_id, e.media_url, e.media_type, e.review_status,
           CASE WHEN e.media_type IN ('image', 'video') AND e.source_system NOT IN ('inaturalist') THEN 'camera'
                WHEN g.grp = 'bat' OR e.classifier_name ILIKE '%bat%' THEN 'bat' WHEN g.grp = 'avian' THEN 'Aves' WHEN g.grp = 'amphibian' THEN 'Amphibia' WHEN g.grp = 'insect' THEN 'Insecta' WHEN g.grp = 'mammal' THEN 'Mammalia'
                ELSE COALESCE(NULLIF(m.iconic, 'Unknown'), CASE WHEN e.source_system = 'birdweather' THEN 'Aves' END, 'Unknown') END AS grp
    FROM events e LEFT JOIN species_media m ON m.scientific_name = e.scientific_name
    LEFT JOIN species_group g ON g.scientific_name = e.scientific_name
    WHERE event_start >= ${from} AND event_start <= ${to}
      AND confidence >= ${minConf}
      AND review_status <> 'rejected'
      ${species ? sql`AND e.scientific_name = ${species}` : sql``}
      ${source ? sql`AND source_system = ${source}` : sql``}
      ${group ? sql`AND g.grp = ${group}` : sql``}
      ${hasBbox ? sql`AND geom && ST_MakeEnvelope(${bbox![0]}, ${bbox![1]}, ${bbox![2]}, ${bbox![3]}, 4326)::geography` : sql``}
    ORDER BY event_start DESC
    LIMIT ${limit}
  `;

  return Response.json({
    type: "FeatureCollection",
    features: rows.map((r) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: r.source_system === "birdweather" ? [Math.round(r.longitude), Math.round(r.latitude)] : [r.longitude, r.latitude] },
      properties: {
        id: r.event_id,
        t: r.event_start,
        sci: r.scientific_name,
        common: r.vernacular_name,
        conf: r.confidence,
        source: r.source_system,
        deployment: r.source_system === "birdweather" ? null : r.deployment_id, // BirdWeather station identity stays with BirdWeather
        media: r.media_url,
        mediaType: r.media_type,
        review: r.review_status,
        group: r.grp,
      },
    })),
  }, { headers: { "cache-control": "public, s-maxage=120, stale-while-revalidate=600" } });
}
