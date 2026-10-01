-- Cached species image + blurb (Wikipedia first, iNaturalist CC photo fallback).
CREATE TABLE IF NOT EXISTS species_media (
  scientific_name text PRIMARY KEY,
  title           text,
  thumb_url       text,
  image_url       text,
  extract         text,
  page_url        text,
  source          text NOT NULL,          -- wikipedia | inaturalist | none
  attribution     text,
  license         text,
  fetched_at      timestamptz NOT NULL DEFAULT now()
);
