"use client";

import { useEffect, useState } from "react";

export interface SpeciesDetail {
  scientificName: string;
  vernacularName: string | null;
  sources: string[];
  daily: { day: string; n: number; high: number | null; lat: number; lon: number; cells: number; weather: { tmax: number | null; tmin: number | null; precip: number | null; wind: number | null; windDir: number | null } | null }[];
  cells: { lat: number; lon: number; n: number; recent: number; earlier: number }[];
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
        <span className="text-slate-400">{title}</span>
        {hi != null && <span className="text-slate-200 tabular-nums">{labels[hi].slice(5)} · {format(values[hi]!)}</span>}
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

export default function SpeciesPanel({ name, onClose }: { name: string; onClose: () => void }) {
  const [data, setData] = useState<SpeciesDetail | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/species/${encodeURIComponent(name)}`).then((r) => r.json()).then((d) => { if (!cancelled) setData(d); });
    return () => { cancelled = true; };
  }, [name]);

  if (!data || data.scientificName !== name) return <div className="text-sm text-slate-400 p-4">Loading {name}…</div>;
  const days = data.daily;
  const labels = days.map((d) => d.day);
  const total = days.reduce((a, d) => a + d.n, 0);
  const last = days[days.length - 1];
  const first = days[0];
  const drift = last && first && days.length > 3 ? last.lat - first.lat : null;
  const corr = pearson(days.map((d) => d.n), days.map((d) => d.weather?.tmax ?? null));

  return (
    <div className="flex flex-col gap-3 p-4 h-full overflow-y-auto">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold leading-tight">{data.vernacularName ?? data.scientificName}</h2>
          <p className="text-xs text-slate-400 italic">{data.scientificName}</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-sm px-2">✕</button>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-xs">
        <Stat label="Detections, 30d" value={total.toLocaleString()} />
        <Stat label="Centroid drift" value={drift == null ? "n/a" : `${Math.abs(drift).toFixed(1)}° ${drift > 0 ? "north" : "south"}`} />
        <Stat label="Count vs max temp" value={corr == null ? "n/a" : `r = ${corr.toFixed(2)}`} />
      </dl>
      <Line title="Daily detections" values={days.map((d) => d.n)} labels={labels} format={(v) => v.toLocaleString()} color="#22d3ee" />
      <Line title="Centroid latitude" values={days.map((d) => d.lat)} labels={labels} format={(v) => `${v.toFixed(1)}°`} color="#a78bfa" />
      <Line title="Max temperature at centroid (°C)" values={days.map((d) => d.weather?.tmax ?? null)} labels={labels} format={(v) => `${v.toFixed(0)}°`} color="#fb923c" />
      <Line title="Max wind at centroid (km/h)" values={days.map((d) => d.weather?.wind ?? null)} labels={labels} format={(v) => `${v.toFixed(0)}`} color="#94a3b8" />
      <p className="text-[11px] text-slate-500">
        Sources: {data.sources.join(", ")}. Weather: Open-Meteo ERA5 at the daily detection centroid. Map squares show change in the last 3 days versus the week before.
      </p>
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
