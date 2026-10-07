"use client";

import { useState } from "react";
import { track } from "@/components/Analytics";

type Result = { ok?: boolean; error?: string; message?: string; stationId?: number; birdweatherName?: string | null };

const field = "w-full rounded-md bg-slate-900 border border-white/15 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500";

export default function OptinForm() {
  const [token, setToken] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [license, setLicense] = useState("CC-BY-4.0");
  const [precisionKm, setPrecisionKm] = useState(10);
  const [inReleases, setInReleases] = useState(true);
  const [contact, setContact] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const send = async (action: "join" | "withdraw") => {
    setBusy(true); setResult(null);
    try {
      const r = await fetch("/api/v1/optin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, token, displayName, license, precisionKm, inReleases, contact, consent }) });
      const j = (await r.json()) as Result;
      setResult(j);
      if (j.ok) { track(action === "join" ? "optin_join" : "optin_withdraw"); setToken(""); }
    } catch { setResult({ error: "Could not reach the server. Please try again." }); }
    setBusy(false);
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); send("join"); }} className="mt-4 space-y-4 rounded-lg border border-white/10 bg-white/5 p-4">
      <label className="block">
        <span className="text-sm text-slate-200">Station token</span>
        <input type="password" autoComplete="off" required value={token} onChange={(e) => setToken(e.target.value)} className={field} placeholder="The token from your BirdWeather station settings" />
        <span className="text-xs text-slate-500">Checked with BirdWeather, stored encrypted, used only to read your station&apos;s daily counts. Never shown again.</span>
      </label>
      <label className="block">
        <span className="text-sm text-slate-200">Name to show (optional)</span>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} className={field} placeholder="Leave empty to appear as an anonymous station" />
      </label>
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm text-slate-200">Licence for your counts</span>
          <select value={license} onChange={(e) => setLicense(e.target.value)} className={field}>
            <option value="CC-BY-4.0">CC BY 4.0 (credit to your station)</option>
            <option value="CC0-1.0">CC0 (no conditions)</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm text-slate-200">Location shown as</span>
          <select value={precisionKm} onChange={(e) => setPrecisionKm(Number(e.target.value))} className={field}>
            <option value={1}>within about 1 km</option>
            <option value={10}>within about 10 km</option>
            <option value={50}>within about 50 km</option>
          </select>
        </label>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={inReleases} onChange={(e) => setInReleases(e.target.checked)} className="mt-1 accent-cyan-500" />
        <span>Include my station&apos;s daily species counts in WildNetwork&apos;s open, citable data releases.</span>
      </label>
      <label className="block">
        <span className="text-sm text-slate-200">Email (optional)</span>
        <input type="email" value={contact} onChange={(e) => setContact(e.target.value)} maxLength={120} className={field} placeholder="Only to reach you about your station" />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 accent-cyan-500" />
        <span>I own or run this station and agree to share its counts as described on this page. I can withdraw at any time.</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className="rounded-md bg-cyan-500 px-4 py-2 font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-50">{busy ? "Checking…" : "Add my station"}</button>
        <button type="button" disabled={busy || !token} onClick={() => send("withdraw")} className="rounded-md border border-white/15 px-4 py-2 text-slate-200 hover:bg-white/5 disabled:opacity-40">Withdraw this station</button>
      </div>
      {result && (
        <p role="status" className={`text-sm ${result.ok ? "text-emerald-300" : "text-rose-300"}`}>
          {result.ok ? `${result.message}${result.birdweatherName ? ` (BirdWeather station: ${result.birdweatherName})` : ""}` : result.error}
        </p>
      )}
    </form>
  );
}
