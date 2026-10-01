import { birdweatherCells, rollupBirdweatherCellDay, rollupEventsDay } from "@/lib/rollups";

export const maxDuration = 300;

/** Refresh today's and yesterday's rollups. Vercel cron: hourly. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const days = [0, 1].map((d) => new Date(Date.now() - d * 86400_000).toISOString().slice(0, 10));
  const cells = await birdweatherCells();
  let rows = 0, errors = 0;
  const jobs = days.flatMap((day) => cells.map((cell) => ({ cell, day })));
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (jobs.length) {
      const j = jobs.shift()!;
      try { rows += await rollupBirdweatherCellDay(j.cell, j.day); } catch { errors++; }
    }
  }));
  for (const day of days) await rollupEventsDay(day);
  return Response.json({ days, cells: cells.length, rows, errors });
}
