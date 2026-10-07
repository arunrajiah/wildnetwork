import { cronAuthorized } from "@/lib/auth";
import { refreshRollups } from "@/lib/rollups";

export const maxDuration = 300;

/** Refresh today's and yesterday's rollups. Protected by CRON_SECRET. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await refreshRollups());
}
