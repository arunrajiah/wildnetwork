import type { Metadata } from "next";
import Link from "next/link";
import CopyBlock from "@/components/CopyBlock";
import { DATA_RELEASES } from "@/lib/site";

export const metadata: Metadata = {
  title: "Developers and researchers: the open API",
  alternates: { canonical: "/developers" },
  description: "How to read WildNetwork's measures from R or Python, push detections from a device, and when to use the citable data releases instead.",
};

const SITE = "https://wildnetwork.arunrajiah.com";

const PY = `import requests, pandas as pd

BASE = "${SITE}/api/v1"

# Arrival weeks for one species, every 5 degree cell
arr = requests.get(f"{BASE}/arrivals", params={"species": "Hirundo rustica"}).json()["arrivals"]
df = pd.DataFrame(arr)
print(df.groupby("region")["arrivalWeek"].min())

# A year of weekly frames: range centre per continent
mv = requests.get(f"{BASE}/species/Hirundo%20rustica/movement").json()
centres = pd.DataFrame([{"week": f["week"], **c} for f in mv["frames"] for c in f["centroids"]])
print(centres[centres.region == "Europe"][["week", "lat"]].tail())`;

const R = `library(httr2)
library(dplyr)

base <- "${SITE}/api/v1"

# Arrival weeks for one species, every 5 degree cell (CSV straight into a data frame)
arr <- read.csv(paste0(base, "/arrivals?species=Hirundo%20rustica&format=csv"), comment.char = "#")
arr |> group_by(region) |> summarise(first = min(arrivalWeek))

# Which cells are watched well enough to use
cov <- request(paste0(base, "/coverage")) |> req_perform() |> resp_body_json()
table(sapply(cov$cells, \\(x) x$status))`;

const RELEASE = `# Latest analysis-ready, citable release (GBIF-derived, CC BY 4.0)
curl -LO ${DATA_RELEASES[0]?.zip ?? SITE + "/data"}`;

export default function Developers() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <Link href="/" className="text-sm text-cyan-400 hover:underline">← Back to the map</Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100">Developers and researchers</h1>
        <p className="mt-3">
          Everything on the map comes from an open API. No key is needed to read it. The full description is an OpenAPI file:{" "}
          <a href="/openapi.json" className="text-cyan-400 hover:underline">openapi.json</a> (import it into Postman, Insomnia or a client generator).
        </p>

        <h2 className="mt-8 text-xl font-semibold text-slate-100">API or releases?</h2>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li><b>Use the API</b> to explore and to show current figures: live detections, effort-corrected measures, arrival weeks, coverage.</li>
          <li><b>Use the <Link href="/data" className="text-cyan-400 hover:underline">open data releases</Link></b> for analysis, papers and anything you redistribute. They are versioned, cite with a DOI, carry GBIF species keys, and are licensed CC BY 4.0.</li>
          <li>API responses include BirdWeather detections, shown with BirdWeather&apos;s agreement for display only. Do not bulk download them or republish them; they are not in the releases for that reason.</li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold text-slate-100">Python</h2>
        <CopyBlock>{PY}</CopyBlock>

        <h2 className="mt-8 text-xl font-semibold text-slate-100">R</h2>
        <CopyBlock>{R}</CopyBlock>

        <h2 className="mt-8 text-xl font-semibold text-slate-100">Main endpoints</h2>
        <table className="mt-3 w-full text-sm">
          <tbody>
            {[
              ["/api/v1/arrivals?species=…&format=csv", "Arrival, peak and departure week per species and 5 degree cell"],
              ["/api/v1/species/{name}/movement", "A year of weekly frames: share per cell, range centre per continent"],
              ["/api/v1/species/{name}", "Last 30 days: daily index, range centre, weather, text summary"],
              ["/api/v1/species/{name}/sources", "Recordings against human sightings in the same cells and weeks"],
              ["/api/v1/insights?group=…", "What is changing now: moving, surging and fading, arrivals"],
              ["/api/v1/coverage", "Which cells are watched, and by which source"],
              ["/api/v1/events?bbox=…&species=…", "Live detections (a sample of the newest) as GeoJSON"],
            ].map(([p, d]) => (
              <tr key={p} className="border-b border-white/5 align-top"><td className="py-1.5 pr-3 font-mono text-[13px] text-slate-200">{p}</td><td>{d}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-sm">
          Every response carries the methods version that produced it; definitions and limits are on the <Link href="/methods" className="text-cyan-400 hover:underline">methods page</Link>.
          Please keep to about one request per second and cache what you can.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-slate-100">Pushing detections</h2>
        <p className="mt-2">
          Devices send WDX events (<a href="https://github.com/arunrajiah/wildlife-detection-exchange" className="text-cyan-400 hover:underline">schema</a>) to{" "}
          <code className="text-slate-200">POST /api/v1/events</code> with a bearer key from <code className="text-slate-200">POST /api/v1/register</code>: a single event, an array or NDJSON, up
          to 5,000 per request. The free <Link href="/contribute" className="text-cyan-400 hover:underline">wdx-agent</Link> does this for BirdNET-Pi, BirdNET-Go, bat detectors and camera traps.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-slate-100">Bulk files</h2>
        <CopyBlock>{RELEASE}</CopyBlock>
        <p className="mt-2 text-sm">Found something wrong? <a href="https://github.com/arunrajiah/wildnetwork/issues" className="text-cyan-400 hover:underline">Open an issue</a> or email arunrajiah@gmail.com.</p>
      </div>
    </main>
  );
}
