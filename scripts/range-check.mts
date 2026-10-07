// Range check (methods 0.11): match names and check every cell. Usage: tsx --env-file=.env.production.local scripts/range-check.mts [minutes=60]
import { sql } from "../src/lib/db";
import { refreshRange } from "../src/lib/range";

console.log(await refreshRange(Number(process.argv[2] ?? 60) * 60_000));
await sql.end();
