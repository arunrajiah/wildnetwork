// Local poller: runs all connectors every N seconds. Usage: pnpm pull [intervalSeconds]
import { pullAll } from "../src/lib/connectors";
import { sql } from "../src/lib/db";

const interval = Number(process.argv[2] ?? 60) * 1000;
async function tick() {
  for (const r of await pullAll()) console.log(new Date().toISOString(), JSON.stringify(r));
}
await tick();
if (interval > 0) setInterval(tick, interval);
else await sql.end();
