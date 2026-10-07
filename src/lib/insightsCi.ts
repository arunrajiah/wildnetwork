import { sql } from "@/lib/db";
import { MIN_CELL_DETECTIONS, REGION, minEffortDay } from "@/lib/methods";
import { BOOT, interval, resample, rng, seedOf } from "@/lib/uncertainty";

/**
 * Confidence intervals for the "Moving" and "Surging and fading" lists, by resampling 5-degree cells
 * (see /methods#uncertainty). The cell selections repeat the ones in /api/v1/insights exactly.
 */

export async function driftIntervals(rows: { scientificName: string; region: string }[]): Promise<Map<string, [number, number] | null>> {
  const out = new Map<string, [number, number] | null>();
  if (!rows.length) return out;
  const names = [...new Set(rows.map((r) => r.scientificName))];
  const cells = await sql<{ scientific_name: string; region: string; recent: boolean; cell_lat: number; w: number }[]>`
    WITH obs AS (
      SELECT sd.scientific_name, g.grp, sd.cell_lat, sd.cell_lon, (sd.day >= CURRENT_DATE - 3) AS recent, SUM(sd.count) AS n
      FROM species_daily sd JOIN species_group g USING (scientific_name)
      WHERE sd.day < CURRENT_DATE AND (sd.day >= CURRENT_DATE - 3 OR (sd.day >= CURRENT_DATE - 10 AND sd.day < CURRENT_DATE - 7))
        AND sd.scientific_name IN ${sql(names)}
      GROUP BY 1, 2, 3, 4, 5
      HAVING SUM(sd.count) >= (CASE WHEN g.grp = 'avian' THEN ${MIN_CELL_DETECTIONS}::int ELSE 2 END)
    ), eff AS (
      SELECT e.cell_lat, e.cell_lon, e.grp,
             SUM(e.detections) FILTER (WHERE e.day >= CURRENT_DATE - 3)::float AS e_recent,
             SUM(e.detections) FILTER (WHERE e.day < CURRENT_DATE - 7)::float AS e_earlier
      FROM effort_daily e
      WHERE e.day < CURRENT_DATE AND (e.day >= CURRENT_DATE - 3 OR (e.day >= CURRENT_DATE - 10 AND e.day < CURRENT_DATE - 7))
      GROUP BY 1, 2, 3
      HAVING COALESCE(SUM(e.detections) FILTER (WHERE e.day >= CURRENT_DATE - 3), 0) >= 3 * ${minEffortDay()}
         AND COALESCE(SUM(e.detections) FILTER (WHERE e.day < CURRENT_DATE - 7), 0) >= 3 * ${minEffortDay()}
    )
    SELECT o.scientific_name, ${REGION} AS region, o.recent, o.cell_lat,
           o.n::float / (CASE WHEN o.recent THEN e.e_recent ELSE e.e_earlier END) AS w
    FROM obs o JOIN eff e USING (cell_lat, cell_lon, grp)`;
  for (const row of rows) {
    const key = `${row.scientificName}|${row.region}`;
    const mine = cells.filter((c) => c.scientific_name === row.scientificName && c.region === row.region);
    const a = mine.filter((c) => c.recent), b = mine.filter((c) => !c.recent);
    if (a.length < 2 || b.length < 2) { out.set(key, null); continue; }
    const centre = (cs: typeof a, idx: number[]) => {
      let w = 0, s = 0;
      for (const i of idx) { w += cs[i].w; s += cs[i].w * (cs[i].cell_lat + 2.5); }
      return w ? s / w : NaN;
    };
    const r = rng(seedOf(`drift|${key}`));
    const vals: number[] = [];
    for (let k = 0; k < BOOT.B; k++) vals.push(centre(a, resample(a.length, r)) - centre(b, resample(b.length, r)));
    out.set(key, interval(vals));
  }
  return out;
}

export async function moverIntervals(rows: { scientificName: string; group: string }[]): Promise<Map<string, [number, number] | null>> {
  const out = new Map<string, [number, number] | null>();
  if (!rows.length) return out;
  const names = [...new Set(rows.map((r) => r.scientificName))];
  const grps = [...new Set(rows.map((r) => r.group))];
  const [effort, counts] = await Promise.all([
    sql<{ grp: string; cell: string; day: string; eff: number }[]>`
      SELECT e.grp, e.cell_lat || ',' || e.cell_lon AS cell, e.day::text AS day, e.detections::float AS eff
      FROM effort_daily e
      WHERE e.day >= CURRENT_DATE - 8 AND e.day < CURRENT_DATE AND e.grp IN ${sql(grps)} AND e.detections >= ${minEffortDay()}`,
    sql<{ scientific_name: string; cell: string; day: string; n: number }[]>`
      SELECT sd.scientific_name, sd.cell_lat || ',' || sd.cell_lon AS cell, sd.day::text AS day, SUM(sd.count)::float AS n
      FROM species_daily sd
      WHERE sd.day >= CURRENT_DATE - 8 AND sd.day < CURRENT_DATE AND sd.scientific_name IN ${sql(names)}
      GROUP BY 1, 2, 3`,
  ]);
  const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  for (const row of rows) {
    const eff = effort.filter((e) => e.grp === row.group);
    const cellIds = [...new Set(eff.map((e) => e.cell))];
    const days = [...new Set(eff.map((e) => e.day))].sort();
    const E = new Map(eff.map((e) => [`${e.cell}|${e.day}`, e.eff]));
    const N = new Map(counts.filter((c) => c.scientific_name === row.scientificName && E.has(`${c.cell}|${c.day}`)).map((c) => [`${c.cell}|${c.day}`, c.n]));
    // Same days as the point estimate: base days are those on which the species was recorded at all.
    const present = new Set([...N.keys()].map((k) => k.split("|")[1]));
    const base = days.filter((d) => d < yesterday && present.has(d));
    if (!present.has(yesterday) || base.length < 5 || cellIds.length < 3) { out.set(row.scientificName, null); continue; }
    const share = (idx: number[], d: string) => {
      let n = 0, e = 0;
      for (const i of idx) { const k = `${cellIds[i]}|${d}`; n += N.get(k) ?? 0; e += E.get(k) ?? 0; }
      return e ? n / e : NaN;
    };
    const r = rng(seedOf(`mover|${row.scientificName}`));
    const vals: number[] = [];
    for (let k = 0; k < BOOT.B; k++) {
      const idx = resample(cellIds.length, r);
      const b = base.map((d) => share(idx, d)).filter(Number.isFinite);
      const mean = b.reduce((s, v) => s + v, 0) / b.length;
      vals.push(share(idx, yesterday) / mean);
    }
    out.set(row.scientificName, interval(vals));
  }
  return out;
}
