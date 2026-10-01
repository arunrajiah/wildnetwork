import type { WdxEvent } from "@/lib/wdx/types";
import type { PullConnector } from "./types";

const ENDPOINT = "https://app.birdweather.com/graphql";
const PAGE = 500;
const MAX_PAGES = 40; // per run (20k events); cursor carries over
const MIN_CONFIDENCE = 0.7;

const QUERY = `
query Pull($from: ISO8601Date!, $to: ISO8601Date!, $after: String, $first: Int!, $conf: Float!) {
  detections(period: {from: $from, to: $to}, after: $after, first: $first, confidenceGte: $conf, sortBy: "timestamp_asc") {
    pageInfo { hasNextPage endCursor }
    nodes {
      id timestamp confidence probability
      coords { lat lon }
      soundscape { url }
      species { id commonName scientificName ebirdCode }
      station { id name type locationPrivacy locationPrivacyRadius coords { lat lon } }
    }
  }
}`;

interface Node {
  id: string;
  timestamp: string;
  confidence: number;
  probability: number | null;
  coords: { lat: number; lon: number } | null;
  soundscape: { url: string } | null;
  species: { id: string; commonName: string; scientificName: string; ebirdCode: string | null };
  station: {
    id: string;
    name: string;
    type: string | null;
    locationPrivacy: boolean | null;
    locationPrivacyRadius: number | null;
    coords: { lat: number; lon: number } | null;
  };
}

function toWdx(n: Node): WdxEvent | null {
  const c = n.coords ?? n.station.coords;
  if (!c) return null;
  return {
    wdx: "0.1",
    eventId: `birdweather:${n.id}`,
    eventStart: n.timestamp,
    deployment: {
      deploymentId: n.station.id,
      name: n.station.name,
      latitude: c.lat,
      longitude: c.lon,
      coordinateUncertaintyMeters: n.station.locationPrivacyRadius || undefined,
      sensorType: "acoustic-recorder",
      sensorModel: n.station.type ?? undefined,
    },
    detection: {
      scientificName: n.species.scientificName,
      vernacularName: n.species.commonName,
      taxonRank: "species",
      taxonId: n.species.ebirdCode ? `ebird:${n.species.ebirdCode}` : undefined,
      confidence: n.confidence,
      classifier: { name: "BirdNET", version: "unknown" },
    },
    media: n.soundscape?.url ? { mediaType: "audio", url: n.soundscape.url } : undefined,
    review: { status: "unreviewed" },
    source: { system: "birdweather", sourceRecordId: n.id },
  };
}

export const birdweather: PullConnector = {
  name: "birdweather",
  async pull(cursor) {
    const now = new Date();
    // Cursor = ISO timestamp of last detection seen. Default: last 15 minutes. Overlap 60s; dedupe absorbs it.
    const fromMs = cursor ? Date.parse(cursor) - 60_000 : now.getTime() - 15 * 60_000;
    const from = new Date(fromMs).toISOString();
    const to = now.toISOString();

    const events: WdxEvent[] = [];
    let after: string | null = null;
    let last = cursor;
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "wildnetwork/0.1 (+https://github.com/arunrajiah)" },
        body: JSON.stringify({ query: QUERY, variables: { from, to, after, first: PAGE, conf: MIN_CONFIDENCE } }),
      });
      if (!res.ok) throw new Error(`birdweather ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const json = (await res.json()) as {
        data?: { detections: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: Node[] } };
        errors?: { message: string }[];
      };
      if (json.errors?.length) throw new Error(`birdweather graphql: ${json.errors[0].message}`);
      const d = json.data!.detections;
      for (const n of d.nodes) {
        const ev = toWdx(n);
        if (ev) events.push(ev);
        if (!last || n.timestamp > last) last = n.timestamp;
      }
      if (!d.pageInfo.hasNextPage) break;
      after = d.pageInfo.endCursor;
    }
    return { events, cursor: last ?? to };
  },
};
