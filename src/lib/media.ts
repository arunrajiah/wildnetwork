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
}

const UA = "wildnetwork/0.1 (https://github.com/arunrajiah/wildnetwork)";

async function fromWikipedia(name: string): Promise<Omit<SpeciesMedia, "scientificName"> | null> {
  const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name.replace(/ /g, "_"))}`, { headers: { "user-agent": UA } });
  if (!r.ok) return null;
  const j = (await r.json()) as { type?: string; title?: string; thumbnail?: { source: string }; originalimage?: { source: string }; extract?: string; content_urls?: { desktop?: { page: string } } };
  if (j.type === "disambiguation" || !j.title) return null;
  return {
    title: j.title, thumbUrl: j.thumbnail?.source?.split("?")[0] ?? null, imageUrl: j.originalimage?.source?.split("?")[0] ?? null,
    extract: j.extract ?? null, pageUrl: j.content_urls?.desktop?.page ?? null, source: "wikipedia", attribution: "Wikipedia / Wikimedia Commons", license: "CC BY-SA",
  };
}

async function fromInat(name: string): Promise<Omit<SpeciesMedia, "scientificName"> | null> {
  const r = await fetch(`https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(name)}&per_page=1`, { headers: { "user-agent": UA } });
  if (!r.ok) return null;
  const t = ((await r.json()) as { results: { name: string; wikipedia_url?: string; default_photo?: { medium_url: string; attribution: string; license_code: string | null } }[] }).results[0];
  const p = t?.default_photo;
  if (!t || t.name !== name || !p?.license_code?.startsWith("cc")) return null;
  return { title: t.name, thumbUrl: p.medium_url, imageUrl: p.medium_url.replace("medium", "large"), extract: null, pageUrl: t.wikipedia_url ?? null, source: "inaturalist", attribution: p.attribution, license: p.license_code.toUpperCase() };
}

/** Cached lookup; negative results are cached too (source = none) and retried after 30 days. */
export async function getSpeciesMedia(name: string): Promise<SpeciesMedia> {
  const [cached] = await sql<Record<string, string | null>[]>`
    SELECT * FROM species_media WHERE scientific_name = ${name} AND (source <> 'none' OR fetched_at > now() - interval '30 days')`;
  if (cached) return rowToMedia(cached);
  let m = await fromWikipedia(name).catch(() => null);
  if (!m?.thumbUrl) m = (await fromInat(name).catch(() => null)) ?? m;
  const row = { scientific_name: name, title: m?.title ?? null, thumb_url: m?.thumbUrl ?? null, image_url: m?.imageUrl ?? null, extract: m?.extract ?? null, page_url: m?.pageUrl ?? null, source: m?.source ?? "none", attribution: m?.attribution ?? null, license: m?.license ?? null };
  await sql`INSERT INTO species_media ${sql(row)} ON CONFLICT (scientific_name) DO UPDATE SET
    title = EXCLUDED.title, thumb_url = EXCLUDED.thumb_url, image_url = EXCLUDED.image_url, extract = EXCLUDED.extract, page_url = EXCLUDED.page_url, source = EXCLUDED.source, attribution = EXCLUDED.attribution, license = EXCLUDED.license, fetched_at = now()`;
  return rowToMedia(row);
}

function rowToMedia(r: Record<string, string | null>): SpeciesMedia {
  return { scientificName: r.scientific_name!, title: r.title, thumbUrl: r.thumb_url, imageUrl: r.image_url, extract: r.extract, pageUrl: r.page_url, source: r.source ?? "none", attribution: r.attribution, license: r.license };
}
