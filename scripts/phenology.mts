// Recompute the phenology table. Usage: pnpm phenology
import { sql } from "../src/lib/db";
import { recomputePhenology } from "../src/lib/phenology";

const t0 = Date.now();
console.log(await recomputePhenology(), `${Math.round((Date.now() - t0) / 1000)}s`);
await sql.end();
