import type { Metadata } from "next";
import Link from "next/link";
import OptinForm from "@/components/OptinForm";

export const metadata: Metadata = {
  title: "Add your BirdWeather station",
  alternates: { canonical: "/stations/join" },
  description: "Opt your BirdWeather station in to WildNetwork: appear by name or anonymously, and share its daily species counts in open, citable data releases under your licence.",
};

export default function Join() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-2xl px-5 py-10 text-[15px] leading-relaxed">
        <Link href="/stations" className="text-sm text-cyan-400 hover:underline">← Stations</Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100">Add your BirdWeather station</h1>
        <p className="mt-3">
          If your station reports to BirdWeather, a sample of its detections is already on the map, at an approximate position and without its name. Opting in
          puts you in control of more: your station appears on the <Link href="/stations" className="text-cyan-400 hover:underline">stations page</Link> under a name you
          choose (or none), and its full daily species counts can go into WildNetwork&apos;s <Link href="/data" className="text-cyan-400 hover:underline">open data releases</Link>,
          which researchers cite, under the licence you pick.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-slate-100">What happens with your token</h2>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>It is checked with BirdWeather, then stored encrypted. It is used only to <b>read</b> your station&apos;s daily species counts; WildNetwork never posts anything to your station.</li>
          <li>Only counts per species per day are kept. No recordings, soundscapes or individual detections.</li>
          <li>Your location is rounded to the precision you choose before anything is shown or published, and BirdWeather&apos;s own location privacy setting still applies.</li>
          <li>Withdraw here at any time with the same token, or by email: the token is forgotten and your station&apos;s data deleted. Releases already published keep their copy; later ones leave your station out.</li>
          <li>If you revoke the token at BirdWeather, your opt-in ends automatically and the data is deleted.</li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold text-slate-100">Where to find your token</h2>
        <p className="mt-2">
          It is the token you entered in BirdNET-Pi or BirdNET-Go to connect to BirdWeather, and it is shown in your station&apos;s settings on{" "}
          <a href="https://app.birdweather.com" className="text-cyan-400 hover:underline">app.birdweather.com</a>. For a BirdWeather PUC, open the station in the
          BirdWeather app or website and look under its settings.
        </p>

        <OptinForm />

        <p className="mt-6 text-sm text-slate-500">
          WildNetwork is independent of BirdWeather and non-commercial; data from BirdWeather stations is never used commercially. Questions or problems:
          arunrajiah@gmail.com. See also the <Link href="/privacy" className="text-cyan-400 hover:underline">privacy page</Link>.
        </p>
      </div>
    </main>
  );
}
