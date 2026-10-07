export const SITE = "https://wildnetwork.arunrajiah.com";
export const SITE_NAME = "WildNetwork";
export const SITE_DESCRIPTION =
  "A live, open map of bird, bat and other animal movement, built from thousands of community sensors. See where a species is now, when it arrives, and how it moves through the year.";

/** "Hirundo rustica" -> "hirundo-rustica" */
export const speciesSlug = (scientificName: string) => scientificName.toLowerCase().replace(/\s+/g, "-");

/** Open data releases (GBIF-derived only), newest first. Built by scripts/release.mts and attached to a GitHub release. */
/** Concept DOI: always resolves to the newest release, so it is the one to cite for "the WildNetwork open data". */
export const DATA_CONCEPT_DOI = "10.5281/zenodo.23193453";

export const DATA_RELEASES: { date: string; url: string; zip: string; weeks: string; rows: { weekly: number; effort: number; arrivals: number; datasets: number; taxa?: number }; doi?: string; notes?: string }[] = [
  {
    date: "2026-10-07",
    url: "https://github.com/arunrajiah/wildnetwork/releases/tag/data-2026-10-07",
    zip: "https://github.com/arunrajiah/wildnetwork/releases/download/data-2026-10-07/wildnetwork-open-2026-10-07.zip",
    weeks: "6 Oct 2025 to 21 Sep 2026",
    rows: { weekly: 376243, effort: 16874, arrivals: 4693, datasets: 284, taxa: 17549 },
    doi: "10.5281/zenodo.23206867",
    notes: "Release 2: GBIF species keys on every row, taxa.csv, and reproducibility notes.",
  },
  {
    date: "2026-10-06",
    url: "https://github.com/arunrajiah/wildnetwork/releases/tag/data-2026-10-06",
    zip: "https://github.com/arunrajiah/wildnetwork/releases/download/data-2026-10-06/wildnetwork-open-2026-10-06.zip",
    weeks: "6 Oct 2025 to 21 Sep 2026",
    rows: { weekly: 376243, effort: 16874, arrivals: 4693, datasets: 284 },
    doi: "10.5281/zenodo.23193454",
  },
];
