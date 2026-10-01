import { sql } from "@/lib/db";

/** Version of the published methods. Bump when a measure changes, and add a line to the changelog on /methods. */
export const METHODS_VERSION = "0.2";

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
