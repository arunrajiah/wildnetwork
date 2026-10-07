import { sql } from "@/lib/db";
import { METHODS_VERSION, REGION } from "@/lib/methods";

/**
 * Text summaries. Every sentence is produced by a fixed template from numbers computed here,
 * and the conditions for each sentence are documented on /methods ("In words").
 */

export interface DayPoint {
  day: string; n: number; index: number; lat: number | null;
  weather: { tmax: number | null; tmin: number | null; precip: number | null; wind: number | null } | null;
}
export interface Climate { cells: number; p25: number; med: number; p75: number; latSpan: number }

const KM_PER_DEG = 111;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
const round = (x: number, d = 0) => Math.round(x * 10 ** d) / 10 ** d;
const monthName = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
const pct = (x: number) => `${Math.round(Math.abs(x) * 100)}%`;

/** Temperature in each cell during the species' arrival week. Cached; recomputed when older than 14 days. */
export async function getClimate(name: string): Promise<Climate | null> {
  const [cached] = await sql`
    SELECT * FROM species_climate WHERE scientific_name = ${name} AND computed_at > now() - interval '14 days' AND methods_version = ${METHODS_VERSION}`;
  if (cached) return cached.arrival_tmax_med == null ? null : { cells: cached.arrival_cells, p25: cached.arrival_tmax_p25, med: cached.arrival_tmax_med, p75: cached.arrival_tmax_p75, latSpan: cached.lat_span };

  const cells = await sql<{ cell_lat: number; cell_lon: number; arrival_week: string }[]>`
    SELECT cell_lat, cell_lon, arrival_week::text FROM phenology
    WHERE scientific_name = ${name} AND arrival_week <= CURRENT_DATE - 14
    ORDER BY total_n DESC LIMIT 50`;
  let result: Climate | null = null;
  if (cells.length >= 5) {
    const start = cells.map((c) => c.arrival_week).sort()[0];
    const endMs = Math.max(...cells.map((c) => Date.parse(c.arrival_week))) + 6 * 86400_000;
    const u = new URL("https://archive-api.open-meteo.com/v1/archive");
    u.search = new URLSearchParams({
      latitude: cells.map((c) => c.cell_lat + 2.5).join(","), longitude: cells.map((c) => c.cell_lon + 2.5).join(","),
      start_date: start, end_date: new Date(endMs).toISOString().slice(0, 10), daily: "temperature_2m_max", timezone: "UTC",
    }).toString();
    try {
      const r = await fetch(u);
      if (r.ok) {
        const body = (await r.json()) as { daily: { time: string[]; temperature_2m_max: (number | null)[] } }[] | { daily: { time: string[]; temperature_2m_max: (number | null)[] } };
        const locs = Array.isArray(body) ? body : [body];
        const temps: number[] = [];
        locs.forEach((loc, i) => {
          const at = loc.daily.time.indexOf(cells[i].arrival_week);
          if (at < 0) return;
          const week = loc.daily.temperature_2m_max.slice(at, at + 7).filter((v): v is number => v != null);
          if (week.length >= 5) temps.push(mean(week));
        });
        if (temps.length >= 5) {
          temps.sort((a, b) => a - b);
          const lats = cells.map((c) => c.cell_lat);
          result = { cells: temps.length, p25: quantile(temps, 0.25), med: quantile(temps, 0.5), p75: quantile(temps, 0.75), latSpan: Math.max(...lats) - Math.min(...lats) + 5 };
        }
      }
    } catch { /* weather is optional */ }
  }
  await sql`
    INSERT INTO species_climate (scientific_name, arrival_cells, arrival_tmax_p25, arrival_tmax_med, arrival_tmax_p75, lat_span, methods_version)
    VALUES (${name}, ${result?.cells ?? 0}, ${result?.p25 ?? null}, ${result?.med ?? null}, ${result?.p75 ?? null}, ${result?.latSpan ?? null}, ${METHODS_VERSION})
    ON CONFLICT (scientific_name) DO UPDATE SET arrival_cells = EXCLUDED.arrival_cells, arrival_tmax_p25 = EXCLUDED.arrival_tmax_p25,
      arrival_tmax_med = EXCLUDED.arrival_tmax_med, arrival_tmax_p75 = EXCLUDED.arrival_tmax_p75, lat_span = EXCLUDED.lat_span,
      methods_version = EXCLUDED.methods_version, computed_at = now()`;
  return result;
}

