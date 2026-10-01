"use client";

import { AttributionControl, Map as MLMap, NavigationControl, Popup, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SpeciesPanel, { type SpeciesDetail } from "./SpeciesPanel";

setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

type FC = GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>>;
interface Species { scientificName: string; vernacularName: string | null; count: number; deployments: number }
interface Insights {
  coverage: { from: string; to: string; species: number; detections: number };
  movers: { scientificName: string; vernacularName: string | null; yesterday: number; avg7: number; ratio: number }[];
  drift: { scientificName: string; vernacularName: string | null; region: string; driftDeg: number; latNow: number; n: number }[];
  arrivals: { scientificName: string; vernacularName: string | null; cellLat: number; cellLon: number; n: number }[];
}

const EMPTY: FC = { type: "FeatureCollection", features: [] };
const STYLE = "https://tiles.openfreemap.org/styles/dark";
const HOURS = [1, 6, 24, 72, 168];
// Validated for the dark surface (dataviz validator): sources are categorical, change is diverging.
const SOURCE_COLOR: unknown[] = ["match", ["get", "source"], "birdweather", "#0891b2", "inaturalist", "#65a30d", "#db2777"];

export default function WorldMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [hours, setHours] = useState(24);
  const [species, setSpecies] = useState<string | null>(null);
  const [speciesList, setSpeciesList] = useState<Species[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [query, setQuery] = useState("");
  const [events, setEvents] = useState<FC>(EMPTY);
  const [deployments, setDeployments] = useState<FC>(EMPTY);
  const [cells, setCells] = useState<FC>(EMPTY);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [playhead, setPlayhead] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const windowStart = useMemo(() => fetchedAt - hours * 3600_000, [fetchedAt, hours]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new MLMap({ container: containerRef.current, style: STYLE, center: [10, 25], zoom: 1.7, attributionControl: false });
    map.addControl(new AttributionControl({ compact: true, customAttribution: "BirdWeather · iNaturalist (CC0/CC-BY) · WDX producers" }));
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      map.addSource("cells", { type: "geojson", data: EMPTY });
      map.addSource("deployments", { type: "geojson", data: EMPTY });
      map.addSource("events", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "cells", type: "fill", source: "cells",
        paint: {
          "fill-color": ["interpolate", ["linear"], ["get", "change"], -1, "#3b82f6", 0, "#64748b", 1, "#ea580c"],
          "fill-opacity": ["interpolate", ["linear"], ["get", "weight"], 0, 0.08, 1, 0.45],
        },
      });
      map.addLayer({ id: "deployments", type: "circle", source: "deployments", paint: { "circle-radius": 2, "circle-color": "#475569", "circle-opacity": 0.7 } });
      map.addLayer({
        id: "events-glow", type: "circle", source: "events",
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 6, 8, 14], "circle-color": SOURCE_COLOR as never, "circle-opacity": 0.18, "circle-blur": 1 },
      });
      map.addLayer({
        id: "events", type: "circle", source: "events",
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 2.5, 8, 6], "circle-color": SOURCE_COLOR as never, "circle-opacity": 0.95, "circle-stroke-width": 0.5, "circle-stroke-color": "#020617" },
      });
      map.on("click", "events", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as Record<string, string>;
        const media = p.media
          ? p.mediaType === "audio" ? `<audio controls src="${p.media}" style="width:220px;margin-top:6px"></audio>` : `<img src="${p.media}" style="width:220px;margin-top:6px;border-radius:6px" alt="" />`
          : "";
        new Popup({ closeButton: false, maxWidth: "260px" })
          .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
          .setHTML(`<div style="font:13px system-ui;color:#e2e8f0"><b>${p.common ?? p.sci}</b><br/><i>${p.sci ?? ""}</i><br/>${new Date(p.t).toLocaleString()}<br/>confidence ${Number(p.conf).toFixed(2)} · ${p.source}${media}</div>`)
          .addTo(map);
      });
      map.on("mouseenter", "events", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "events", () => (map.getCanvas().style.cursor = ""));
      setReady(true);
    });
    mapRef.current = map;
    (window as unknown as { __wnMap?: MLMap }).__wnMap = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  const load = useCallback(async () => {
    const from = new Date(Date.now() - hours * 3600_000).toISOString();
    const u = new URLSearchParams({ from, limit: "20000" });
    if (species) u.set("species", species);
    const [ev, dep, sp, ins] = await Promise.all([
      fetch(`/api/v1/events?${u}`).then((r) => r.json() as Promise<FC>),
      fetch(`/api/v1/deployments`).then((r) => r.json() as Promise<FC>),
      fetch(`/api/v1/species?hours=${hours}${query ? `&q=${encodeURIComponent(query)}` : ""}`).then((r) => r.json() as Promise<Species[]>),
      fetch(`/api/v1/insights`).then((r) => r.json() as Promise<Insights>),
    ]);
    setEvents(ev); setDeployments(dep); setSpeciesList(sp); setInsights(ins); setFetchedAt(Date.now());
  }, [hours, species, query]);

  useEffect(() => {
    const t0 = setTimeout(load, 0);
    const t = setInterval(load, 60_000);
    return () => { clearTimeout(t0); clearInterval(t); };
  }, [load]);

  // Change cells for the selected species (recent 3 days vs week before).
  useEffect(() => {
    if (!species) return;
    let cancelled = false;
    fetch(`/api/v1/species/${encodeURIComponent(species)}`).then((r) => r.json()).then((d: SpeciesDetail) => {
      if (cancelled) return;
      const max = Math.max(1, ...d.cells.map((c) => c.n));
      if (d.cells.length && mapRef.current) {
        const lats = d.cells.map((c) => c.lat), lons = d.cells.map((c) => c.lon);
        mapRef.current.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons) + 5, Math.max(...lats) + 5]], { padding: { top: 40, bottom: 80, left: 380, right: 40 }, maxZoom: 5, duration: 1200 });
      }
      setCells({
        type: "FeatureCollection",
        features: d.cells.map((c) => {
          const r = c.recent / 3, e = c.earlier / 7; // per-day rates
          const change = r + e === 0 ? 0 : Math.max(-1, Math.min(1, (r - e) / (r + e)));
          return {
            type: "Feature",
            geometry: { type: "Polygon", coordinates: [[[c.lon, c.lat], [c.lon + 5, c.lat], [c.lon + 5, c.lat + 5], [c.lon, c.lat + 5], [c.lon, c.lat]]] },
            properties: { change, weight: Math.log1p(c.n) / Math.log1p(max) },
          };
        }),
      });
    });
    return () => { cancelled = true; };
  }, [species]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("cells") as GeoJSONSource)?.setData(species ? cells : EMPTY);
    (map.getSource("deployments") as GeoJSONSource)?.setData(deployments);
    let fc = events;
    if (playhead !== null) {
      const cutoff = windowStart + playhead;
      const trail = Math.max(hours * 3600_000 * 0.05, 15 * 60_000);
      fc = { ...events, features: events.features.filter((f) => { const t = Date.parse(String(f.properties.t)); return t <= cutoff && t > cutoff - trail; }) };
    }
    (map.getSource("events") as GeoJSONSource)?.setData(fc);
  }, [events, deployments, cells, species, playhead, ready, windowStart, hours]);

  useEffect(() => {
    if (!playing) return;
    const total = hours * 3600_000;
    const id = setInterval(() => setPlayhead((p) => { const n = (p ?? 0) + total / 300; return n >= total ? 0 : n; }), 50);
    return () => clearInterval(id);
  }, [playing, hours]);

  const total = hours * 3600_000;
  const pick = (name: string) => { setSpecies(name); setPlayhead(null); setPlaying(false); };

  return (
    <div className="relative h-screen w-screen bg-slate-950 text-slate-100 font-sans">
      <div className="absolute inset-0"><div ref={containerRef} className="h-full w-full" /></div>

      <aside className="absolute left-3 top-3 bottom-3 w-[21rem] flex flex-col rounded-xl bg-slate-900/85 backdrop-blur border border-slate-700/60 overflow-hidden">
        <div className="px-4 pt-3 pb-2 border-b border-slate-800">
          <div className="flex items-baseline justify-between">
            <h1 className="text-base font-semibold tracking-tight">WildNetwork</h1>
            {insights && <span className="text-[11px] text-slate-500 tabular-nums">{insights.coverage.detections.toLocaleString()} detections · {insights.coverage.species} species</span>}
          </div>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a species"
            className="mt-2 w-full rounded-md bg-slate-800 px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-cyan-600" />
          {query && (
            <div className="mt-1 max-h-40 overflow-y-auto">
              {speciesList.slice(0, 20).map((s) => (
                <button key={s.scientificName} onClick={() => { pick(s.scientificName); setQuery(""); }} className="w-full text-left px-2 py-1 rounded hover:bg-slate-800 text-sm">
                  {s.vernacularName ?? s.scientificName} <span className="text-slate-500 text-xs italic">{s.scientificName}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {species ? (
          <SpeciesPanel name={species} onClose={() => setSpecies(null)} />
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
            <Section title="Moving" hint="Centroid shift per continent, 3 days vs week before">
              {insights?.drift.map((d) => (
                <Row key={d.scientificName + d.region} onClick={() => pick(d.scientificName)} name={d.vernacularName ?? d.scientificName} sci={`${d.scientificName} · ${d.region}`}
                  value={`${Math.abs(d.driftDeg).toFixed(1)}° ${d.driftDeg > 0 ? "N" : "S"}`} tone={d.driftDeg > 0 ? "warm" : "cool"} />
              ))}
            </Section>
            <Section title="Surging and fading" hint="Yesterday vs 7-day average">
              {insights?.movers.map((m) => (
                <Row key={m.scientificName} onClick={() => pick(m.scientificName)} name={m.vernacularName ?? m.scientificName} sci={m.scientificName}
                  value={`${m.ratio >= 1 ? "×" + m.ratio.toFixed(1) : "÷" + (1 / m.ratio).toFixed(1)}`} tone={m.ratio >= 1 ? "warm" : "cool"} />
              ))}
            </Section>
            <Section title="New arrivals" hint="First time in a 5° cell in 12 days">
              {insights?.arrivals.map((a) => (
                <Row key={`${a.scientificName}${a.cellLat}${a.cellLon}`} onClick={() => pick(a.scientificName)} name={a.vernacularName ?? a.scientificName} sci={a.scientificName}
                  value={`${a.cellLat}°, ${a.cellLon}°`} tone="neutral" />
              ))}
            </Section>
            <Section title="Most detected" hint={`Last ${hours < 24 ? hours + "h" : hours / 24 + "d"}`}>
              {speciesList.slice(0, 15).map((s) => (
                <Row key={s.scientificName} onClick={() => pick(s.scientificName)} name={s.vernacularName ?? s.scientificName} sci={s.scientificName} value={s.count.toLocaleString()} tone="neutral" />
              ))}
            </Section>
          </div>
        )}

        <div className="px-4 py-2 border-t border-slate-800 text-[11px] text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
          <Legend color="#0891b2" label="BirdWeather" /><Legend color="#65a30d" label="iNaturalist" /><Legend color="#db2777" label="WDX devices" />
          <span className="text-slate-500">{deployments.features.length.toLocaleString()} sensors</span>
        </div>
      </aside>

      <div className="absolute left-[23rem] right-3 bottom-3 rounded-xl bg-slate-900/85 backdrop-blur border border-slate-700/60 px-3 py-2 flex items-center gap-3">
        <div className="flex gap-1">
          {HOURS.map((h) => (
            <button key={h} onClick={() => { setHours(h); setPlayhead(null); setPlaying(false); }}
              className={`text-xs rounded px-2 py-1 ${h === hours ? "bg-slate-200 text-slate-900 font-medium" : "bg-slate-800 hover:bg-slate-700"}`}>
              {h < 24 ? `${h}h` : `${h / 24}d`}
            </button>
          ))}
        </div>
        <button onClick={() => { setPlaying((p) => !p); if (playhead === null) setPlayhead(0); }} className="rounded bg-cyan-700 hover:bg-cyan-600 text-sm px-3 py-1">
          {playing ? "Pause" : "Play"}
        </button>
        <input type="range" min={0} max={total} step={total / 600} value={playhead ?? total}
          onChange={(e) => { setPlaying(false); setPlayhead(Number(e.target.value)); }} className="flex-1 accent-cyan-500" />
        <button onClick={() => { setPlaying(false); setPlayhead(null); }} className="text-xs text-slate-400 hover:text-white">All</button>
        <span className="text-xs text-slate-300 tabular-nums w-40 text-right">
          {playhead === null ? `${events.features.length.toLocaleString()} events` : new Date(windowStart + playhead).toLocaleString()}
        </span>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">{title}</h3>
        <span className="text-[10px] text-slate-500">{hint}</span>
      </div>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

function Row({ name, sci, value, tone, onClick }: { name: string; sci: string; value: string; tone: "warm" | "cool" | "neutral"; onClick: () => void }) {
  const toneCls = tone === "warm" ? "text-orange-400" : tone === "cool" ? "text-blue-400" : "text-slate-300";
  return (
    <button onClick={onClick} className="flex items-center justify-between gap-2 px-2 py-1 -mx-2 rounded hover:bg-slate-800 text-left">
      <span className="min-w-0"><span className="text-sm block truncate">{name}</span><span className="text-[11px] text-slate-500 italic block truncate">{sci}</span></span>
      <span className={`text-xs tabular-nums shrink-0 ${toneCls}`}>{value}</span>
    </button>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: color }} />{label}</span>;
}
