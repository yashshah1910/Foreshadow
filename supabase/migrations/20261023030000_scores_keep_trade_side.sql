-- The stored top trades may also keep `side` ("ask" = bought, "bid" = sold,
-- "mid"): Foreshadow's reading of each trade, which the pages need to tell a
-- bet from a sale. Everything else raw is still stripped (see 20261023020000).

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
            ) || case
              when a ->> 'side' in ('ask', 'bid', 'mid') then jsonb_build_object('side', a -> 'side')
              else '{}'::jsonb
            end
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
