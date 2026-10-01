// Validate WildNetwork arrival weeks against iNaturalist human observations (independent modality).
// Usage: pnpm exec tsx --env-file=.env.production.local scripts/validate.mts [pairs=300]
// Writes src/data/validation.json. Same detection rule on both sides (detectSeason), thresholds relaxed for iNat's smaller counts.
import { writeFileSync } from "node:fs";
import { sql } from "../src/lib/db";
import { METHODS_VERSION } from "../src/lib/methods";
import { PHENOLOGY, detectSeason, type WeekPoint } from "../src/lib/phenology";

const LIMIT = Number(process.argv[2] ?? 300);
const PER_SPECIES = 6;
const INAT_LIMITS = { ...PHENOLOGY, MIN_TOTAL: 15, MIN_PEAK_N: 3, MIN_WEEKS_OBSERVED: 26 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const weeks = (await sql<{ week: string }[]>`SELECT DISTINCT week::text FROM effort_weekly WHERE week <= CURRENT_DATE - 7 ORDER BY 1`).map((r) => r.week);
const d1 = weeks[0], d2 = new Date(Date.parse(weeks[weeks.length - 1]) + 6 * 86400_000).toISOString().slice(0, 10);

// Objective sample: best sampled arrivals in the first half of the year, capped per species.
const candidates = await sql<{ scientific_name: string; vernacular_name: string | null; cell_lat: number; cell_lon: number; arrival_week: string; peak_week: string; total_n: number }[]>`
  SELECT scientific_name, vernacular_name, cell_lat, cell_lon, arrival_week::text, peak_week::text, total_n FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY scientific_name ORDER BY total_n DESC) AS rk FROM phenology
    WHERE arrival_week BETWEEN '2026-02-01' AND '2026-07-15' AND absent_weeks >= 8
  ) x WHERE rk <= ${PER_SPECIES} ORDER BY total_n DESC LIMIT ${LIMIT}`;
console.log(`${candidates.length} candidate pairs, weeks ${d1} to ${d2}`);

const pairs: Record<string, unknown>[] = [];
let notComparable = 0, failed = 0;
for (const [i, c] of candidates.entries()) {
  const u = new URL("https://api.inaturalist.org/v1/observations/histogram");
  u.search = new URLSearchParams({
    taxon_name: c.scientific_name, date_field: "observed", interval: "week", d1, d2, quality_grade: "research",
    swlat: String(c.cell_lat), swlng: String(c.cell_lon), nelat: String(c.cell_lat + 5), nelng: String(c.cell_lon + 5),
  }).toString();
  try {
    const r = await fetch(u, { headers: { "user-agent": "wildnetwork-validation/0.2 (https://github.com/arunrajiah/wildnetwork)" } });
    if (!r.ok) throw new Error(String(r.status));
    const hist = ((await r.json()) as { results: { week: Record<string, number> } }).results.week;
    const series: WeekPoint[] = weeks.map((w) => ({ week: w, n: hist[w] ?? 0, value: hist[w] ?? 0 }));
    const s = detectSeason(series, INAT_LIMITS);
    if (!s) { notComparable++; }
    else {
      pairs.push({
        sci: c.scientific_name, common: c.vernacular_name, lat: c.cell_lat, lon: c.cell_lon,
        ours: c.arrival_week, inat: s.arrival, diffWeeks: Math.round((Date.parse(c.arrival_week) - Date.parse(s.arrival)) / (7 * 86400_000)),
        oursPeak: c.peak_week, inatPeak: s.peak, n: c.total_n, inatN: s.total,
      });
    }
  } catch (e) { failed++; if (failed < 4) console.error(c.scientific_name, String(e)); }
  if ((i + 1) % 25 === 0) console.log(`${i + 1}/${candidates.length} comparable ${pairs.length} not comparable ${notComparable} failed ${failed}`);
  await sleep(1100); // stay under iNaturalist's 60 requests a minute
}

const diffs = pairs.map((p) => p.diffWeeks as number).sort((a, b) => a - b);
const q = (f: number) => diffs[Math.min(diffs.length - 1, Math.floor(f * diffs.length))];
const mean = diffs.reduce((a, b) => a + b, 0) / (diffs.length || 1);
const xs = pairs.map((p) => Date.parse(p.inat as string)), ys = pairs.map((p) => Date.parse(p.ours as string));
const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
let sxy = 0, sxx = 0, syy = 0;
xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; syy += (ys[i] - my) ** 2; });
const summary = {
  generatedAt: new Date().toISOString(), methods: METHODS_VERSION, weeks: [d1, d2],
  candidates: candidates.length, comparable: pairs.length, notComparable, failed, species: new Set(pairs.map((p) => p.sci)).size,
  medianDiff: q(0.5), meanDiff: Math.round(mean * 100) / 100, p10: q(0.1), p90: q(0.9),
  mae: Math.round((diffs.reduce((a, b) => a + Math.abs(b), 0) / (diffs.length || 1)) * 100) / 100,
  within1: Math.round((100 * diffs.filter((d) => Math.abs(d) <= 1).length) / (diffs.length || 1)),
  within2: Math.round((100 * diffs.filter((d) => Math.abs(d) <= 2).length) / (diffs.length || 1)),
  within4: Math.round((100 * diffs.filter((d) => Math.abs(d) <= 4).length) / (diffs.length || 1)),
  pearson: Math.round((sxy / Math.sqrt(sxx * syy)) * 100) / 100,
};
writeFileSync("src/data/validation.json", JSON.stringify({ summary, pairs }, null, 1));
console.log(summary);
await sql.end();
