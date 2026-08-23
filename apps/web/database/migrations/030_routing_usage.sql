-- 030_routing_usage.sql
-- Privacy-safe route cache and organization routing usage accounting.

create table if not exists routing_cache (
  route_hash text primary key,
  provider text not null,
  distance_meters integer not null,
  duration_seconds integer not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists idx_routing_cache_expires_at on routing_cache(expires_at);

create table if not exists routing_usage_daily (
  usage_date date not null default current_date,
  organization_id uuid not null references organizations(id) on delete cascade,
  provider text not null,
  request_count integer not null default 0,
  cache_hits integer not null default 0,
  fallback_count integer not null default 0,
  estimated_cost_microusd bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (usage_date,organization_id,provider)
);

create index if not exists idx_routing_usage_daily_org_date
  on routing_usage_daily(organization_id,usage_date desc);
