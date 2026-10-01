@AGENTS.md

# WildNetwork
Live world map of bird and animal detections, aggregated from any network or device, with per-species movement over time (weather overlay planned). WDX (wildlife-detection-exchange v0.1) is the canonical event format. Vision and research: docs/RESEARCH-2026-10-01.md.

## Stack
Next.js 16 App Router (Turbopack), TypeScript, Tailwind 4, MapLibre GL 6 (OpenFreeMap dark tiles), Postgres 16 + PostGIS via postgres-js (raw SQL, no ORM), Ajv for WDX schema validation, tsx scripts.

## Layout
- src/lib/wdx: schema (vendored), types, validate, ingest (chunked upsert, dedupe on eventId)
- src/lib/connectors: pull connectors (birdweather GraphQL, inaturalist v1); index.ts runs them with cursor state in pull_state
- src/app/api/v1/{events,deployments,species}: public read API (GeoJSON) + authenticated WDX push (POST /api/v1/events)
- src/app/api/cron/pull: runs connectors (Vercel cron every minute, CRON_SECRET)
- src/lib/rollups.ts: species_daily rollups (BirdWeather via topSpecies aggregate per 5-degree cell per day, other sources from events)
- src/app/api/v1/insights: movers / centroid drift / arrivals from species_daily; src/app/api/v1/species/[name]: 30-day series + Open-Meteo weather at centroid
- src/app/api/cron/rollup: hourly refresh of today+yesterday rollups
- src/components/WorldMap.tsx: EarthRanger-style shell (44px top bar with live dot, 70px icon rail: Now/Feed/About, 24rem panel, floating time slider); SpeciesPanel.tsx: hero image + charts (inline SVG, single series each); AboutPanel.tsx: credits
- src/lib/media.ts + /api/v1/media: cached species image/blurb (Wikipedia, iNat CC fallback) in species_media
- /api/v1/status: live dot + totals
- src/lib/mapIcons.ts + public/icons/er: EarthRanger silhouettes (Apache 2.0) drawn per taxon group (species_media.iconic from iNat) x source colour, symbol layer from zoom 3.5
- drizzle/*.sql: plain SQL migrations applied in order by scripts/migrate.mts
- public/maplibre/: worker files copied by postinstall (gitignored); MapLibre 6 worker needs them under Turbopack

## Deploy
Vercel project wildnetwork (Hobby: crons daily only) + Neon Postgres (wildnetwork-db, PostGIS). Prod URL https://wildnetwork-beige.vercel.app. Push to main auto-deploys. Ingest every 5 min via .github/workflows/ingest.yml (secrets CRON_SECRET, var APP_URL). Migrate prod: `pnpm exec tsx --env-file=.env.production.local scripts/migrate.mts` (pull env with `vercel env pull .env.production.local --environment=production`).

## Commands
- pnpm db:up (docker compose Postgres on :5433), pnpm db:migrate (applies all drizzle/*.sql, idempotent)
- pnpm key:create "<name>" [source_system]  (prints a push API key once)
- pnpm pull [seconds]  (local poller; 0 = run once)
- pnpm backfill [days=14] [concurrency=8]  (BirdWeather rollup backfill, ~390 cells x days queries, ~7 min for 14 days)
- pnpm dev --port 3100, pnpm lint, pnpm exec tsc --noEmit
- .env.local: DATABASE_URL, CRON_SECRET (see .env.example)

## Conventions
- Every ingested record is a WdxEvent; connectors map to it, never write to tables directly.
- eventId is "<source>:<sourceRecordId>" for pulled data; deployments keyed "<source>:<deploymentId>".
- Raw BirdWeather is ~7M detections/day; never ingest raw history, use species_daily rollups. Raw events table is only the live window.
- Store per-event license; only CC0/CC-BY from iNaturalist. BirdWeather terms unconfirmed (email support@birdweather.com).
- Browser pane in this app reports document.hidden=true so MapLibre never renders frames there; drive map._render() manually via window.__wnMap to verify.
- No em dashes in UI copy.

## Token efficiency
- Grep/Glob to the target file; read only the relevant section.
- Don't re-read files after editing. Verify once per batch of edits.
- Delegate broad exploration to a subagent. Batch shell commands.
- Keep narration and summaries to 2-3 sentences.
