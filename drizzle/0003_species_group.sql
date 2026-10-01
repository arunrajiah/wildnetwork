-- Coarse taxon group per species (iNaturalist iconic taxon: Aves, Mammalia, Amphibia, Reptilia, Insecta, ...), used for map icons.
ALTER TABLE species_media ADD COLUMN IF NOT EXISTS iconic text;
