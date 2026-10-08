<p align="center"><img src="public/logo.svg" width="96" alt="WildNetwork logo" /></p>

# WildNetwork

**A live, open map of where birds and animals are, and where they are going.**

Live site: **https://wildnetwork.arunrajiah.com**

WildNetwork gathers wildlife detections from acoustic stations, camera traps and community observations into one open event stream, then looks for movement: species whose range centre is shifting, whose numbers are surging or fading, and who has turned up somewhere new. Weather is matched to each species day by day.

It is free, open source, and built so that anyone with a Raspberry Pi can contribute data.

> Part of an open wildlife toolkit. Not sure this is the project you need? See [which project to use](#part-of-an-open-wildlife-toolkit).

## Contents

- [What you can do with it](#what-you-can-do-with-it)
- [Methods and limits](https://wildnetwork.arunrajiah.com/methods) and [validation](https://wildnetwork.arunrajiah.com/validation)
- [Contribute data from your own device](#contribute-data-from-your-own-device)
- [How it works](#how-it-works)
- [Open API](#open-api)
- [Run your own instance](#run-your-own-instance)
- [Project layout](#project-layout)
- [Data sources and licensing](#data-sources-and-licensing)
- [Part of an open wildlife toolkit](#part-of-an-open-wildlife-toolkit)
- [Contributing and governance](#contributing-and-governance)
- [Roadmap](#roadmap)
- [Credits](#credits)

## What you can do with it

- **See what is happening now.** A live map of detections from thousands of sensors, with a feed of the latest events.
- **Birds, bats, frogs, insects and mammals.** Switch class in the top bar. Each class is measured against its own kind, so bats are compared with bats from the stations that can hear them.
- **See what is changing.** Species moving north or south (per continent), species surging or fading against their weekly average, and first arrivals in a region.
- **Follow one species.** Daily counts, the drift of its range centre, temperature and wind where it is, and a week by week playback of its movement across a year.
- **Add your own sensor.** One command on a Raspberry Pi.
- **Use the data.** Everything on the map is available through an open read API.

## Contribute data from your own device

The step by step guide, for people who already have a device and for people starting from nothing, is at **[wildnetwork.arunrajiah.com/contribute](https://wildnetwork.arunrajiah.com/contribute)**. Stations that already report to BirdWeather are included automatically and should not install the agent as well.

Building a new station? The open **[WildNetwork Base](https://github.com/arunrajiah/wildnetwork-base)** (Raspberry Pi, microphone, solar) identifies birds on the device and sends to WildNetwork by itself; install it on a Raspberry Pi (a ready-to-flash SD card image is coming) and set it up from a phone or a browser.

If you run BirdNET-Pi or BirdNET-Go on a Raspberry Pi:

```bash
curl -fsSL https://wildnetwork.arunrajiah.com/agent/install.sh | bash
```

That installs **[wdx-agent](https://github.com/arunrajiah/wdx-agent)**, a single dependency free Python file (Apache 2.0). It finds your detection database, registers a device key, and starts sending. Your location is rounded to about 1 km on the device before anything is sent.

### Capture setups

| You have | You need | Guide |
|---|---|---|
| A Raspberry Pi and a USB microphone | [BirdNET-Pi](https://github.com/Nachtzuster/BirdNET-Pi) + wdx-agent | [Acoustic station with BirdNET-Pi](https://github.com/arunrajiah/wdx-agent#acoustic-station-with-birdnet-pi) |
| A Pi, mini PC, NAS or an RTSP camera with audio | [BirdNET-Go](https://github.com/tphakala/birdnet-go) + wdx-agent | [Acoustic station with BirdNET-Go](https://github.com/arunrajiah/wdx-agent#acoustic-station-with-birdnet-go) |
| A trail camera | [SpeciesNet](https://github.com/google/cameratrapai) + wdx-agent | [Camera trap with SpeciesNet](https://github.com/arunrajiah/wdx-agent#camera-trap-with-speciesnet) |
| An ultrasonic recorder (AudioMoth, Song Meter Mini Bat) | [BatDetect2](https://github.com/macaodha/batdetect2) + wdx-agent | [Bat detector with BatDetect2](https://github.com/arunrajiah/wdx-agent#bat-detector-with-batdetect2) |
| A table exported by Kaleidoscope, SonoBat or similar | wdx-agent's `csv` source | [Any detections table](https://github.com/arunrajiah/wdx-agent#any-detections-table-csv) |
| Any other detector (Frigate, MegaDetector, a custom model) | Write WDX events to a file, or POST them | [Anything else](https://github.com/arunrajiah/wdx-agent#anything-else-write-wdx-to-a-file) |

Hardware lists, configuration, privacy settings and troubleshooting are in the [wdx-agent README](https://github.com/arunrajiah/wdx-agent#readme).

### Push directly, without the agent

Get a key, then POST [WDX 0.1](https://github.com/arunrajiah/wildlife-detection-exchange) events as one JSON object, a JSON array, or NDJSON:

```bash
curl -X POST https://wildnetwork.arunrajiah.com/api/v1/register \
  -H 'content-type: application/json' \
  -d '{"name":"my-station","source":"other"}'

curl -X POST https://wildnetwork.arunrajiah.com/api/v1/events \
  -H "Authorization: Bearer wn_..." \
  -H "content-type: application/x-ndjson" \
  --data-binary @events.wdx.ndjson
```

Keys are tied to one source system. Events are validated against the WDX schema, and sending the same `eventId` twice never creates a duplicate.

## How it works

```
 Capture                         Exchange                           Observe
 -------                         --------                           -------
 wdx-agent on your device  --+
 (BirdNET-Pi, BirdNET-Go,    +-->  POST /api/v1/events  --+
  SpeciesNet, NDJSON)      --+     WDX validation         |
                                                          +--> events (live window, PostGIS)
 Pull connectors           ----->  map to WDX           --+        |
 (BirdWeather, iNaturalist)                                        v
                                                          species_daily / species_weekly
 BirdWeather aggregates    ----->  rollups per species,            |
 (history without raw data)        5 degree cell, day, week        v
                                                          insights, species pages, map
 Open-Meteo, Wikipedia     ----->  weather and species media
```

- **One format.** Every record, whatever its origin, becomes a WDX event. Connectors never write to tables directly.
- **Live window plus rollups.** Raw events are kept for the live map. History is kept as counts per species, per 5 degree cell, per day and per week, which is what movement analysis needs and stays small.
- **Movement is measured, not drawn, and corrected for effort.** Every measure uses a species' share of all detections in a cell, never its raw count, so more stations do not look like more birds. The definitions, thresholds and known limits are published at **[wildnetwork.arunrajiah.com/methods](https://wildnetwork.arunrajiah.com/methods)**.

## Open API

All read endpoints are public and need no key.

| Endpoint | Returns |
|---|---|
| `GET /api/v1/events?from=&to=&species=&bbox=w,s,e,n&source=&minConfidence=&limit=` | GeoJSON of detection events |
| `GET /api/v1/deployments` | GeoJSON of sensor sites with 24 hour counts |
| `GET /api/v1/species?hours=24&q=robin` | Species ranked by detections |
| `GET /api/v1/species/{scientific name}` | 30 day series, range centre, weather |
| `GET /api/v1/species/{scientific name}/movement` | Weekly frames for the past year |
| `GET /api/v1/arrivals?species=&lat=&lon=&format=csv` | Arrival, peak and departure week per species and cell ([validated](https://wildnetwork.arunrajiah.com/validation)) |
| `?group=bat` on events, species, insights, arrivals | Limit to one class: `avian`, `bat`, `amphibian`, `insect`, `mammal` |
| `GET /api/v1/insights` | Moving, surging, fading, arriving (effort corrected, with the methods version) |
| `GET /api/v1/media?names=A,B` | Species photo and description with attribution |
| `POST /api/v1/ask` | A plain language answer from the site's own data (when switched on; 8 an hour per visitor) |
| `GET /api/v1/status` | Freshness and totals |
| `POST /api/v1/register` | A device key (5 per address per day) |
| `POST /api/v1/events` | Ingest WDX events (key required) |

Please credit the underlying data sources when you reuse data, see [Data sources and licensing](#data-sources-and-licensing).

## Run your own instance

Requirements: Node.js 22+, pnpm, Docker (for local Postgres with PostGIS).

```bash
git clone https://github.com/arunrajiah/wildnetwork && cd wildnetwork
pnpm install
cp .env.example .env.local
pnpm db:up            # Postgres 16 + PostGIS on port 5433
pnpm db:migrate       # applies drizzle/*.sql in order, safe to re-run
pnpm backfill 14      # 14 days of daily rollups from BirdWeather (about 7 minutes)
pnpm pull 60          # live pull every 60 seconds, leave running
pnpm dev              # http://localhost:3000
```

Optional: `pnpm backfill:weekly 52` fills a year of weekly history for the movement playback. It is slow, roughly two minutes per week.

| Command | What it does |
|---|---|
| `pnpm db:up` / `pnpm db:migrate` | Start the database, apply migrations |
| `pnpm pull [seconds]` | Run the pull connectors on a loop (`0` runs once) |
| `pnpm backfill [days]` / `pnpm backfill:weekly [weeks]` | Build history from BirdWeather aggregates |
| `pnpm key:create "<name>" [source]` | Issue a push key by hand |
| `pnpm lint` / `pnpm exec tsc --noEmit` | Checks that CI runs |

### Self-host with Neon and Vercel

The public site runs this way, and it fits in free tiers to start.

1. Create a [Neon](https://neon.com) project (or add Neon from the Vercel Marketplace: `vercel integration add neon`). PostGIS is available on Neon; the first migration enables it with `CREATE EXTENSION postgis`.
2. Put the pooled connection string in `DATABASE_URL`.
3. Apply the schema: `DATABASE_URL=... pnpm exec tsx scripts/migrate.mts`.
4. Build history: `DATABASE_URL=... pnpm exec tsx scripts/backfill.mts 14`. Rollups keep the database small: about 200 million detections fit in a few hundred thousand rows.
5. Deploy the app to Vercel (`vercel --prod`) with `DATABASE_URL` and `CRON_SECRET` set.
6. Schedule the pull and rollup endpoints (below). Neon scales to zero when idle, so the first request after a quiet period takes about a second.

**Ask box (optional).** Set `ASK_ENABLED=true` to switch on plain language questions, answered by an AI model that can only read this site's own data through four lookups (see [methods](https://wildnetwork.arunrajiah.com/methods#ask)). The free route needs no payment card: create a key in [Google AI Studio](https://aistudio.google.com/apikey), leave billing off, and store it as `GOOGLE_GENERATIVE_AI_API_KEY` in your host's secret store (`vercel env add GOOGLE_GENERATIVE_AI_API_KEY production`), never in a file. Without that key the app uses the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway), which needs no key on Vercel but does need a card on the account.

**Analytics (optional).** Set `NEXT_PUBLIC_GA_ID` to a Google Analytics 4 measurement id. Visitors are asked first, and nothing is loaded from Google unless they allow it. Leave it unset for no analytics at all.

**Deploying elsewhere.** Any Node host with a Postgres + PostGIS database works. The public site runs on Vercel with Neon. Set `DATABASE_URL` and `CRON_SECRET`, run the migrations against the production database, and schedule `GET /api/cron/pull` every few minutes and `GET /api/cron/rollup` hourly with `Authorization: Bearer $CRON_SECRET` (see [.github/workflows/ingest.yml](.github/workflows/ingest.yml)).

## Project layout

```
agent/                    vendored copy of wdx-agent, served from /agent/ on the site
drizzle/                  SQL migrations, applied in file name order
scripts/                  migrate, pull loop, backfills, key creation
src/lib/wdx/              WDX schema, validation, ingest (upsert and dedupe)
src/lib/connectors/       pull connectors (BirdWeather, iNaturalist)
src/lib/rollups.ts        daily and weekly rollups
src/lib/media.ts          species photo and description cache
src/app/api/v1/           public API
src/app/api/cron/         scheduled pull and rollup
src/components/           map shell, species panel, about panel
```

Stack: Next.js (App Router), TypeScript, Tailwind, MapLibre GL, Postgres with PostGIS.

## Data sources and licensing

**Code** in this repository is licensed under the [GNU Affero General Public License v3.0](LICENSE). You may use, modify and self host it. If you run a modified version as a network service, you must make your changes available under the same license. The capture agent is separate and more permissive: [wdx-agent](https://github.com/arunrajiah/wdx-agent) is Apache 2.0 (the copy in `agent/` keeps that license), and the [WDX schema](https://github.com/arunrajiah/wildlife-detection-exchange) is MIT.

**Data** shown on the map belongs to its sources and keeps their terms:

| Source | What | Terms |
|---|---|---|
| [BirdWeather](https://www.birdweather.com) | Acoustic detections from community stations | Detections only, never soundscapes or recording links (agreed with BirdWeather, October 2026); credit BirdWeather and its station owners |
| [GBIF](https://www.gbif.org) | Observations published by national recording schemes and others | Only CC0 and CC BY 4.0 records are ingested; every dataset is cited by DOI |
| [iNaturalist](https://www.inaturalist.org) | Community observations | Only CC0 and CC BY records are ingested; credit the observer |
| WDX producers | Devices running wdx-agent or pushing directly | License chosen by each contributor, CC BY 4.0 by default |
| [Open-Meteo](https://open-meteo.com) | ERA5 weather | CC BY 4.0 |
| [Wikipedia](https://www.wikipedia.org) / Wikimedia Commons | Species photos and descriptions | CC BY-SA |
| [OpenFreeMap](https://openfreemap.org), [OpenMapTiles](https://openmaptiles.org), [OpenStreetMap](https://www.openstreetmap.org/copyright) | Base map | ODbL and respective licenses |
| [EarthRanger](https://www.earthranger.com) | Map silhouettes and interface patterns | Apache 2.0, see [public/icons/er/NOTICE.md](public/icons/er/NOTICE.md) |

## Part of an open wildlife toolkit

Eight open source projects for listening to, identifying and mapping wildlife. They work together, but you rarely need more than one or two. Start from what you want to do:

| I want to | Use | What it is |
|---|---|---|
| See where birds and wildlife are moving, or download the data | [WildNetwork](https://github.com/arunrajiah/wildnetwork) (this project) | The live map and open data: [wildnetwork.arunrajiah.com](https://wildnetwork.arunrajiah.com) |
| Build a monitoring station from open hardware | [WildNetwork Base](https://github.com/arunrajiah/wildnetwork-base) | Software for the open WildNetwork station (Raspberry Pi, microphone, solar); SD card image coming |
| Share detections from a BirdNET-Pi, BirdNET-Go, camera trap or bat detector you already have | [wdx-agent](https://github.com/arunrajiah/wdx-agent) | One small program that sends your station's detections. BirdWeather stations are already included and need nothing |
| Follow your own station on your phone | [BirdEcho](https://github.com/arunrajiah/birdecho) | Android app for BirdNET-Pi, BirdNET-Go and BirdWeather stations |
| Identify a sound you just heard | [WildEcho](https://github.com/arunrajiah/wildecho) | Phone app: record a clip, get ranked species |
| Run your own sound identification server | [wildecho-api](https://github.com/arunrajiah/wildecho-api) | Self-hosted species identification from audio, on CPU, no API keys |
| Check camera trap predictions before you use them | [SpeciesNet Studio](https://github.com/arunrajiah/speciesnet-studio) | Self-hosted review of SpeciesNet results |
| Make your own software or device produce or read detections in a common format | [WDX](https://github.com/arunrajiah/wildlife-detection-exchange) | The open format for one AI wildlife detection; maps to Darwin Core |

**How this one fits.** WildNetwork is where detections come together. It takes WDX from WildNetwork Bases and wdx-agent, alongside BirdWeather, GBIF and iNaturalist, and turns them into the map, arrival dates and open data releases.

**How they connect:** stations (a WildNetwork Base, BirdNET-Pi, BirdNET-Go, camera traps) produce detections; wdx-agent sends them in the WDX format; WildNetwork maps them. Connected today: wdx-agent and the WildNetwork Base send to WildNetwork, and WildEcho uses wildecho-api. Planned: Base setup in BirdEcho, and WDX export from wildecho-api and SpeciesNet Studio.

## Name and logo

The code is open source (AGPL v3). The name "WildNetwork" and the logo are not part of the code licence: forks that run as a public service should use their own name and logo. See [TRADEMARKS.md](TRADEMARKS.md).

## Contributing and governance

Contributions are welcome: new connectors, better movement analysis, design, documentation, translations, and above all data.

- [CONTRIBUTING.md](CONTRIBUTING.md): how to set up, what to work on, how to add a connector
- [GOVERNANCE.md](GOVERNANCE.md): who decides what, and the commitments that do not change
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [SECURITY.md](SECURITY.md): reporting vulnerabilities and sensitive species concerns

## Roadmap

- More sources: Movebank GPS tracks, GBIF camera trap datasets (Camtrap DP), weather radar migration (NEXRAD, OPERA)
- Species level alerts: first arrival of the season, unusual movement nights
- Context layers for long term analysis: land use, agriculture and climate indicators
- Per station pages for contributors
- wdx-agent sources: Frigate, MegaDetector, Animl, BirdNET-Go v2
- More bat data: NABat and national bat monitoring schemes, by agreement

## Credits

Made by [Arun Rajiah](https://www.arunrajiah.com), alongside [WDX](https://github.com/arunrajiah/wildlife-detection-exchange), [wdx-agent](https://github.com/arunrajiah/wdx-agent), [BirdEcho](https://github.com/arunrajiah/birdecho), [WildEcho](https://github.com/arunrajiah/wildecho) and [SpeciesNet Studio](https://github.com/arunrajiah/speciesnet-studio).

WildNetwork stands on the work of the BirdNET team (Cornell Lab of Ornithology and Chemnitz University of Technology), BirdWeather and its station owners, iNaturalist observers, Open-Meteo, Wikipedia contributors, the OpenStreetMap community, MapLibre, PostGIS, and EarthRanger.
