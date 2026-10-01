import type { WdxEvent } from "@/lib/wdx/types";

/**
 * A pull connector fetches recent detections from an external network and maps them to WDX.
 * `cursor` is opaque connector state persisted in pull_state between runs.
 */
export interface PullConnector {
  name: string;
  pull(cursor: string | null): Promise<{ events: WdxEvent[]; cursor: string | null }>;
}
