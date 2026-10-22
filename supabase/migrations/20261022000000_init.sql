-- Foreshadow schema, first cut.
--
-- Data tables (catalysts, footprints, scores, narrations) are written only by
-- the service role from the ingest route. Everything user-owned is protected
-- by row level security keyed on auth.uid().

create extension if not exists supabase_vault cascade;

-- ---------------------------------------------------------------------------
-- Catalysts: one row per (ticker, event)
-- ---------------------------------------------------------------------------
create table public.catalysts (
  id          text primary key,
  ticker      text not null,
  kind        text not null check (kind in ('fda', 'earnings', 'congress', 'insider', 'economic', 'potus')),
  event_date  date not null,
  session     text not null default 'unknown' check (session in ('premarket', 'intraday', 'afterhours', 'unknown')),
  title       text not null,
  source      text not null default 'uw',
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index catalysts_ticker_event_date_idx on public.catalysts (ticker, event_date desc);
create index catalysts_event_date_idx on public.catalysts (event_date);
create index catalysts_kind_idx on public.catalysts (kind);

-- ---------------------------------------------------------------------------
-- Footprints: raw UW responses and the normalized daily aggregate, cached forever
--   endpoint = 'daily'  -> payload is a normalized DailyFootprint
--   endpoint = 'ohlc'   -> payload is one OhlcBar
--   anything else       -> raw cache rows written by packages/uw
-- ---------------------------------------------------------------------------
create table public.footprints (
  ticker      text not null,
  trade_date  date not null,
  endpoint    text not null,
  payload     jsonb not null,
  fetched_at  timestamptz not null default now(),
  primary key (ticker, trade_date, endpoint)
);
create index footprints_endpoint_date_idx on public.footprints (endpoint, trade_date);

-- ---------------------------------------------------------------------------
-- Scores: one row per catalyst, recomputed by the cron
-- ---------------------------------------------------------------------------
create table public.scores (
  catalyst_id        text primary key references public.catalysts (id) on delete cascade,
  ticker             text not null,
  event_date         date not null,
  score              numeric(5, 1) not null check (score >= 0 and score <= 100),
  direction          text not null check (direction in ('bullish', 'bearish', 'mixed')),
  verdict            text not null check (verdict in ('matched', 'missed', 'pending', 'insufficient')),
  realized_move_pct  numeric,
  implied_move_pct   numeric,
  partial_window     boolean not null default false,
  flags              jsonb not null default '{}'::jsonb,
  breakdown          jsonb not null,
  computed_at        timestamptz not null default now()
);
create index scores_score_idx on public.scores (score desc);
create index scores_ticker_event_date_idx on public.scores (ticker, event_date desc);
create index scores_event_date_idx on public.scores (event_date);
create index scores_partial_idx on public.scores (partial_window, event_date);

-- ---------------------------------------------------------------------------
-- Narrations: cached Claude output keyed by (catalyst, score) so a re-score
-- re-narrates and an identical score never re-spends tokens
-- ---------------------------------------------------------------------------
create table public.narrations (
  catalyst_id       text not null references public.catalysts (id) on delete cascade,
  score             numeric(5, 1) not null,
  story             text not null,
  caption           text not null,
  model             text not null,
  numbers_verified  boolean not null default true,
  created_at        timestamptz not null default now(),
  primary key (catalyst_id, score)
);

-- ---------------------------------------------------------------------------
-- Ingest runs: one row per cron execution
-- ---------------------------------------------------------------------------
create table public.ingest_runs (
  id              bigint generated always as identity primary key,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  status          text not null default 'running' check (status in ('running', 'ok', 'error')),
  mode            text not null default 'backfill',
  catalysts_seen  integer not null default 0,
  scored          integer not null default 0,
  requests        integer not null default 0,
  warnings        jsonb not null default '[]'::jsonb,
  error           text
);

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  plan          text not null default 'free' check (plan in ('free', 'pro')),
  display_name  text,
  created_at    timestamptz not null default now()
);

-- The UW key itself lives in Supabase Vault; this row only points at it.
create table public.user_keys (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  uw_key_secret_id  uuid not null,
  key_hint          text,
  updated_at        timestamptz not null default now()
);

create table public.watchlists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null default 'Watchlist',
  tickers     text[] not null default '{}',
  created_at  timestamptz not null default now()
);
create index watchlists_user_id_idx on public.watchlists (user_id);

