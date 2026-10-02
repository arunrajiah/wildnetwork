import { sql } from "@/lib/db";

export const revalidate = 3600;

/** Where the data comes from, for the credits: GBIF publishers by number of records seen, with DOI and licence. */
export async function GET() {
  const gbif = await sql`SELECT dataset_key, title, doi, license, publisher, n FROM gbif_datasets ORDER BY n DESC LIMIT 40`;
  return Response.json({
    gbif: gbif.map((d) => ({
      datasetKey: d.dataset_key, title: d.title, doi: d.doi, publisher: d.publisher, records: d.n,
      license: d.license?.includes("zero") ? "CC0" : d.license?.includes("/by/") ? "CC BY 4.0" : d.license ?? null,
      url: `https://www.gbif.org/dataset/${d.dataset_key}`,
    })),
  }, { headers: { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
