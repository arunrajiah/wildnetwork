# Contributing to WildNetwork

WildNetwork exists so that anyone can see how wildlife is moving, and anyone can help. Thank you for being here.

## Ways to help

- **Data.** Run [wdx-agent](https://github.com/arunrajiah/wdx-agent) on a BirdNET station or camera trap. This is the most valuable contribution of all.
- **Connectors.** Bring in another open network (Movebank, GBIF camera trap datasets, weather radar).
- **Analysis.** Better movement measures, alerts, weather relationships. Ecologists and statisticians are very welcome to challenge the current methods.
- **Design and accessibility.** The map should be clear to someone who is not a scientist.
- **Documentation and translation.**
- **Bug reports.** Especially wrong or misleading insights. Open an issue with the species, the date, and what you expected.

## Set up

```bash
pnpm install
cp .env.example .env.local
pnpm db:up && pnpm db:migrate
pnpm backfill 14       # history for the insights
pnpm pull 0            # one live pull
pnpm dev
```

Before you open a pull request:

```bash
pnpm lint
pnpm exec tsc --noEmit
```

## Conventions

- **Everything is a WDX event.** A connector maps its source to `WdxEvent` and hands it to `ingestEvents`. It never writes to tables itself.
- **Raw history is not stored.** History lives in `species_daily` and `species_weekly`. Do not add a feature that needs years of raw events.
- **Migrations** are plain SQL files in `drizzle/`, numbered, idempotent (`IF NOT EXISTS`), and never edited after merge. Add a new file.
- **No new runtime dependency** without a reason stated in the pull request.
- **Charts** have one measure per chart (no dual axes), text in text colours, and a hover readout.
- **Copy** is plain and short. No em dashes.
- **Licenses matter.** A new data source needs its license and attribution written into the README table and the About panel in the same pull request. Sources that forbid redistribution cannot be stored.

## Adding a pull connector

1. Create `src/lib/connectors/<name>.ts` exporting a `PullConnector`: `pull(cursor)` returns `{ events, cursor }`.
2. Give events a stable `eventId` of the form `<source>:<record id>`.
3. Keep only records whose license allows redistribution, and set `license` on each event.
4. Register it in `src/lib/connectors/index.ts`.
5. Add the source colour and legend entry if it should be distinguished on the map.
6. Document it under "Data sources and licensing".

## Sensitive species

Do not add features that expose precise locations of threatened species. Sources that already obscure locations must stay obscured. If you find a record on the map that could put an animal at risk, report it privately, see [SECURITY.md](SECURITY.md).

## Pull requests

- Small and focused. Describe what changes for a visitor of the site.
- Include a screenshot for interface changes.
- Sign off your commits (`git commit -s`). This is the [Developer Certificate of Origin](https://developercertificate.org): you confirm you have the right to contribute the work under this project's license (AGPL-3.0).

## Conduct

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
