create table if not exists brand (
  id serial primary key,
  name text not null unique
);

create table if not exists platform_account (
  id serial primary key,
  brand_id int not null references brand(id),
  platform text not null,
  account_id text not null,
  account_name text,
  currency text,
  timezone text,
  unique(platform, account_id)
);

create table if not exists fact_daily (
  platform text not null,
  account_id text not null,
  entity_type text not null,
  entity_id text not null default 'account',
  report_date date not null,
  metric text not null,
  raw_value numeric,
  normalized_value numeric,
  value_used numeric,
  currency text,
  timezone text,
  attribution_window text not null default '',
  conversion_definition text not null default '',
  freshness text not null default 'provisional',
  source_api_version text,
  ingested_at timestamptz not null default now(),
  primary key (
    platform, account_id, entity_type, entity_id, report_date,
    metric, conversion_definition, attribution_window
  )
);

create index if not exists fact_daily_account_date_idx
  on fact_daily(platform, account_id, report_date);

create table if not exists entity (
  platform text not null,
  account_id text not null,
  entity_type text not null,
  entity_id text not null,
  name text,
  campaign_name text,
  objective text,
  funnel_stage text,
  primary key(platform, account_id, entity_type, entity_id)
);

create table if not exists social_profile (
  platform text not null,
  channel_key text not null,
  handle text,
  display_name text,
  avatar_url text,
  cover_url text,
  bio text,
  profile_url text,
  verified boolean,
  followers int,
  following int,
  posts_count int,
  likes_total bigint,
  snapshot_date date not null,
  primary key(platform, channel_key, snapshot_date)
);

create table if not exists social_post (
  platform text not null,
  channel_key text not null,
  post_id text not null,
  post_url text,
  posted_at timestamptz,
  media_type text,
  caption text,
  thumbnail_url text,
  likes int,
  comments int,
  shares int,
  saves int,
  views int,
  reach int,
  impressions int,
  engagement int,
  primary key(platform, channel_key, post_id)
);

create index if not exists social_post_channel_date_idx
  on social_post(platform, channel_key, posted_at);

create table if not exists organic_daily (
  platform text not null,
  channel_key text not null,
  report_date date not null,
  metric text not null,
  value numeric,
  freshness text not null default 'complete',
  ingested_at timestamptz not null default now(),
  primary key(platform, channel_key, report_date, metric)
);

create table if not exists web_daily (
  source text not null,
  account_id text not null,
  report_date date not null,
  dimension_type text not null default '',
  dimension_value text not null default '',
  metric text not null,
  value numeric,
  freshness text not null default 'complete',
  ingested_at timestamptz not null default now(),
  primary key(source, account_id, report_date, dimension_type, dimension_value, metric)
);

create index if not exists web_daily_source_date_idx
  on web_daily(source, account_id, report_date);

create table if not exists sov_snapshot (
  snapshot_date date not null,
  brand text not null,
  popularity numeric,
  mentions int,
  geo text not null default 'ID',
  source text not null default 'Brand24 popularity index',
  primary key(snapshot_date, brand, geo)
);

create table if not exists ingestion_run (
  id serial primary key,
  source text not null,
  account_id text,
  window_start date,
  window_end date,
  status text not null,
  rows_written int not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists ingestion_run_source_started_idx
  on ingestion_run(source, started_at desc);

create table if not exists source_state (
  source text primary key,
  status text not null,
  message text,
  details jsonb,
  latest_report_date date,
  last_success_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table source_state add column if not exists details jsonb;
