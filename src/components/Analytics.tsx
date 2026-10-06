"use client";

import Script from "next/script";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

declare global {
  interface Window { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void }
}

/** Record a usage event. Does nothing unless analytics is configured. */
export function track(name: string, params: Record<string, string | number> = {}) {
  if (typeof window !== "undefined" && window.gtag) window.gtag("event", name, params);
}

/**
 * Google Analytics 4 for every visit (no consent prompt, decided 6 October 2026). Advertising features stay off;
 * GA4 does not store IP addresses. Set NEXT_PUBLIC_GA_ID to a measurement id (G-XXXXXXXXXX) to turn it on.
 */
export default function Analytics() {
  if (!GA_ID) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
gtag('js', new Date());
gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' });
gtag('config', '${GA_ID}');`}
      </Script>
    </>
  );
}
