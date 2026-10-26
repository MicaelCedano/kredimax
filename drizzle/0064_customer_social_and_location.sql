-- Add customer social media handles/links and home location (Google Maps URL, GPS coordinates, or home reference).
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS social_media text,
  ADD COLUMN IF NOT EXISTS home_location text;
