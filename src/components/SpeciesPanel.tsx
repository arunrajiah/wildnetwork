"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { track } from "./Analytics";

export interface SpeciesDetail {
  scientificName: string;
  vernacularName: string | null;
  sources: string[];
  methods?: string;
  group?: string;
  daily: { day: string; n: number; high: number | null; effort: number; index: number; lat: number | null; lon: number | null; cells: number; weather: { tmax: number | null; tmin: number | null; precip: number | null; wind: number | null; windDir: number | null } | null }[];
  cells: { lat: number; lon: number; n: number; recent: number | null; earlier: number | null }[];
}

const W = 560, H = 96, PAD = { l: 36, r: 8, t: 10, b: 18 };

function Line({ values, labels, format, color, title }: { values: (number | null)[]; labels: string[]; format: (v: number) => string; color: string; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const nums = values.filter((v): v is number => v != null);
  if (nums.length < 2) return <div className="text-xs text-slate-500 py-4">{title}: not enough data yet</div>;
  const min = Math.min(...nums), max = Math.max(...nums);
  const x = (i: number) => PAD.l + (i / (values.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - min) / (max - min || 1)) * (H - PAD.t - PAD.b);
  const d = values.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`)).reduce<string>((acc, p, i) => (p == null ? acc : acc + (acc && values[i - 1] != null ? " L" : " M") + p), "");
  const hi = hover != null && values[hover] != null ? hover : nums.length ? values.lastIndexOf(nums[nums.length - 1]) : null;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-slate-400 truncate pr-2">{title}</span>
        {hi != null && <span className="text-slate-200 tabular-nums whitespace-nowrap">{labels[hi].slice(5)} · {format(values[hi]!)}</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24" role="img" aria-label={title}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; setHover(Math.max(0, Math.min(values.length - 1, Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (values.length - 1))))); }}>
        <line x1={PAD.l} x2={W - PAD.r} y1={y(min)} y2={y(min)} stroke="#334155" strokeWidth={1} />
        <text x={PAD.l - 4} y={y(max) + 4} textAnchor="end" fontSize={10} fill="#94a3b8">{format(max)}</text>
        <text x={PAD.l - 4} y={y(min) + 4} textAnchor="end" fontSize={10} fill="#94a3b8">{format(min)}</text>
        <text x={PAD.l} y={H - 4} fontSize={10} fill="#64748b">{labels[0].slice(5)}</text>
        <text x={W - PAD.r} y={H - 4} textAnchor="end" fontSize={10} fill="#64748b">{labels[labels.length - 1].slice(5)}</text>
        <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {hi != null && <>
          <line x1={x(hi)} x2={x(hi)} y1={PAD.t} y2={H - PAD.b} stroke="#475569" strokeWidth={1} />
          <circle cx={x(hi)} cy={y(values[hi]!)} r={4} fill={color} stroke="#0f172a" strokeWidth={2} />
        </>}
      </svg>
    </div>
  );
}

const CLASS_NOUN: Record<string, string> = { avian: "", bat: "bat", amphibian: "frog", insect: "insect", mammal: "mammal", other: "other" };

interface Arrival { cellLat: number; cellLon: number; region: string; arrivalWeek: string; peakWeek: string; departureWeek: string | null; detections: number }
interface Media { title: string | null; thumbUrl: string | null; imageUrl: string | null; extract: string | null; pageUrl: string | null; source: string; attribution: string | null; license: string | null }

export default function SpeciesPanel({ name, onClose }: { name: string; onClose: () => void }) {
  const [data, setData] = useState<SpeciesDetail | null>(null);
  const [media, setMedia] = useState<Media | null>(null);
  const [arrivals, setArrivals] = useState<{ name: string; rows: Arrival[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/arrivals?species=${encodeURIComponent(name)}`).then((r) => r.json()).then((d) => { if (!cancelled) setArrivals({ name, rows: d.arrivals ?? [] }); });
    return () => { cancelled = true; };
  }, [name]);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/media?names=${encodeURIComponent(name)}`).then((r) => r.json()).then((d) => { if (!cancelled) setMedia(d[name] ?? null); });
    return () => { cancelled = true; };
  }, [name]);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/species/${encodeURIComponent(name)}`).then((r) => r.json()).then((d) => { if (!cancelled) setData(d); });
    return () => { cancelled = true; };
  }, [name]);

  if (!data || data.scientificName !== name) return <div className="text-sm text-slate-400 p-4">Loading {name}…</div>;
  const days = data.daily;
  const labels = days.map((d) => d.day);
  const total = days.reduce((a, d) => a + d.n, 0);
  const located = days.filter((d) => d.lat != null);
  const drift = located.length > 3 ? located[located.length - 1].lat! - located[0].lat! : null;
  const corr = pearson(days.map((d) => d.index), days.map((d) => d.weather?.tmax ?? null));

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto">
      <div className="relative">
        {media?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={media.thumbUrl ?? media.imageUrl} alt={media.title ?? name} className="w-full h-40 object-cover" />
        ) : <div className="w-full h-16 bg-slate-800" />}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900 to-transparent h-20" />
        <button onClick={onClose} aria-label="Close" className="absolute top-2 right-2 rounded-full bg-slate-900/70 text-slate-200 hover:text-white w-7 h-7 text-sm">✕</button>
        <div className="absolute left-4 bottom-2">
          <h2 className="text-base font-semibold leading-tight drop-shadow">{data.vernacularName ?? data.scientificName}</h2>
          <p className="text-xs text-slate-300 italic">{data.scientificName}</p>
        </div>
      </div>
      <div className="px-4 flex flex-col gap-3">
      {media?.extract && <p className="text-xs text-slate-300 leading-relaxed">{media.extract.split(". ").slice(0, 2).join(". ").replace(/\.$/, "")}.{media.pageUrl && <> <a href={media.pageUrl} target="_blank" rel="noreferrer" className="text-cyan-500 hover:underline">Wikipedia</a></>}</p>}
      <dl className="grid grid-cols-3 gap-2 text-xs">
        <Stat label="Detections, 30d" value={total.toLocaleString()} />
        <Stat label="Range centre drift" value={drift == null ? "n/a" : `${Math.abs(drift).toFixed(1)}° ${drift > 0 ? "north" : "south"}`} />
        <Stat label="Frequency vs max temp" value={corr == null ? "n/a" : `r = ${corr.toFixed(2)}`} />
      </dl>
      <Line title={`Relative frequency (per 1,000${CLASS_NOUN[data.group ?? "avian"] ? " " + CLASS_NOUN[data.group ?? "avian"] : ""})`} values={days.map((d) => d.index)} labels={labels} format={(v) => (v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2))} color="#22d3ee" />
      <Line title="Range centre latitude" values={days.map((d) => d.lat)} labels={labels} format={(v) => `${v.toFixed(1)}°`} color="#a78bfa" />
      <Line title="Max temperature at range centre (°C)" values={days.map((d) => d.weather?.tmax ?? null)} labels={labels} format={(v) => `${v.toFixed(0)}°`} color="#fb923c" />
      <Line title="Max wind at range centre (km/h)" values={days.map((d) => d.weather?.wind ?? null)} labels={labels} format={(v) => `${v.toFixed(0)}`} color="#94a3b8" />
      <ArrivalTable rows={arrivals?.name === name ? arrivals.rows : null} name={name} />
      <p className="text-[11px] text-slate-500 pb-4">
        Effort corrected: figures are the species&apos; share of all {CLASS_NOUN[data.group ?? "avian"] || "bird"} detections, so more stations do not look like more animals.{" "}
        <Link href="/methods" className="text-cyan-500 hover:underline">How this is measured, and its limits</Link>.
        Sources: {data.sources.join(", ")}. Weather: Open-Meteo ERA5 at the range centre. Map squares show the change in share, last 3 days against the week before.
        {media?.attribution && <> Photo: {media.attribution} ({media.license}).</>}
      </p>
      </div>
    </div>
  );
}

