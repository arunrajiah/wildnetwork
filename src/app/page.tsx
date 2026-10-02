import type { Metadata } from "next";
import Link from "next/link";
import WorldMap from "@/components/WorldMap";
import { SITE, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", "@id": `${SITE}/#website`, url: SITE, name: SITE_NAME, description: SITE_DESCRIPTION, inLanguage: "en",
      publisher: { "@type": "Person", name: "Arun Rajiah", url: "https://www.arunrajiah.com" } },
    { "@type": "WebApplication", name: SITE_NAME, url: SITE, applicationCategory: "EducationalApplication", operatingSystem: "Any",
      description: SITE_DESCRIPTION, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, isAccessibleForFree: true,
      codeRepository: "https://github.com/arunrajiah/wildnetwork", license: "https://www.gnu.org/licenses/agpl-3.0.html" },
  ],
};

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {/* The map is drawn in the browser; this gives screen readers and crawlers the same orientation in words. */}
      <div className="sr-only">
        <h1>WildNetwork: a live map of bird, bat and wildlife movement</h1>
        <p>{SITE_DESCRIPTION}</p>
        <nav aria-label="Pages">
          <Link href="/species">Species: migration and arrival dates</Link>
          <Link href="/methods">Methods</Link>
          <Link href="/validation">Validation</Link>
          <Link href="/contribute">Contribute data</Link>
        </nav>
      </div>
      <WorldMap />
    </>
  );
}
