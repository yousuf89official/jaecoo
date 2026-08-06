create table if not exists client_access (
  client_slug text primary key,
  enabled boolean not null default false,
  passcode_hash text,
  session_version int not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists client_auth_attempt (
  id bigserial primary key,
  client_slug text not null,
  ip_hash text not null,
  succeeded boolean not null default false,
  attempted_at timestamptz not null default now()
);

create index if not exists client_auth_attempt_lookup_idx
  on client_auth_attempt(client_slug, ip_hash, attempted_at desc);

