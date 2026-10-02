import { hashKey } from "@/lib/auth";
import { answerQuestion } from "@/lib/ask";
import { sql } from "@/lib/db";

export const maxDuration = 60;

const ENABLED = process.env.ASK_ENABLED === "true";
const PER_IP_PER_HOUR = 8;
const PER_DAY_TOTAL = Number(process.env.ASK_DAILY_LIMIT ?? 400);
const CACHE_HOURS = 6;
const MAX_CHARS = 300;

const norm = (q: string) => q.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

/** Is the question box switched on? The interface hides it otherwise. */
export function GET() {
  return Response.json({ enabled: ENABLED, maxChars: MAX_CHARS });
}

/**
 * Ask a question in plain language. Body: { question }.
 * Limits protect a free model allowance: 8 questions an hour per visitor, a daily total, and a 6 hour cache of identical questions.
 */
export async function POST(req: Request) {
  if (!ENABLED) return Response.json({ error: "The question box is not switched on." }, { status: 503 });
  let question = "";
  try { question = String((await req.json()).question ?? "").trim(); } catch { /* handled below */ }
  if (question.length < 3) return Response.json({ error: "Ask a question about the animals on this map." }, { status: 400 });
  if (question.length > MAX_CHARS) return Response.json({ error: `Please keep the question under ${MAX_CHARS} characters.` }, { status: 400 });

  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const ipHash = hashKey(`ask:${ip}`);
  const qNorm = norm(question);

  const [cached] = await sql`
    SELECT answer, species, tools FROM ask_log
    WHERE q_norm = ${qNorm} AND answer IS NOT NULL AND created_at > now() - (${CACHE_HOURS} || ' hours')::interval
    ORDER BY created_at DESC LIMIT 1`;
  if (cached) return Response.json({ answer: cached.answer, species: cached.species ?? [], tools: cached.tools ?? [], cached: true });

  const [{ mine, today }] = await sql<{ mine: number; today: number }[]>`
    SELECT COUNT(*) FILTER (WHERE ip_hash = ${ipHash} AND created_at > now() - interval '1 hour')::int AS mine,
           COUNT(*) FILTER (WHERE created_at > now() - interval '1 day' AND answer IS NOT NULL)::int AS today
    FROM ask_log WHERE created_at > now() - interval '1 day'`;
  if (mine >= PER_IP_PER_HOUR) return Response.json({ error: "You have asked several questions in the last hour. Please try again a little later." }, { status: 429 });
  if (today >= PER_DAY_TOTAL) return Response.json({ error: "The question box has reached its limit for today. Please come back tomorrow." }, { status: 429 });

  const t0 = Date.now();
  try {
    const r = await answerQuestion(question, new URL(req.url).origin);
    await sql`
      INSERT INTO ask_log (ip_hash, question, q_norm, answer, species, tools, model, tokens, ms)
      VALUES (${ipHash}, ${question}, ${qNorm}, ${r.answer}, ${sql.json(r.species)}, ${sql.json(r.tools)}, ${r.model}, ${r.tokens}, ${Date.now() - t0})`;
    await sql`DELETE FROM ask_log WHERE created_at < now() - interval '30 days'`;
    return Response.json({ answer: r.answer, species: r.species, tools: r.tools, cached: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await sql`INSERT INTO ask_log (ip_hash, question, q_norm, error, ms) VALUES (${ipHash}, ${question}, ${qNorm}, ${msg.slice(0, 500)}, ${Date.now() - t0})`;
    return Response.json({ error: "The question could not be answered just now. Please try again." }, { status: 502 });
  }
}