/** Arrival week by latitude band for the continent with the most cells: the classic "arrival front". */
function ArrivalTable({ rows, name }: { rows: Arrival[] | null; name: string }) {
  if (!rows) return null;
  if (rows.length === 0) return <div className="text-xs text-slate-500">Seasonal timing: no clear arrival in the past year (a resident here, or too few detections).</div>;
  const byRegion = new Map<string, Arrival[]>();
  rows.forEach((r) => byRegion.set(r.region, [...(byRegion.get(r.region) ?? []), r]));
  const [region, list] = [...byRegion.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const bands = new Map<number, Arrival[]>();
  list.forEach((r) => bands.set(r.cellLat, [...(bands.get(r.cellLat) ?? []), r]));
  const median = (xs: string[]) => xs.sort()[Math.floor((xs.length - 1) / 2)];
  const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-slate-400">Arrival by latitude · {region}</span>
        <a href={`/api/v1/arrivals?species=${encodeURIComponent(name)}&format=csv`} onClick={() => track("download_csv", { species: name })} className="text-cyan-500 hover:underline">CSV</a>
      </div>
      <table className="mt-1 w-full text-xs tabular-nums">
        <thead><tr className="text-left text-slate-500"><th className="font-normal py-0.5">Latitude</th><th className="font-normal">Arrives</th><th className="font-normal">Peaks</th><th className="font-normal text-right">Cells</th></tr></thead>
        <tbody>
          {[...bands.entries()].sort((a, b) => b[0] - a[0]).map(([lat, rs]) => (
            <tr key={lat} className="border-t border-white/5 text-slate-200">
              <td className="py-0.5">{Math.abs(lat)}° to {Math.abs(lat + 5)}° {lat >= 0 ? "N" : "S"}</td>
              <td>{fmt(median(rs.map((r) => r.arrivalWeek)))}</td>
              <td>{fmt(median(rs.map((r) => r.peakWeek)))}</td>
              <td className="text-right text-slate-400">{rs.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[11px] text-slate-500">First week the species reaches a tenth of its seasonal peak after at least six weeks away (median across cells). Typically within a week of human sightings, about a week late; for residents it marks the start of singing. <Link href="/validation" className="text-cyan-500 hover:underline">Validation</Link>.</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-800/70 px-2 py-1.5">
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-sm text-slate-100 tabular-nums">{value}</dd>
    </div>
  );
}

function pearson(a: number[], b: (number | null)[]): number | null {
  const pairs = a.map((x, i) => [x, b[i]] as const).filter((p): p is readonly [number, number] => p[1] != null);
  if (pairs.length < 5) return null;
  const n = pairs.length, mx = pairs.reduce((s, p) => s + p[0], 0) / n, my = pairs.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pairs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}
