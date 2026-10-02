import type { Metadata } from "next";
import Link from "next/link";
import PausedNotice from "@/components/PausedNotice";
import { BIRDWEATHER_PAUSED } from "@/lib/sources";
import { sql } from "@/lib/db";
import { speciesSlug } from "@/lib/site";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Species: migration and arrival dates",
  description: "Every bird, bat and other animal with a seasonal record on WildNetwork: where it is now, when it arrives and how it moves through the year.",
  alternates: { canonical: "/species" },
};

const CLASS_TITLE: Record<string, string> = { avian: "Birds", bat: "Bats", amphibian: "Frogs and toads", insect: "Insects", mammal: "Mammals", other: "Other" };

export default async function SpeciesIndex() {
  const rows = await sql<{ scientific_name: string; vernacular_name: string | null; grp: string }[]>`
    SELECT p.scientific_name, MIN(p.vernacular_name) AS vernacular_name, COALESCE(MIN(g.grp), 'other') AS grp
    FROM phenology p LEFT JOIN species_group g USING (scientific_name)
    GROUP BY 1 ORDER BY 2 NULLS LAST, 1`;
  const groups = Object.keys(CLASS_TITLE).map((g) => ({ g, items: rows.filter((r) => r.grp === g) })).filter((x) => x.items.length);
  return (
    <main className="min-h-screen bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <Link href="/" className="text-sm text-cyan-400 hover:underline">← Back to the map</Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100">Species</h1>
        {BIRDWEATHER_PAUSED && <PausedNotice className="mt-4" />}
        <p className="mt-3">
          {rows.length.toLocaleString("en-GB")} species have a full seasonal record so far. Each page shows where the species is being detected now, when it arrives in each region, and how its range moves with the weather.
        </p>
        {groups.map(({ g, items }) => (
          <section key={g}>
            <h2 className="mt-8 text-xl font-semibold text-slate-100">{CLASS_TITLE[g]} <span className="text-sm font-normal text-slate-500">{items.length}</span></h2>
            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              {items.map((r) => (
                <li key={r.scientific_name}>
                  <Link href={`/species/${speciesSlug(r.scientific_name)}`} className="text-cyan-400 hover:underline" prefetch={false}>{r.vernacular_name ?? r.scientific_name}</Link>
                  {r.vernacular_name && <span className="text-slate-500 italic"> {r.scientific_name}</span>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
