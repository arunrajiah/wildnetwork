import { getSpeciesMedia } from "@/lib/media";

/** ?names=Parkesia motacilla,Tyto alba  (max 40) -> { [scientificName]: media } */
export async function GET(req: Request) {
  const names = (new URL(req.url).searchParams.get("names") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 40);
  const out: Record<string, unknown> = {};
  await Promise.all(names.map(async (n) => { out[n] = await getSpeciesMedia(n); }));
  return Response.json(out, { headers: { "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
}
