import type { Metadata } from "next";
import Link from "next/link";
import PausedNotice from "@/components/PausedNotice";
import { BIRDWEATHER_PAUSED } from "@/lib/sources";
import data from "@/data/validation.json";

export const metadata: Metadata = {
  title: "Validation: arrival dates against human observers",
  alternates: { canonical: "/validation" },
  description: "How WildNetwork's arrival dates compare with independent human observations, including where they are wrong.",
};

interface Pair { sci: string; common: string | null; lat: number; lon: number; ours: string; inat: string; diffWeeks: number; n: number; inatN: number }
const pairs = data.pairs as Pair[];
const S = data.summary;

const W = 640, H = 420, PAD = { l: 78, r: 16, t: 14, b: 40 };
const day = (s: string) => Date.parse(s) / 86400_000;
const fmt = (s: string) => new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default function Validation() {
  // The comparison was built on BirdWeather detections, which are off public display for now.
  if (BIRDWEATHER_PAUSED) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-300">
        <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
          <Link href="/methods" className="text-sm text-cyan-400 hover:underline">← Methods</Link>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100">Validation: arrival dates</h1>
          <PausedNotice className="mt-6" />
          <p className="mt-4">The validation compared arrival dates derived from BirdWeather detections with iNaturalist observations. It is withdrawn while that data is paused.</p>
        </div>
      </main>
    );
  }
  const lo = Math.min(...pairs.flatMap((p) => [day(p.ours), day(p.inat)])), hi = Math.max(...pairs.flatMap((p) => [day(p.ours), day(p.inat)]));
  const sx = (d: number) => PAD.l + ((d - lo) / (hi - lo)) * (W - PAD.l - PAD.r);
  const sy = (d: number) => H - PAD.b - ((d - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const months = ["2026-01-01", "2026-03-01", "2026-05-01", "2026-07-01", "2026-09-01"].filter((m) => day(m) >= lo && day(m) <= hi);

  const bins = new Map<number, number>();
  pairs.forEach((p) => { const b = Math.max(-6, Math.min(8, p.diffWeeks)); bins.set(b, (bins.get(b) ?? 0) + 1); });
  const binKeys = Array.from({ length: 15 }, (_, i) => i - 6);
  const maxBin = Math.max(...bins.values());
  const worst = [...pairs].sort((a, b) => Math.abs(b.diffWeeks) - Math.abs(a.diffWeeks)).slice(0, 12);
  const outliers = pairs.filter((p) => Math.abs(p.diffWeeks) > 4).length;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <Link href="/methods" className="text-sm text-cyan-400 hover:underline">← Methods</Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100">Validation: arrival dates</h1>
        <p className="mt-1 text-sm text-slate-500">Run on {fmt(S.generatedAt)} 2026 · methods {S.methods} · weeks {fmt(S.weeks[0])} 2025 to {fmt(S.weeks[1])} 2026</p>

        <p className="mt-6">
          WildNetwork estimates when a species arrives in a region from acoustic detections. This page compares those estimates with an independent source:
          photographs and recordings submitted by people to iNaturalist, for the same species, the same 5 degree cells and the same weeks. The two sources
          share no data and have different biases, so agreement between them is meaningful, and disagreement is informative.
        </p>

        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Tile label="Arrivals compared" value={String(S.comparable)} note={`${S.species} species`} />
          <Tile label="Median difference" value={`${S.medianDiff > 0 ? "+" : ""}${S.medianDiff} week`} note="WildNetwork is later" />
          <Tile label="Within 1 week" value={`${S.within1}%`} note={`${S.within2}% within 2, ${S.within4}% within 4`} />
          <Tile label="Mean absolute error" value={`${S.mae} weeks`} note={`correlation ${S.pearson}`} />
        </div>

        <H2>What was compared</H2>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>The {S.candidates} best sampled arrivals in WildNetwork between February and mid July 2026, at most six cells per species so that no species dominates. The sample was taken by detection count, not chosen by hand.</li>
          <li>For each, iNaturalist&apos;s weekly count of research grade observations of that species in that cell.</li>
          <li>The <b>same rule</b> on both sides: the arrival is the first week a species reaches a tenth of its seasonal peak, after at least six weeks below that level, and stays there the following week.</li>
          <li>{S.comparable} of {S.candidates} could be compared. In {S.notComparable} cases iNaturalist had too few observations or showed no clear seasonal arrival, and {S.failed} requests failed.</li>
        </ul>

        <H2>Result</H2>
        <figure className="mt-3">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Scatter plot of WildNetwork arrival week against iNaturalist arrival week">
            {months.map((m) => (
              <g key={m}>
                <line x1={sx(day(m))} x2={sx(day(m))} y1={PAD.t} y2={H - PAD.b} stroke="#1e293b" />
                <line x1={PAD.l} x2={W - PAD.r} y1={sy(day(m))} y2={sy(day(m))} stroke="#1e293b" />
                <text x={sx(day(m))} y={H - PAD.b + 16} textAnchor="middle" fontSize={11} fill="#94a3b8">{fmt(m)}</text>
                <text x={PAD.l - 8} y={sy(day(m)) + 4} textAnchor="end" fontSize={11} fill="#94a3b8">{fmt(m)}</text>
              </g>
            ))}
            <line x1={sx(lo)} y1={sy(lo)} x2={sx(hi)} y2={sy(hi)} stroke="#64748b" strokeDasharray="4 4" />
            {pairs.map((p, i) => (
              <circle key={i} cx={sx(day(p.inat))} cy={sy(day(p.ours))} r={4} fill="#22d3ee" fillOpacity={0.55} stroke="#020617" strokeWidth={1}>
                <title>{`${p.common ?? p.sci} (${p.lat}°, ${p.lon}°): WildNetwork ${fmt(p.ours)}, iNaturalist ${fmt(p.inat)}, difference ${p.diffWeeks} weeks`}</title>
              </circle>
            ))}
            <text x={(W + PAD.l) / 2} y={H - 4} textAnchor="middle" fontSize={12} fill="#cbd5e1">Arrival week, iNaturalist observers</text>
            <text x={14} y={H / 2} textAnchor="middle" fontSize={12} fill="#cbd5e1" transform={`rotate(-90 14 ${H / 2})`}>Arrival week, WildNetwork</text>
          </svg>
          <figcaption className="mt-1 text-sm text-slate-500">Each dot is one species in one cell. Dots on the dashed line agree exactly; above it, WildNetwork is later. Hover a dot for the species.</figcaption>
        </figure>

        <figure className="mt-8">
          <svg viewBox="0 0 640 200" className="w-full h-auto" role="img" aria-label="Histogram of the difference in weeks between WildNetwork and iNaturalist arrival dates">
            {binKeys.map((b, i) => {
              const n = bins.get(b) ?? 0, bw = 36, x = 40 + i * 39, h = (n / maxBin) * 140;
              return (
                <g key={b}>
                  <rect x={x} y={160 - h} width={bw} height={Math.max(h, n ? 1 : 0)} rx={3} fill={b === 0 || b === 1 ? "#22d3ee" : "#475569"}><title>{`${n} arrivals`}</title></rect>
                  {n > 0 && <text x={x + bw / 2} y={154 - h} textAnchor="middle" fontSize={11} fill="#cbd5e1">{n}</text>}
                  <text x={x + bw / 2} y={176} textAnchor="middle" fontSize={11} fill="#94a3b8">{b === -6 ? "≤−6" : b === 8 ? "≥8" : b > 0 ? `+${b}` : b}</text>
                </g>
              );
            })}
            <line x1={36} x2={628} y1={160} y2={160} stroke="#334155" />
            <text x={332} y={196} textAnchor="middle" fontSize={12} fill="#cbd5e1">WildNetwork minus iNaturalist, weeks</text>
          </svg>
          <figcaption className="mt-1 text-sm text-slate-500">Most arrivals agree to the week or are one week later in WildNetwork.</figcaption>
        </figure>

        <H2>Reading it honestly</H2>
        <ul className="mt-2 list-disc pl-5 space-y-2">
          <li><b>For most species the acoustic arrival date is usable to within about a week.</b> {S.within1} percent of arrivals agree within one week and {S.within2} percent within two.</li>
          <li><b>There is a consistent lag of about one week.</b> A species has to be heard often enough to reach a tenth of its peak, while a single photograph is enough for a person. Early scouts are seen before they are heard in numbers.</li>
          <li><b>The overall correlation is only {S.pearson}</b> because {outliers} arrivals ({Math.round((100 * outliers) / pairs.length)} percent) miss by more than four weeks. Without them the correlation is 0.94. They are not random, and fall into two groups described below.</li>
          <li><b>Weeks are coarse.</b> Both series are weekly, so a difference of one week can be a difference of one day across a week boundary.</li>
          <li><b>iNaturalist is not the truth either.</b> It reflects when and where people go outdoors with a camera. It is independent, which is what makes the comparison useful.</li>
        </ul>

        <H2>Where it fails</H2>
        <H3>Species that are quiet when they arrive</H3>
        <p>
          Ruby-throated Hummingbird is 9 to 15 weeks late in all six cells tested: WildNetwork puts its arrival in June and July, while people photograph it
          from late March. Hummingbirds make little sound in spring and a great deal around feeders in late summer, so a threshold set relative to the peak
          is crossed far too late. Rufous Hummingbird shows the same miss in one of its three cells and agrees within a week in the other two. Expect this for any species whose calling changes strongly through the season.
        </p>
        <H3>Residents that start singing</H3>
        <p>
          Brown Thrasher and Yellow-throated Warbler on the Gulf coast are present all year. Their &quot;arrival&quot; in February is the start of the singing
          season. For a resident species, the acoustic onset marks behaviour, not movement. The site labels this limit wherever arrival dates are shown.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-400 border-b border-slate-800"><th className="py-1.5 pr-3 font-medium">Species</th><th className="py-1.5 pr-3 font-medium">Cell</th><th className="py-1.5 pr-3 font-medium">WildNetwork</th><th className="py-1.5 pr-3 font-medium">iNaturalist</th><th className="py-1.5 font-medium text-right">Weeks</th></tr></thead>
            <tbody className="tabular-nums">
              {worst.map((p, i) => (
                <tr key={i} className="border-b border-slate-900">
                  <td className="py-1.5 pr-3">{p.common ?? p.sci}</td><td className="py-1.5 pr-3">{p.lat}°, {p.lon}°</td>
                  <td className="py-1.5 pr-3">{fmt(p.ours)}</td><td className="py-1.5 pr-3">{fmt(p.inat)}</td>
                  <td className="py-1.5 text-right">{p.diffWeeks > 0 ? "+" : ""}{p.diffWeeks}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-sm text-slate-500">The twelve largest disagreements.</p>
        </div>

        <H2>What this does not show</H2>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>It covers one spring, mostly in North America and Europe, where both sources have data.</li>
          <li>It tests arrival timing only. Range centres, surges and the relative frequency index are not validated here.</li>
          <li>It is not a comparison with eBird or BirdCast. Their arrival and migration products are not available without an access agreement. That comparison is the next step.</li>
          <li>It has not been reviewed by an ornithologist. If you are one, corrections are welcome.</li>
        </ul>

        <H2>Reproduce it</H2>
        <p>
          The comparison is one script, <a className="text-cyan-400 hover:underline" href="https://github.com/arunrajiah/wildnetwork/blob/main/scripts/validate.mts">scripts/validate.mts</a>, and every pair is in{" "}
          <a className="text-cyan-400 hover:underline" href="https://github.com/arunrajiah/wildnetwork/blob/main/src/data/validation.json">src/data/validation.json</a>. Arrival dates for any species can be downloaded as CSV from{" "}
          <code className="text-slate-200">/api/v1/arrivals?species=Hirundo rustica&amp;format=csv</code>.
        </p>
      </div>
    </main>
  );
}

function H2({ children }: { children: React.ReactNode }) { return <h2 className="mt-10 mb-2 text-xl font-semibold text-slate-100">{children}</h2>; }
function H3({ children }: { children: React.ReactNode }) { return <h3 className="mt-5 mb-1 text-base font-semibold text-slate-200">{children}</h3>; }
function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-xl font-semibold text-slate-100 tabular-nums">{value}</div>
      <div className="text-xs text-slate-500">{note}</div>
    </div>
  );
}
