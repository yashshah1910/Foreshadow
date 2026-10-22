-- Belt and braces for 20261023010000: whatever writes a score (an ingest
-- still running older code, a manual upsert), the stored top trades keep only
-- the six example fields. Scores are readable with the public key.

create or replace function public.strip_score_top_alerts()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if jsonb_typeof(new.breakdown -> 'topAlerts') = 'array' then
    new.breakdown := jsonb_set(
      new.breakdown,
      '{topAlerts}',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'tradeDate', a -> 'tradeDate',
              'type', a -> 'type',
              'strike', a -> 'strike',
              'expiry', a -> 'expiry',
              'premium', a -> 'premium',
              'isSweep', a -> 'isSweep'
            )
            order by t.ord
          )
          from jsonb_array_elements(new.breakdown -> 'topAlerts') with ordinality as t (a, ord)
        ),
        '[]'::jsonb
      )
    );
  end if;
  return new;
end;
$$;

revoke all on function public.strip_score_top_alerts() from public, anon, authenticated;

drop trigger if exists scores_strip_top_alerts on public.scores;
create trigger scores_strip_top_alerts
  before insert or update on public.scores
  for each row execute function public.strip_score_top_alerts();
