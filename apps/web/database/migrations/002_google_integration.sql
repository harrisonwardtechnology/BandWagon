create extension if not exists pgcrypto;

create table if not exists google_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null,
  google_subject text not null unique,
  email text null,
  display_name text null,
  refresh_token_encrypted text not null,
  access_token_encrypted text null,
  access_token_expires_at timestamptz null,
  granted_scopes text null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists google_calendars (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references google_connections(id) on delete cascade,
  external_calendar_id text not null,
  summary text not null,
  description text null,
  time_zone text null,
  selected boolean not null default false,
  last_seen_at timestamptz null,
  last_sync_at timestamptz null,
  sync_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(connection_id, external_calendar_id)
);

create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null,
  provider text not null,
  provider_calendar_id text not null,
  provider_event_id text not null,
  title text not null,
  description text null,
  location text null,
  starts_at timestamptz null,
  ends_at timestamptz null,
  all_day boolean not null default false,
  status text not null default 'confirmed',
  html_link text null,
  raw_etag text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_calendar_id, provider_event_id)
);

create index if not exists idx_google_calendars_selected on google_calendars(connection_id, selected);
create index if not exists idx_calendar_events_start on calendar_events(starts_at);
create index if not exists idx_calendar_events_provider on calendar_events(provider, provider_calendar_id);
