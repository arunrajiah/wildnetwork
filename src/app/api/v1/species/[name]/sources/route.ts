import { sql } from "@/lib/db";
import { METHODS_VERSION, REGION, SMALL_CLASS, minAcousticWeek, minObservedWeek } from "@/lib/methods";
import { PHENOLOGY, detectSeason, type WeekPoint } from "@/lib/phenology";
import { corrInterval } from "@/lib/uncertainty";

export const revalidate = 3600;

/**
 * Heard versus seen: one species' weekly rhythm in acoustic detections (BirdWeather) and in human records (GBIF),
 * over the same cells and weeks only, so differences are not just differences in where each source looks.
 * Each value is the species' share of its own source's records of that class (per 1,000). See /methods#two-sources.
 * Shown on the site only; not part of the data release.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const name = decodeURIComponent((await ctx.params).name);
  const [{ grp } = { grp: "avian" }] = await sql<{ grp: string }[]>`SELECT grp FROM species_group WHERE scientific_name = ${name}`;
  const rows = await sql<{ week: string; region: string; cells: number; na: number; ea: number; no: number; eo: number }[]>`
    WITH range AS (
      SELECT DISTINCT cell_lat, cell_lon FROM species_weekly
      WHERE scientific_name = ${name} AND week >= CURRENT_DATE - 371 AND source_system IN ('birdweather', 'gbif')
    ), co AS (
      SELECT e.week, e.cell_lat, e.cell_lon,
             MAX(e.detections) FILTER (WHERE e.source_system = 'birdweather') AS ea,
             MAX(e.detections) FILTER (WHERE e.source_system = 'gbif') AS eo
      FROM effort_weekly_source e JOIN range USING (cell_lat, cell_lon)
      WHERE e.grp = ${grp} AND e.week >= CURRENT_DATE - 371 AND e.week <= CURRENT_DATE - 7 AND e.source_system IN ('birdweather', 'gbif')
      GROUP BY 1, 2, 3
      HAVING COALESCE(MAX(e.detections) FILTER (WHERE e.source_system = 'birdweather'), 0) >= ${minAcousticWeek(grp)}
         AND COALESCE(MAX(e.detections) FILTER (WHERE e.source_system = 'gbif'), 0) >= ${minObservedWeek(grp)}
    ), sp AS (
      SELECT week, cell_lat, cell_lon,
             SUM(count) FILTER (WHERE source_system = 'birdweather') AS na,
             SUM(count) FILTER (WHERE source_system = 'gbif') AS no
      FROM species_weekly WHERE scientific_name = ${name} AND week >= CURRENT_DATE - 371 GROUP BY 1, 2, 3
    )
    SELECT co.week::text AS week, ${REGION} AS region, COUNT(*)::int AS cells,
           COALESCE(SUM(sp.na), 0)::int AS na, SUM(co.ea)::float AS ea, COALESCE(SUM(sp.no), 0)::int AS no, SUM(co.eo)::float AS eo
    FROM co LEFT JOIN sp USING (week, cell_lat, cell_lon)
    GROUP BY 1, 2 ORDER BY 1`;

  // One continent only: seasons differ between hemispheres, so mixing them would blur both curves.
  type Row = (typeof rows)[number];
  const byRegion = new Map<string, Row[]>();
  rows.forEach((r) => byRegion.set(r.region, [...(byRegion.get(r.region) ?? []), r]));
  const best = [...byRegion.entries()].sort((a, b) => b[1].reduce((s, r) => s + r.na + r.no, 0) - a[1].reduce((s, r) => s + r.na + r.no, 0))[0];
  const empty = { scientificName: name, methods: METHODS_VERSION, group: grp, region: null, weeks: [], r: null, lag: null, arrival: { acoustic: null, observed: null } };
  if (!best || best[1].length < 8) return Response.json(empty);

  const weeks = best[1].map((r) => ({ week: r.week, cells: r.cells, acoustic: { n: r.na, index: (1000 * r.na) / r.ea }, observed: { n: r.no, index: (1000 * r.no) / r.eo } }));
  const a = weeks.map((w) => w.acoustic.index), o = weeks.map((w) => w.observed.index);

  // Agreement: correlation of the two weekly series, and the shift (in weeks) that agrees best.
  const corr = (x: number[], y: number[]) => {
    const n = x.length; if (n < 6) return null;
    const mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
  };
  const r0 = corr(a, o);
  let lag = 0, rBest = r0 ?? -1;
  for (let k = -4; k <= 4; k++) {
    if (!k) continue;
    // k > 0: human records follow acoustic detections by k weeks.
    const x = k > 0 ? a.slice(0, -k) : a.slice(-k), y = k > 0 ? o.slice(k) : o.slice(0, k);
    const r = corr(x, y);
    if (r != null && r > rBest + 0.05) { rBest = r; lag = k; }
  }
  // A shift is only worth reporting when the shifted series actually agree.
  const lagOut = rBest >= 0.5 ? lag : null;

  const limits = grp === "avian" ? PHENOLOGY : { ...PHENOLOGY, MIN_TOTAL: Math.ceil(PHENOLOGY.MIN_TOTAL * SMALL_CLASS.SCALE), MIN_PEAK_N: Math.ceil(PHENOLOGY.MIN_PEAK_N * SMALL_CLASS.SCALE), MIN_WEEKS_OBSERVED: 16 };
  const season = (key: "acoustic" | "observed") => detectSeason(weeks.map((w): WeekPoint => ({ week: w.week, n: w[key].n, value: w[key].index })), limits)?.arrival ?? null;

  return Response.json({
    scientificName: name, methods: METHODS_VERSION, group: grp, region: best[0],
    medianCells: weeks.map((w) => w.cells).sort((x, y) => x - y)[Math.floor(weeks.length / 2)],
    weeks: weeks.map((w) => ({ week: w.week, cells: w.cells, acoustic: { n: w.acoustic.n, index: Math.round(w.acoustic.index * 100) / 100 }, observed: { n: w.observed.n, index: Math.round(w.observed.index * 100) / 100 } })),
    r: r0 == null ? null : Math.round(r0 * 100) / 100,
    // 95% interval by resampling 4-week blocks, which keeps the series' autocorrelation (see /methods#uncertainty).
    rInterval: (() => { const ci = r0 == null ? null : corrInterval(a, o, `sources|${name}`); return ci ? [Math.round(ci[0] * 100) / 100, Math.round(ci[1] * 100) / 100] : null; })(),
    lag: r0 == null ? null : lagOut,
    arrival: { acoustic: season("acoustic"), observed: season("observed") },
  });
}
