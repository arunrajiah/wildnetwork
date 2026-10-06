export const SITE = "https://wildnetwork.arunrajiah.com";
export const SITE_NAME = "WildNetwork";
export const SITE_DESCRIPTION =
  "A live, open map of bird, bat and other animal movement, built from thousands of community sensors. See where a species is now, when it arrives, and how it moves through the year.";

/** "Hirundo rustica" -> "hirundo-rustica" */
export const speciesSlug = (scientificName: string) => scientificName.toLowerCase().replace(/\s+/g, "-");

/** Open data releases (GBIF-derived only), newest first. Built by scripts/release.mts and attached to a GitHub release. */
export const DATA_RELEASES: { date: string; url: string; zip: string; weeks: string; rows: { weekly: number; effort: number; arrivals: number; datasets: number }; doi?: string }[] = [];
