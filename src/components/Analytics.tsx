"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const KEY = "wn-analytics"; // "yes" | "no" in localStorage

declare global {
  interface Window { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void }
}

/** Record a usage event. Does nothing unless analytics is configured and the visitor allowed it. */
export function track(name: string, params: Record<string, string | number> = {}) {
  if (typeof window !== "undefined" && window.gtag) window.gtag("event", name, params);
}

/**
 * Google Analytics 4, loaded only after the visitor allows it.
 * Nothing is sent to Google before that: no script, no cookie, no request.
 * Set NEXT_PUBLIC_GA_ID to a measurement id (G-XXXXXXXXXX) to turn it on.
 */
export default function Analytics() {
  const [choice, setChoice] = useState<"yes" | "no" | "ask" | null>(null);

  useEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem(KEY); } catch { /* storage blocked: ask each visit */ }
    const t = setTimeout(() => setChoice(stored === "yes" || stored === "no" ? stored : "ask"), 0);
    return () => clearTimeout(t);
  }, []);

  if (!GA_ID || choice === null) return null;
  const decide = (c: "yes" | "no") => { try { localStorage.setItem(KEY, c); } catch { /* ignore */ } setChoice(c); };

  return (
    <>
      {choice === "yes" && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
gtag('js', new Date());
gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' });
gtag('config', '${GA_ID}', { anonymize_ip: true });`}
          </Script>
        </>
      )}
      {choice === "ask" && (
        <div role="dialog" aria-label="Usage statistics" className="fixed bottom-24 right-3 md:right-6 z-30 max-w-xs rounded-lg bg-black/85 backdrop-blur-xl border border-white/10 px-3 py-2.5 text-xs text-slate-300 shadow-xl">
          <p>May we count your visit? Anonymous usage statistics (Google Analytics) help show which features matter. No ads, nothing sold.</p>
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => decide("no")} className="rounded px-2 py-1 text-slate-400 hover:text-white">No thanks</button>
            <button onClick={() => decide("yes")} className="rounded bg-white/90 px-2.5 py-1 font-medium text-slate-900 hover:bg-white">Allow</button>
          </div>
        </div>
      )}
    </>
  );
}
