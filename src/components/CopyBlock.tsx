"use client";

import { useState } from "react";

/** A command or snippet with a copy button. */
export default function CopyBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative my-3">
      <pre className="overflow-x-auto rounded-md border border-slate-800 bg-slate-900 pl-3 pr-16 py-2.5 text-[13px] leading-relaxed text-slate-200"><code>{children}</code></pre>
      <button
        onClick={() => { navigator.clipboard?.writeText(children).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }}
        className="absolute right-2 top-2 rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-700">
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
