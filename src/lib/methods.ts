import { sql } from "@/lib/db";

/** Version of the published methods. Bump when a measure changes, and add a line to the changelog on /methods. */
export const METHODS_VERSION = "0.6";

/** A cell-day needs this many detections of all species before it counts as observed. */
export const MIN_EFFORT_DAY = 200;
/** Same for a cell-week. */
export const MIN_EFFORT_WEEK = 1000;

/** A species needs this many detections in a cell and period before that cell counts toward its range centre. */
export const MIN_CELL_DETECTIONS = 5;

/** Coarse continent from a 5-degree cell, so a range centre is never a mix of hemispheres. */
export const REGION = sql`CASE
  WHEN cell_lon < -30 AND cell_lat >= 10 THEN 'North America'
  WHEN cell_lon < -30 THEN 'South America'
  WHEN cell_lon < 60 AND cell_lat >= 35 THEN 'Europe'
  WHEN cell_lon < 60 THEN 'Africa'
  WHEN cell_lon >= 110 AND cell_lat < -10 THEN 'Oceania'
  ELSE 'Asia' END`;

/** Taxon classes. Effort is corrected within a class: a bat is compared with other bats, heard by the same ultrasonic stations. */
export const GROUPS = ["avian", "bat", "amphibian", "insect", "mammal", "other"] as const;
export type Group = (typeof GROUPS)[number];

/** Non-bird classes have far fewer sensors and detections, so their minimums are lower. */
export const SMALL_CLASS = { MIN_EFFORT_DAY: 30, MIN_EFFORT_WEEK: 150, SCALE: 0.2 };

/** Class of a rollup row: the stored class, else birds for BirdWeather rows and "other" for everything else. */
export const GRP = (g = sql`g`, s = sql`s`) => sql`COALESCE(${g}.grp, CASE WHEN ${s}.source_system = 'birdweather' THEN 'avian' ELSE 'other' END)`;
/** Minimum effort for a cell and period to count as observed, by class. */
export const minEffortDay = (e = sql`e`) => sql`(CASE WHEN ${e}.grp = 'avian' THEN ${MIN_EFFORT_DAY}::int ELSE ${SMALL_CLASS.MIN_EFFORT_DAY}::int END)`;
export const minEffortWeek = (e = sql`e`) => sql`(CASE WHEN ${e}.grp = 'avian' THEN ${MIN_EFFORT_WEEK}::int ELSE ${SMALL_CLASS.MIN_EFFORT_WEEK}::int END)`;
/** Scales a count threshold down for the small classes. */
export const scaled = (n: number, grp = sql`grp`) => sql`(CASE WHEN ${grp} = 'avian' THEN ${n}::int ELSE ${Math.ceil(n * SMALL_CLASS.SCALE)}::int END)`;
