// Refresh English common names for cached GBIF taxa, then copy them onto stored rows. Resumable: skips taxa done in the last day.
// Usage: tsx --env-file=.env.production.local scripts/gbif-names.mts
import { sql } from "../src/lib/db";
import { englishName } from "../src/lib/gbif";

const taxa = await sql<{ species_key: number }[]>`SELECT species_key FROM gbif_taxa WHERE fetched_at < now() - interval '1 day' OR vernacular_name IS NULL OR vernacular_name = upper(vernacular_name) ORDER BY (grp = 'avian') DESC, (grp IN ('bat', 'amphibian')) DESC, species_key`;
console.log(taxa.length, "taxa to check");
/** Put the refreshed names on the stored rows. Run every 2,000 taxa so the site improves while the long tail of insects is still going. */
async function copyNames() {
  for (const tb of ["species_weekly", "phenology"]) {
    const r = await sql.unsafe(`UPDATE ${tb} s SET vernacular_name = t.vernacular_name FROM (SELECT scientific_name, MAX(vernacular_name) vernacular_name FROM gbif_taxa GROUP BY 1) t WHERE t.scientific_name = s.scientific_name AND s.vernacular_name IS DISTINCT FROM t.vernacular_name ${tb === "species_weekly" ? "AND s.source_system = 'gbif'" : ""}`);
    console.log(tb, "rows updated", r.count);
  }
}
const jobs = [...taxa];
let done = 0;
await Promise.all(Array.from({ length: 3 }, async () => {
  while (jobs.length) {
    const t = jobs.shift()!;
    const name = await englishName(t.species_key);
    await sql`UPDATE gbif_taxa SET vernacular_name = ${name}, fetched_at = now() + interval '1 second' WHERE species_key = ${t.species_key}`;
    if (++done % 500 === 0) console.log(done, "done");
    if (done % 2000 === 0) await copyNames();
  }
}));
await copyNames();
console.log("NAMESDONE");
await sql.end();
