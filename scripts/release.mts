// Build an open data release from GBIF-derived tables only (CC0 / CC BY 4.0 records, so the release can be shared).
// BirdWeather-derived data is not included: redistribution has not been agreed with BirdWeather.
// Usage: tsx --env-file=.env.production.local scripts/release.mts   -> release/wildnetwork-open-<date>/ and a .zip
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
const COMMIT = execSync("git rev-parse --short HEAD").toString().trim();
const RELEASE_NO = process.argv[2] ?? "1";
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

// GBIF backbone species key for every name, so rows join reliably to other datasets (names differ between taxonomies).
// A few names map to two keys (synonyms merged in the weekly rollup); the lowest key is used.
const keys = new Map((await sql<{ scientific_name: string; key: number }[]>`SELECT scientific_name, MIN(species_key)::int AS key FROM gbif_taxa GROUP BY 1`).map((r) => [r.scientific_name, r.key]));

const weekly = await csv("weekly_records.csv", ["week", "cell_lat", "cell_lon", "class", "scientific_name", "gbif_species_key", "vernacular_name", "records"],
  sql`SELECT s.week::text AS week, s.cell_lat, s.cell_lon, COALESCE(g.grp, 'other') AS class, s.scientific_name, t.key AS gbif_species_key, s.vernacular_name, s.count AS records
      FROM species_weekly s LEFT JOIN species_group g USING (scientific_name)
      LEFT JOIN (SELECT scientific_name, MIN(species_key)::int AS key FROM gbif_taxa GROUP BY 1) t USING (scientific_name)
      WHERE s.source_system = 'gbif' AND s.week >= ${range.first} AND s.week <= ${range.last}
      ORDER BY s.week, s.cell_lat, s.cell_lon, s.scientific_name`.cursor(20000));

const effort = await csv("effort.csv", ["week", "cell_lat", "cell_lon", "class", "records", "species"],
  sql`SELECT week::text AS week, cell_lat, cell_lon, grp AS class, detections AS records, species
      FROM effort_weekly_source WHERE source_system = 'gbif' AND week >= ${range.first} AND week <= ${range.last}
      ORDER BY week, cell_lat, cell_lon, grp`.cursor(20000));

const seasons = (await computeSeasons("gbif")).rows;
const arrivals = await csv("arrivals.csv", ["scientific_name", "gbif_species_key", "vernacular_name", "cell_lat", "cell_lon", "arrival_week", "arrival_low", "arrival_high", "arrival_support", "peak_week", "departure_week", "peak_per_1000", "records", "weeks_observed", "absent_weeks_before"],
  [seasons.map((s) => ({ ...s, gbif_species_key: keys.get(String(s.scientific_name)) ?? "", peak_per_1000: Math.round(Number(s.peak_index) * 100) / 100, records: s.total_n, absent_weeks_before: s.absent_weeks }))]);

const taxa = await csv("taxa.csv", ["gbif_species_key", "scientific_name", "vernacular_name", "class", "records", "cells", "weeks"],
  [await sql`SELECT t.key AS gbif_species_key, s.scientific_name, MIN(s.vernacular_name) AS vernacular_name, COALESCE(MIN(g.grp), 'other') AS class,
                    SUM(s.count)::int AS records, COUNT(DISTINCT (s.cell_lat, s.cell_lon))::int AS cells, COUNT(DISTINCT s.week)::int AS weeks
             FROM species_weekly s LEFT JOIN species_group g USING (scientific_name)
             LEFT JOIN (SELECT scientific_name, MIN(species_key)::int AS key FROM gbif_taxa GROUP BY 1) t USING (scientific_name)
             WHERE s.source_system = 'gbif' AND s.week >= ${range.first} AND s.week <= ${range.last}
             GROUP BY 1, 2 ORDER BY 2`]);

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
      // The dataset licence can be stricter than the records counted here: only records licensed CC0 or CC BY 4.0 are used.
      const lic = d.license ?? "";
      sets.push({ dataset_key: f.name, title: d.title, doi: d.doi ?? "", dataset_license: lic.includes("zero") ? "CC0 1.0" : lic.includes("by-nc") ? "CC BY-NC 4.0" : lic.includes("/by/") ? "CC BY 4.0" : lic, records_used: f.count });
    } catch { sets.push({ dataset_key: f.name, title: "", doi: "", dataset_license: "", records_used: f.count }); }
  }
}));
sets.sort((a, b) => Number(b.records_used) - Number(a.records_used));
const datasets = await csv("datasets.csv", ["dataset_key", "title", "doi", "dataset_license", "records_used"], [sets]);

