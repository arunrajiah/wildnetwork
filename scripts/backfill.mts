// Backfill species_daily from BirdWeather aggregates. Usage: pnpm backfill [days=14] [concurrency=6]
import { sql } from "../src/lib/db";
import { birdweatherCells, rollupBirdweatherCellDay, rollupEventsDay } from "../src/lib/rollups";

const days = Number(process.argv[2] ?? 14);
const conc = Number(process.argv[3] ?? 6);
const cells = await birdweatherCells();
console.log(`${cells.length} cells with stations, ${days} days, ${cells.length * days} queries`);

const jobs: { cell: { lat: number; lon: number }; day: string }[] = [];
for (let d = days; d >= 0; d--) {
  const day = new Date(Date.now() - d * 86400_000).toISOString().slice(0, 10);
  for (const cell of cells) jobs.push({ cell, day });
}
let done = 0, rows = 0, errors = 0;
const t0 = Date.now();
await Promise.all(Array.from({ length: conc }, async () => {
  while (jobs.length) {
    const j = jobs.shift()!;
    try { rows += await rollupBirdweatherCellDay(j.cell, j.day); } catch (e) { errors++; if (errors < 5) console.error(j, String(e)); }
    if (++done % 100 === 0) console.log(`${done} done, ${rows} rows, ${errors} errors, ${Math.round((Date.now() - t0) / 1000)}s`);
  }
}));
for (let d = days; d >= 0; d--) await rollupEventsDay(new Date(Date.now() - d * 86400_000).toISOString().slice(0, 10));
console.log(`finished: ${done} queries, ${rows} rows, ${errors} errors`);
await sql.end();
