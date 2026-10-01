// Usage: pnpm key:create "My BirdNET-Pi" [source_system]
import postgres from "postgres";
import { createHash, randomBytes } from "node:crypto";

const [name, source] = process.argv.slice(2);
if (!name) { console.error("usage: pnpm key:create <name> [source_system]"); process.exit(1); }
const raw = `wn_${randomBytes(24).toString("base64url")}`;
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
await sql`INSERT INTO api_keys (key_hash, name, source_system) VALUES (${createHash("sha256").update(raw).digest("hex")}, ${name}, ${source ?? null})`;
await sql.end();
console.log(`API key for "${name}" (shown once):\n${raw}`);
