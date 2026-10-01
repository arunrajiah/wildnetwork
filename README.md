# WildNetwork

A live world map of bird and animal detections, aggregated from any network or device.

WildNetwork ingests detection events in the open [WDX](https://github.com/arunrajiah/wildlife-detection-exchange) format from acoustic stations, camera traps, community observations and GPS tracking, and shows where species are moving, when, across the whole planet.

**Today's feeds:** BirdWeather (global BirdNET station network), iNaturalist (CC0 / CC-BY observations), and any device pushing WDX events to the API.

## Run locally

```bash
pnpm install
cp .env.example .env.local
pnpm db:up && pnpm db:migrate
pnpm pull 60        # pull BirdWeather + iNaturalist every 60s
pnpm dev            # http://localhost:3000
```

## Push your own detections

Create a key, then POST WDX events (single JSON, JSON array, or NDJSON):

```bash
pnpm key:create "my-birdnet-pi" birdnet-pi
curl -X POST http://localhost:3000/api/v1/events \
  -H "Authorization: Bearer wn_..." \
  -H "content-type: application/json" \
  --data-binary @events.wdx.ndjson
```

## Read API

- `GET /api/v1/events?from=ISO&to=ISO&species=Erithacus+rubecula&bbox=w,s,e,n&source=birdweather&minConfidence=0.7` returns GeoJSON
- `GET /api/v1/deployments` all sensor sites with 24h counts
- `GET /api/v1/species?hours=24&q=robin` ranked species list

## Data and attribution

BirdWeather station data, iNaturalist contributors (CC0 / CC-BY only), WDX producers. Basemap: OpenFreeMap, OpenMapTiles, OpenStreetMap contributors.
