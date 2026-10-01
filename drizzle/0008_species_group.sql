-- Taxon class per species (avian, bat, insect, amphibian, mammal, other). Effort is corrected within a class,
-- because sensors differ: only ultrasonic stations hear bats, so a bat's share must be of bat detections.
CREATE TABLE IF NOT EXISTS species_group (
  scientific_name text PRIMARY KEY,
  grp             text NOT NULL,
  is_species      boolean NOT NULL DEFAULT true    -- false for genus, family or order level identifications
);

ALTER TABLE effort_daily  ADD COLUMN IF NOT EXISTS grp text NOT NULL DEFAULT 'avian';
ALTER TABLE effort_weekly ADD COLUMN IF NOT EXISTS grp text NOT NULL DEFAULT 'avian';
ALTER TABLE effort_daily  DROP CONSTRAINT IF EXISTS effort_daily_pkey;
ALTER TABLE effort_weekly DROP CONSTRAINT IF EXISTS effort_weekly_pkey;
ALTER TABLE effort_daily  ADD PRIMARY KEY (day, cell_lat, cell_lon, grp);
ALTER TABLE effort_weekly ADD PRIMARY KEY (week, cell_lat, cell_lon, grp);
