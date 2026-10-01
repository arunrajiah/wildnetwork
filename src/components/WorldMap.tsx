"use client";

import { AttributionControl, Map as MLMap, NavigationControl, Popup, setWorkerUrl, type GeoJSONSource, type MapLayerMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ICON_IMAGE, registerIcons } from "@/lib/mapIcons";
import AboutPanel from "./AboutPanel";
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

interface Movement { scientificName: string; frames: { week: string; total: number; cells: [number, number, number][]; centroids: { region: string; n: number; lat: number; lon: number }[] }[] }
interface Status { live: boolean; lastPullAt: string | null; events1h: number; sensors: number; detections: number; species: number }

const EMPTY: FC = { type: "FeatureCollection", features: [] };
const STYLE = "https://tiles.openfreemap.org/styles/dark";
const HOURS = [1, 3]; // the live window; longer history is in the weekly movement playback
// Validated for the dark surface (dataviz validator): sources are categorical, change is diverging.
const SOURCE_COLOR: unknown[] = ["match", ["get", "source"], "birdweather", "#0891b2", "inaturalist", "#65a30d", "#db2777"];

export default function WorldMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [hours, setHours] = useState(3);
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
  const [thumbs, setThumbs] = useState<Record<string, string | null>>({});
  const [tab, setTab] = useState<"now" | "feed" | "about" | null>("now");
  const [status, setStatus] = useState<Status | null>(null);
  const [movement, setMovement] = useState<Movement | null>(null);
  const [frame, setFrame] = useState<number | null>(null); // index into movement.frames; null = live view
  const [mvPlaying, setMvPlaying] = useState(false);

  const thumbsRef = useRef<Record<string, string | null>>({});
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
      map.addSource("week-cells", { type: "geojson", data: EMPTY });
      map.addSource("track", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "week-cells", type: "fill", source: "week-cells",
        paint: { "fill-color": "#22d3ee", "fill-opacity": ["interpolate", ["linear"], ["get", "share"], 0, 0.04, 1, 0.7], "fill-outline-color": "rgba(34,211,238,0.25)" },
      });
      map.addLayer({ id: "track-line", type: "line", source: "track", filter: ["==", ["geometry-type"], "LineString"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#f8fafc", "line-width": 3, "line-opacity": 0.75 } });
      map.addLayer({ id: "track-head", type: "circle", source: "track", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 6, "circle-color": "#f8fafc", "circle-stroke-width": 2, "circle-stroke-color": "#020617" } });
      map.addLayer({ id: "deployments", type: "circle", source: "deployments", paint: { "circle-radius": 2, "circle-color": "#475569", "circle-opacity": 0.7 } });
      map.addLayer({
        id: "events-glow", type: "circle", source: "events",
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 6, 8, 14], "circle-color": SOURCE_COLOR as never, "circle-opacity": 0.18, "circle-blur": 1 },
      });
      map.addLayer({
        id: "events", type: "circle", source: "events",
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 2.5, 8, 6], "circle-color": SOURCE_COLOR as never, "circle-opacity": 0.95, "circle-stroke-width": 0.5, "circle-stroke-color": "#020617" },
      });
      registerIcons(map).then(() => {
        if (map.getLayer("events-icons")) return;
        map.addLayer({
          id: "events-icons", type: "symbol", source: "events", minzoom: 3.5, filter: ["!=", ["get", "group"], "Unknown"],
          layout: { "icon-image": ICON_IMAGE as never, "icon-size": ["interpolate", ["linear"], ["zoom"], 3.5, 0.45, 8, 0.8], "icon-padding": 1 },
        });
      }).catch((err) => console.error("icon load failed", err));
      const showPopup = (e: MapLayerMouseEvent) => {
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
      };
      for (const layer of ["events", "events-icons"]) {
        map.on("click", layer, showPopup);
        map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
      }
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
    const [ev, dep, sp, ins, st] = await Promise.all([
      fetch(`/api/v1/events?${u}`).then((r) => r.json() as Promise<FC>),
      fetch(`/api/v1/deployments`).then((r) => r.json() as Promise<FC>),
      fetch(`/api/v1/species?hours=${hours}${query ? `&q=${encodeURIComponent(query)}` : ""}`).then((r) => r.json() as Promise<Species[]>),
      fetch(`/api/v1/insights`).then((r) => r.json() as Promise<Insights>),
      fetch(`/api/v1/status`).then((r) => r.json() as Promise<Status>),
    ]);
    setEvents(ev); setDeployments(dep); setSpeciesList(sp); setInsights(ins); setStatus(st); setFetchedAt(Date.now());
    const names = [...new Set([...ins.drift, ...ins.movers, ...ins.arrivals].map((x) => x.scientificName).concat(sp.slice(0, 15).map((x) => x.scientificName), ev.features.slice(0, 40).map((f) => String(f.properties.sci))))];
    const missing = names.filter((n) => n && n !== "null" && !(n in thumbsRef.current)).slice(0, 40);
    if (missing.length) {
      const m = (await fetch(`/api/v1/media?names=${encodeURIComponent(missing.join(","))}`).then((r) => r.json())) as Record<string, { thumbUrl: string | null }>;
      setThumbs((t) => { const next = { ...t }; for (const n of missing) next[n] = m[n]?.thumbUrl ?? null; thumbsRef.current = next; return next; });
    }
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
        mapRef.current.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons) + 5, Math.max(...lats) + 5]], { padding: { top: 60, bottom: 90, left: 480, right: 40 }, maxZoom: 5, duration: 1200 });
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

  // Weekly movement frames for the selected species (a year of history).
  useEffect(() => {
    if (!species) return;
    let cancelled = false;
    fetch(`/api/v1/species/${encodeURIComponent(species)}/movement`).then((r) => r.json()).then((d: Movement) => { if (!cancelled) setMovement(d); });
    return () => { cancelled = true; };
  }, [species]);

  const frames = useMemo(() => (species && movement?.scientificName === species ? movement.frames : []), [species, movement]);
  const activeFrame = species && frame !== null && frames[frame] ? frames[frame] : null;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const weekSrc = map.getSource("week-cells") as GeoJSONSource, trackSrc = map.getSource("track") as GeoJSONSource;
    if (activeFrame) {
      const max = Math.max(1, ...activeFrame.cells.map((c) => c[2]));
      weekSrc?.setData({ type: "FeatureCollection", features: activeFrame.cells.map(([lat, lon, n]) => ({
        type: "Feature", properties: { share: Math.sqrt(n / max) },
        geometry: { type: "Polygon", coordinates: [[[lon, lat], [lon + 5, lat], [lon + 5, lat + 5], [lon, lat + 5], [lon, lat]]] },
      })) });
      // One centroid track per continent that holds at least 10% of the year's detections.
      const yearTotal = frames.reduce((a, f) => a + f.total, 0);
      const byRegion = new Map<string, { n: number; pts: [number, number][] }>();
      frames.slice(0, frame! + 1).forEach((f) => f.centroids.forEach((c) => {
        const g = byRegion.get(c.region) ?? { n: 0, pts: [] };
        g.pts.push([c.lon, c.lat]); byRegion.set(c.region, g);
      }));
      frames.forEach((f) => f.centroids.forEach((c) => { const g = byRegion.get(c.region); if (g) g.n += c.n; }));
      const feats: GeoJSON.Feature[] = [];
      for (const g of byRegion.values()) {
        if (g.n < yearTotal * 0.1) continue;
        if (g.pts.length > 1) feats.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: g.pts } });
        feats.push({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: g.pts[g.pts.length - 1] } });
      }
      trackSrc?.setData({ type: "FeatureCollection", features: feats });
      (map.getSource("cells") as GeoJSONSource)?.setData(EMPTY);
      (map.getSource("events") as GeoJSONSource)?.setData(EMPTY);
      (map.getSource("deployments") as GeoJSONSource)?.setData(deployments);
      return;
    }
    weekSrc?.setData(EMPTY); trackSrc?.setData(EMPTY);
    (map.getSource("cells") as GeoJSONSource)?.setData(species ? cells : EMPTY);
    (map.getSource("deployments") as GeoJSONSource)?.setData(deployments);
    let fc = events;
    if (playhead !== null) {
      const cutoff = windowStart + playhead;
      const trail = Math.max(hours * 3600_000 * 0.05, 15 * 60_000);
      fc = { ...events, features: events.features.filter((f) => { const t = Date.parse(String(f.properties.t)); return t <= cutoff && t > cutoff - trail; }) };
    }
    (map.getSource("events") as GeoJSONSource)?.setData(fc);
  }, [events, deployments, cells, species, playhead, ready, windowStart, hours, activeFrame, frames, frame]);

  useEffect(() => {
    if (!playing) return;
    const total = hours * 3600_000;
    const id = setInterval(() => setPlayhead((p) => { const n = (p ?? 0) + total / 300; return n >= total ? 0 : n; }), 50);
    return () => clearInterval(id);
  }, [playing, hours]);

  useEffect(() => {
    if (!mvPlaying || frames.length === 0) return;
    const id = setInterval(() => setFrame((f) => ((f ?? -1) + 1) % frames.length), 450);
    return () => clearInterval(id);
  }, [mvPlaying, frames.length]);

  const total = hours * 3600_000;
  const pick = (name: string) => { setSpecies(name); setPlayhead(null); setPlaying(false); setFrame(null); setMvPlaying(false); setTab("now"); };
  const flyTo = (f: GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>) => {
    const c = (f.geometry as GeoJSON.Point).coordinates as [number, number];
    mapRef.current?.flyTo({ center: c, zoom: Math.max(mapRef.current.getZoom(), 6), duration: 900 });
  };
  const panelOpen = tab !== null || species !== null;

  return (
    <div className="fixed inset-0 bg-slate-950 text-slate-100 font-sans overflow-clip">
      <div className="absolute inset-0"><div ref={containerRef} className="h-full w-full" /></div>

      {/* Top bar */}
      <header className="absolute top-0 inset-x-0 h-11 bg-black/80 backdrop-blur-xl border-b border-white/10 flex items-center px-3 gap-3 z-20">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" className="w-6 h-6 rounded-md" />
        <span className="font-semibold tracking-tight">WildNetwork</span>
        <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <span className={`inline-block w-2 h-2 rounded-full ${status?.live ? "bg-[#7fd320]" : "bg-[#d0031b]"}`} />
          {status?.live ? "Live" : "Stale"}{status?.lastPullAt && <span className="hidden sm:inline"> · updated {relTime(status.lastPullAt)}</span>}
        </span>
        <div className="flex-1" />
        <div className="relative w-64 max-w-[40vw]">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a species"
            className="w-full rounded-md bg-white/10 px-2.5 py-1 text-sm outline-none focus:bg-white/15 placeholder:text-slate-500" />
          {query && (
            <div className="absolute top-full mt-1 left-0 right-0 max-h-72 overflow-y-auto rounded-md bg-slate-900 border border-slate-700 shadow-xl">
              {speciesList.slice(0, 20).map((s) => (
                <button key={s.scientificName} onClick={() => { pick(s.scientificName); setQuery(""); }} className="w-full text-left px-3 py-1.5 hover:bg-slate-800 text-sm flex items-center gap-2">
                  <Thumb src={thumbs[s.scientificName]} size={6} />
                  <span className="truncate">{s.vernacularName ?? s.scientificName}</span>
                  <span className="text-slate-500 text-xs italic truncate">{s.scientificName}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="hidden md:inline text-[11px] text-slate-500 tabular-nums">
          {status ? `${status.detections.toLocaleString()} detections · ${status.species.toLocaleString()} species · ${status.sensors.toLocaleString()} sensors` : ""}
        </span>
      </header>

      {/* Icon rail */}
      <nav className="absolute left-0 top-11 bottom-0 w-[4.375rem] bg-black/80 backdrop-blur-xl border-r border-white/10 flex flex-col items-center py-2 gap-1 z-20">
        <RailButton label="Now" active={tab === "now" && !species} onClick={() => { setTab("now"); setSpecies(null); }} icon={<path d="M3 12h4l3-8 4 16 3-8h4" />} />
        <RailButton label="Feed" active={tab === "feed" && !species} onClick={() => { setTab("feed"); setSpecies(null); }} icon={<><path d="M4 6h16M4 12h16M4 18h10" /></>} />
        <RailButton label="About" active={tab === "about" && !species} onClick={() => { setTab("about"); setSpecies(null); }} icon={<><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" /></>} />
        <div className="flex-1" />
        <RailButton label="Hide" active={false} onClick={() => { setTab(null); setSpecies(null); }} icon={<path d="M15 6l-6 6 6 6" />} />
      </nav>

      {/* Panel */}
      {panelOpen && (
        <aside className="absolute left-[4.375rem] top-11 bottom-0 w-[24rem] max-w-[calc(100vw-4.375rem)] bg-slate-900/95 backdrop-blur-xl border-r border-white/10 flex flex-col z-10">
          {species ? (
            <SpeciesPanel name={species} onClose={() => setSpecies(null)} />
          ) : tab === "about" ? (
            <AboutPanel />
          ) : tab === "feed" ? (
            <div className="flex-1 overflow-y-auto">
              <div className="px-4 py-2 text-[11px] text-slate-500 border-b border-white/5">Latest detections · {events.features.length.toLocaleString()} in the last {hours < 24 ? hours + "h" : hours / 24 + "d"}</div>
              {events.features.slice(0, 200).map((f) => {
                const p = f.properties as Record<string, string>;
                return (
                  <div key={p.id} className="flex items-center gap-3 h-[3.85rem] px-3 border-b border-white/5 hover:bg-white/5">
                    <button onClick={() => pick(p.sci)} className="shrink-0"><Thumb src={thumbs[p.sci]} size={10} /></button>
                    <button onClick={() => pick(p.sci)} className="min-w-0 flex-1 text-left">
                      <div className="text-sm truncate">{p.common ?? p.sci}</div>
                      <div className="text-[11px] text-slate-500 truncate">{p.source} · conf {Number(p.conf).toFixed(2)}</div>
                    </button>
                    <span className="text-[11px] text-slate-400 tabular-nums shrink-0">{relTime(p.t)}</span>
                    <button onClick={() => flyTo(f)} aria-label="Jump to location" className="shrink-0 w-7 h-7 rounded hover:bg-white/10 text-slate-400 hover:text-white grid place-items-center">
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></svg>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
              <Section title="Moving" hint="Centroid shift per continent, 3 days vs week before">
                {insights?.drift.map((d) => (
                  <Row key={d.scientificName + d.region} thumb={thumbs[d.scientificName]} onClick={() => pick(d.scientificName)} name={d.vernacularName ?? d.scientificName} sci={`${d.scientificName} · ${d.region}`}
                    value={`${Math.abs(d.driftDeg).toFixed(1)}° ${d.driftDeg > 0 ? "N" : "S"}`} tone={d.driftDeg > 0 ? "warm" : "cool"} />
                ))}
              </Section>
              <Section title="Surging and fading" hint="Yesterday vs 7-day average">
                {insights?.movers.map((m) => (
                  <Row key={m.scientificName} thumb={thumbs[m.scientificName]} onClick={() => pick(m.scientificName)} name={m.vernacularName ?? m.scientificName} sci={m.scientificName}
                    value={`${m.ratio >= 1 ? "×" + m.ratio.toFixed(1) : "÷" + (1 / m.ratio).toFixed(1)}`} tone={m.ratio >= 1 ? "warm" : "cool"} />
                ))}
              </Section>
              <Section title="New arrivals" hint="First time in a 5° cell in 12 days">
                {insights?.arrivals.map((a) => (
                  <Row key={`${a.scientificName}${a.cellLat}${a.cellLon}`} thumb={thumbs[a.scientificName]} onClick={() => pick(a.scientificName)} name={a.vernacularName ?? a.scientificName} sci={a.scientificName}
                    value={`${a.cellLat}°, ${a.cellLon}°`} tone="neutral" />
                ))}
              </Section>
              <Section title="Most detected" hint={`Last ${hours < 24 ? hours + "h" : hours / 24 + "d"}`}>
                {speciesList.slice(0, 15).map((s) => (
                  <Row key={s.scientificName} thumb={thumbs[s.scientificName]} onClick={() => pick(s.scientificName)} name={s.vernacularName ?? s.scientificName} sci={s.scientificName} value={s.count.toLocaleString()} tone="neutral" />
                ))}
              </Section>
            </div>
          )}
          <div className="px-4 py-2 border-t border-white/5 text-[11px] text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
            <Legend color="#0891b2" label="BirdWeather" /><Legend color="#65a30d" label="iNaturalist" /><Legend color="#db2777" label="WDX devices" />
            <span className="text-slate-500">{deployments.features.length.toLocaleString()} sensors</span>
          </div>
        </aside>
      )}

      {/* Time slider */}
      <div className={`absolute right-6 bottom-6 ${panelOpen ? "left-[30rem]" : "left-24"} h-[3.75rem] rounded-lg bg-black/70 backdrop-blur-xl border border-white/10 px-4 flex items-center gap-3 z-10 transition-[left]`}>
        {species ? (
          <>
            <span className="text-[11px] uppercase tracking-wider text-slate-400 shrink-0 whitespace-nowrap">{activeFrame ? new Date(activeFrame.week).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" }) : "Movement"}</span>
            <button disabled={frames.length === 0} onClick={() => { setMvPlaying((p) => !p); if (frame === null) setFrame(0); }} className="rounded bg-[#006cd9] hover:bg-[#2b84e6] disabled:opacity-40 text-sm px-3 py-1 font-medium whitespace-nowrap shrink-0">
              {mvPlaying ? "Pause" : "Play year"}
            </button>
            <input type="range" min={0} max={Math.max(0, frames.length - 1)} aria-label="Week" step={1} value={frame ?? Math.max(0, frames.length - 1)} disabled={frames.length === 0}
              onChange={(e) => { setMvPlaying(false); setFrame(Number(e.target.value)); }} className="flex-1 min-w-0 accent-[#006cd9]" />
            <button onClick={() => { setMvPlaying(false); setFrame(null); }} className="text-xs text-slate-400 hover:text-white">Live</button>
            <span className="text-xs text-slate-300 tabular-nums whitespace-nowrap text-right hidden lg:inline">
              {frames.length === 0 ? "No weekly history yet" : activeFrame ? `Week of ${new Date(activeFrame.week).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} · ${activeFrame.total.toLocaleString()}` : `${frames.length} weeks available`}
            </span>
          </>
        ) : (
          <>
        <div className="flex gap-1">
          {HOURS.map((h) => (
            <button key={h} onClick={() => { setHours(h); setPlayhead(null); setPlaying(false); }}
              className={`text-xs rounded px-2 py-1 ${h === hours ? "bg-white/90 text-slate-900 font-medium" : "bg-white/10 hover:bg-white/20"}`}>
              {h < 24 ? `${h}h` : `${h / 24}d`}
            </button>
          ))}
        </div>
        <button onClick={() => { setPlaying((p) => !p); if (playhead === null) setPlayhead(0); }} className="rounded bg-[#006cd9] hover:bg-[#2b84e6] text-sm px-3 py-1 font-medium">
          {playing ? "Pause" : "Play"}
        </button>
        <input type="range" min={0} max={total} step={total / 600} value={playhead ?? total}
          onChange={(e) => { setPlaying(false); setPlayhead(Number(e.target.value)); }} className="flex-1 accent-[#006cd9]" />
        <button onClick={() => { setPlaying(false); setPlayhead(null); }} className="text-xs text-slate-400 hover:text-white">All</button>
        <span className="text-xs text-slate-300 tabular-nums w-40 text-right hidden sm:inline">
          {playhead === null ? `${events.features.length.toLocaleString()} events` : new Date(windowStart + playhead).toLocaleString()}
        </span>
          </>
        )}
      </div>
    </div>
  );
}

function relTime(iso: string) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function RailButton({ label, active, onClick, icon }: { label: string; active: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`w-14 h-14 rounded-md flex flex-col items-center justify-center gap-1 text-[10px] ${active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"}`}>
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
      {label}
    </button>
  );
}

function Thumb({ src, size }: { src?: string | null; size: 6 | 8 | 10 }) {
  const cls = size === 6 ? "w-6 h-6" : size === 8 ? "w-8 h-8" : "w-10 h-10";
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="" className={`${cls} rounded-full object-cover shrink-0 bg-slate-800`} loading="lazy" /> : <span className={`${cls} rounded-full bg-slate-800 shrink-0 inline-block`} />;
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

function Row({ name, sci, value, tone, onClick, thumb }: { name: string; sci: string; value: string; tone: "warm" | "cool" | "neutral"; onClick: () => void; thumb?: string | null }) {
  const toneCls = tone === "warm" ? "text-[#E76826]" : tone === "cool" ? "text-[#268cfb]" : "text-slate-300";
  return (
    <button onClick={onClick} className="flex items-center gap-2 px-2 py-1 -mx-2 rounded hover:bg-white/5 text-left">
      <Thumb src={thumb} size={8} />
      <span className="min-w-0 flex-1"><span className="text-sm block truncate">{name}</span><span className="text-[11px] text-slate-500 italic block truncate">{sci}</span></span>
      <span className={`text-xs tabular-nums shrink-0 ${toneCls}`}>{value}</span>
    </button>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: color }} />{label}</span>;
}
