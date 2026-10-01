// Backfill species_weekly from BirdWeather aggregates. Usage: pnpm backfill:weekly [weeks=52] [concurrency=8]
import { sql } from "../src/lib/db";
import { birdweatherCells, rollupBirdweatherCellWeek } from "../src/lib/rollups";

const weeks = Number(process.argv[2] ?? 52);
const conc = Number(process.argv[3] ?? 8);
const cells = await birdweatherCells();
const now = new Date();
const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)));
const jobs: { cell: { lat: number; lon: number }; week: string }[] = [];
for (let w = 0; w < weeks; w++) {
  const week = new Date(monday.getTime() - w * 7 * 86400_000).toISOString().slice(0, 10);
  for (const cell of cells) jobs.push({ cell, week });
}
console.log(`${cells.length} cells x ${weeks} weeks = ${jobs.length} queries`);
let done = 0, rows = 0, errors = 0;
const t0 = Date.now();
await Promise.all(Array.from({ length: conc }, async () => {
  while (jobs.length) {
    const j = jobs.shift()!;
    try { rows += await rollupBirdweatherCellWeek(j.cell, j.week); } catch (e) { errors++; if (errors < 5) console.error(j, String(e)); }
    if (++done % 500 === 0) console.log(`${done} done, ${rows} rows, ${errors} errors, ${Math.round((Date.now() - t0) / 1000)}s`);
  }
}));
console.log(`finished: ${done} queries, ${rows} rows, ${errors} errors`);
await sql.end();
