// Label every species with its class and rebuild per-class effort. Usage: pnpm classify
import { sql } from "../src/lib/db";
import { classifyAll } from "../src/lib/rollups";

console.log(await classifyAll());
console.log(await sql`SELECT grp, COUNT(*)::int AS taxa, COUNT(*) FILTER (WHERE is_species)::int AS species FROM species_group GROUP BY 1 ORDER BY 2 DESC`);
await sql.end();