const doc = `# WildNetwork open data release ${RELEASE_NO} (${today})

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
| gbif_species_key | GBIF backbone species key (join on this, not on the name) |
| vernacular_name | English name most checklists agree on, where one exists |
| records | number of GBIF occurrence records of the species in that cell and week |

### effort.csv (${effort.toLocaleString("en-GB")} rows)
All records of a class in a cell and week, the denominator for effort correction. A species' share of its class (records / effort records) removes most of the difference between busy and quiet places. WildNetwork treats a cell-week as watched by observers at ${OBSERVED.MIN_EFFORT_WEEK} bird records (${OBSERVED.SMALL_MIN_EFFORT_WEEK} for other classes).

### arrivals.csv (${arrivals.toLocaleString("en-GB")} rows)
Seasonal timing per species and cell, from this data alone. arrival_low and arrival_high give a 90% interval for the arrival week, from re-detecting it on weekly counts redrawn 40 times with the series' own overdispersion (gamma-Poisson); arrival_support is the share of those redraws that found a season at all (below 0.5, treat the arrival as weak). arrival_week is the first week the species reaches a tenth of its seasonal peak share after at least six weeks below it, in a cell watched in the weeks before. peak_per_1000 is the peak share per 1,000 records of its class. Full definition and known limits: https://wildnetwork.arunrajiah.com/methods

### taxa.csv (${taxa.toLocaleString("en-GB")} rows)
One row per species in this release: GBIF species key, name, English name, class, total records, cells and weeks with records.

To join other data (for example BirdNET or eBird names, which follow other taxonomies), match your names to GBIF keys with the GBIF species match service, https://api.gbif.org/v1/species/match?name=<name>, and join on gbif_species_key. Use the acceptedUsageKey where a name is a synonym.

### datasets.csv (${datasets.toLocaleString("en-GB")} rows)
The GBIF datasets whose records fall in the classes and weeks above, with DOIs, the dataset's own licence, and how many of its records were used (only records individually licensed CC0 or CC BY 4.0 are used, even where the dataset as a whole carries a stricter licence such as CC BY-NC). Cite them as GBIF asks: https://www.gbif.org/citation-guidelines

## How this release was made
- Code: https://github.com/arunrajiah/wildnetwork at commit ${COMMIT}, script scripts/release.mts; methods version ${METHODS_VERSION} (definitions at https://wildnetwork.arunrajiah.com/methods).
- Weekly counts: GBIF occurrence search API (https://api.gbif.org/v1/occurrence/search), one facet query per 5 degree cell and week, facet=speciesKey, with license=CC0_1_0 and CC_BY_4_0, hasCoordinate=true, hasGeospatialIssue=false, occurrenceStatus=PRESENT, basisOfRecord in HUMAN_OBSERVATION, MACHINE_OBSERVATION, OBSERVATION, OCCURRENCE, and taxonKey 212 (Aves), 734 (Chiroptera), 131 (Amphibia), 216 (Insecta). Cells queried: every 5 degree cell with at least 10 such bird records in the 90 days before the cell list was built.
- Effort: the same counts summed over all species of a class per cell and week.
- Arrivals: computed from these counts alone by computeSeasons("gbif") in src/lib/phenology.ts.
- Records were accessed from GBIF between 3 and ${Number(today.slice(8))} October ${today.slice(0, 4)}; GBIF data changes as publishers update, so a rebuild later will differ slightly.

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
version: "${RELEASE_NO}"
license: CC-BY-4.0
url: "https://wildnetwork.arunrajiah.com/data"
repository-code: "https://github.com/arunrajiah/wildnetwork"
`);
execSync(`cd release && rm -f ${name}.zip && zip -qr ${name}.zip ${name}`);
console.log(execSync(`ls -la release/${name} release/${name}.zip`).toString());
await sql.end();
