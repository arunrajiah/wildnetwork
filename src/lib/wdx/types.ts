// Mirrors wildlife-detection-exchange v0.1 (schema/detection-event.schema.json).
export type SensorType = "acoustic-recorder" | "camera-trap" | "other";
export type TaxonRank = "species" | "genus" | "family" | "class" | "unranked";
export type ReviewStatus = "unreviewed" | "confirmed" | "rejected" | "uncertain";
export type MediaType = "audio" | "image" | "video";

export interface WdxEvent {
  wdx: "0.1";
  eventId: string;
  eventStart: string;
  eventEnd?: string;
  deployment: {
    deploymentId: string;
    name?: string;
    latitude: number;
    longitude: number;
    coordinateUncertaintyMeters?: number;
    sensorType: SensorType;
    sensorModel?: string;
  };
  detection: {
    scientificName?: string;
    vernacularName?: string;
    taxonRank?: TaxonRank;
    taxonId?: string;
    confidence: number;
    classifier: { name: string; version: string };
    classifiedAt?: string;
  };
  media?: {
    mediaType: MediaType;
    url?: string;
    fileName?: string;
    startOffsetSeconds?: number;
    durationSeconds?: number;
    sha256?: string;
  };
  review?: { status: ReviewStatus; reviewedBy?: string; reviewedAt?: string };
  source: { system: string; systemVersion?: string; sourceRecordId?: string };
  license?: string;
}
