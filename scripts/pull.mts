// Local poller: runs all connectors every N seconds. Usage: pnpm pull [intervalSeconds]
import { connectors, runConnector } from "../src/lib/connectors";
import { sql } from "../src/lib/db";

const interval = Number(process.argv[2] ?? 60) * 1000;
async function tick() {
  for (const c of Object.values(connectors)) {
    const r = await runConnector(c);
    console.log(new Date().toISOString(), JSON.stringify(r));
  }
}
await tick();
if (interval > 0) setInterval(tick, interval);
else await sql.end();
