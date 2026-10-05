/**
 * BirdWeather asked on 2026-10-02 that collection stop; on 2026-10-05 Tim (BirdWeather) confirmed detections are fine as long as no soundscapes are taken, and Arun switched it back on 2026-10-06.
 * Collection runs only while BIRDWEATHER_ENABLED=true (set on Vercel); unset it to pause again.
 */
export const BIRDWEATHER_PAUSED = process.env.BIRDWEATHER_ENABLED !== "true";
