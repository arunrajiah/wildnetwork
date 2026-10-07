-- Arrival week uncertainty (methods 0.10): 90% interval from resampling the weekly counts, and the share of resamples
-- that found a season at all (low support means the arrival depends on a few detections).
ALTER TABLE phenology ADD COLUMN IF NOT EXISTS arrival_low date;
ALTER TABLE phenology ADD COLUMN IF NOT EXISTS arrival_high date;
ALTER TABLE phenology ADD COLUMN IF NOT EXISTS arrival_support real;
