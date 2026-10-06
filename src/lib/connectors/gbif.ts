import { CLASS_TAXA, INAT_DATASET, baseParams, gbifJson, noteDataset } from "@/lib/gbif";
import { upsertGroups } from "@/lib/rollups";
import type { WdxEvent } from "@/lib/wdx/types";
import type { PullConnector } from "./types";

/**
 * Live layer from GBIF: CC0 / CC BY records observed in the last 7 days, picked up as GBIF indexes them
 * (cursor = lastInterpreted). Human observations, so sensorType=other. Max 5 pages of 300 per run.
 */
const PAGE = 300;
const MAX_PAGES = 5;
/** The live pull runs inside a web request alongside the other connectors, so it gives up quickly when GBIF is throttling. */
const BUDGET_MS = 45_000;

interface Occ {
  key: number;
  datasetKey: string;
  datasetName?: string;
  species?: string;
  scientificName: string;
  acceptedScientificName?: string;
  vernacularName?: string;
  taxonRank?: string;
  speciesKey?: number;
  classKey?: number;
  orderKey?: number;
  decimalLatitude: number;
  decimalLongitude: number;
  coordinateUncertaintyInMeters?: number;
  eventDate?: string;
  basisOfRecord: string;
  license?: string;
  lastInterpreted: string;
  references?: string;
}

const grpOf = (o: Occ) => (o.orderKey === 734 ? "bat" : CLASS_TAXA.find((c) => c.key === o.classKey)?.grp ?? "other");

function toWdx(o: Occ): WdxEvent | null {
  if (o.datasetKey === INAT_DATASET || !o.eventDate) return null;
  const start = o.eventDate.split("/")[0];
  const iso = start.length === 10 ? `${start}T12:00:00Z` : start.includes("T") ? (start.endsWith("Z") || /[+-]\d\d:\d\d$/.test(start) ? start : `${start}Z`) : null;
  if (!iso || Number.isNaN(Date.parse(iso))) return null;
  const name = o.species ?? o.acceptedScientificName ?? o.scientificName;
  if (!name) return null;
  const rank = o.taxonRank?.toLowerCase();
  return {
    wdx: "0.1",
    eventId: `gbif:${o.key}`,
    eventStart: iso,
    deployment: {
      deploymentId: `dataset:${o.datasetKey}`,
      name: o.datasetName,
      latitude: o.decimalLatitude,
      longitude: o.decimalLongitude,
      coordinateUncertaintyMeters: o.coordinateUncertaintyInMeters || undefined,
      sensorType: o.basisOfRecord === "MACHINE_OBSERVATION" ? "acoustic-recorder" : "other",
      sensorModel: o.basisOfRecord === "MACHINE_OBSERVATION" ? "machine-observation" : "human-observer",
    },
    detection: {
      scientificName: name,
      vernacularName: o.vernacularName,
      taxonRank: rank === "species" || rank === "subspecies" ? "species" : rank === "genus" ? "genus" : rank === "family" ? "family" : "unranked",
      taxonId: o.speciesKey ? `gbif:${o.speciesKey}` : undefined,
      confidence: 0.9,
      classifier: { name: "gbif-publisher", version: o.datasetKey },
    },
    review: { status: "confirmed", reviewedAt: o.lastInterpreted },
    source: { system: "gbif", sourceRecordId: String(o.key) },
    license: o.license,
  };
}

export const gbif: PullConnector = {
  name: "gbif",
  async pull(cursor) {
    // GBIF only filters lastInterpreted by whole days and cannot sort, so the cursor is a day plus an offset into that day's results.
    // A finished day advances to the next; today keeps its offset so later-indexed records are picked up on later runs.
    const today = new Date().toISOString().slice(0, 10);
    const t0 = Date.now();
    let { d, o } = cursor ? (JSON.parse(cursor) as { d: string; o: number }) : { d: new Date(Date.now() - 86400_000).toISOString().slice(0, 10), o: 0 };
    const events: WdxEvent[] = [];
    const groups: { name: string; grp: string }[] = [];
    const datasets = new Map<string, number>();
    for (let page = 0; page < MAX_PAGES; page++) {
      const p = baseParams();
      for (const c of CLASS_TAXA) p.append("taxonKey", String(c.key));
      p.set("lastInterpreted", `${d},${d}`);
      p.set("eventDate", `${new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10)},${today}`);
      p.set("limit", String(PAGE));
      p.set("offset", String(o));
      if (Date.now() - t0 > BUDGET_MS) break;
      const j = await gbifJson<{ results: Occ[]; endOfRecords: boolean }>("/occurrence/search", p, 1);
      for (const occ of j.results) {
        const ev = toWdx(occ);
        if (!ev) continue;
        events.push(ev);
        groups.push({ name: ev.detection.scientificName!, grp: grpOf(occ) });
        datasets.set(occ.datasetKey, (datasets.get(occ.datasetKey) ?? 0) + 1);
      }
      o += j.results.length;
      if (j.endOfRecords || j.results.length < PAGE) {
        if (d < today) { d = new Date(Date.parse(d) + 86400_000).toISOString().slice(0, 10); o = 0; continue; }
        break;
      }
    }
    if (groups.length) await upsertGroups(groups);
    for (const [k, n] of datasets) await noteDataset(k, n);
    return { events, cursor: JSON.stringify({ d, o }) };
  },
};
