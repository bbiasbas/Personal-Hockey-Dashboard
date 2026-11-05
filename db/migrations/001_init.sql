-- Every Refresh button press. Views read the latest finished one without an error.
create table refreshes (
  id serial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error text,
  warnings text[] not null default '{}'
);

-- The current Yahoo league and matchup week (one row, replaced on each refresh).
create table league (
  key text primary key,
  name text not null,
  my_team_key text not null,
  week int not null,
  week_start date not null,
  week_end date not null
);

-- This week's matchup: your team and your opponent (replaced on each refresh).
create table matchup (
  team_key text primary key,
  name text not null,
  points numeric not null,
  is_mine boolean not null
);

create table players (
  key text primary key,
  name text not null,
  positions text[] not null,
  nhl_team text not null,
  status text
);

-- Fantasy points per player per stat window, kept for every refresh (history).
-- period: season | lastmonth | lastweek | week. games is null when Yahoo didn't send GP.
create table player_stats (
  refresh_id int not null references refreshes on delete cascade,
  player_key text not null references players,
  period text not null,
  points numeric not null,
  games int,
  primary key (refresh_id, player_key, period)
);

-- Lineup slot per team per day (replaced on each refresh).
create table rosters (
  team_key text not null,
  day date not null,
  player_key text not null references players,
  slot text not null,
  primary key (team_key, day, player_key)
);

-- Available players from Yahoo, in Yahoo's last-30-days order (replaced on each refresh).
create table free_agents (
  player_key text primary key references players,
  rank int not null
);

-- NHL schedule (regular season + playoffs), from api-web.nhle.com.
create table nhl_games (
  id bigint primary key,
  day date not null,
  home text not null,
  away text not null,
  start_utc timestamptz not null
);
create index nhl_games_day on nhl_games (day);
