import { randomBytes } from "node:crypto";

/** Systems a self-registered key may push as. A key is restricted to one of them. */
export const SOURCES = ["wildnetwork-base", "birdnet-pi", "birdnet-go", "birdecho", "speciesnet", "batdetect2", "megadetector", "wildecho-api", "speciesnet-studio", "animl", "frigate", "audiomoth", "other"];
export const PER_IP_PER_DAY = 5;
/** Health reports closer together than this are not stored (the latest is still kept on the device row). */
export const STATUS_MIN_SECONDS = 60;
export const STATUS_KEEP_DAYS = 30;

export const newDeviceId = () => `wnd_${randomBytes(8).toString("base64url")}`;
export const clientIp = (req: Request) =>
  (req.headers.get("x-vercel-forwarded-for") ?? req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
