import { sql } from "@/lib/db";
import { GBIF, UA } from "@/lib/gbif";
import { RANGE } from "@/lib/methods";

/**
 * Range check (methods 0.11). For each 5 degree cell with bird recordings, one GBIF facet query counts bird records per species
 * in the cell and its eight neighbours, all licences, since RANGE.SINCE_YEAR. Only counts are read; no records are copied.
 * A species whose share of those records is below RANGE.MAX_SHARE, in an area with at least RANGE.MIN_AREA_RECORDS records,
 * goes into range_outliers and is left out of that cell's arrival dates. Names GBIF cannot match are never flagged.
 */
async function getJson<T>(url: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
    if (res.ok) return (await res.json()) as T;
    if ((res.status === 429 || res.status >= 500) && attempt < 5) { await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt)); continue; }
    throw new Error(`gbif ${res.status}`);
  }
}

/** GBIF species keys for bird names not yet matched. */
async function matchNames(names: string[], deadline: number) {
  for (let i = 0; i < names.length; i += 4) {
    if (Date.now() > deadline) return false;
    await Promise.all(names.slice(i, i + 4).map((name) => matchName(name)));
  }
  return true;
}

async function matchName(name: string) {
  {
    const m = await getJson<{ speciesKey?: number; rank?: string; matchType?: string; class?: string }>(
      `${GBIF}/species/match?${new URLSearchParams({ name, class: "Aves", strict: "true" })}`);
    const key = m.matchType !== "NONE" && m.class === "Aves" && m.speciesKey ? m.speciesKey : null;
    await sql`INSERT INTO gbif_name_match (scientific_name, species_key) VALUES (${name}, ${key})
              ON CONFLICT (scientific_name) DO UPDATE SET species_key = EXCLUDED.species_key, matched_at = now()`;
  }
}

const EBIRD = "4fa7b334-ce0d-4e88-aaae-2e0c138d049e"; // eBird Observation Dataset on GBIF: its verbatim names follow current eBird taxonomy

/** Splits since the taxonomy BirdNET labels follow: the old name stands for either part, so records of the new species count for it. */
export const SPLITS: Record<string, string[]> = {
  "Tyto alba": ["Tyto furcata", "Tyto javanica"],
  "Larus argentatus": ["Larus smithsonianus", "Larus vegae"],
  "Empidonax occidentalis": ["Empidonax difficilis"],
  "Gallinula chloropus": ["Gallinula galeata"],
  "Ardea alba": ["Ardea modesta"],
  "Bubulcus ibis": ["Ardea ibis", "Bubulcus coromandus", "Ardea coromanda"],
  "Corvus corax": ["Corvus principalis"],
};

async function facet(params: Record<string, string>, field: string) {
  const p = new URLSearchParams({ ...params, limit: "0", facet: field, facetLimit: "10000", hasCoordinate: "true" });
  const j = await getJson<{ count: number; facets: { counts: { name: string; count: number }[] }[] }>(`${GBIF}/occurrence/search?${p}`);
  return { total: j.count, counts: new Map((j.facets[0]?.counts ?? []).map((c) => [c.name.toLowerCase(), c.count])) };
}

