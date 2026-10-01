import { sql } from "@/lib/db";

export interface SpeciesMedia {
  scientificName: string;
  title: string | null;
  thumbUrl: string | null;
  imageUrl: string | null;
  extract: string | null;
  pageUrl: string | null;
  source: string;
  attribution: string | null;
  license: string | null;
  iconic: string | null;
}

const UA = "wildnetwork/0.1 (https://github.com/arunrajiah/wildnetwork)";

type Found = Omit<SpeciesMedia, "scientificName" | "iconic">;

async function fromWikipedia(name: string): Promise<Found | null> {
  const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name.replace(/ /g, "_"))}`, { headers: { "user-agent": UA } });
  if (!r.ok) return null;
  const j = (await r.json()) as { type?: string; title?: string; thumbnail?: { source: string }; originalimage?: { source: string }; extract?: string; content_urls?: { desktop?: { page: string } } };
  if (j.type === "disambiguation" || !j.title) return null;
  return {
    title: j.title, thumbUrl: j.thumbnail?.source?.split("?")[0] ?? null, imageUrl: j.originalimage?.source?.split("?")[0] ?? null,
    extract: j.extract ?? null, pageUrl: j.content_urls?.desktop?.page ?? null, source: "wikipedia", attribution: "Wikipedia / Wikimedia Commons", license: "CC BY-SA",
  };
}

/** iNaturalist taxon: gives the iconic group for any species, plus a CC photo when one exists. */
async function fromInat(name: string): Promise<{ iconic: string | null; media: Found | null }> {
  const r = await fetch(`https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(name)}&per_page=1`, { headers: { "user-agent": UA } });
  if (!r.ok) return { iconic: null, media: null };
  const t = ((await r.json()) as { results: { name: string; iconic_taxon_name?: string; wikipedia_url?: string; default_photo?: { medium_url: string; attribution: string; license_code: string | null } }[] }).results[0];
  if (!t || t.name !== name) return { iconic: null, media: null };
  const p = t.default_photo;
  const media = p?.license_code?.startsWith("cc")
    ? { title: t.name, thumbUrl: p.medium_url, imageUrl: p.medium_url.replace("medium", "large"), extract: null, pageUrl: t.wikipedia_url ?? null, source: "inaturalist", attribution: p.attribution, license: p.license_code.toUpperCase() }
    : null;
  return { iconic: t.iconic_taxon_name ?? null, media };
}

/** Cached lookup; negative results are cached too (source = none) and retried after 30 days. */
export async function getSpeciesMedia(name: string): Promise<SpeciesMedia> {
  const [cached] = await sql<Record<string, string | null>[]>`
    SELECT * FROM species_media WHERE scientific_name = ${name} AND iconic IS NOT NULL AND (source <> 'none' OR fetched_at > now() - interval '30 days')`;
  if (cached) return rowToMedia(cached);
  const [wiki, inat] = await Promise.all([fromWikipedia(name).catch(() => null), fromInat(name).catch(() => ({ iconic: null, media: null }))]);
  const m = wiki?.thumbUrl ? wiki : (inat.media ?? wiki);
  const row = { iconic: inat.iconic ?? "Unknown", scientific_name: name, title: m?.title ?? null, thumb_url: m?.thumbUrl ?? null, image_url: m?.imageUrl ?? null, extract: m?.extract ?? null, page_url: m?.pageUrl ?? null, source: m?.source ?? "none", attribution: m?.attribution ?? null, license: m?.license ?? null };
  await sql`INSERT INTO species_media ${sql(row)} ON CONFLICT (scientific_name) DO UPDATE SET
    title = EXCLUDED.title, thumb_url = EXCLUDED.thumb_url, image_url = EXCLUDED.image_url, extract = EXCLUDED.extract, page_url = EXCLUDED.page_url, source = EXCLUDED.source, attribution = EXCLUDED.attribution, license = EXCLUDED.license, iconic = EXCLUDED.iconic, fetched_at = now()`;
  return rowToMedia(row);
}

function rowToMedia(r: Record<string, string | null>): SpeciesMedia {
  return { scientificName: r.scientific_name!, title: r.title, thumbUrl: r.thumb_url, imageUrl: r.image_url, extract: r.extract, pageUrl: r.page_url, source: r.source ?? "none", attribution: r.attribution, license: r.license, iconic: r.iconic ?? null };
}