/** The species' yearly span: the lowest and highest weekly range centre in the continent where it is most detected. */
export async function getYearSpan(name: string, grp: string): Promise<{ region: string; minLat: number; minWeek: string; maxLat: number; maxWeek: string; weeks: number } | null> {
  const rows = await sql<{ region: string; week: string; lat: number; n: number; w: number }[]>`
    SELECT ${REGION} AS region, s.week::text AS week,
           SUM(s.count::float / e.detections * (cell_lat + 2.5)) / SUM(s.count::float / e.detections) AS lat, SUM(s.count)::int AS n,
           SUM(s.count::float / e.detections) AS w
    FROM species_weekly s JOIN effort_weekly e USING (week, cell_lat, cell_lon)
    WHERE s.scientific_name = ${name} AND e.grp = ${grp} AND e.detections >= ${grp === "avian" ? 1000 : 150}
      AND s.week >= CURRENT_DATE - 371 AND s.week <= CURRENT_DATE - 7
    GROUP BY 1, 2 HAVING SUM(s.count) >= ${grp === "avian" ? 30 : 6}`;
  const byRegion = new Map<string, typeof rows>();
  rows.forEach((r) => byRegion.set(r.region, [...(byRegion.get(r.region) ?? []), r] as typeof rows));
  const best = [...byRegion.entries()].sort((a, b) => b[1].reduce((s, r) => s + r.n, 0) - a[1].reduce((s, r) => s + r.n, 0))[0];
  if (!best) return null;
  // Only weeks when the species is really there: at least a tenth of its peak week. Stray detections out of season are ignored.
  const peak = Math.max(...best[1].map((r) => r.w));
  const present = best[1].filter((r) => r.w >= 0.1 * peak);
  if (present.length < 8) return null;
  const sorted = [...present].sort((a, b) => a.lat - b.lat);
  const lo = sorted[0], hi = sorted[sorted.length - 1];
  return { region: best[0], minLat: lo.lat, minWeek: lo.week, maxLat: hi.lat, maxWeek: hi.week, weeks: present.length };
}

const latText = (lat: number) => `${Math.abs(round(lat))}°${lat >= 0 ? "N" : "S"}`;

/** Sentences for one species. Returns [] when nothing can be said with the stated minimums. */
export function speciesStory(name: string, daily: DayPoint[], climate: Climate | null, span: Awaited<ReturnType<typeof getYearSpan>>, minDaily = 50): string[] {
  const out: string[] = [];
  const located = daily.filter((d) => d.lat != null);

  // 1. Recent movement and the weather it moved into.
  // Needs enough detections at both ends: a centre computed from a few stray detections means nothing.
  const enough = (ds: DayPoint[]) => mean(ds.map((d) => d.n)) >= minDaily;
  if (located.length >= 8 && enough(located.slice(0, 3)) && enough(located.slice(-3))) {
    const head = located.slice(0, 3), tail = located.slice(-3);
    const dLat = mean(tail.map((d) => d.lat!)) - mean(head.map((d) => d.lat!));
    const t0 = head.map((d) => d.weather?.tmax).filter((v): v is number => v != null), t1 = tail.map((d) => d.weather?.tmax).filter((v): v is number => v != null);
    if (Math.abs(dLat) >= 2) {
      let s = `Over the last ${located.length} days its range centre moved about ${round(Math.abs(dLat))}° ${dLat > 0 ? "north" : "south"}, roughly ${round(Math.abs(dLat) * KM_PER_DEG, -1).toLocaleString("en-GB")} km.`;
      if (t0.length && t1.length && Math.abs(mean(t1) - mean(t0)) >= 2) s += ` Daytime highs where it is concentrated went from ${round(mean(t0))}°C to ${round(mean(t1))}°C.`;
      out.push(s);
    } else {
      out.push(`Its range centre has stayed put over the last ${located.length} days, within ${round(Math.abs(dLat), 1)}° of latitude.`);
    }
  }

  // 2. Arrival temperature.
  if (climate && climate.cells >= 5) {
    const spread = climate.p75 - climate.p25;
    let s = `Each season it is first heard regularly where daytime highs are around ${round(climate.med)}°C (typically ${round(climate.p25)} to ${round(climate.p75)}°C, from ${climate.cells} areas).`;
    if (climate.latSpan >= 15 && spread <= 6) s += ` That holds across ${round(climate.latSpan)}° of latitude, which suggests its timing follows temperature more than the calendar.`;
    else if (spread > 10) s += ` That range is wide, so temperature alone does not explain when it turns up.`;
    out.push(s);
  }

  // 3. The yearly journey.
  if (span && span.maxLat - span.minLat >= 8) {
    out.push(`Over the weeks it was present in the past year, its centre in ${span.region} ranged from ${latText(span.minLat)} in ${monthName(span.minWeek)} to ${latText(span.maxLat)} in ${monthName(span.maxWeek)}, about ${round((span.maxLat - span.minLat) * KM_PER_DEG, -2).toLocaleString("en-GB")} km apart.`);
  }

  // 4. Rain and wind: mostly about what a microphone can hear.
  const withW = daily.filter((d) => d.weather && d.index > 0);
  const wet = withW.filter((d) => (d.weather!.precip ?? 0) >= 5), dry = withW.filter((d) => (d.weather!.precip ?? 0) < 1);
  if (wet.length >= 3 && dry.length >= 3) {
    const change = mean(wet.map((d) => d.index)) / mean(dry.map((d) => d.index)) - 1;
    if (Math.abs(change) >= 0.15) out.push(`On the ${wet.length} wet days (5 mm of rain or more) it was detected ${pct(change)} ${change < 0 ? "less" : "more"} often than on dry days.`);
  }
  const windy = withW.filter((d) => (d.weather!.wind ?? 0) >= 30), calm = withW.filter((d) => (d.weather!.wind ?? 99) < 20);
  if (windy.length >= 3 && calm.length >= 3) {
    const change = mean(windy.map((d) => d.index)) / mean(calm.map((d) => d.index)) - 1;
    if (Math.abs(change) >= 0.15) out.push(`On the ${windy.length} windy days (gusts of 30 km/h or more) it was detected ${pct(change)} ${change < 0 ? "less" : "more"} often than on calm days.`);
  }
  if (out.some((s) => s.startsWith("On the "))) out.push("Rain and wind also make microphones hear less, so part of that is the weather hiding the animal, not the animal changing its behaviour.");
  return out;
}

