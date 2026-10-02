import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { sql } from "@/lib/db";
import { getSpeciesMedia } from "@/lib/media";
import { REGION } from "@/lib/methods";
import { SITE, speciesSlug } from "@/lib/site";
import { getClimate, getYearSpan, speciesStory } from "@/lib/story";

export const revalidate = 86400;

const CLASS_LABEL: Record<string, string> = { avian: "bird", bat: "bat", amphibian: "frog or toad", insect: "insect", mammal: "mammal", other: "animal" };
const fmtWeek = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Everything the page shows, straight from the tables behind the public API. */
const load = cache(async (slug: string) => {
  const [sp] = await sql<{ scientific_name: string; grp: string }[]>`
    SELECT scientific_name, grp FROM species_group WHERE lower(replace(scientific_name, ' ', '-')) = ${slug.toLowerCase()} AND is_species LIMIT 1`;
  if (!sp) return null;
  const name = sp.scientific_name;
  const [names, recent, arrivals, media, climate, span] = await Promise.all([
    sql<{ vernacular_name: string | null }[]>`SELECT MIN(vernacular_name) AS vernacular_name FROM species_weekly WHERE scientific_name = ${name}`,
    sql<{ n: number; cells: number }[]>`SELECT COALESCE(SUM(count), 0)::int AS n, COUNT(DISTINCT (cell_lat, cell_lon))::int AS cells FROM species_daily WHERE scientific_name = ${name} AND day >= CURRENT_DATE - 28`,
    sql<{ region: string; first: string; last: string; peak: string; areas: number }[]>`
      SELECT ${REGION} AS region, MIN(arrival_week)::text AS first, MAX(arrival_week)::text AS last,
             (percentile_disc(0.5) WITHIN GROUP (ORDER BY peak_week))::text AS peak, COUNT(*)::int AS areas
      FROM phenology WHERE scientific_name = ${name} GROUP BY 1 ORDER BY COUNT(*) DESC`,
    getSpeciesMedia(name).catch(() => null),
    getClimate(name).catch(() => null),
    getYearSpan(name, sp.grp).catch(() => null),
  ]);
  return { name, grp: sp.grp, common: names[0]?.vernacular_name ?? null, recent: recent[0], arrivals, media, story: speciesStory(name, [], climate, span) };
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const d = await load((await params).slug);
  if (!d) return { title: "Species not found" };
  const label = d.common ? `${d.common} (${d.name})` : d.name;
  const description = `Where the ${d.common ?? d.name} is being detected now, when it arrives in each region and how its range moves through the year, from community acoustic sensors. Effort corrected, with published methods.`;
  const thin = d.arrivals.length === 0 && d.story.length === 0;
  return {
    title: `${label}: migration, arrival dates and live map`,
    description,
    alternates: { canonical: `/species/${speciesSlug(d.name)}` },
    robots: thin ? { index: false, follow: true } : undefined,
    openGraph: { title: `${label} on WildNetwork`, description, url: `/species/${speciesSlug(d.name)}`, type: "article", ...(d.media?.imageUrl ? { images: [{ url: d.media.imageUrl, alt: label }] } : {}) },
  };
}

export default async function SpeciesPage({ params }: { params: Promise<{ slug: string }> }) {
  const d = await load((await params).slug);
  if (!d) notFound();
  const title = d.common ?? d.name;
  const url = `${SITE}/species/${speciesSlug(d.name)}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": url, url, name: `${title}: migration, arrival dates and live map`, isPartOf: { "@id": `${SITE}/#website` },
        about: { "@type": "Taxon", name: d.name, ...(d.common ? { alternateName: d.common } : {}), taxonRank: "species", ...(d.media?.pageUrl ? { sameAs: d.media.pageUrl } : {}) } },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "WildNetwork", item: SITE },
        { "@type": "ListItem", position: 2, name: "Species", item: `${SITE}/species` },
        { "@type": "ListItem", position: 3, name: title, item: url },
      ] },
    ],
  };
  return (
    <main className="min-h-screen bg-slate-950 text-slate-300">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <nav className="text-sm text-slate-500">
          <Link href="/" className="text-cyan-400 hover:underline">WildNetwork</Link> / <Link href="/species" className="text-cyan-400 hover:underline">Species</Link>
        </nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100">{title}</h1>
        {d.common && <p className="mt-1 text-slate-400 italic">{d.name}</p>}

        {d.media?.imageUrl && (
          <figure className="mt-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={d.media.imageUrl} alt={`${title} (${d.name})`} className="w-full max-h-96 object-cover rounded-lg" />
            {(d.media.attribution || d.media.license) && <figcaption className="mt-1 text-xs text-slate-500">Image: {[d.media.attribution, d.media.license, d.media.source].filter(Boolean).join(", ")}</figcaption>}
          </figure>
        )}
        {d.media?.extract && (
          <p className="mt-5">
            {d.media.extract}{" "}
            {d.media.pageUrl && <a href={d.media.pageUrl} className="text-cyan-400 hover:underline" rel="noopener">Source</a>}
          </p>
        )}

        <h2 className="mt-8 text-xl font-semibold text-slate-100">Where it is now</h2>
        <p className="mt-2">
          {d.recent.n > 0
            ? `In the last 28 days this ${CLASS_LABEL[d.grp] ?? "animal"} was detected ${d.recent.n.toLocaleString("en-GB")} times across ${d.recent.cells} ${d.recent.cells === 1 ? "area" : "areas"} of the sensor network (each area is a 5 degree square).`
            : "No detections in the last 28 days. It may be out of season where the sensors are."}
        </p>
        <p className="mt-3">
          <Link href={`/?species=${encodeURIComponent(d.name)}`} className="inline-block rounded-md bg-cyan-500 px-4 py-2 font-medium text-slate-950 hover:bg-cyan-400">See the {title} on the live map</Link>
        </p>

        {d.story.length > 0 && (
          <>
            <h2 className="mt-8 text-xl font-semibold text-slate-100">Movement and weather</h2>
            {d.story.map((s) => <p key={s} className="mt-2">{s}</p>)}
          </>
        )}

        {d.arrivals.length > 0 && (
          <>
            <h2 className="mt-8 text-xl font-semibold text-slate-100">Arrival dates</h2>
            <p className="mt-2">The week it was first heard regularly in each region, after at least six weeks away. Dates differ from south to north, so a region has a range.</p>
            <table className="mt-3 w-full text-sm">
              <thead><tr className="text-left text-slate-400 border-b border-white/10"><th className="py-1.5 font-medium">Region</th><th className="font-medium">First arrival</th><th className="font-medium">Last arrival</th><th className="font-medium">Typical peak</th><th className="font-medium text-right">Areas</th></tr></thead>
              <tbody>
                {d.arrivals.map((a) => (
                  <tr key={a.region} className="border-b border-white/5"><td className="py-1.5">{a.region}</td><td>{fmtWeek(a.first)}</td><td>{fmtWeek(a.last)}</td><td>{fmtWeek(a.peak)}</td><td className="text-right">{a.areas}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-sm">
              <a href={`/api/v1/arrivals?species=${encodeURIComponent(d.name)}&format=csv`} className="text-cyan-400 hover:underline" rel="nofollow">Download every area as CSV</a>
            </p>
          </>
        )}

        <p className="mt-8 text-sm text-slate-500">
          Figures are effort corrected and come from automatic sound identification, which makes mistakes.{" "}
          <Link href="/methods" className="text-cyan-400 hover:underline">How this is measured</Link> and{" "}
          <Link href="/validation" className="text-cyan-400 hover:underline">how it compares with human observers</Link>.
        </p>
      </div>
    </main>
  );
}
