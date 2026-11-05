# Personal Fantasy Hockey Dashboard: spec

Agreed 2026-11-04. A standalone, read-only advisor for one Yahoo fantasy hockey team, running on this PC.
Independent from Saucy Sports: it never touches that repo, database, Figma file or CLAUDE.md
(Hot Sauce design values were copied read-only).

## League
- Yahoo, **H2H points**, **daily lineups**.
- Skaters: G 5, A 3.5, PPP 1.25, SHP 1.25, SOG 0.5, HIT 0.35, BLK 0.65.
- Goalies: W 3, GA -1, SV 0.25, SHO 3.
- Weights are read from Yahoo league settings; this list is the test fixture.

## Views (v1)
- **Lineup**: date with prev/next day; roster grouped by slot (C, LW, RW, D, G, Bench, IR).
  Columns: player, pos, NHL team, tonight's opponent or "—", L30 FP/G, season FP/G.
  Flags: red = starter with no game, green = bench player who plays.
- **Waivers**: position chips (All, C, LW, RW, D, G); sortable table.
  Columns: rank, player, pos, team, L30 FP/G, L7 hot/cold hint, games left this week,
  score (= L30 FP/G x games left), season FP/G.
- **Matchup**: you vs opponent: current points, games left, projected finish
  (current + games left x each starter's L30 FP/G); starters side by side with week points.
- Shared header: tabs, Refresh button, "last updated" time.

## Data
- **Yahoo Fantasy API** (OAuth, `oob`: one-time code paste; client id/secret + refresh token in
  git-ignored `.env` and token file). League auto-detected (first 2026-27 NHL league; else set in `.env`).
  Source for roster, matchup, free agents, scoring weights, player stats/points (season, lastweek, lastmonth).
- **NHL API** (api-web.nhle.com): schedule only (games per team per day), matched by team abbreviation.
- **Postgres in Docker Compose** stores Yahoo snapshots + NHL schedule; refreshed by the Refresh button
  (no scheduler).
- One small data-source adapter interface: Yahoo now, Saucy Sports later.

## Code
- One repo, one package.json. `web/` = Vite + React + TS, plain CSS from Hot Sauce variables (dark only),
  Google Fonts (Barlow Condensed + Inter), plain `fetch` + one `useApi` hook.
  `server/` = Express + TS, `pg`, numbered SQL files in `db/migrations/`.
- Tests: `node --test` for scoring (our math vs Yahoo points), ranking, projection.

## Design
- Separate Figma file, Hot Sauce variables (dark), 1440-wide desktop frames:
  Lineup, Waivers, Matchup, States (not connected / refreshing / Postgres down).
- Figma is approved before coding and stays the source of truth for screens.

## Later
- Trades; injuries/news (Yahoo player status makes this cheap); NHL per-game data for custom windows/splits.

## Manual step
- Register a Yahoo developer app (Fantasy Sports read) — steps to be written in the README.
