import { refreshRollups } from "@/lib/rollups";

export const maxDuration = 300;

/** Refresh today's and yesterday's rollups. Protected by CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return Response.json(await refreshRollups());
}
