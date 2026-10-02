// Backfill species_weekly from GBIF facets. Usage: pnpm backfill:gbif [weeks=52] [concurrency=2] [skipWeeks=0] [rediscover]
import { sql } from "../src/lib/db";
import { gbifCells, rollupGbifCellWeek } from "../src/lib/gbif";

const weeks = Number(process.argv[2] ?? 52);
const conc = Number(process.argv[3] ?? 2);
const skip = Number(process.argv[4] ?? 0);
const cells = await gbifCells(process.argv[5] === "rediscover");
const now = new Date();
const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)));
const jobs: { cell: { lat: number; lon: number }; week: string }[] = [];
for (let w = skip; w < skip + weeks; w++) {
  const week = new Date(monday.getTime() - w * 7 * 86400_000).toISOString().slice(0, 10);
  for (const cell of cells) jobs.push({ cell, week });
}
console.log(`${cells.length} cells x ${weeks} weeks = ${jobs.length} cell-weeks (4 class queries each)`);
let done = 0, rows = 0, errors = 0;
const t0 = Date.now();
await Promise.all(Array.from({ length: conc }, async () => {
  while (jobs.length) {
    const j = jobs.shift()!;
    try { rows += await rollupGbifCellWeek(j.cell, j.week); } catch (e) { errors++; if (errors < 5) console.error(j, String(e)); }
    if (++done % 200 === 0) console.log(`${done} done, ${rows} rows, ${errors} errors, ${Math.round((Date.now() - t0) / 1000)}s`);
  }
}));
console.log(`finished: ${done} cell-weeks, ${rows} rows, ${errors} errors`);
await sql.end();
