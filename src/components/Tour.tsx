"use client";

import { useCallback, useEffect, useState } from "react";
import { track } from "./Analytics";

/**
 * First-visit walkthrough of the map. Each step points at an element marked data-tour="…"; a step whose element is
 * not visible (phone layouts hide some) is skipped. Remembered in localStorage; the About panel can replay it.
 */
export const TOUR_KEY = "wn_tour_v1";

interface Step { target: string | null; title: string; text: string; place: "center" | "bottom" | "right" | "top" }

export function tourSteps(askEnabled: boolean): Step[] {
  return [
    { target: null, place: "center", title: "A live map of wildlife",
      text: "WildNetwork shows where birds, bats and other animals are right now, from thousands of community stations and observers. Each dot is a recent detection: blue from BirdWeather stations, amber from GBIF, green from iNaturalist, pink from devices sending directly." },
    { target: "search", place: "bottom", title: "Find a species",
      text: "Type a name to see where it is being heard and seen, how its range centre is shifting, and when it arrives in each region, with the uncertainty of each estimate." },
    { target: "classes", place: "bottom", title: "Birds, bats, insects, amphibians",
      text: "Switch the animal class. Every measure is worked out per class, so a sparse group is not drowned out by birds." },
    { target: "rail", place: "right", title: "Now, Feed and About",
      text: `Now shows what is changing: species moving, surging or fading, and the latest arrivals. Feed lists the newest detections.${askEnabled ? " Ask answers questions in plain words from the same data." : ""} About has the sources, credits and privacy notes.` },
    { target: "slider", place: "top", title: "Replay time",
      text: "Play the last hours of detections, or pick a species and play a whole year of its movement, week by week." },
    { target: "contribute", place: "right", title: "Add your own station",
      text: "A BirdNET-Pi, BirdNET-Go, camera trap, bat detector or a WildNetwork Base can send its detections here. Everything is open: the methods, the data downloads and the API." },
  ];
}

const PAD = 8;
const CARD_W = 320;

function visibleRect(target: string | null): DOMRect | null {
  if (!target) return null;
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return r;
  }
  return null;
}

export default function Tour({ open, auto, askEnabled, onClose }: { open: boolean; auto: boolean; askEnabled: boolean; onClose: () => void }) {
  const steps = tourSteps(askEnabled);
  const [i, setI] = useState(0);
  // Re-rendered on resize so the spotlight follows the element; the rect itself is read from the DOM while rendering.
  const [, setTick] = useState(0);

  const finish = useCallback((how: string) => {
    try { localStorage.setItem(TOUR_KEY, "done"); } catch {}
    track("tour_end", { how, step: i + 1 });
    onClose();
  }, [i, onClose]);

  // Steps whose element is hidden on this screen size are skipped in the direction of travel.
  const go = useCallback((dir: 1 | -1) => {
    let n = i + dir;
    while (n >= 0 && n < steps.length && steps[n].target && !visibleRect(steps[n].target)) n += dir;
    if (n >= steps.length) return finish("done");
    if (n < 0) return;
    setI(n);
  }, [i, steps, finish]);

  useEffect(() => { if (open) track("tour_start", { auto: auto ? 1 : 0 }); }, [open, auto]);
  useEffect(() => {
    if (!open) return;
    const onResize = () => setTick((t) => t + 1);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish("skip");
      else if (e.key === "ArrowRight" || e.key === "Enter") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("resize", onResize); window.removeEventListener("keydown", onKey); };
  }, [open, go, finish]);
  if (!open) return null;
  const step = steps[i];
  const rect = visibleRect(step.target);
  const vw = window.innerWidth, vh = window.innerHeight;
  let cardStyle: React.CSSProperties;
  if (!rect || step.place === "center") {
    cardStyle = { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  } else if (step.place === "bottom") {
    cardStyle = { left: Math.min(Math.max(12, rect.left), vw - CARD_W - 12), top: rect.bottom + PAD + 8 };
  } else if (step.place === "right") {
    cardStyle = { left: Math.min(rect.right + PAD + 8, vw - CARD_W - 12), top: Math.min(Math.max(12, rect.top), vh - 220) };
  } else {
    cardStyle = { left: Math.min(Math.max(12, rect.left), vw - CARD_W - 12), bottom: vh - rect.top + PAD + 8 };
  }
  const last = i === steps.length - 1;

  return (
    <div className="absolute inset-0 z-40" role="dialog" aria-modal="true" aria-label="Welcome tour">
      {rect ? (
        <div className="absolute rounded-lg pointer-events-none" style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + 2 * PAD, height: rect.height + 2 * PAD, boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.72)", outline: "2px solid rgba(34, 211, 238, 0.9)" }} />
      ) : (
        <div className="absolute inset-0 bg-slate-950/75" />
      )}
      <div className="absolute rounded-xl bg-slate-900 border border-white/15 shadow-2xl p-4 text-slate-100" style={{ width: Math.min(CARD_W, vw - 24), ...cardStyle }}>
        <div className="text-[11px] uppercase tracking-wider text-slate-400">{i + 1} of {steps.length}</div>
        <h2 className="mt-1 text-base font-semibold">{step.title}</h2>
        <p className="mt-1.5 text-sm text-slate-300 leading-relaxed">{step.text}</p>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={() => go(1)} className="rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-cyan-400">{last ? "Start exploring" : "Next"}</button>
          {i > 0 && <button onClick={() => go(-1)} className="rounded-md px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10">Back</button>}
          <span className="flex-1" />
          {!last && <button onClick={() => finish("skip")} className="text-sm text-slate-400 hover:text-white">Skip</button>}
        </div>
      </div>
    </div>
  );
}
