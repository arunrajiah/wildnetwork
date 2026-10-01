import type { WdxEvent } from "@/lib/wdx/types";
import type { PullConnector } from "./types";

/**
 * iNaturalist observations: human-made, so WDX sensorType=other, classifier=human/community.
 * Only CC0 / CC-BY observations are pulled so they stay redistributable.
 * Rate limit: stay under 60 req/min. One run = max 5 pages of 200.
 */
const API = "https://api.inaturalist.org/v1/observations";
const PAGE = 200;
const MAX_PAGES = 5;

interface Obs {
  id: number;
  uuid: string;
  time_observed_at: string | null;
  observed_on: string | null;
  created_at: string;
  updated_at: string;
  quality_grade: string;
  license_code: string | null;
  geojson: { coordinates: [number, number] } | null;
  public_positional_accuracy: number | null;
  obscured: boolean;
  taxon: { id: number; name: string; preferred_common_name?: string; rank: string; iconic_taxon_name?: string } | null;
  user: { login: string };
  photos: { url: string }[];
  sounds: { file_url: string }[];
}

function toWdx(o: Obs): WdxEvent | null {
  if (!o.geojson || !o.taxon) return null;
  const [lon, lat] = o.geojson.coordinates;
  const start = o.time_observed_at ?? (o.observed_on ? `${o.observed_on}T12:00:00Z` : null);
  if (!start) return null;
  const photo = o.photos[0]?.url?.replace("square", "medium");
  const sound = o.sounds[0]?.file_url;
  return {
    wdx: "0.1",
    eventId: `inaturalist:${o.id}`,
    eventStart: start,
    deployment: {
      deploymentId: `user:${o.user.login}`,
      latitude: lat,
      longitude: lon,
      coordinateUncertaintyMeters: o.public_positional_accuracy || undefined,
      sensorType: "other",
      sensorModel: "human-observer",
    },
    detection: {
      scientificName: o.taxon.name,
      vernacularName: o.taxon.preferred_common_name,
      taxonRank: o.taxon.rank === "species" ? "species" : o.taxon.rank === "genus" ? "genus" : o.taxon.rank === "family" ? "family" : "unranked",
      taxonId: `inat:${o.taxon.id}`,
      confidence: o.quality_grade === "research" ? 0.95 : 0.6,
      classifier: { name: "inaturalist-community", version: "v1" },
    },
    media: sound ? { mediaType: "audio", url: sound } : photo ? { mediaType: "image", url: photo } : undefined,
    review: { status: o.quality_grade === "research" ? "confirmed" : "unreviewed", reviewedAt: o.updated_at },
    source: { system: "inaturalist", sourceRecordId: String(o.id) },
    license: o.license_code ? `https://creativecommons.org/${o.license_code === "cc0" ? "publicdomain/zero/1.0" : "licenses/by/4.0"}/` : undefined,
  };
}

export const inaturalist: PullConnector = {
  name: "inaturalist",
  async pull(cursor) {
    // Cursor = ISO updated_since. Default: last 30 minutes.
    const since = cursor ?? new Date(Date.now() - 30 * 60_000).toISOString();
    const events: WdxEvent[] = [];
    let newest = since;
    let idAbove = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const u = new URL(API);
      u.searchParams.set("updated_since", since);
      u.searchParams.set("d1", new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10)); // observed in last 7 days
      u.searchParams.set("license", "cc0,cc-by");
      u.searchParams.set("geo", "true");
      u.searchParams.set("verifiable", "true");
      u.searchParams.set("per_page", String(PAGE));
      u.searchParams.set("order_by", "id");
      u.searchParams.set("order", "asc");
      if (idAbove) u.searchParams.set("id_above", String(idAbove));
      const res = await fetch(u, { headers: { "user-agent": "wildnetwork/0.1 (+https://github.com/arunrajiah)" } });
      if (!res.ok) throw new Error(`inaturalist ${res.status}`);
      const json = (await res.json()) as { results: Obs[] };
      if (json.results.length === 0) break;
      for (const o of json.results) {
        const ev = toWdx(o);
        if (ev) events.push(ev);
        if (Date.parse(o.updated_at) > Date.parse(newest)) newest = new Date(o.updated_at).toISOString();
        idAbove = o.id;
      }
      if (json.results.length < PAGE) break;
    }
    return { events, cursor: newest };
  },
};
