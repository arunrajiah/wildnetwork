import Link from "next/link";

/** Shown wherever BirdWeather-derived figures used to be. */
export default function PausedNotice({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[13px] leading-snug text-amber-100 ${className}`}>
      <b>BirdWeather data is paused.</b> At BirdWeather&apos;s request, WildNetwork has stopped collecting and showing detections from BirdWeather
      stations while we agree terms that respect station owners&apos; choices. Movement measures and arrival dates built on that data are hidden
      until then. What you see now comes from iNaturalist and from devices that send data directly.{" "}
      <Link href="/contribute" className="underline">Add your own station</Link>.
    </div>
  );
}
