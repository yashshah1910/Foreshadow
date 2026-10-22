-- Footprints hold raw cached Unusual Whales responses. Anyone can sign in with
-- a magic link, so "signed-in users" was effectively public. Only the service
-- role (ingest and the server's data client) reads or writes them now.

drop policy if exists "footprints are readable by signed-in users" on public.footprints;
revoke all on public.footprints from anon, authenticated;
