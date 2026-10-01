import type { Metadata } from "next";
import Link from "next/link";
import { METHODS_VERSION, MIN_CELL_DETECTIONS, MIN_EFFORT_DAY, MIN_EFFORT_WEEK, SMALL_CLASS } from "@/lib/methods";

export const metadata: Metadata = {
  title: "Methods · WildNetwork",
  description: "How WildNetwork measures wildlife movement, how it corrects for observation effort, and what its limits are.",
};

const GH = "https://github.com/arunrajiah/wildnetwork/blob/main";

export default function Methods() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <Link href="/" className="text-sm text-cyan-400 hover:underline">← Back to the map</Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100">Methods</h1>
        <p className="mt-1 text-sm text-slate-500">Version {METHODS_VERSION} · updated 1 October 2026</p>

        <p className="mt-6">
          This page states exactly how each number on WildNetwork is produced, and where it can mislead. If you plan to use these measures in research,
          read the <a href="#limits" className="text-cyan-400 hover:underline">known limits</a> first. The code that computes everything is public and linked
          from each section.
        </p>

        <H2 id="data">1. Data</H2>
        <p>
          A <b>detection</b> is one record that a species was identified at a place and time, by a classifier or a person. WildNetwork currently holds three kinds:
        </p>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li><b>Acoustic detections</b> from BirdWeather community stations: birds, frogs, insects and some mammals identified by BirdNET, and bats identified by BirdWeather&apos;s ultrasonic classifier. This is the large majority of the data.</li>
          <li><b>Community observations</b> from iNaturalist, limited to CC0 and CC BY records.</li>
          <li><b>Device detections</b> pushed by contributors running wdx-agent on BirdNET-Pi, BirdNET-Go or camera traps.</li>
        </ul>
        <p className="mt-3">
          Detections are not stored one by one for long. They are counted into <b>rollups</b>: the number of detections per species, per 5 degree
          latitude and longitude cell, per day and per week. A 5 degree cell is roughly 550 km north to south. All measures below are computed from these
          rollups. The dots on the live map are a sample only (the 500 newest high confidence detections every five minutes, kept for three hours; bats are kept for a day) and are not used for
          any measure.
        </p>
        <Src files={[["src/lib/rollups.ts", "rollups"], ["src/lib/connectors", "connectors"]]} />

        <H2 id="effort">2. Correcting for observation effort</H2>
        <p>
          Raw counts mostly reflect where and how much people are listening. A cell with two hundred stations produces far more detections than a cell with
          two, and a new station looks like a sudden arrival of every species it hears. Daily detections per cell differ by more than a factor of a hundred
          across the network.
        </p>
        <p className="mt-3">
          WildNetwork therefore never compares raw counts between places or periods. It uses <b>relative frequency</b>: a species&apos; share of all detections
          of all species in the same cell and period.
        </p>
        <Formula>share(species, cell, period) = detections of the species ÷ detections of all species</Formula>
        <p>
          The denominator is the <b>effort</b> of that cell and period. A cell and period only counts as observed if effort reaches a minimum: {MIN_EFFORT_DAY}{" "}
          detections for a day, {MIN_EFFORT_WEEK.toLocaleString()} for a week. Below that, the cell is treated as not watched and is left out, instead of being read as an absence.
        </p>
        <p className="mt-3">
          This is the same idea as reporting frequency on checklists in citizen science. It removes the effect of station numbers and uptime to first order.
          It does not make detections equal to animals, see the limits below.
        </p>
        <Src files={[["drizzle/0006_effort.sql", "effort tables"], ["src/lib/methods.ts", "thresholds"]]} />

        <H3><span id="classes" className="scroll-mt-6">Classes: birds, bats, frogs, insects, mammals</span></H3>
        <p>
          Effort is corrected <b>within a class</b>. Each species belongs to one of birds, bats, amphibians, insects or mammals (as labelled by BirdWeather),
          and its share is taken of the detections of that class only.
        </p>
        <Formula>share(bat species, cell, period) = detections of the species ÷ detections of all bats</Formula>
        <p>
          This matters most for bats. Bat calls are ultrasonic and are only recorded by stations with an ultrasonic microphone, about 800 of some 25,000.
          A bat&apos;s share of <i>all</i> detections would mostly measure how many of the local stations can hear bats. Measured against other bats, it
          describes the bat community at the stations that can.
        </p>
        <p className="mt-3">
          Classes other than birds have far fewer sensors and detections, so their minimums are lower: a cell counts as observed with {SMALL_CLASS.MIN_EFFORT_DAY}{" "}
          detections of that class in a day or {SMALL_CLASS.MIN_EFFORT_WEEK} in a week, and count thresholds in the measures below are a fifth of those for birds.
          Results for these classes rest on little data and should be read as early signals.
        </p>
        <p className="mt-3">
          Many bat calls cannot be identified to species and are reported at a higher level: &quot;Bats&quot; (order), &quot;Vesper Bats&quot; (family) or a genus such as
          <i> Myotis</i>. These count toward bat effort, and can be looked up, but are left out of the movement lists and arrival dates, which are for species only.
        </p>

        <H2 id="measures">3. Measures</H2>

        <H3>Relative frequency index</H3>
        <p>Shown on each species panel and in the weekly playback, per 1,000 detections.</p>
        <Formula>index = 1000 × Σ detections of the species ÷ Σ detections of all species, over the species&apos; range cells</Formula>
        <p>
          The range is the set of cells where the species was detected at least once in the window (30 days for the daily series, the past year for the weekly
          series). Only observed cells contribute.
        </p>

        <H3>Range centre</H3>
        <p>The latitude and longitude around which the species is concentrated, weighted by share and not by count.</p>
        <Formula>centre latitude = Σ share(cell) × latitude(cell) ÷ Σ share(cell)</Formula>
        <p>
          Cell positions are cell midpoints. Centres are computed <b>per continent</b> (six coarse regions split by longitude and latitude), so a species that
          lives on two continents never gets a meaningless centre in the ocean between them.
        </p>

        <H3>Moving</H3>
        <p>
          The shift of the range centre within one continent, between the last 3 complete days and days 8 to 10 before today. Only cells observed in{" "}
          <b>both</b> periods are used, so a station going online or offline cannot move the centre. A cell contributes only if the species has at least{" "}
          {MIN_CELL_DETECTIONS} detections there in the period. A species is listed if it has at least 300 detections and 3 contributing cells in each period, and
          the shift is at least 1 degree of latitude (about 111 km).
        </p>

        <H3>Surging and fading</H3>
        <p>The species&apos; global share of detections yesterday, divided by its mean share over the 7 days before.</p>
        <Formula>ratio = share(yesterday) ÷ mean share(previous 7 days)</Formula>
        <p>Listed species have at least 100 detections yesterday, a 7 day mean of at least 100, and at least 5 days of baseline.</p>

        <H3>New arrivals</H3>
        <p>
          A species with at least 20 detections in a cell over the last 2 days, and none in that cell for the 12 days before. The cell must have been observed
          on at least 8 of those 12 days. Without that last condition, most &quot;arrivals&quot; turn out to be new stations.
        </p>

        <H3>Arrival dates</H3>
        <p>
          For each species and cell, from the weekly relative frequency over the past year: the <b>arrival week</b> is the first week the species reaches a
          tenth of its seasonal peak, after at least 6 consecutive observed weeks below that level, and stays there the following week. The <b>peak week</b>{" "}
          is the highest week of that season, and the <b>departure week</b> is the last week above the threshold before the next 6 week absence, when the data
          reaches that far. A species and cell qualifies with at least 26 observed weeks, 200 detections and 30 detections in its peak week; the cell must have
          been observed in the week before the arrival, so an outage cannot look like one. Residents, which have no 6 week absence, get no arrival date.
          The species panel shows the median arrival week per 5 degree latitude band. Download: <code className="text-slate-200">/api/v1/arrivals?species=…&amp;format=csv</code>.
        </p>
        <p className="mt-3">
          These dates were compared with independent human observations: see the <Link href="/validation" className="text-cyan-400 hover:underline">validation</Link>.
          In short, they agree within one week for 70 percent of arrivals, run about one week late, and fail for species that are quiet on arrival and for
          residents whose singing season starts.
        </p>

        <H3>Change squares on the map</H3>
        <p>
          When a species is selected, each cell is coloured by the change in share between the last 3 days and days 8 to 14 before today:{" "}
          <code className="text-slate-200">(recent − earlier) ÷ (recent + earlier)</code>, from −1 (gone) through 0 (unchanged) to +1 (new). Cells not observed
          enough in either period are not drawn.
        </p>

        <H3>Weekly movement playback</H3>
        <p>
          One frame per week for up to a year. Cells are shaded by the species&apos; share that week, on a scale fixed across the whole year so that weeks are
          comparable. The white track joins the weekly range centres for each continent that holds at least 10 percent of the year&apos;s detections.
        </p>

        <H3>Weather</H3>
        <p>
          Daily maximum and minimum temperature, precipitation and wind from the ERA5 reanalysis (Open-Meteo), taken at the species&apos; range centre for that
          day, rounded to 1 degree. The correlation shown is Pearson&apos;s r between the daily index and daily maximum temperature over the window.
        </p>
        <Src files={[["src/app/api/v1/insights/route.ts", "insights"], ["src/app/api/v1/species/%5Bname%5D/route.ts", "species"], ["src/app/api/v1/species/%5Bname%5D/movement/route.ts", "movement"]]} />

        <H2 id="check">4. A worked check</H2>
        <p>
          Wilson&apos;s Warbler (<i>Cardellina pusilla</i>) breeds across boreal Canada and Alaska and winters from Mexico to Panama. Its weekly range centre in
          North America, as computed here on 1 October 2026:
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-400 border-b border-slate-800"><th className="py-1.5 pr-4 font-medium">Week of</th><th className="py-1.5 pr-4 font-medium">Range centre</th><th className="py-1.5 font-medium">Index per 1,000</th></tr></thead>
            <tbody className="tabular-nums">
              {[["27 Jul", "52.8° N", "0.07"], ["10 Aug", "45.2° N", "0.11"], ["24 Aug", "45.0° N", "0.17"], ["7 Sep", "42.8° N", "0.24"], ["14 Sep", "39.3° N", "0.19"], ["21 Sep", "29.7° N", "0.14"]].map((r) => (
                <tr key={r[0]} className="border-b border-slate-900"><td className="py-1.5 pr-4">{r[0]}</td><td className="py-1.5 pr-4">{r[1]}</td><td className="py-1.5">{r[2]}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3">
          The southward passage and its timing match what is known for this species. This is one example chosen because the answer is known. The systematic
          test is on the <Link href="/validation" className="text-cyan-400 hover:underline">validation page</Link>: 204 arrival dates across 82 species
          compared with iNaturalist, including the cases where WildNetwork is wrong. A comparison with eBird and BirdCast products is still to do.
        </p>

        <H2 id="limits">5. Known limits</H2>
        <ol className="mt-2 list-decimal pl-5 space-y-3">
          <li><b>Detections are not animals.</b> One loud bird near a microphone can produce hundreds of detections. Shares describe how often a species is recorded, not how many individuals there are. Do not read the index as abundance.</li>
          <li><b>Classifier errors.</b> Acoustic detections are unreviewed machine identifications. Species with similar calls are confused, and errors are not random: they cluster by region and season. Example: on the day this page was written, Whimbrel showed a 20 degree northward shift in North America in autumn, which is not credible and most likely reflects misidentification in a few cells. Treat any single species result as a lead to check, not a finding.</li>
          <li><b>Where the microphones are.</b> Stations are concentrated in Europe, North America and Australasia, near where people live. Large parts of Africa, Asia and South America have little or no coverage, and a range centre can only move among cells that are watched.</li>
          <li><b>Shares are relative.</b> If another species becomes much more vocal, every other share in that cell falls, even if nothing else changed. Seasonal changes in singing (birds call more in spring) change detection rates without any movement.</li>
          <li><b>Coarse cells.</b> At 5 degrees, movements shorter than a few hundred kilometres are invisible, and a range centre is a summary, not a route.</li>
          <li><b>Thresholds are judgement calls.</b> The minimums on this page were chosen to suppress obvious noise, not derived from a model. They are published so they can be challenged.</li>
          <li><b>Bats are harder than birds.</b> About two thirds of bat detections are identified only to genus, family or order. Species level bat identification from calls is uncertain even for experts, coverage is limited to a few dozen cells, and bat detection scores are on a different scale from bird scores. Nothing about bats has been validated yet. For temperate bats, a seasonal &quot;arrival&quot; is likely emergence from hibernation, not migration.</li>
          <li><b>Acoustic onset is not always arrival.</b> For a resident species the first sustained detections mark the start of singing, not movement. For species that are quiet when they arrive (hummingbirds are the clearest case) the acoustic arrival date can be two to three months late.</li>
          <li><b>No uncertainty yet.</b> Measures are reported without confidence intervals.</li>
          <li><b>Short history.</b> Daily rollups cover four weeks; weekly rollups go back up to a year but with fewer stations in earlier months.</li>
          <li><b>Weather is a single point.</b> Conditions at the range centre do not describe what a migrating bird experienced along its way, and a correlation over a few weeks is not evidence of cause.</li>
          <li><b>Mixed sources.</b> Acoustic detections and human observations are counted together in effort. Human observations are a very small fraction today.</li>
        </ol>

        <H2 id="use">6. Using and citing</H2>
        <p>
          Every measure is available from the open API, for example <code className="text-slate-200">/api/v1/insights</code>,{" "}
          <code className="text-slate-200">/api/v1/species/Cardellina pusilla</code> and <code className="text-slate-200">/api/v1/species/Cardellina pusilla/movement</code>.
          Responses include the methods version that produced them. Please cite the underlying sources as well: BirdWeather and its station owners, iNaturalist
          observers, and Open-Meteo.
        </p>
        <p className="mt-3">
          Suggested citation: Rajiah, A. (2026). WildNetwork: an open map of wildlife movement from community sensors. Methods version {METHODS_VERSION}.
          https://wildnetwork.arunrajiah.com/methods
        </p>
        <p className="mt-3">
          Found a result that is wrong for a species you know? That is the most useful report we can get. Please{" "}
          <a href="https://github.com/arunrajiah/wildnetwork/issues/new?template=misleading_insight.md" className="text-cyan-400 hover:underline">open a &quot;misleading insight&quot; issue</a>.
        </p>

        <H2 id="changes">7. Changes</H2>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li><b>0.4</b> (1 October 2026): taxon classes. Bats, amphibians, insects and mammals are labelled and effort corrected within their own class; higher level identifications are excluded from species measures.</li>
          <li><b>0.3</b> (1 October 2026): arrival, peak and departure weeks per species and cell, with a first validation against iNaturalist.</li>
          <li><b>0.2</b> (1 October 2026): effort correction. All measures use share of detections; range centres use only cells observed in both periods; arrivals require a watched cell.</li>
          <li><b>0.1</b> (1 October 2026): first release, raw counts. Superseded because raw counts track station numbers.</li>
        </ul>

        <p className="mt-10 text-sm text-slate-500">
          Made by <a href="https://www.arunrajiah.com" className="text-cyan-400 hover:underline">Arun Rajiah</a>. Code and this page are open:{" "}
          <a href="https://github.com/arunrajiah/wildnetwork" className="text-cyan-400 hover:underline">github.com/arunrajiah/wildnetwork</a>.
        </p>
      </div>
    </main>
  );
}

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="mt-10 mb-2 text-xl font-semibold text-slate-100 scroll-mt-6">{children}</h2>;
}
function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-6 mb-1 text-base font-semibold text-slate-200">{children}</h3>;
}
function Formula({ children }: { children: React.ReactNode }) {
  return <pre className="my-3 overflow-x-auto rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-[13px] text-slate-200 whitespace-pre-wrap">{children}</pre>;
}
function Src({ files }: { files: [string, string][] }) {
  return (
    <p className="mt-3 text-sm text-slate-500">
      Code: {files.map(([path, label], i) => (
        <span key={path}>{i > 0 && ", "}<a href={`${GH}/${path}`} className="text-cyan-400 hover:underline">{label}</a></span>
      ))}
    </p>
  );
}
