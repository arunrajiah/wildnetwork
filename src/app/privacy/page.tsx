import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
  alternates: { canonical: "/privacy" },
  description: "What WildNetwork collects about visitors and station owners, why, how long it is kept, and how to have it removed.",
};

const UPDATED = "7 October 2026";

export default function Privacy() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <Link href="/" className="text-sm text-cyan-400 hover:underline">← Back to the map</Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100">Privacy</h1>
        <p className="mt-1 text-sm text-slate-500">Updated {UPDATED}</p>

        <p className="mt-6">
          WildNetwork is a free, non-commercial, open source project run by Arun Rajiah in Chennai, India. There are no accounts and no ads, and no data is sold.
          This page lists everything the site collects. Questions or requests: <a href="mailto:arunrajiah@gmail.com" className="text-cyan-400 hover:underline">arunrajiah@gmail.com</a>.
        </p>

        <H2>Visit statistics</H2>
        <p>
          Every page loads Google Analytics, which counts visits so the project can show funders and researchers how it is used. It records the pages you view, the
          features you use (choosing a species or animal class, playing a year, downloading a CSV, showing coverage), your approximate location at city level,
          your device and browser, and the site you came from. It sets cookies (named <code className="text-slate-200">_ga</code>) to recognise a returning browser.
          Google processes your IP address to do this. Advertising features are off. The data is kept for the period set in the project&apos;s Analytics account
          (Google&apos;s default is two months) and then deleted by Google. Google&apos;s own policy:{" "}
          <a href="https://policies.google.com/privacy" className="text-cyan-400 hover:underline">policies.google.com/privacy</a>.
        </p>
        <p className="mt-2">
          To opt out, block cookies for this site in your browser, use a tracker blocker, or install{" "}
          <a href="https://tools.google.com/dlpage/gaoptout" className="text-cyan-400 hover:underline">Google&apos;s Analytics opt-out add-on</a>. The site works the same either way.
        </p>

        <H2>The question box</H2>
        <p>
          If you ask a question, its text is sent to Google&apos;s Gemini API to write the answer. That service is used on its free tier, under which Google may use
          what is sent to improve its products, so please do not include personal information. The question and answer are kept for 30 days, with a keyed hash of
          your IP address (not the address itself) to limit how many questions one visitor can ask, then deleted.
        </p>

        <H2>Stations and devices</H2>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li><b>Registering a device</b> stores the name you give it, its type, an optional contact email, and a keyed hash of your IP address to limit sign-ups. The API key itself is stored only as a hash.</li>
          <li><b>Detections your device sends</b> (species, time, confidence, location rounded to about 1 km on the device, and the station name you chose) are shown on the map and in the API, kept as individual records for 30 days, and after that only as counts per species, 5 degree area and week. They may be included in open data releases under the licence you chose (CC BY 4.0 by default). No recordings are uploaded.</li>
          <li><b>BirdWeather stations</b> appear only as approximate positions (rounded to 1 degree) without names or identifiers; individual detections are kept for 3 hours (bat detections for 24). Stations that stop reporting are deleted after 30 days.</li>
          <li><b>iNaturalist and GBIF records</b> are public records used under their CC0 or CC BY licences; observers are credited as their publishers ask.</li>
        </ul>

        <H2>Hosting</H2>
        <p>
          The site runs on Vercel and its database on Neon, both in the United States. Vercel processes IP addresses and request details to serve pages and protect
          the service, and keeps them in logs for a short time. No other cookies or tracking are used.
        </p>

        <H2>Removal and your rights</H2>
        <p>
          Email <a href="mailto:arunrajiah@gmail.com" className="text-cyan-400 hover:underline">arunrajiah@gmail.com</a> to see, correct or delete anything held about
          you or your station, to hide a species or a location, or to withdraw a station. Requests are handled within two days. Data already published in a dated,
          citable release cannot be recalled from people who downloaded it, so future releases will leave it out. You have these rights under India&apos;s Digital
          Personal Data Protection Act, 2023 and, in the EU and UK, under the GDPR.
        </p>

        <H2>Changes</H2>
        <p>Changes to this page are dated above and recorded in the public code history.</p>
      </div>
    </main>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-8 mb-2 text-xl font-semibold text-slate-100">{children}</h2>;
}
