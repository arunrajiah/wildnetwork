// Move the held BirdWeather rollups back into the live tables and rebuild what depends on them.
// Run ONLY after BirdWeather has agreed in writing, and set BIRDWEATHER_ENABLED=true on Vercel at the same time.
// Usage: tsx --env-file=.env.production.local scripts/birdweather-restore.mts
import { sql } from "../src/lib/db";
import { refreshDerived } from "../src/lib/rollups";
import { recomputePhenology } from "../src/lib/phenology";

for (const t of ["species_weekly", "species_daily"]) {
  const r = await sql.unsafe(`INSERT INTO public.${t} SELECT * FROM held.${t} ON CONFLICT DO NOTHING`);
  console.log(t, "restored", r.count);
}
// Station list: names and coordinates as the API returned them. Live events were deleted on 2 October and refill from the next pull.
const d = await sql`INSERT INTO public.deployments SELECT * FROM held.deployments ON CONFLICT (id) DO NOTHING`;
console.log("deployments restored", d.count);
await sql`DELETE FROM public.species_daily WHERE day < CURRENT_DATE - 28`;
await sql`TRUNCATE effort_daily, effort_weekly`;
await refreshDerived(4000);
console.log("phenology", await recomputePhenology());
console.log(await sql`SELECT pg_size_pretty(pg_database_size(current_database())) db`);
console.log("Held copies are still in schema `held`; drop it once the restore is verified: DROP SCHEMA held CASCADE");
await sql.end();
