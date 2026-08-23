-- 029_driver_route_assist.sql
-- Driver-controlled willingness to deviate from an existing route to assist open ride requests.

alter table driver_preferences
  add column if not exists route_assist_enabled boolean not null default false,
  add column if not exists max_route_deviation_percent numeric(5,2) not null default 0,
  add column if not exists route_assist_notify boolean not null default true;

alter table driver_preferences
  drop constraint if exists driver_preferences_route_deviation_check;

alter table driver_preferences
  add constraint driver_preferences_route_deviation_check
  check (max_route_deviation_percent >= 0 and max_route_deviation_percent <= 50);

create table if not exists driver_ride_recommendations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  driver_person_id uuid not null references people(id) on delete cascade,
  ride_request_id uuid not null references ride_requests(id) on delete cascade,
  source_route_id uuid null references rides(id) on delete set null,
  estimated_baseline_distance_meters integer null,
  estimated_detour_distance_meters integer null,
  estimated_deviation_percent numeric(7,2) null,
  estimated_extra_minutes integer null,
  score numeric(8,4) null,
  reason_codes jsonb not null default '[]'::jsonb,
  status text not null default 'recommended' check (status in ('recommended','viewed','accepted','dismissed','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz null,
  updated_at timestamptz not null default now(),
  unique (driver_person_id, ride_request_id, source_route_id)
);

create index if not exists idx_driver_ride_recommendations_driver
  on driver_ride_recommendations(driver_person_id,status,created_at desc);
create index if not exists idx_driver_ride_recommendations_org
  on driver_ride_recommendations(organization_id,status,created_at desc);
