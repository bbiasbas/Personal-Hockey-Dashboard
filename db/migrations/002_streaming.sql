-- Streaming Center (see CONTEXT.md for the terms).

-- League rules the planner needs, from Yahoo settings and transactions.
alter table league
  add column max_weekly_adds int,                              -- null = no limit
  add column roster_slots jsonb not null default '{}',         -- slot -> count, starting slots + BN
  add column adds_used int not null default 0,                 -- your adds so far this matchup week
  add column added_this_week text[] not null default '{}';     -- player keys you added this week

-- Players on waivers can be claimed from this date; null = free agent.
alter table free_agents add column waiver_date date;

-- Roster players you marked as droppable for streaming. Survives refreshes.
create table streamer_marks (
  player_key text primary key,
  marked_at timestamptz not null default now()
);

-- Goals for/against per game by NHL team, from api-web.nhle.com standings (replaced on each refresh).
create table team_strength (
  team text primary key,
  gf_per_game numeric not null,
  ga_per_game numeric not null
);

-- DailyFaceoff starting goalies (replaced for the days it reported).
create table goalie_starts (
  day date not null,
  team text not null,
  goalie text not null,
  status text not null,  -- Confirmed | Likely | Unconfirmed
  primary key (day, team)
);

-- The week plan computed during each refresh.
create table streaming_plans (
  refresh_id int primary key references refreshes on delete cascade,
  week int not null,
  plan jsonb not null
);
