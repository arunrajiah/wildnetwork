import type { Metadata } from "next";
import Link from "next/link";
import CopyBlock from "@/components/CopyBlock";

export const metadata: Metadata = {
  title: "Contribute data: connect a bird station, bat detector or camera trap",
  alternates: { canonical: "/contribute" },
  description: "How to send detections from a bird station, bat detector or camera trap to WildNetwork, whether you already have a device or want to set one up.",
};

const SITE = "https://wildnetwork.arunrajiah.com";
const AGENT = "https://github.com/arunrajiah/wdx-agent";

export default function Contribute() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <Link href="/" className="text-sm text-cyan-400 hover:underline">← Back to the map</Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100">Contribute data</h1>
        <p className="mt-3">
          WildNetwork is built from what people&apos;s devices hear and see. If you run a bird station, a bat detector or a camera trap, you can add it in a few
          minutes. If you don&apos;t have one yet, this page shows what to get and how to set it up. It is free, and you keep the rights to your data.
        </p>

        <h2 className="mt-8 mb-3 text-xl font-semibold text-slate-100">Where are you starting from?</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Card href="#birdweather" title="My station is on BirdWeather" text="You are already included. Nothing to install." />
          <Card href="#have" title="I have a device" text="BirdNET-Pi, BirdNET-Go, a camera trap, a bat detector, or other software." />
          <Card href="#new" title="I want to set one up" text="What to buy and how to build a bird, bat or camera station." />
        </div>

        <H2 id="birdweather">Already on BirdWeather? You are done</H2>
        <p>
          WildNetwork already reads BirdWeather&apos;s public network. If you have a BirdWeather PUC, or your BirdNET-Pi or BirdNET-Go station uploads to BirdWeather,
          your detections are on the map and in every measure. <b>Do not install the agent as well:</b> the same detections would arrive twice and be counted twice.
        </p>
        <p className="mt-3">
          Not sure? Look for your station on <A href="https://app.birdweather.com">app.birdweather.com</A>. If it is there, you are included.
        </p>

        <H2 id="have">I have a device</H2>
        <p>
          You install one small program, <A href={AGENT}>wdx-agent</A>, on the computer that holds your detections. It is a single open source Python file with no
          dependencies. It reads what your detector has already found and sends it. It never changes your detector&apos;s files, and it catches up by itself after
          being offline.
        </p>

        <H3 id="birdnet-pi">BirdNET-Pi</H3>
        <p>Open a terminal on the Pi (or connect with SSH) and run:</p>
        <CopyBlock>{`curl -fsSL ${SITE}/agent/install.sh | bash`}</CopyBlock>
        <p>
          The installer finds BirdNET-Pi&apos;s database, registers your station, and starts a background service. It uses the location you set in BirdNET-Pi. That is all.
        </p>

        <H3 id="birdnet-go">BirdNET-Go</H3>
        <p>Run the same command on the machine that runs BirdNET-Go:</p>
        <CopyBlock>{`curl -fsSL ${SITE}/agent/install.sh | bash`}</CopyBlock>
        <p>If it cannot find the database, tell it where <code className="text-slate-200">birdnet.db</code> is:</p>
        <CopyBlock>{`curl -fsSL ${SITE}/agent/install.sh | WDX_SOURCE=birdnet-go WDX_PATH=/path/to/birdnet.db bash`}</CopyBlock>
        <p className="text-sm text-slate-400">Works with BirdNET-Go&apos;s original database layout. Its newer v2 datastore is not supported yet.</p>

        <H3 id="camera">Camera trap</H3>
        <p>
          Cameras take pictures; a classifier names the animals. Run <A href="https://github.com/google/cameratrapai">SpeciesNet</A> over your images, then point the
          agent at the folder with its results. A camera has no GPS in the result file, so give its location:
        </p>
        <CopyBlock>{`curl -fsSL ${SITE}/agent/install.sh | WDX_SOURCE=speciesnet WDX_PATH=/data/camtrap WDX_LAT=11.41 WDX_LON=76.69 bash`}</CopyBlock>
        <p className="text-sm text-slate-400">Blank images, people and vehicles are never sent. One agent serves one location, so use one setup per camera site.</p>

        <H3 id="bat">Bat detector</H3>
        <p>
          Record with an ultrasonic recorder, classify the recordings with <A href="https://github.com/macaodha/batdetect2">BatDetect2</A>, and point the agent at the
          results folder:
        </p>
        <CopyBlock>{`curl -fsSL ${SITE}/agent/install.sh | WDX_SOURCE=batdetect2 WDX_PATH=/data/bats/results WDX_LAT=51.51 WDX_LON=-0.13 bash`}</CopyBlock>
        <p className="text-sm text-slate-400">
          BatDetect2&apos;s default model knows UK species. Elsewhere, use a model trained for your region, or the names will be wrong.
        </p>

        <H3 id="csv">Other software (Kaleidoscope, SonoBat and similar)</H3>
        <p>
          If your software can export a table of detections, the agent can read it. You tell it which columns hold the species, the time and the score. The{" "}
          <A href={`${AGENT}#any-detections-table-csv`}>CSV guide</A> has a worked example.
        </p>

        <H3 id="api">Your own detector or code</H3>
        <p>Send detections straight to the API in the open <A href="https://github.com/arunrajiah/wildlife-detection-exchange">WDX</A> format. Get a key, then post events:</p>
        <CopyBlock>{`curl -X POST ${SITE}/api/v1/register \\
  -H 'content-type: application/json' \\
  -d '{"name":"my-station","source":"other"}'

curl -X POST ${SITE}/api/v1/events \\
  -H "Authorization: Bearer wn_YOUR_KEY" \\
  -H "content-type: application/x-ndjson" \\
  --data-binary @events.wdx.ndjson`}</CopyBlock>

        <H2 id="new">I want to set one up</H2>
        <p>Three kinds of station, from easiest to most involved. Each links to the maker&apos;s own guide for the build, then you come back here to connect it.</p>

        <H3 id="new-bird">A bird listening station</H3>
        <p>The most popular way to start. It sits in a garden or on a balcony and identifies birds by their song, all day, every day.</p>
        <Steps items={[
          <><b>Get the parts:</b> a Raspberry Pi (4B, 5, 3B+ or Zero 2 W), a microSD card of 32 GB or more, a USB microphone (or a USB sound card with a small lavalier microphone), and a power supply. For outdoors, add a weatherproof box.</>,
          <><b>Install the listening software:</b> follow the <A href="https://github.com/Nachtzuster/BirdNET-Pi">BirdNET-Pi</A> guide, or <A href="https://github.com/tphakala/birdnet-go">BirdNET-Go</A> if you prefer. Set your latitude and longitude in its settings.</>,
          <><b>Let it listen for a day</b> and check that it is identifying birds in its own web page.</>,
          <><b>Connect it:</b> run the <a href="#birdnet-pi" className="text-cyan-400 hover:underline">one line install</a> above.</>,
        ]} />
        <p className="mt-3 text-sm text-slate-400">
          Prefer something ready made? A <A href="https://www.birdweather.com">BirdWeather PUC</A> is a finished device that reports to BirdWeather, and so to WildNetwork, with nothing to build.
        </p>

        <H3 id="new-bat">A bat detector</H3>
        <p>Bats call above the range of human hearing, so you need a recorder that captures ultrasound.</p>
        <Steps items={[
          <><b>Get a recorder:</b> an <A href="https://www.openacousticdevices.info/audiomoth">AudioMoth</A> is the common low cost choice. Set it to a sample rate of 250 kHz or more and schedule it from dusk to dawn.</>,
          <><b>Put it out</b> near water, a hedge line or a woodland edge, a few metres up, away from rustling leaves.</>,
          <><b>Collect the recordings</b> and copy them to a computer.</>,
          <><b>Classify them</b> with <A href="https://github.com/macaodha/batdetect2">BatDetect2</A>, which writes a result file for each recording.</>,
          <><b>Connect it:</b> run the <a href="#bat" className="text-cyan-400 hover:underline">bat detector install</a> above, pointing at the results folder.</>,
        ]} />

        <H3 id="new-camera">A camera trap</H3>
        <p>For mammals and ground birds. A camera takes a picture when something moves in front of it.</p>
        <Steps items={[
          <><b>Get a trail camera</b> and an SD card. Any model that saves ordinary photos works.</>,
          <><b>Mount it</b> at about knee height on a game trail or by water, facing north or south to avoid direct sun, with nothing moving in front.</>,
          <><b>Collect the card</b> every few weeks and copy the images to a computer. Keep the file dates when copying, since the agent uses them as the time of each sighting.</>,
          <><b>Classify the images</b> with <A href="https://github.com/google/cameratrapai">SpeciesNet</A>.</>,
          <><b>Connect it:</b> run the <a href="#camera" className="text-cyan-400 hover:underline">camera trap install</a> above with the camera&apos;s location.</>,
        ]} />

        <H2 id="check">Check that it is working</H2>
        <ul className="mt-2 list-disc pl-5 space-y-2">
          <li>Watch the agent: <code className="text-slate-200">journalctl -u wdx-agent -f</code>. A healthy line reads <code className="text-slate-200">sent 12 (new 12, updated 0, rejected 0)</code>.</li>
          <li>See what would be sent, without sending anything: <code className="text-slate-200">python3 /opt/wdx-agent/wdx_agent.py --config /etc/wdx-agent.ini --dry-run</code>.</li>
          <li>On the <Link href="/" className="text-cyan-400 hover:underline">map</Link>, detections from the last three hours appear as pink &quot;Devices&quot; dots at your rounded location.</li>
          <li>Your detections join the movement measures within about an hour.</li>
        </ul>

        <H2 id="privacy">What is shared, and your rights</H2>
        <ul className="mt-2 list-disc pl-5 space-y-2">
          <li><b>Your location is blurred on your device.</b> Coordinates are rounded to about 1 km before anything is sent. You can make that coarser (about 11 km) with <code className="text-slate-200">round_coords = 1</code> in <code className="text-slate-200">/etc/wdx-agent.ini</code>.</li>
          <li><b>What is sent:</b> species, time, confidence, the rounded location, the classifier&apos;s name, the file name of the clip or photo, and a station id. <b>Not sent:</b> the audio or the photos themselves.</li>
          <li><b>No account.</b> The installer registers a key for your device. A station name is optional.</li>
          <li><b>You choose the license.</b> The default is CC BY 4.0, which lets others use your detections with credit.</li>
          <li><b>Sensitive species.</b> If your station records a threatened species at a known site, use the coarser rounding or leave that station out.</li>
          <li><b>Stopping and removal.</b> Uninstall at any time with the commands in the <A href={`${AGENT}#uninstall`}>agent guide</A>. To have your station&apos;s data removed, <A href="https://github.com/arunrajiah/wildnetwork/issues/new">open an issue</A> with your station id (it is in the first line of the agent&apos;s log).</li>
        </ul>

        <H2 id="trouble">If something goes wrong</H2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {[
                ["The installer finds no database", "Tell it the source and path, as in the BirdNET-Go example above."],
                ["\"no coordinates\" in the log", "Add latitude and longitude to /etc/wdx-agent.ini."],
                ["\"server rejected the whole batch\"", "The key was registered for a different source. Register a new one for the right source."],
                ["Nothing is sent", "Run the dry run. If it shows 0 events, everything is below min_confidence or already sent."],
                ["Something else", "The agent guide has a longer list, and you can open an issue."],
              ].map(([a, b]) => (
                <tr key={a} className="border-b border-slate-900 align-top"><td className="py-2 pr-4 text-slate-200 w-2/5">{a}</td><td className="py-2">{b}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3">
          Full reference, every setting, and manual install steps: the <A href={`${AGENT}#readme`}>wdx-agent guide</A>. Problems or questions:{" "}
          <A href={`${AGENT}/issues`}>open an issue</A>.
        </p>

        <p className="mt-10 text-sm text-slate-500">
          How your data is used in the measures: <Link href="/methods" className="text-cyan-400 hover:underline">Methods</Link>. Made by{" "}
          <A href="https://www.arunrajiah.com">Arun Rajiah</A>.
        </p>
      </div>
    </main>
  );
}

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="mt-12 mb-2 text-xl font-semibold text-slate-100 scroll-mt-6">{children}</h2>;
}
function H3({ id, children }: { id: string; children: React.ReactNode }) {
  return <h3 id={id} className="mt-7 mb-1 text-base font-semibold text-slate-200 scroll-mt-6">{children}</h3>;
}
function A({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">{children}</a>;
}
function Card({ href, title, text }: { href: string; title: string; text: string }) {
  return (
    <a href={href} className="block rounded-lg border border-slate-800 bg-slate-900/60 p-4 hover:border-cyan-700 hover:bg-slate-900">
      <div className="font-medium text-slate-100">{title}</div>
      <div className="mt-1 text-sm text-slate-400">{text}</div>
    </a>
  );
}
function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="mt-2 space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-800 text-xs font-medium text-slate-200">{i + 1}</span>
          <span>{it}</span>
        </li>
      ))}
    </ol>
  );
}
