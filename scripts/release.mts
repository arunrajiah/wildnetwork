// Build an open data release from GBIF-derived tables only (CC0 / CC BY 4.0 records, so the release can be shared).
// BirdWeather-derived data is not included: redistribution has not been agreed with BirdWeather.
// Usage: tsx --env-file=.env.production.local scripts/release.mts   -> release/wildnetwork-open-<date>/ and a .zip
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { sql } from "../src/lib/db";
import { CLASS_TAXA, baseParams, gbifJson } from "../src/lib/gbif";
import { METHODS_VERSION, OBSERVED } from "../src/lib/methods";
import { computeSeasons } from "../src/lib/phenology";

const today = new Date().toISOString().slice(0, 10);
const name = `wildnetwork-open-${today}`;
const dir = `release/${name}`;
mkdirSync(dir, { recursive: true });
const esc = (v: unknown) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

async function csv(file: string, cols: string[], rows: AsyncIterable<Record<string, unknown>[]> | Record<string, unknown>[][]) {
  const out = createWriteStream(`${dir}/${file}`);
  out.write(cols.join(",") + "\n");
  let n = 0;
  for await (const batch of rows) for (const r of batch) { out.write(cols.map((c) => esc(r[c])).join(",") + "\n"); n++; }
  await new Promise((r) => out.end(r));
  console.log(file, n, "rows");
  return n;
}

const [range] = await sql<{ first: string; last: string }[]>`
  SELECT MIN(week)::text AS first, MAX(week)::text AS last FROM species_weekly
  WHERE source_system = 'gbif' AND week >= CURRENT_DATE - 371 AND week <= CURRENT_DATE - 14`;

const weekly = await csv("weekly_records.csv", ["week", "cell_lat", "cell_lon", "class", "scientific_name", "vernacular_name", "records"],
  sql`SELECT s.week::text AS week, s.cell_lat, s.cell_lon, COALESCE(g.grp, 'other') AS class, s.scientific_name, s.vernacular_name, s.count AS records
      FROM species_weekly s LEFT JOIN species_group g USING (scientific_name)
      WHERE s.source_system = 'gbif' AND s.week >= ${range.first} AND s.week <= ${range.last}
      ORDER BY s.week, s.cell_lat, s.cell_lon, s.scientific_name`.cursor(20000));

const effort = await csv("effort.csv", ["week", "cell_lat", "cell_lon", "class", "records", "species"],
  sql`SELECT week::text AS week, cell_lat, cell_lon, grp AS class, detections AS records, species
      FROM effort_weekly_source WHERE source_system = 'gbif' AND week >= ${range.first} AND week <= ${range.last}
      ORDER BY week, cell_lat, cell_lon, grp`.cursor(20000));

const seasons = (await computeSeasons("gbif")).rows;
const arrivals = await csv("arrivals.csv", ["scientific_name", "vernacular_name", "cell_lat", "cell_lon", "arrival_week", "peak_week", "departure_week", "peak_per_1000", "records", "weeks_observed", "absent_weeks_before"],
  [seasons.map((s) => ({ ...s, peak_per_1000: Math.round(Number(s.peak_index) * 100) / 100, records: s.total_n, absent_weeks_before: s.absent_weeks }))]);

// Contributing GBIF datasets, for citation: one facet query over the same classes, licences and dates.
const p = baseParams();
for (const c of CLASS_TAXA) p.append("taxonKey", String(c.key));
p.set("eventDate", `${range.first},${new Date(Date.parse(range.last) + 6 * 86400_000).toISOString().slice(0, 10)}`);
p.set("facet", "datasetKey"); p.set("facetLimit", "2000"); p.set("limit", "0");
const facets = (await gbifJson<{ facets: { counts: { name: string; count: number }[] }[] }>("/occurrence/search", p)).facets[0]?.counts ?? [];
const sets: Record<string, unknown>[] = [];
const queue = [...facets];
await Promise.all(Array.from({ length: 3 }, async () => {
  while (queue.length) {
    const f = queue.shift()!;
    try {
      const d = await gbifJson<{ title: string; doi?: string; license?: string }>(`/dataset/${f.name}`, new URLSearchParams());
      sets.push({ dataset_key: f.name, title: d.title, doi: d.doi ?? "", license: d.license?.includes("zero") ? "CC0 1.0" : "CC BY 4.0", records: f.count });
    } catch { sets.push({ dataset_key: f.name, title: "", doi: "", license: "", records: f.count }); }
  }
}));
sets.sort((a, b) => Number(b.records) - Number(a.records));
const datasets = await csv("datasets.csv", ["dataset_key", "title", "doi", "license", "records"], [sets]);

