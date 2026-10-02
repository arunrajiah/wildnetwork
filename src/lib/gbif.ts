import { sql } from "@/lib/db";
import { upsertGroups } from "@/lib/rollups";

/**
 * GBIF occurrence API (https://techdocs.gbif.org/en/openapi/v1/occurrence). Free, keyless, no login.
 * Only records published under CC0 or CC BY 4.0 are used, so every record may be shown and passed on with attribution.
 * GBIF asks that datasets are cited by DOI: see gbif_datasets and /api/v1/sources.
 * The iNaturalist dataset is skipped for live records because those are pulled directly; the weekly history keeps it.
 */
export const GBIF = "https://api.gbif.org/v1";
export const UA = "wildnetwork/0.1 (https://github.com/arunrajiah/wildnetwork; arunrajiah@gmail.com)";
export const INAT_DATASET = "50c9509d-22c7-4a22-a47d-8c48425ef4a7";
export const CELL = 5;

/** Classes pulled, as GBIF taxon keys. Bats are an order inside mammals, so mammals are not pulled as a class. */
export const CLASS_TAXA: { key: number; grp: string }[] = [
  { key: 212, grp: "avian" },      // Aves
  { key: 734, grp: "bat" },        // Chiroptera
  { key: 131, grp: "amphibian" },  // Amphibia
  { key: 216, grp: "insect" },     // Insecta
];

/** Query parameters shared by every occurrence request: licence, coordinates, observation records only. */
export function baseParams(): URLSearchParams {
  const p = new URLSearchParams();
  p.append("license", "CC0_1_0");
  p.append("license", "CC_BY_4_0");
  p.set("hasCoordinate", "true");
  p.set("hasGeospatialIssue", "false");
  p.set("occurrenceStatus", "PRESENT");
  for (const b of ["HUMAN_OBSERVATION", "MACHINE_OBSERVATION", "OBSERVATION", "OCCURRENCE"]) p.append("basisOfRecord", b);
  return p;
}

