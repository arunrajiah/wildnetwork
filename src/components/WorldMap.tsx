"use client";

import { AttributionControl, Map as MLMap, NavigationControl, Popup, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";

setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type FC = GeoJSON.FeatureCollection<GeoJSON.Point, Record<string, unknown>>;
interface Species { scientificName: string; vernacularName: string | null; count: number; deployments: number }

const EMPTY: FC = { type: "FeatureCollection", features: [] };
const STYLE = "https://tiles.openfreemap.org/styles/dark";
const HOURS_OPTIONS = [1, 6, 24, 72, 168];

export default function WorldMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [hours, setHours] = useState(24);
  const [species, setSpecies] = useState<string | null>(null);
  const [speciesList, setSpeciesList] = useState<Species[]>([]);
  const [query, setQuery] = useState("");
  const [events, setEvents] = useState<FC>(EMPTY);
  const [deployments, setDeployments] = useState<FC>(EMPTY);
  const [playhead, setPlayhead] = useState<number | null>(null); // ms since window start, null = show all
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(0);

  const windowStart = useMemo(() => fetchedAt - hours * 3600_000, [fetchedAt, hours]);

  // Map init
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new MLMap({ container: containerRef.current, style: STYLE, center: [10, 30], zoom: 1.8, attributionControl: false });
    map.addControl(new AttributionControl({ compact: true, customAttribution: "Data: BirdWeather, iNaturalist contributors (CC0/CC-BY), WDX producers" }));
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      map.addSource("deployments", { type: "geojson", data: EMPTY });
      map.addSource("events", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "deployments", type: "circle", source: "deployments",
        paint: { "circle-radius": 2.5, "circle-color": "#64748b", "circle-opacity": 0.6 },
      });
      map.addLayer({
        id: "events-glow", type: "circle", source: "events",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 6, 8, 14],
          "circle-color": ["match", ["get", "source"], "birdweather", "#22d3ee", "inaturalist", "#a3e635", "#f472b6"],
          "circle-opacity": 0.15, "circle-blur": 1,
        },
      });
      map.addLayer({
        id: "events", type: "circle", source: "events",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 2.5, 8, 6],
          "circle-color": ["match", ["get", "source"], "birdweather", "#22d3ee", "inaturalist", "#a3e635", "#f472b6"],
          "circle-opacity": 0.9, "circle-stroke-width": 0.5, "circle-stroke-color": "#0f172a",
        },
      });
      map.on("click", "events", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as Record<string, string>;
        const media = p.media
          ? p.mediaType === "audio"
            ? `<audio controls src="${p.media}" style="width:220px;margin-top:6px"></audio>`
            : `<img src="${p.media}" style="width:220px;margin-top:6px;border-radius:6px" alt="" />`
          : "";
        new Popup({ closeButton: false, maxWidth: "260px" })
          .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
          .setHTML(`<div style="font:13px system-ui;color:#e2e8f0"><b>${p.common ?? p.sci}</b><br/><i>${p.sci ?? ""}</i><br/>
            ${new Date(p.t).toLocaleString()}<br/>conf ${Number(p.conf).toFixed(2)} · ${p.source}${media}</div>`)
          .addTo(map);
      });
      map.on("mouseenter", "events", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "events", () => (map.getCanvas().style.cursor = ""));
      setReady(true);
    });
    mapRef.current = map;
    (window as unknown as { __wnMap?: MLMap }).__wnMap = map; // debug handle
    map.on("error", (e) => console.error("maplibre error", e.error?.message ?? e));
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Data fetch
  const load = useCallback(async () => {
    setLoading(true);
    const from = new Date(Date.now() - hours * 3600_000).toISOString();
    const u = new URLSearchParams({ from, limit: "20000" });
    if (species) u.set("species", species);
    const [ev, dep, sp] = await Promise.all([
      fetch(`/api/v1/events?${u}`).then((r) => r.json() as Promise<FC>),
      fetch(`/api/v1/deployments`).then((r) => r.json() as Promise<FC>),
      fetch(`/api/v1/species?hours=${hours}${query ? `&q=${encodeURIComponent(query)}` : ""}`).then((r) => r.json() as Promise<Species[]>),
    ]);
    setEvents(ev); setDeployments(dep); setSpeciesList(sp); setFetchedAt(Date.now());
    setLoading(false);
  }, [hours, species, query]);

  useEffect(() => {
    const t0 = setTimeout(load, 0);
    const t = setInterval(load, 60_000);
    return () => { clearTimeout(t0); clearInterval(t); };
  }, [load]);

  // Push data to map, filtered by playhead
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("deployments") as GeoJSONSource)?.setData(deployments);
    let fc = events;
    if (playhead !== null) {
      const cutoff = windowStart + playhead;
      const trail = Math.max(hours * 3600_000 * 0.05, 15 * 60_000);
      fc = { ...events, features: events.features.filter((f: GeoJSON.Feature<GeoJSON.Point, Record<string, unknown>>) => { const t = Date.parse(String(f.properties.t)); return t <= cutoff && t > cutoff - trail; }) };
    }
    (map.getSource("events") as GeoJSONSource)?.setData(fc);
  }, [events, deployments, playhead, ready, windowStart, hours]);

  // Playback
  useEffect(() => {
    if (!playing) return;
    const total = hours * 3600_000;
    const id = setInterval(() => setPlayhead((p) => { const n = (p ?? 0) + total / 300; return n >= total ? 0 : n; }), 50);
    return () => clearInterval(id);
  }, [playing, hours]);

  const total = hours * 3600_000;
  const shown = playhead === null ? events.features.length : undefined;

  return (
    <div className="relative h-screen w-screen bg-slate-950 text-slate-100">
      <div className="absolute inset-0"><div ref={containerRef} className="h-full w-full" /></div>

      {/* Sidebar */}
      <aside className="absolute left-3 top-3 bottom-3 w-72 flex flex-col rounded-xl bg-slate-900/85 backdrop-blur border border-slate-700/60 p-3 gap-3 overflow-hidden">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">WildNetwork</h1>
          <p className="text-xs text-slate-400">Live bird and animal detections, worldwide</p>
        </div>
        <div className="flex gap-1">
          {HOURS_OPTIONS.map((h) => (
            <button key={h} onClick={() => { setHours(h); setPlayhead(null); setPlaying(false); }}
              className={`flex-1 text-xs rounded-md py-1 ${h === hours ? "bg-cyan-500 text-slate-950 font-medium" : "bg-slate-800 hover:bg-slate-700"}`}>
              {h < 24 ? `${h}h` : `${h / 24}d`}
            </button>
          ))}
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search species"
          className="w-full rounded-md bg-slate-800 px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-cyan-500" />
        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          <button onClick={() => setSpecies(null)}
            className={`w-full text-left text-sm px-2 py-1 rounded ${species === null ? "bg-slate-700" : "hover:bg-slate-800"}`}>
            All species <span className="text-slate-400 text-xs">({events.features.length.toLocaleString()})</span>
          </button>
          {speciesList.map((s) => (
            <button key={s.scientificName} onClick={() => setSpecies(s.scientificName)}
              className={`w-full text-left px-2 py-1 rounded ${species === s.scientificName ? "bg-slate-700" : "hover:bg-slate-800"}`}>
              <div className="text-sm truncate">{s.vernacularName ?? s.scientificName}</div>
              <div className="text-xs text-slate-400 truncate">
                <i>{s.scientificName}</i> · {s.count.toLocaleString()} · {s.deployments} sites
              </div>
            </button>
          ))}
        </div>
        <div className="text-[11px] text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
          <span><span className="inline-block w-2 h-2 rounded-full bg-cyan-400 mr-1" />BirdWeather</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-lime-400 mr-1" />iNaturalist</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-pink-400 mr-1" />WDX devices</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-slate-500 mr-1" />{deployments.features.length.toLocaleString()} sensors</span>
        </div>
      </aside>

      {/* Time controls */}
      <div className="absolute left-80 right-3 bottom-3 rounded-xl bg-slate-900/85 backdrop-blur border border-slate-700/60 px-4 py-2 flex items-center gap-3">
        <button onClick={() => { setPlaying((p) => !p); if (playhead === null) setPlayhead(0); }}
          className="rounded-md bg-cyan-500 text-slate-950 text-sm font-medium px-3 py-1">
          {playing ? "Pause" : "Play"}
        </button>
        <input type="range" min={0} max={total} step={total / 600} value={playhead ?? total}
          onChange={(e) => { setPlaying(false); setPlayhead(Number(e.target.value)); }} className="flex-1 accent-cyan-400" />
        <button onClick={() => { setPlaying(false); setPlayhead(null); }} className="text-xs text-slate-300 hover:text-white">Show all</button>
        <span className="text-xs text-slate-300 tabular-nums w-44 text-right">
          {playhead === null ? `${shown?.toLocaleString()} events` : new Date(windowStart + playhead).toLocaleString()}
          {loading ? " …" : ""}
        </span>
      </div>
    </div>
  );
}