create table public.alerts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  kind           text not null check (kind in ('discord', 'email')),
  target         text not null,
  min_score      numeric not null default 70 check (min_score >= 0 and min_score <= 100),
  tickers        text[],
  enabled        boolean not null default true,
  last_fired_at  timestamptz,
  created_at     timestamptz not null default now()
);
create index alerts_user_id_idx on public.alerts (user_id);
create index alerts_enabled_idx on public.alerts (enabled) where enabled;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.catalysts   enable row level security;
alter table public.footprints  enable row level security;
alter table public.scores      enable row level security;
alter table public.narrations  enable row level security;
alter table public.ingest_runs enable row level security;
alter table public.profiles    enable row level security;
alter table public.user_keys   enable row level security;
alter table public.watchlists  enable row level security;
alter table public.alerts      enable row level security;

-- Scored events are public: the leaderboard is the product's front door.
create policy "catalysts are readable by everyone"
  on public.catalysts for select to anon, authenticated using (true);
create policy "scores are readable by everyone"
  on public.scores for select to anon, authenticated using (true);
create policy "narrations are readable by everyone"
  on public.narrations for select to anon, authenticated using (true);

-- Raw UW rows are only readable by signed-in users (never re-served anonymously).
create policy "footprints are readable by signed-in users"
  on public.footprints for select to authenticated using (true);

-- ingest_runs: service role only (no policies -> only bypassrls roles).

create policy "profiles: owner can read"
  on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "profiles: owner can update"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "user_keys: owner can read"
  on public.user_keys for select to authenticated using ((select auth.uid()) = user_id);

create policy "watchlists: owner can read"
  on public.watchlists for select to authenticated using ((select auth.uid()) = user_id);
create policy "watchlists: owner can insert"
  on public.watchlists for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "watchlists: owner can update"
  on public.watchlists for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "watchlists: owner can delete"
  on public.watchlists for delete to authenticated using ((select auth.uid()) = user_id);

create policy "alerts: owner can read"
  on public.alerts for select to authenticated using ((select auth.uid()) = user_id);
create policy "alerts: owner can insert"
  on public.alerts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "alerts: owner can update"
  on public.alerts for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "alerts: owner can delete"
  on public.alerts for delete to authenticated using ((select auth.uid()) = user_id);

-- Explicit grants (independent of the auto-expose setting).
grant select on public.catalysts, public.scores, public.narrations to anon, authenticated;
grant select on public.footprints to authenticated;
revoke all on public.footprints from anon;
revoke all on public.ingest_runs from anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.user_keys to authenticated;
grant select, insert, update, delete on public.watchlists, public.alerts to authenticated;

-- ---------------------------------------------------------------------------
-- Profile bootstrap
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Bring-your-own-key: the UW key is stored in Vault, never in a table column.
--   set_uw_key(key)      -> callable by the signed-in owner
--   delete_uw_key()      -> callable by the signed-in owner
--   get_uw_key(user_id)  -> service role only; used server-side by the cron / ask routes
-- ---------------------------------------------------------------------------
create or replace function public.set_uw_key(p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_existing uuid;
  v_secret uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_key is null or length(trim(p_key)) < 16 then
    raise exception 'invalid key' using errcode = '22023';
  end if;

  select uw_key_secret_id into v_existing from public.user_keys where user_id = v_uid;

  if v_existing is not null then
    perform vault.update_secret(v_existing, trim(p_key), 'uw_key:' || v_uid::text, 'Unusual Whales API key');
    update public.user_keys
      set key_hint = right(trim(p_key), 4), updated_at = now()
      where user_id = v_uid;
  else
    v_secret := vault.create_secret(trim(p_key), 'uw_key:' || v_uid::text, 'Unusual Whales API key');
    insert into public.user_keys (user_id, uw_key_secret_id, key_hint)
      values (v_uid, v_secret, right(trim(p_key), 4));
  end if;
end;
$$;
revoke execute on function public.set_uw_key(text) from public, anon;
grant execute on function public.set_uw_key(text) to authenticated;

create or replace function public.delete_uw_key()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_existing uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select uw_key_secret_id into v_existing from public.user_keys where user_id = v_uid;
  if v_existing is not null then
    delete from vault.secrets where id = v_existing;
    delete from public.user_keys where user_id = v_uid;
  end if;
end;
$$;
revoke execute on function public.delete_uw_key() from public, anon;
grant execute on function public.delete_uw_key() to authenticated;

create or replace function public.get_uw_key(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  select ds.decrypted_secret into v_key
  from public.user_keys uk
  join vault.decrypted_secrets ds on ds.id = uk.uw_key_secret_id
  where uk.user_id = p_user_id;
  return v_key;
end;
$$;
revoke execute on function public.get_uw_key(uuid) from public, anon, authenticated;
grant execute on function public.get_uw_key(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Realtime: Live Radar subscribes to score changes
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.scores;
