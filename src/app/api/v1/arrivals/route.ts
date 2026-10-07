import { sql } from "@/lib/db";
import { METHODS_VERSION, REGION } from "@/lib/methods";

export const revalidate = 3600;

/**
 * Seasonal timing per species and 5-degree cell (see /methods, "Arrival dates").
 * ?species=Hirundo rustica   all cells for one species
 * (no species)               the most recent arrivals across all species
 * ?lat=51.5&lon=-0.1          only the 5-degree cell containing that point (all species there,
 *                            or one row with ?species); used by BirdEcho's "near you" lists
 * ?format=csv                same rows as CSV
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const species = p.get("species");
  const group = p.get("group");
  const lat = Number(p.get("lat")), lon = Number(p.get("lon"));
  const cell = p.has("lat") && p.has("lon") && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
    ? { lat: Math.floor(lat / 5) * 5, lon: Math.floor(lon / 5) * 5 } : null;
  const rows = await sql`
    SELECT scientific_name, vernacular_name, cell_lat, cell_lon, ${REGION} AS region,
           arrival_week::text, peak_week::text, departure_week::text, peak_index, total_n, weeks_observed, absent_weeks
    FROM phenology
    ${species ? sql`WHERE scientific_name = ${species}` : cell ? sql`WHERE true` : sql`WHERE arrival_week >= CURRENT_DATE - 28`}
    ${cell ? sql`AND cell_lat = ${cell.lat} AND cell_lon = ${cell.lon}` : sql``}
    ${group ? sql`AND scientific_name IN (SELECT scientific_name FROM species_group WHERE grp = ${group})` : sql``}
    ORDER BY ${species ? sql`cell_lat DESC, cell_lon` : sql`arrival_week DESC, total_n DESC`}
    LIMIT ${species || cell ? 500 : 200}
  `;
  const out = rows.map((r) => ({
    scientificName: r.scientific_name, vernacularName: r.vernacular_name, cellLat: r.cell_lat, cellLon: r.cell_lon, region: r.region,
    arrivalWeek: r.arrival_week, peakWeek: r.peak_week, departureWeek: r.departure_week,
    peakIndex: Math.round(r.peak_index * 100) / 100, detections: r.total_n, weeksObserved: r.weeks_observed, absentWeeksBefore: r.absent_weeks,
  }));
  if (p.get("format") === "csv") {
    const cols = ["scientificName", "vernacularName", "cellLat", "cellLon", "region", "arrivalWeek", "peakWeek", "departureWeek", "peakIndex", "detections", "weeksObserved", "absentWeeksBefore"] as const;
    const esc = (v: unknown) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const csv = [`# WildNetwork arrival dates, methods ${METHODS_VERSION}, https://wildnetwork.arunrajiah.com/methods. Cells are 5 degree squares named by their south-west corner. Weeks start on Monday.`,
      cols.join(","), ...out.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
    return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="wildnetwork-arrivals${species ? "-" + species.replace(/\s+/g, "_") : ""}.csv"` } });
  }
  return Response.json({ methods: METHODS_VERSION, arrivals: out });
}
