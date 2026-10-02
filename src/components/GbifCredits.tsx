"use client";

import { useEffect, useState } from "react";

interface Ds { datasetKey: string; title: string; doi: string | null; publisher: string | null; records: number; license: string | null; url: string }

/** GBIF asks that every dataset used is cited by DOI. Listed by records seen, newest fetched hourly. */
export default function GbifCredits() {
  const [sets, setSets] = useState<Ds[]>([]);
  useEffect(() => {
    fetch("/api/v1/sources").then((r) => r.json()).then((j: { gbif: Ds[] }) => setSets(j.gbif ?? [])).catch(() => {});
  }, []);
  if (!sets.length) return null;
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">GBIF datasets</h3>
      <ul className="flex flex-col gap-1 text-[12px] text-slate-400">
        {sets.map((d) => (
          <li key={d.datasetKey}>
            <a href={d.doi ? `https://doi.org/${d.doi}` : d.url} target="_blank" rel="noreferrer" className="text-cyan-500 hover:underline">{d.title}</a>
            {d.publisher ? `, ${d.publisher}` : ""}{d.license ? ` (${d.license})` : ""}{d.doi ? `, doi:${d.doi}` : ""}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[12px] text-slate-500">Accessed through <a href="https://www.gbif.org" target="_blank" rel="noreferrer" className="text-cyan-500 hover:underline">GBIF.org</a>. Only records their publishers released under CC0 or CC BY 4.0 are used.</p>
    </section>
  );
}
