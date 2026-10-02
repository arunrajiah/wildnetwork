export default function AboutPanel() {
  return (
    <div className="p-5 text-sm text-slate-300 flex flex-col gap-5 overflow-y-auto h-full">
      <section>
        <h2 className="text-base font-semibold text-slate-100">WildNetwork</h2>
        <p className="mt-1 leading-relaxed">
          A live, open map of where birds and animals are, and where they are going. WildNetwork aggregates detections from acoustic stations, camera traps,
          community observations and tracking networks into one event stream, then watches for movement: species whose range centre shifts, whose numbers surge
          or fade, and who shows up somewhere new. Weather at each species&apos; centre is matched day by day.
        </p>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Made by</h3>
        <p>
          <a href="https://www.arunrajiah.com" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">Arun Rajiah</a>, as part of an open
          set of wildlife tools: <Link href="https://github.com/arunrajiah/wildlife-detection-exchange">WDX</Link> (the detection exchange format this site speaks),{" "}
          <Link href="https://github.com/arunrajiah/birdecho">BirdEcho</Link>, <Link href="https://github.com/arunrajiah/wildecho">WildEcho</Link> and{" "}
          <Link href="https://github.com/arunrajiah/speciesnet-studio">SpeciesNet Studio</Link>. Source code:{" "}
          <Link href="https://github.com/arunrajiah/wildnetwork">github.com/arunrajiah/wildnetwork</Link>.
        </p>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Data</h3>
        <ul className="flex flex-col gap-1.5">
          <li><Link href="https://www.birdweather.com">BirdWeather</Link>: live acoustic detections from thousands of community stations worldwide. Birds, frogs and insects through BirdNET, and bats from stations with ultrasonic microphones.</li>
          <li><Link href="https://www.inaturalist.org">iNaturalist</Link>: community observations, CC0 and CC BY licensed records only, credited to their observers.</li>
          <li><Link href="https://open-meteo.com">Open-Meteo</Link>: ERA5 reanalysis weather (CC BY 4.0).</li>
          <li><Link href="https://www.wikipedia.org">Wikipedia</Link> and Wikimedia Commons contributors: species photos and descriptions (CC BY-SA).</li>
          <li>WDX producers: anyone running a Raspberry Pi, camera trap or BirdNET station who pushes events to this network.</li>
        </ul>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Built with</h3>
        <p>
          <Link href="https://maplibre.org">MapLibre GL</Link>, <Link href="https://openfreemap.org">OpenFreeMap</Link> tiles from{" "}
          <Link href="https://openmaptiles.org">OpenMapTiles</Link> and <Link href="https://www.openstreetmap.org/copyright">OpenStreetMap</Link> contributors,{" "}
          <Link href="https://postgis.net">PostGIS</Link>, Next.js. Interface patterns and map silhouettes from{" "}
          <Link href="https://www.earthranger.com">EarthRanger</Link> (Apache 2.0), the conservation platform from the Allen Institute for AI.
        </p>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Privacy</h3>
        <p>
          No account, no ads, no tracking by default. If you choose &quot;Allow&quot; when asked, Google Analytics counts your visit and which features you use,
          so the project can show funders and researchers that it is used. Decline and nothing is sent to Google. To change your mind, clear this site&apos;s
          data in your browser and you will be asked again. If you use the Ask box, your question is sent to an AI model provider and kept for 30 days with a scrambled form of your address.
        </p>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Connect your device</h3>
        <p>
          Running BirdNET-Pi or BirdNET-Go on a Raspberry Pi? One command installs the free <b>wdx-agent</b>, registers your station and starts sending detections.
          Coordinates are rounded to about 1 km before they leave your device.
        </p>
        <pre className="mt-2 text-[11px] bg-black/50 border border-white/10 rounded p-2 overflow-x-auto text-slate-200"><code>curl -fsSL https://wildnetwork.arunrajiah.com/agent/install.sh | bash</code></pre>
        <p className="mt-2">
          Camera traps and bat detectors work too, and if you have no device yet, the guide shows what to get and how to build it:{" "}
          <a href="/contribute" className="text-cyan-400 hover:underline">Contribute data</a>. Stations already on BirdWeather are included automatically.
        </p>
      </section>
    </div>
  );
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">{children}</a>;
}