/** GBIF rate limits bursts (429). Retry with backoff; be polite rather than fast. */
export async function gbifJson<T>(path: string, params: URLSearchParams): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${GBIF}${path}?${params}`, { headers: { "user-agent": UA, accept: "application/json" } });
    if (res.ok) return (await res.json()) as T;
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      await new Promise((r) => setTimeout(r, Math.min(60_000, 1500 * 2 ** attempt)));
      continue;
    }
    throw new Error(`gbif ${res.status} ${path}`);
  }
}

export const cellPolygon = (c: { lat: number; lon: number }) =>
  `POLYGON((${c.lon} ${c.lat},${c.lon + CELL} ${c.lat},${c.lon + CELL} ${c.lat + CELL},${c.lon} ${c.lat + CELL},${c.lon} ${c.lat}))`;

const taxa = new Map<number, { scientific_name: string; vernacular_name: string | null; grp: string }>();

/** Species key -> name and class, cached in memory and in gbif_taxa. */
export async function resolveTaxa(keys: number[], grp: string): Promise<void> {
  const missing = keys.filter((k) => !taxa.has(k));
  if (missing.length) {
    const rows = await sql<{ species_key: number; scientific_name: string; vernacular_name: string | null; grp: string }[]>`
      SELECT species_key, scientific_name, vernacular_name, grp FROM gbif_taxa WHERE species_key IN ${sql(missing)}`;
    for (const r of rows) taxa.set(r.species_key, r);
  }
  const fetchKeys = missing.filter((k) => !taxa.has(k));
  await Promise.all(fetchKeys.map(async (k) => {
    try {
      const s = await gbifJson<{ canonicalName?: string; scientificName: string; vernacularName?: string }>(`/species/${k}`, new URLSearchParams());
      let vern = s.vernacularName ?? null;
      if (!vern) {
        const v = await gbifJson<{ results: { vernacularName: string; language?: string }[] }>(`/species/${k}/vernacularNames`, new URLSearchParams({ limit: "100" })).catch(() => null);
        vern = v?.results.find((x) => x.language === "eng")?.vernacularName ?? null;
      }
      const row = { scientific_name: s.canonicalName ?? s.scientificName, vernacular_name: vern, grp };
      taxa.set(k, row);
      await sql`INSERT INTO gbif_taxa (species_key, scientific_name, vernacular_name, grp) VALUES (${k}, ${row.scientific_name}, ${row.vernacular_name}, ${grp}) ON CONFLICT (species_key) DO NOTHING`;
    } catch { /* unresolved keys are skipped in this run */ }
  }));
}

export const taxon = (k: number) => taxa.get(k);

/**
 * One cell, one week, one class: species counts straight from GBIF's facet, no records downloaded.
 * Writes species_weekly rows with source_system 'gbif'. Returns rows written.
 */
export async function rollupGbifCellWeek(cell: { lat: number; lon: number }, week: string, cls = CLASS_TAXA): Promise<number> {
  const end = new Date(Date.parse(week) + 6 * 86400_000).toISOString().slice(0, 10);
  let total = 0;
  for (const c of cls) {
    const p = baseParams();
    p.set("taxonKey", String(c.key));
    p.set("eventDate", `${week},${end}`);
    p.set("geometry", cellPolygon(cell));
    p.set("facet", "speciesKey");
    p.set("facetLimit", "300");
    p.set("limit", "0");
    const j = await gbifJson<{ count: number; facets: { field: string; counts: { name: string; count: number }[] }[] }>("/occurrence/search", p);
    const counts = j.facets?.[0]?.counts ?? [];
    if (!counts.length) continue;
    await resolveTaxa(counts.map((x) => Number(x.name)), c.grp);
    const rows = counts.flatMap((x) => {
      const t = taxon(Number(x.name));
      return t ? [{ week, source_system: "gbif", scientific_name: t.scientific_name, vernacular_name: t.vernacular_name, cell_lat: cell.lat, cell_lon: cell.lon, count: x.count, high_conf_count: x.count }] : [];
    });
    if (!rows.length) continue;
    await upsertGroups(rows.map((r) => ({ name: r.scientific_name, grp: c.grp })));
    await sql`
      INSERT INTO species_weekly ${sql(rows)}
      ON CONFLICT (week, source_system, scientific_name, cell_lat, cell_lon) DO UPDATE SET
        count = EXCLUDED.count, high_conf_count = EXCLUDED.high_conf_count, vernacular_name = COALESCE(EXCLUDED.vernacular_name, species_weekly.vernacular_name)`;
    total += rows.length;
  }
  return total;
}

/** Cells with at least 10 licensed bird records in the last 90 days. About 2,000 count-only queries; refreshed when older than 30 days. */
export async function gbifCells(force = false): Promise<{ lat: number; lon: number }[]> {
  const have = await sql<{ cell_lat: number; cell_lon: number; age: number }[]>`SELECT cell_lat, cell_lon, EXTRACT(EPOCH FROM now() - checked_at) AS age FROM gbif_cells`;
  if (have.length && !force && Math.max(...have.map((h) => Number(h.age))) < 30 * 86400) return have.map((h) => ({ lat: h.cell_lat, lon: h.cell_lon }));
  const since = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const jobs: { lat: number; lon: number }[] = [];
  for (let lat = -60; lat < 80; lat += CELL) for (let lon = -180; lon < 180; lon += CELL) jobs.push({ lat, lon });
  const found: { cell_lat: number; cell_lon: number; n: number }[] = [];
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (jobs.length) {
      const c = jobs.shift()!;
      const p = baseParams();
      p.set("taxonKey", "212"); p.set("eventDate", `${since},${today}`); p.set("geometry", cellPolygon(c)); p.set("limit", "0");
      try {
        const j = await gbifJson<{ count: number }>("/occurrence/search", p);
        if (j.count >= 10) found.push({ cell_lat: c.lat, cell_lon: c.lon, n: j.count });
      } catch { /* a missed cell is picked up next refresh */ }
    }
  }));
  if (found.length) {
    await sql`DELETE FROM gbif_cells`;
    await sql`INSERT INTO gbif_cells ${sql(found)}`;
  }
  return found.map((f) => ({ lat: f.cell_lat, lon: f.cell_lon }));
}

/**
 * Keep the weekly history current: the last `weeks` weeks for every active cell, within a time budget
 * (GBIF indexes records days after they are observed, so recent weeks keep changing).
 */
export async function refreshGbifWeekly(weeks = 3, budgetMs = 240_000): Promise<{ cells: number; rows: number; errors: number; done: number; total: number }> {
  const t0 = Date.now();
  const cells = await gbifCells();
  const now = new Date();
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)));
  const jobs = Array.from({ length: weeks }, (_, w) => new Date(monday.getTime() - w * 7 * 86400_000).toISOString().slice(0, 10)).flatMap((week) => cells.map((cell) => ({ cell, week })));
  const total = jobs.length;
  let rows = 0, errors = 0, done = 0;
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (jobs.length && Date.now() - t0 < budgetMs) {
      const j = jobs.shift()!;
      try { rows += await rollupGbifCellWeek(j.cell, j.week); } catch { errors++; }
      done++;
    }
  }));
  return { cells: cells.length, rows, errors, done, total };
}

/** Remember a publisher for the credits. */
export async function noteDataset(key: string, n: number): Promise<void> {
  const [row] = await sql`SELECT 1 FROM gbif_datasets WHERE dataset_key = ${key}`;
  if (row) { await sql`UPDATE gbif_datasets SET n = n + ${n}, last_seen = now() WHERE dataset_key = ${key}`; return; }
  try {
    const d = await gbifJson<{ title: string; doi?: string; license?: string; publishingOrganizationKey?: string }>(`/dataset/${key}`, new URLSearchParams());
    let publisher: string | null = null;
    if (d.publishingOrganizationKey) {
      try { publisher = (await gbifJson<{ title: string }>(`/organization/${d.publishingOrganizationKey}`, new URLSearchParams())).title; } catch { /* optional */ }
    }
    await sql`INSERT INTO gbif_datasets (dataset_key, title, doi, license, publisher, n) VALUES (${key}, ${d.title}, ${d.doi ?? null}, ${d.license ?? null}, ${publisher}, ${n}) ON CONFLICT (dataset_key) DO UPDATE SET n = gbif_datasets.n + EXCLUDED.n, last_seen = now()`;
  } catch { /* credited next time it is seen */ }
}
