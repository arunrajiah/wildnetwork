"use client";

import Link from "next/link";
import { useState } from "react";
import { track } from "./Analytics";

interface Answer { answer: string; species: { scientificName: string; commonName: string | null }[]; tools: string[]; cached?: boolean }

const EXAMPLES = ["Where are barn swallows now?", "What is moving south in North America this week?", "Which bats are being heard most around London?", "When do swifts arrive in northern Europe?"];
const TOOL_LABEL: Record<string, string> = { findSpecies: "species search", speciesFacts: "species summary", whatIsChanging: "this week's changes", speciesNear: "detections near a place" };

export default function AskPanel({ onPick }: { onPick: (scientificName: string) => void }) {
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Answer | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const ask = async (question: string) => {
    const text = question.trim();
    if (text.length < 3 || busy) return;
    setBusy(true); setErr(null); setRes(null); setAsked(text); track("ask");
    try {
      const r = await fetch("/api/v1/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: text }) });
      const d = await r.json();
      if (!r.ok) setErr(d.error ?? "Something went wrong."); else setRes(d);
    } catch { setErr("Could not reach the server."); }
    setBusy(false);
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
      <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="flex flex-col gap-2">
        <label htmlFor="ask" className="text-xs font-semibold uppercase tracking-wider text-slate-300">Ask about the animals on this map</label>
        <textarea id="ask" value={q} onChange={(e) => setQ(e.target.value.slice(0, 300))} rows={2} placeholder="For example: where are barn swallows now?"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(q); } }}
          className="w-full resize-none rounded-md bg-slate-800 px-2.5 py-2 text-sm outline-none focus:ring-1 focus:ring-cyan-600 placeholder:text-slate-500" />
        <button type="submit" disabled={busy || q.trim().length < 3} className="self-end rounded bg-[#006cd9] hover:bg-[#2b84e6] disabled:opacity-40 text-sm px-3 py-1 font-medium">{busy ? "Looking it up" : "Ask"}</button>
      </form>

      {!asked && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-slate-500">Try</span>
          {EXAMPLES.map((e) => <button key={e} onClick={() => { setQ(e); ask(e); }} className="text-left text-sm text-slate-300 rounded px-2 py-1 -mx-2 hover:bg-white/5">{e}</button>)}
        </div>
      )}

      {asked && <p className="text-sm text-slate-400">{asked}</p>}
      {busy && <p className="text-sm text-slate-500">Checking the data…</p>}
      {err && <p role="alert" className="text-sm text-[#E76826]">{err}</p>}
      {res && (
        <section aria-live="polite" className="rounded-md border border-white/10 bg-white/5 px-3 py-2.5">
          <p className="text-[13px] leading-relaxed text-slate-100 whitespace-pre-line">{res.answer}</p>
          {res.species.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {res.species.slice(0, 8).map((s) => (
                <button key={s.scientificName} onClick={() => onPick(s.scientificName)} className="rounded-full bg-slate-800 hover:bg-slate-700 px-2 py-0.5 text-[11px] text-slate-200">
                  {s.commonName ?? s.scientificName}
                </button>
              ))}
            </div>
          )}
          {res.tools.length > 0 && <p className="mt-2 text-[11px] text-slate-500">Looked up: {res.tools.map((t) => TOOL_LABEL[t] ?? t).join(", ")}.</p>}
        </section>
      )}

      <p className="mt-auto text-[11px] leading-relaxed text-slate-500">
        Answers are written by an AI model that may only use this site&apos;s own data, and can still be wrong: check the species panel for the numbers.
        Your question is sent to the model provider and kept for 30 days to improve answers. <Link href="/methods#ask" className="text-cyan-500 hover:underline">How it works</Link>.
      </p>
    </div>
  );
}