const doc = `# WildNetwork open data release, ${today}

Weekly records of birds, bats, amphibians and insects on a 5 degree grid, with observation effort and seasonal arrival dates, from openly licensed records published through GBIF.org. Made by WildNetwork (https://wildnetwork.arunrajiah.com), methods version ${METHODS_VERSION}.

Weeks covered: ${range.first} to ${range.last} (weeks start on Monday). Licence: CC BY 4.0. Please cite this release and the GBIF datasets listed in datasets.csv.

## What is and is not included

- Included: records published to GBIF under CC0 1.0 or CC BY 4.0 only, classes Aves, Chiroptera (bats), Amphibia and Insecta, human observations and machine observations with coordinates and no geospatial issues.
- Not included: BirdWeather acoustic detections. WildNetwork shows them on its map with BirdWeather's agreement, but redistribution has not been agreed, so they are left out of every release.

## Files

### weekly_records.csv (${weekly.toLocaleString("en-GB")} rows)
| column | meaning |
|---|---|
| week | Monday of the week (ISO date) |
| cell_lat, cell_lon | south-west corner of the 5 degree cell, in degrees |
| class | avian, bat, amphibian, insect (bats are the order Chiroptera, reported separately from mammals) |
| scientific_name | GBIF backbone canonical name of the species |
| vernacular_name | English name most checklists agree on, where one exists |
| records | number of GBIF occurrence records of the species in that cell and week |

### effort.csv (${effort.toLocaleString("en-GB")} rows)
All records of a class in a cell and week, the denominator for effort correction. A species' share of its class (records / effort records) removes most of the difference between busy and quiet places. WildNetwork treats a cell-week as watched by observers at ${OBSERVED.MIN_EFFORT_WEEK} bird records (${OBSERVED.SMALL_MIN_EFFORT_WEEK} for other classes).

### arrivals.csv (${arrivals.toLocaleString("en-GB")} rows)
Seasonal timing per species and cell, from this data alone. arrival_week is the first week the species reaches a tenth of its seasonal peak share after at least six weeks below it, in a cell watched in the weeks before. peak_per_1000 is the peak share per 1,000 records of its class. Full definition and known limits: https://wildnetwork.arunrajiah.com/methods

### datasets.csv (${datasets.toLocaleString("en-GB")} rows)
The GBIF datasets whose records fall in the classes, licences and weeks above, with record counts and DOIs. Cite them as GBIF asks: https://www.gbif.org/citation-guidelines

## Limits
Counts are records, not animals: they follow where and when people look and report. Coverage is uneven (strongest in northern and western Europe and North America); use effort.csv to judge it. GBIF receives records a week or two after they are made, so the most recent weeks are under-counted and are left out of this release.

## Citation
Rajiah, A. (${today.slice(0, 4)}). WildNetwork open data release ${today} [Data set]. https://wildnetwork.arunrajiah.com/data
`;
writeFileSync(`${dir}/README.md`, doc);
writeFileSync(`${dir}/CITATION.cff`, `cff-version: 1.2.0
message: "If you use this data, please cite it and the GBIF datasets in datasets.csv."
type: dataset
title: "WildNetwork open data release ${today}"
authors:
  - family-names: Rajiah
    given-names: Arun
    email: arunrajiah@gmail.com
date-released: ${today}
version: "${today}"
license: CC-BY-4.0
url: "https://wildnetwork.arunrajiah.com/data"
repository-code: "https://github.com/arunrajiah/wildnetwork"
`);
execSync(`cd release && rm -f ${name}.zip && zip -qr ${name}.zip ${name}`);
console.log(execSync(`ls -la release/${name} release/${name}.zip`).toString());
await sql.end();
