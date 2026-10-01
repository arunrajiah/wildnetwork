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
          <li><Link href="https://www.birdweather.com">BirdWeather</Link>: live BirdNET acoustic detections from thousands of community stations worldwide.</li>
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
          <Link href="https://postgis.net">PostGIS</Link>, Next.js. Interface patterns inspired by{" "}
          <Link href="https://www.earthranger.com">EarthRanger</Link> (Apache 2.0), the conservation platform from the Allen Institute for AI.
        </p>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Contribute data</h3>
        <p>
          Any device can join. Push WDX events to <code className="text-xs bg-slate-800 px-1 rounded">POST /api/v1/events</code> with an API key, or read everything
          back through the open <code className="text-xs bg-slate-800 px-1 rounded">GET /api/v1/*</code> endpoints. See the repository for the schema and examples.
        </p>
      </section>
    </div>
  );
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">{children}</a>;
}
