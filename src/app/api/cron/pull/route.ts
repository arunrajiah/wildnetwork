import { cronAuthorized } from "@/lib/auth";
import { pullAll } from "@/lib/connectors";

export const maxDuration = 300;

/** Run pull connectors. Protected by CRON_SECRET (Vercel Cron sends it as Bearer). ?only=birdweather */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const results = await pullAll(new URL(req.url).searchParams.get("only"));
  return Response.json({ ranAt: new Date().toISOString(), results });
}
