import { sql } from "@/lib/db";
import { METHODS_VERSION, MIN_EFFORT_WEEK } from "@/lib/methods";

export interface WeekPoint { week: string; value: number; n: number }
export interface Season { arrival: string; departure: string | null; peak: string; peakValue: number; total: number; weeks: number; absentWeeks: number }

export const PHENOLOGY = {
  /** A week counts as "present" when the value reaches this fraction of the seasonal peak. */
  PRESENT_FRACTION: 0.1,
  /** An arrival needs at least this many consecutive absent weeks before it. */
  MIN_ABSENT_WEEKS: 6,
  /** and at least this many consecutive present weeks from the arrival on. */
  MIN_PRESENT_WEEKS: 2,
  MIN_WEEKS_OBSERVED: 26,
  MIN_TOTAL: 200,
  MIN_PEAK_N: 30,
};

const DAY = 86400_000;

/**
 * Find the seasonal arrival in a weekly series (observed weeks only, zeros included, sorted by week).
 * Returns null for residents, for series that are too thin, and when the cell was not watched in the week before arrival.
 * Pure function: the validation applies the same rule to an independent data source.
 */
export function detectSeason(series: WeekPoint[], limits = PHENOLOGY): Season | null {
  if (series.length < limits.MIN_WEEKS_OBSERVED) return null;
  const total = series.reduce((a, p) => a + p.n, 0);
  let peakI = 0;
  series.forEach((p, i) => { if (p.value > series[peakI].value) peakI = i; });
  if (total < limits.MIN_TOTAL || series[peakI].n < limits.MIN_PEAK_N) return null;
  const thr = series[peakI].value * limits.PRESENT_FRACTION;
  const present = series.map((p) => p.value >= thr && p.value > 0);

  let best: { i: number; run: number } | null = null;
  let run = 0;
  for (let i = 0; i < series.length; i++) {
    if (!present[i]) { run++; continue; }
    const runBefore = run;
    run = 0;
    if (runBefore < limits.MIN_ABSENT_WEEKS) continue;
    let ahead = 0;
    while (i + ahead < series.length && present[i + ahead]) ahead++;
    if (ahead < limits.MIN_PRESENT_WEEKS) continue;
    // The week before must have been observed, otherwise an outage would look like an arrival.
    if (i === 0 || Date.parse(series[i].week) - Date.parse(series[i - 1].week) > 8 * DAY) continue;
    if (!best || runBefore > best.run) best = { i, run: runBefore };
  }
  if (!best) return null;

  // Departure: the last present week before the next long absence, if the data reaches that far.
  let departure: string | null = null;
  let lastPresent = best.i, gap = 0;
  for (let j = best.i; j < series.length; j++) {
    if (present[j]) { lastPresent = j; gap = 0; } else if (++gap >= limits.MIN_ABSENT_WEEKS) { departure = series[lastPresent].week; break; }
  }
  // Peak within the season that starts at the arrival.
  let seasonPeak = best.i;
  for (let j = best.i; j < series.length && (departure === null || series[j].week <= departure); j++) if (series[j].value > series[seasonPeak].value) seasonPeak = j;
  return { arrival: series[best.i].week, departure, peak: series[seasonPeak].week, peakValue: series[seasonPeak].value, total, weeks: series.length, absentWeeks: best.run };
}

/** Recompute the phenology table from species_weekly and effort_weekly. Streams rows, so memory stays small. */
export async function recomputePhenology(): Promise<{ pairs: number; seasons: number }> {
  const effort = new Map<string, Map<string, number>>(); // cell -> week -> detections
  for (const e of await sql<{ week: string; cell_lat: number; cell_lon: number; detections: number }[]>`
    SELECT week::text, cell_lat, cell_lon, detections FROM effort_weekly
    WHERE detections >= ${MIN_EFFORT_WEEK} AND week <= CURRENT_DATE - 7 ORDER BY week`) {
    const k = `${e.cell_lat},${e.cell_lon}`;
    if (!effort.has(k)) effort.set(k, new Map());
    effort.get(k)!.set(e.week, e.detections);
  }

  const out: Record<string, unknown>[] = [];
  let pairs = 0;
  let key = "", name = "", vern: string | null = null, cell = "", counts = new Map<string, number>();
  const flush = () => {
    if (!key) return;
    pairs++;
    const weeks = effort.get(cell);
    if (!weeks) return;
    const series: WeekPoint[] = [...weeks.entries()].map(([week, eff]) => { const n = counts.get(week) ?? 0; return { week, n, value: (1000 * n) / eff }; });
    const s = detectSeason(series);
    if (!s) return;
    const [lat, lon] = cell.split(",").map(Number);
    out.push({ scientific_name: name, vernacular_name: vern, cell_lat: lat, cell_lon: lon, arrival_week: s.arrival, departure_week: s.departure, peak_week: s.peak,
      peak_index: s.peakValue, total_n: s.total, weeks_observed: s.weeks, absent_weeks: s.absentWeeks, methods_version: METHODS_VERSION });
  };
  await sql<{ scientific_name: string; vernacular_name: string | null; cell_lat: number; cell_lon: number; week: string; n: number }[]>`
    SELECT scientific_name, MIN(vernacular_name) AS vernacular_name, cell_lat, cell_lon, week::text, SUM(count)::int AS n
    FROM species_weekly WHERE week <= CURRENT_DATE - 7
    GROUP BY scientific_name, cell_lat, cell_lon, week
    ORDER BY scientific_name, cell_lat, cell_lon, week
  `.cursor(20000, (rows) => {
    for (const r of rows) {
      const k = `${r.scientific_name}|${r.cell_lat},${r.cell_lon}`;
      if (k !== key) { flush(); key = k; name = r.scientific_name; vern = r.vernacular_name; cell = `${r.cell_lat},${r.cell_lon}`; counts = new Map(); }
      counts.set(r.week, r.n);
    }
  });
  flush();

  await sql.begin(async (tx) => {
    await tx`TRUNCATE phenology`;
    for (let i = 0; i < out.length; i += 2000) await tx`INSERT INTO phenology ${tx(out.slice(i, i + 2000))}`;
  });
  return { pairs, seasons: out.length };
}
