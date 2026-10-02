import { generateText, isStepCount, tool } from "ai";
import { z } from "zod";
import { sql } from "@/lib/db";
import { METHODS_VERSION } from "@/lib/methods";

/**
 * Answers a plain language question using only this site's own data.
 * The model has no knowledge it may use except what the tools return; every tool reads the same
 * public API and tables that the map uses. Model and fallbacks run through the Vercel AI Gateway.
 */
export const ASK_MODEL = process.env.AI_GATEWAY_MODEL ?? "inclusionai/ling-3.1-flash-free";
const FALLBACKS = (process.env.AI_GATEWAY_FALLBACKS ?? "openai/gpt-oss-20b").split(",").map((s) => s.trim()).filter(Boolean);

const CLASSES = ["avian", "bat", "amphibian", "insect", "mammal"] as const;
const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
const cellName = (lat: number, lon: number) => `${Math.abs(lat + 2.5)}°${lat + 2.5 >= 0 ? "N" : "S"}, ${Math.abs(lon + 2.5)}°${lon + 2.5 >= 0 ? "E" : "W"}`;

export interface AskResult { answer: string; species: { scientificName: string; commonName: string | null }[]; tools: string[]; model: string; tokens: number }

/** The only ways the model can learn anything: four read-only lookups over this site's data. */
export function askTools(origin: string, seen: Map<string, string | null>, used: string[]) {
  const api = async (path: string) => {
    const r = await fetch(`${origin}${path}`);
    if (!r.ok) throw new Error(`${path} ${r.status}`);
    return r.json();
  };

  return {
    findSpecies: tool({
      description: "Look up species by common or scientific name. Always call this first when the question names an animal, to get its exact scientific name.",
      inputSchema: z.object({ query: z.string().describe("Common or scientific name, for example 'barn swallow'") }),
      execute: async ({ query }) => {
        used.push("findSpecies");
        const rows = (await api(`/api/v1/species?q=${encodeURIComponent(query)}`)) as { scientificName: string; vernacularName: string | null; count: number }[];
        rows.slice(0, 6).forEach((r) => seen.set(r.scientificName, r.vernacularName));
        return rows.length ? rows.slice(0, 6).map((r) => ({ scientificName: r.scientificName, commonName: r.vernacularName, detectionsLast4Weeks: r.count })) : "No species with that name in the last four weeks of data.";
      },
    }),
    speciesFacts: tool({
      description: "Everything known about one species: recent movement, the weather where it is, where it is concentrated now, when it arrives at each latitude, and its yearly span. Needs the exact scientific name from findSpecies.",
      inputSchema: z.object({ scientificName: z.string() }),
      execute: async ({ scientificName }) => {
        used.push("speciesFacts");
        const [d, arr] = await Promise.all([
          api(`/api/v1/species/${encodeURIComponent(scientificName)}`),
          api(`/api/v1/arrivals?species=${encodeURIComponent(scientificName)}`),
        ]);
        if (!d.daily?.length) return "No data for that species.";
        seen.set(scientificName, d.vernacularName ?? null);
        const days = d.daily as { day: string; n: number; index: number; lat: number | null; lon: number | null }[];
        const last = [...days].reverse().find((x) => x.lat != null);
        const bands = new Map<string, string[]>();
        for (const a of arr.arrivals as { cellLat: number; region: string; arrivalWeek: string }[]) {
          const k = `${a.region}, ${Math.abs(a.cellLat)}-${Math.abs(a.cellLat + 5)}°${a.cellLat >= 0 ? "N" : "S"}`;
          bands.set(k, [...(bands.get(k) ?? []), a.arrivalWeek]);
        }
        return {
          commonName: d.vernacularName, class: d.group,
          summarySentences: d.story,
          detectionsLast4Weeks: days.reduce((s, x) => s + x.n, 0),
          latestRangeCentre: last ? { date: last.day, latitude: round(last.lat!), longitude: round(last.lon!) } : null,
          strongestAreasNow: (d.cells as { lat: number; lon: number; recent: number | null }[]).filter((c) => c.recent != null).sort((a, b) => b.recent! - a.recent!).slice(0, 5)
            .map((c) => ({ areaCentre: cellName(c.lat, c.lon), sharePer1000Detections: round(c.recent!, 2) })),
          firstHeardEachSeason: [...bands.entries()].slice(0, 12).map(([band, weeks]) => ({ band, medianWeek: weeks.sort()[Math.floor((weeks.length - 1) / 2)], areas: weeks.length })),
        };
      },
    }),
    whatIsChanging: tool({
      description: "What is changing right now across all species or one class: which species are moving north or south, surging, fading, or newly arrived.",
      inputSchema: z.object({ animalClass: z.enum(CLASSES).optional().describe("Limit to birds (avian), bats, amphibians, insects or mammals") }),
      execute: async ({ animalClass }) => {
        used.push("whatIsChanging");
        const d = await api(`/api/v1/insights${animalClass ? `?group=${animalClass}` : ""}`);
        type Row = { scientificName: string; vernacularName: string | null; region?: string; driftDeg?: number; ratio?: number; cellLat?: number; cellLon?: number };
        [...d.drift, ...d.movers, ...d.arrivals].forEach((r: Row) => seen.set(r.scientificName, r.vernacularName));
        return {
          summarySentences: d.summary,
          moving: (d.drift as Row[]).slice(0, 8).map((r) => ({ species: r.vernacularName ?? r.scientificName, continent: r.region, degreesNorthInAWeek: r.driftDeg })),
          surgingOrFading: (d.movers as Row[]).slice(0, 8).map((r) => ({ species: r.vernacularName ?? r.scientificName, shareYesterdayVsWeekBefore: round(r.ratio!, 2) })),
          newArrivals: (d.arrivals as Row[]).slice(0, 8).map((r) => ({ species: r.vernacularName ?? r.scientificName, areaCentre: cellName(r.cellLat!, r.cellLon!) })),
          dataFrom: d.coverage?.from, dataTo: d.coverage?.to,
        };
      },
    }),
    speciesNear: tool({
      description: "The most detected species around a place in the last 7 days, and species first heard there this season. Give the latitude and longitude of the place (you may use your knowledge of geography for the coordinates only). The area is a square about 550 km across.",
      inputSchema: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), animalClass: z.enum(CLASSES).optional() }),
      execute: async ({ latitude, longitude, animalClass }) => {
        used.push("speciesNear");
        const lat = Math.floor(latitude / 5) * 5, lon = Math.floor(longitude / 5) * 5;
        const cls = animalClass ?? null;
        const [top, arrivals, effort] = await Promise.all([
          sql`
            SELECT sd.scientific_name, MIN(sd.vernacular_name) AS common, g.grp, SUM(sd.count)::int AS n
            FROM species_daily sd JOIN species_group g USING (scientific_name)
            WHERE sd.cell_lat = ${lat} AND sd.cell_lon = ${lon} AND sd.day >= CURRENT_DATE - 7 AND g.is_species
              ${cls ? sql`AND g.grp = ${cls}` : sql``}
            GROUP BY 1, 3 ORDER BY n DESC LIMIT 12`,
          sql`
            SELECT p.scientific_name, p.vernacular_name, p.arrival_week::text FROM phenology p
            ${cls ? sql`JOIN species_group g ON g.scientific_name = p.scientific_name AND g.grp = ${cls}` : sql``}
            WHERE p.cell_lat = ${lat} AND p.cell_lon = ${lon} AND p.arrival_week >= CURRENT_DATE - 35
            ORDER BY p.arrival_week DESC, p.total_n DESC LIMIT 10`,
          sql`SELECT COALESCE(SUM(detections), 0)::int AS n FROM effort_daily WHERE cell_lat = ${lat} AND cell_lon = ${lon} AND day >= CURRENT_DATE - 7`,
        ]);
        if (!top.length) return `No detections in the area around ${cellName(lat, lon)} in the last 7 days. There may be no sensors there.`;
        top.forEach((r) => seen.set(r.scientific_name, r.common));
        return {
          area: `square centred ${cellName(lat, lon)}, about 550 km across`,
          allDetectionsLast7Days: effort[0].n,
          mostDetected: top.map((r) => ({ species: r.common ?? r.scientific_name, scientificName: r.scientific_name, class: r.grp, detections: r.n })),
          firstHeardThisSeasonInLast5Weeks: arrivals.map((r) => ({ species: r.vernacular_name ?? r.scientific_name, weekOf: r.arrival_week })),
        };
      },
    }),
  };
}

