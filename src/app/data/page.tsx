import type { Metadata } from "next";
import Link from "next/link";
import { METHODS_VERSION, OBSERVED } from "@/lib/methods";
import { DATA_RELEASES } from "@/lib/site";

export const metadata: Metadata = {
  title: "Open data: weekly wildlife records, effort and arrival dates",
  alternates: { canonical: "/data" },
  description: "Citable, versioned downloads of weekly bird, bat, amphibian and insect records on a 5 degree grid, with observation effort and arrival dates, from openly licensed GBIF records.",
};

const fmt = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default function Data() {
  const latest = DATA_RELEASES[0];
  return (
    <main className="min-h-screen bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <Link href="/" className="text-sm text-cyan-400 hover:underline">← Back to the map</Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100">Open data</h1>
        <p className="mt-3">
          Versioned files for research and teaching: weekly records per species on a 5 degree grid, the observation effort behind them, and seasonal arrival
          dates. Built only from records their publishers released under CC0 or CC BY 4.0 through GBIF, so you may reuse them under CC BY 4.0 with credit.
        </p>

        {latest ? (
          <section className="mt-6 rounded-lg border border-white/10 bg-white/5 p-4">
            <h2 className="text-lg font-semibold text-slate-100">Latest release: {fmt(latest.date)}</h2>
            <p className="mt-1 text-sm text-slate-400">Weeks {latest.weeks} · methods {METHODS_VERSION}{latest.doi ? <> · DOI <a href={`https://doi.org/${latest.doi}`} className="text-cyan-400 hover:underline">{latest.doi}</a></> : null}</p>
            <ul className="mt-3 text-sm space-y-1">
              <li><b>weekly_records.csv</b>: {latest.rows.weekly.toLocaleString("en-GB")} rows (week, cell, class, species, records)</li>
              <li><b>effort.csv</b>: {latest.rows.effort.toLocaleString("en-GB")} rows (all records of a class per cell and week)</li>
              <li><b>arrivals.csv</b>: {latest.rows.arrivals.toLocaleString("en-GB")} rows (arrival, peak and departure week per species and cell)</li>
              <li><b>datasets.csv</b>: {latest.rows.datasets.toLocaleString("en-GB")} contributing GBIF datasets with DOIs, for citation</li>
            </ul>
            <p className="mt-3 flex flex-wrap gap-3">
              <a href={latest.zip} className="inline-block rounded-md bg-cyan-500 px-4 py-2 font-medium text-slate-950 hover:bg-cyan-400">Download (zip)</a>
              <a href={latest.url} className="inline-block rounded-md border border-white/15 px-4 py-2 text-slate-200 hover:bg-white/5">Release notes</a>
            </p>
          </section>
        ) : (
          <p className="mt-6 rounded-lg border border-white/10 bg-white/5 p-4 text-sm">The first release is being prepared.</p>
        )}

        <h2 className="mt-8 text-xl font-semibold text-slate-100">What is in it</h2>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>Birds, bats, amphibians and insects; human and machine observations with coordinates and no geospatial issues.</li>
          <li>Counts are records, not animals. Use <b>effort.csv</b> to turn them into shares and to judge coverage: WildNetwork treats a cell-week as watched by observers at {OBSERVED.MIN_EFFORT_WEEK} bird records ({OBSERVED.SMALL_MIN_EFFORT_WEEK} for other classes).</li>
          <li>Arrival dates follow the rule on the <Link href="/methods#measures" className="text-cyan-400 hover:underline">methods page</Link>, applied to these records alone.</li>
          <li>The last two weeks are left out because GBIF receives records late.</li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold text-slate-100">What is not in it</h2>
        <p className="mt-2">
          BirdWeather acoustic detections. They power much of the live map with BirdWeather&apos;s agreement, but redistribution has not been agreed, so they are
          not in any release or bulk download.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-slate-100">Citing</h2>
        <p className="mt-2">
          Cite the release you used{latest?.doi ? " by its DOI" : ""}, and the GBIF datasets listed in datasets.csv as GBIF asks
          (<a href="https://www.gbif.org/citation-guidelines" className="text-cyan-400 hover:underline">GBIF citation guidelines</a>). Each release folder has a CITATION.cff file.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-slate-100">Live access</h2>
        <p className="mt-2">
          For current figures use the open API (<Link href="/developers" className="text-cyan-400 hover:underline">documentation and R and Python examples</Link>): <code className="text-slate-200">/api/v1/coverage</code> (who watches each cell), <code className="text-slate-200">/api/v1/arrivals?species=…&amp;format=csv</code>,{" "}
          <code className="text-slate-200">/api/v1/species/…/movement</code>. API responses mix sources and are for viewing; for analysis, use the releases.
        </p>
      </div>
    </main>
  );
}
