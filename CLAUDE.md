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
- src/components/WorldMap.tsx: the whole UI (sidebar, time slider, playback)
- drizzle/*.sql: plain SQL migrations applied in order by scripts/migrate.mts
- public/maplibre/: worker files copied by postinstall (gitignored); MapLibre 6 worker needs them under Turbopack

## Commands
- pnpm db:up (docker compose Postgres on :5433), pnpm db:migrate (applies all drizzle/*.sql, idempotent)
- pnpm key:create "<name>" [source_system]  (prints a push API key once)
- pnpm pull [seconds]  (local poller; 0 = run once)
- pnpm dev --port 3100, pnpm lint, pnpm exec tsc --noEmit
- .env.local: DATABASE_URL, CRON_SECRET (see .env.example)

## Conventions
- Every ingested record is a WdxEvent; connectors map to it, never write to tables directly.
- eventId is "<source>:<sourceRecordId>" for pulled data; deployments keyed "<source>:<deploymentId>".
- Store per-event license; only CC0/CC-BY from iNaturalist. BirdWeather terms unconfirmed (email support@birdweather.com).
- Browser pane in this app reports document.hidden=true so MapLibre never renders frames there; drive map._render() manually via window.__wnMap to verify.
- No em dashes in UI copy.

## Token efficiency
- Grep/Glob to the target file; read only the relevant section.
- Don't re-read files after editing. Verify once per batch of edits.
- Delegate broad exploration to a subagent. Batch shell commands.
- Keep narration and summaries to 2-3 sentences.
