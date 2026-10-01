import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const dir = join(process.cwd(), "drizzle");
for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  process.stdout.write(`applying ${f}... `);
  await sql.unsafe(readFileSync(join(dir, f), "utf8"));
  console.log("ok");
}
await sql.end();