export async function answerQuestion(question: string, origin: string): Promise<AskResult> {
  const seen = new Map<string, string | null>(); // species the tools returned, for the clickable chips
  const used: string[] = [];
  const tools = askTools(origin, seen, used);

  const today = new Date().toISOString().slice(0, 10);
  const result = await generateText({
    model: ASK_MODEL,
    providerOptions: { gateway: { models: FALLBACKS } },
    instructions: `You answer questions about wildlife movement for WildNetwork, an open map built from community acoustic stations, camera traps and citizen observations. Today is ${today}.

Rules:
- Use the tools for every fact. Never state a number, date, place or species behaviour that a tool did not return. If the tools do not cover the question, say plainly that this site's data cannot answer it.
- Tool results give areas as coordinates. You may name the country or region those coordinates fall in, and you may convert a place name in the question to coordinates. Use your own knowledge for nothing else.
- Detections are not counts of animals: one bird near a microphone can be detected many times. Say "detected" or "heard", never "there are N birds". Most data is acoustic and coverage is densest in Europe, North America and Australasia.
- "First heard" dates are when a species is first heard regularly, which for residents means when singing starts.
- Answer in at most 110 words of plain text, no markdown, no lists unless asked. Be specific: give the figures the tools returned.
- If the question is not about wildlife, this site or its data, say in one sentence that you can only answer questions about the animals on this map.`,
    prompt: question,
    tools,
    stopWhen: isStepCount(6),
    maxOutputTokens: 500,
    temperature: 0.2,
  });

  return {
    answer: result.text.trim(),
    species: [...seen.entries()].slice(0, 12).map(([scientificName, commonName]) => ({ scientificName, commonName })),
    tools: [...new Set(used)],
    model: result.response?.modelId ?? ASK_MODEL,
    tokens: result.usage?.totalTokens ?? 0,
  };
}

export const ASK_METHODS = METHODS_VERSION;
