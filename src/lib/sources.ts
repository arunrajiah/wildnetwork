/**
 * BirdWeather asked on 2026-10-02 that collection stop and that their data come off public display and the API
 * while terms are agreed. Collection stays off unless BIRDWEATHER_ENABLED=true, which must only be set with their written agreement.
 */
export const BIRDWEATHER_PAUSED = process.env.BIRDWEATHER_ENABLED !== "true";
