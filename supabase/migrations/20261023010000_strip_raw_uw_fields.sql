-- Hackathon rule 11: no public redistribution of raw Unusual Whales data.
--
-- 1. scores.breakdown.topAlerts held the five largest flow alerts verbatim
--    (UW alert id, rule name, volume, open interest, timestamps...) and scores
--    are readable with the public key. Keep only the fields the scorer now
--    writes (TradeExample in packages/core): day, call/put, strike, expiry,
--    amount and sweep flag.
update public.scores s
set breakdown = jsonb_set(
  s.breakdown,
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
      from jsonb_array_elements(s.breakdown -> 'topAlerts') with ordinality as t (a, ord)
    ),
    '[]'::jsonb
  )
)
where jsonb_typeof(s.breakdown -> 'topAlerts') = 'array'
  and jsonb_array_length(s.breakdown -> 'topAlerts') > 0;

-- 2. catalysts.payload is the raw UW calendar row (FDA calendar, earnings,
--    congress trades with politician ids...). The server reads it with the
--    service role; the public key may read every other column.
revoke select on public.catalysts from anon, authenticated;
grant select (id, ticker, kind, event_date, session, title, source, created_at)
  on public.catalysts to anon, authenticated;
