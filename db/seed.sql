insert into brand(name) values ('Jaecoo Indonesia')
on conflict(name) do nothing;

insert into platform_account(brand_id, platform, account_id, account_name, currency, timezone)
select id, 'ga4', '470554174', 'JAECOO.ID', null, 'Asia/Jakarta' from brand where name='Jaecoo Indonesia'
union all select id, 'gsc', 'sc-domain:jaecoo.id', 'jaecoo.id', null, 'Asia/Jakarta' from brand where name='Jaecoo Indonesia'
union all select id, 'google', '2762824884', 'Jaecoo', 'IDR', 'Asia/Jakarta' from brand where name='Jaecoo Indonesia'
union all select id, 'meta', 'act_1372413011147906', 'Jaecoo - Lucky Cat', 'IDR', 'Asia/Jakarta' from brand where name='Jaecoo Indonesia'
union all select id, 'tiktok', '7575077837867335696', 'Jaecoo - Lucky Cat', 'IDR', 'Asia/Jakarta' from brand where name='Jaecoo Indonesia'
on conflict(platform, account_id) do update set
  account_name=excluded.account_name, currency=excluded.currency, timezone=excluded.timezone;

-- Verified Brand24 snapshot supplied in the build brief. This is deliberately dated,
-- and the UI labels it as a rolling 30-day index rather than current market share.
insert into sov_snapshot(snapshot_date, brand, popularity, geo)
values
  ('2026-07-27','Jaecoo',300559,'ID'),
  ('2026-07-27','Chery',928528,'ID'),
  ('2026-07-27','BYD',2918440,'ID'),
  ('2026-07-27','Wuling',245521,'ID'),
  ('2026-07-27','Geely',469895,'ID'),
  ('2026-07-27','MG',9226756,'ID')
on conflict(snapshot_date, brand, geo) do update set popularity=excluded.popularity;

insert into source_state(source,status,message)
values
  ('meta_organic','not_connected','Jaecoo Facebook Page and Instagram are not registered in WAC social_channel_list.'),
  ('tiktok_organic','not_connected','Jaecoo TikTok is not registered with a permanent read grant.'),
  ('meta_paid','awaiting_backfill','Run the WAC full-history backfill before using long-range performance.'),
  ('tiktok_paid','awaiting_backfill','Run the WAC full-history backfill before using long-range performance.'),
  ('google_paid','awaiting_backfill','Run the WAC full-history backfill and review the spend-units QA flag.'),
  ('ga4','awaiting_sync','Awaiting first scheduled web analytics ingestion.'),
  ('gsc','awaiting_sync','Awaiting first scheduled search ingestion.'),
  ('brand24','seeded_snapshot','Verified rolling 30-day popularity snapshot dated 2026-07-27.')
on conflict(source) do update set status=excluded.status,message=excluded.message,updated_at=now();
