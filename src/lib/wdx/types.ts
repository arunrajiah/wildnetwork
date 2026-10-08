// Mirrors wildlife-detection-exchange v0.2 (v0.1 events are also valid) (schema/detection-event.schema.json).
export type SensorType = "acoustic-recorder" | "camera-trap" | "other";
export type TaxonRank = "species" | "genus" | "family" | "class" | "unranked";
export type ReviewStatus = "unreviewed" | "confirmed" | "rejected" | "uncertain";
export type MediaType = "audio" | "image" | "video";

export interface WdxEvent {
  wdx: "0.1" | "0.2";
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
    pipeline?: { role: string; name: string; version: string; weights?: string }[];
    classifiedAt?: string;
  };
  media?: {
    mediaType: MediaType;
    url?: string;
    fileName?: string;
    startOffsetSeconds?: number;
    durationSeconds?: number;
    sha256?: string;
    region?: { type: "box" | "polygon" | "point"; coordinates: number[] | number[][]; units?: "normalized" | "pixels"; imageWidth?: number; imageHeight?: number; frame?: number };
  };
  review?: { status: ReviewStatus; reviewedBy?: string; reviewedAt?: string };
  source: { system: string; systemVersion?: string; sourceRecordId?: string };
  license?: string;
}