async function checkCell(lat: number, lon: number, labels: Set<string>) {
  const area = { decimalLatitude: `${Math.max(-90, lat - 5)},${Math.min(90, lat + 10)}`, decimalLongitude: `${Math.max(-180, lon - 5)},${Math.min(180, lon + 10)}`,
    year: `${RANGE.SINCE_YEAR},${new Date().getUTCFullYear()}` };
  const all = await facet({ ...area, classKey: "212" }, "speciesKey");
  const ebird = await facet({ ...area, datasetKey: EBIRD }, "verbatimScientificName");
  // Renames: the same species part of the name under another genus, when that other name is not itself a separate label.
  const byEpithet = new Map<string, number>();
  for (const [n, c] of ebird.counts) {
    const epithet = n.split(" ")[1];
    if (epithet && !labels.has(n)) byEpithet.set(epithet, Math.max(byEpithet.get(epithet) ?? 0, c));
  }
  const ebirdShare = (n: string) => (ebird.total ? (ebird.counts.get(n.toLowerCase()) ?? 0) / ebird.total : 0);
  const names = await sql<{ scientific_name: string; species_key: number }[]>`
    SELECT DISTINCT s.scientific_name, m.species_key FROM species_weekly s
    JOIN species_group g USING (scientific_name) JOIN gbif_name_match m USING (scientific_name)
    WHERE s.cell_lat = ${lat} AND s.cell_lon = ${lon} AND s.source_system = 'birdweather' AND g.grp = 'avian' AND m.species_key IS NOT NULL`;
  const present = (r: { scientific_name: string; species_key: number }) => {
    const n = r.scientific_name;
    if ((all.counts.get(String(r.species_key)) ?? 0) / all.total >= RANGE.MAX_SHARE) return true;
    if (ebirdShare(n) >= RANGE.MAX_SHARE) return true;
    if (ebird.total && (byEpithet.get(n.split(" ")[1]?.toLowerCase() ?? "") ?? 0) / ebird.total >= RANGE.MAX_SHARE) return true;
    return (SPLITS[n] ?? []).some((x) => ebirdShare(x) >= RANGE.MAX_SHARE);
  };
  const outliers = all.total >= RANGE.MIN_AREA_RECORDS
    ? names.filter((r) => !present(r))
        .map((r) => ({ scientific_name: r.scientific_name, cell_lat: lat, cell_lon: lon, gbif_records: all.counts.get(String(r.species_key)) ?? 0 }))
    : [];
  await sql.begin(async (tx) => {
    await tx`DELETE FROM range_outliers WHERE cell_lat = ${lat} AND cell_lon = ${lon}`;
    if (outliers.length) await tx`INSERT INTO range_outliers ${tx(outliers)}`;
    await tx`INSERT INTO range_cells (cell_lat, cell_lon, records, species) VALUES (${lat}, ${lon}, ${all.total}, ${all.counts.size})
             ON CONFLICT (cell_lat, cell_lon) DO UPDATE SET records = EXCLUDED.records, species = EXCLUDED.species, checked_at = now()`;
  });
  return outliers.length;
}

/** Match new names, then check cells never checked or older than RANGE.RECHECK_DAYS, until the time budget runs out. */
export async function refreshRange(budgetMs = 60_000): Promise<{ matched: boolean; cells: number; outliers: number }> {
  const deadline = Date.now() + budgetMs;
  const pending = await sql<{ scientific_name: string }[]>`
    SELECT DISTINCT s.scientific_name FROM species_weekly s JOIN species_group g USING (scientific_name)
    WHERE s.source_system = 'birdweather' AND g.grp = 'avian' AND g.is_species
      AND NOT EXISTS (SELECT 1 FROM gbif_name_match m WHERE m.scientific_name = s.scientific_name)`;
  const matched = await matchNames(pending.map((r) => r.scientific_name), deadline);
  if (!matched) return { matched, cells: 0, outliers: 0 };
  const cells = await sql<{ cell_lat: number; cell_lon: number }[]>`
    SELECT DISTINCT s.cell_lat, s.cell_lon FROM species_weekly s JOIN species_group g USING (scientific_name)
    LEFT JOIN range_cells r ON r.cell_lat = s.cell_lat AND r.cell_lon = s.cell_lon
    WHERE s.source_system = 'birdweather' AND g.grp = 'avian'
      AND (r.checked_at IS NULL OR r.checked_at < now() - make_interval(days => ${RANGE.RECHECK_DAYS}))
    ORDER BY 1, 2`;
  const labels = new Set((await sql<{ scientific_name: string }[]>`SELECT scientific_name FROM gbif_name_match`).map((r) => r.scientific_name.toLowerCase()));
  let done = 0, outliers = 0;
  for (const c of cells) {
    if (Date.now() > deadline) break;
    outliers += await checkCell(c.cell_lat, c.cell_lon, labels);
    done++;
  }
  return { matched, cells: done, outliers };
}