interface DriftRow { vernacularName: string | null; scientificName: string; group: string; region: string; driftDeg: number; driftLow?: number | null; driftHigh?: number | null }
interface MoverRow { vernacularName: string | null; scientificName: string; group: string; ratio: number }
const CLASS_PLURAL: Record<string, string> = { avian: "birds", bat: "bats", amphibian: "frogs and toads", insect: "insects", mammal: "mammals" };

/** A few sentences on what the lists show this week. Counts refer to the species listed, not to all species. */
export function overview(drift: DriftRow[], movers: MoverRow[]): string[] {
  const out: string[] = [];
  const byRegion = new Map<string, DriftRow[]>();
  drift.forEach((d) => byRegion.set(d.region, [...(byRegion.get(d.region) ?? []), d]));
  for (const [region, rows] of [...byRegion.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 2)) {
    if (rows.length < 3) {
      // One or two clear movers: name the fastest, with its interval, rather than a count.
      const lead = [...rows].sort((a, b) => Math.abs(b.driftDeg) - Math.abs(a.driftDeg))[0];
      const ci = lead.driftLow != null && lead.driftHigh != null ? ` (95% interval ${round(Math.min(Math.abs(lead.driftLow), Math.abs(lead.driftHigh)))} to ${round(Math.max(Math.abs(lead.driftLow), Math.abs(lead.driftHigh)))}°)` : "";
      out.push(`In ${region}, ${lead.vernacularName ?? lead.scientificName} is the clearest mover this week: its range centre shifted about ${round(Math.abs(lead.driftDeg))}° ${lead.driftDeg < 0 ? "south" : "north"}${ci}.`);
      continue;
    }
    const south = rows.filter((r) => r.driftDeg < 0).length;
    const dir = south >= rows.length / 2 ? "south" : "north";
    const k = dir === "south" ? south : rows.length - south;
    const lead = [...rows].filter((r) => (dir === "south" ? r.driftDeg < 0 : r.driftDeg > 0)).sort((a, b) => Math.abs(b.driftDeg) - Math.abs(a.driftDeg))[0];
    out.push(`In ${region}, ${k} of the ${rows.length} fastest moving species are heading ${dir}, led by ${lead.vernacularName ?? lead.scientificName} (${round(Math.abs(lead.driftDeg))}° in a week).`);
  }
  const fading = movers.filter((m) => m.ratio < 1), surging = movers.filter((m) => m.ratio >= 1);
  const dominant = (rows: MoverRow[]) => {
    const c = new Map<string, number>();
    rows.forEach((r) => c.set(r.group, (c.get(r.group) ?? 0) + 1));
    const top = [...c.entries()].sort((a, b) => b[1] - a[1])[0];
    return top && top[1] >= 3 && top[1] >= rows.length / 2 ? top : null;
  };
  const f = dominant(fading);
  if (f && f[0] !== "avian") out.push(`${f[1]} of the ${fading.length} sharpest drops are ${CLASS_PLURAL[f[0]] ?? f[0]}.`);
  const s = dominant(surging);
  if (s && s[0] !== "avian") out.push(`${s[1]} of the ${surging.length} biggest surges are ${CLASS_PLURAL[s[0]] ?? s[0]}.`);
  return out;
}
