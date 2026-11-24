# Personal Fantasy Hockey Dashboard

A read-only advisor for my Yahoo fantasy hockey team (H2H points, daily lineups), running on this PC.
Four views: **Lineup** (who plays today), **Waivers** (best free agents for this week), **Matchup**
(score, games left, projected finish) and **Streaming** (a week plan of add/drop streams, plus a day view).
Spec: [docs/spec.md](docs/spec.md). Terms: [CONTEXT.md](CONTEXT.md).
Design: [Figma](https://www.figma.com/design/je5SD3ZTgiAwv4CjZUQJTb).

## First-time setup

1. Install [Node 22+](https://nodejs.org) and [Docker Desktop](https://www.docker.com/products/docker-desktop/).
2. `npm install`
3. Copy `.env.example` to `.env`.
4. **Register a Yahoo app** (free, once):
   - Go to <https://developer.yahoo.com/apps/create/> and sign in with the Yahoo account that owns your team.
   - Application Name: anything, e.g. "Personal Hockey Dashboard". Application Type: **Installed Application**.
   - Redirect URI: `oob`. (If Yahoo won't accept `oob`, use `https://localhost:8080`, and set
     `YAHOO_REDIRECT_URI=https://localhost:8080` in `.env`.)
   - API Permissions: **Fantasy Sports → Read**.
   - OAuth Client Type: **Confidential Client** (only those get a Client Secret).
   - Create it, then copy the **Client ID** and **Client Secret** into `.env`.
   - **Get the app approved.** Since mid-2026 Yahoo refuses every Fantasy request (403 "This application is
     not authorized to perform this action") until it approves the app, even though sign-in works.
     Apply at <https://sports.yahoo.com/developer/access/>, sign the DocuSign agreement, then confirm the
     Client ID at <https://sports.yahoo.com/developer/application-confirmation/>. Reportedly takes 2–4 weeks.
     After approval, run `npm run yahoo:auth` again.
5. Start Docker Desktop, then start the database and the goalie scraper: `npm run db:up`
   (the first run builds the scraper image, which takes a few minutes).
   To keep the data on another drive, move Docker Desktop's disk image there:
   Settings → Resources → Disk image location.
6. Connect Yahoo: `npm run yahoo:auth`. Open the link it prints, click Agree, and paste the code back.
   (With an https redirect, paste the whole address you land on; the page itself won't load, that's fine.)
   The token is saved in `.yahoo-token.json` (git-ignored) and renews itself.

## Every day

```bash
npm run dev
```

Open <http://localhost:5173> and press **Refresh**. Data is only as fresh as your last Refresh.
If Docker Desktop isn't running, the dashboard tells you; start it, then `npm run db:up`.

## How it works

- `server/` is an Express API (port 3001). Refresh pulls Yahoo (roster for each day of the matchup week,
  opponent's roster, 100 available players, season / last 30 days / last 7 days / this week's points)
  the NHL schedule and standings, and DailyFaceoff's starting goalies (today and tomorrow), stores it in
  Postgres (`db/migrations/`), then plans the week's streams (`server/streaming.ts`). The search runs for `PLAN_SEARCH_SECONDS`
  in `.env` (default 25, capped at 900 = 15 minutes), so Refresh takes about that much longer.
- `scraper/` is a small Python service (Scrapling, port 3002) that reads DailyFaceoff; see
  [docs/adr/0001](docs/adr/0001-python-scrapling-container-for-goalie-starts.md). If it fails, Refresh still
  works and goalie starts show as projected only.
- Streamer slots: mark players on the Lineup tab; anyone you added this matchup week counts automatically.
- `server/source.ts` is the one seam to the fantasy platform; `server/yahoo/` implements it.
  When the league moves to Saucy Sports, add a second implementation.
- `server/logic.ts` holds the math (FP/G, games left, waiver score, projection, flags); `npm test` covers it.
- `web/` is the React app (Vite), styled with the Hot Sauce colors in `web/styles.css`.
- Each refresh keeps its player points in `player_stats` (history), and records warnings, e.g. when our
  points math disagrees with Yahoo's or a Yahoo team abbreviation doesn't match the NHL's.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | API + web app with live reload |
| `npm run db:up` | Start Postgres and the goalie scraper in Docker |
| `npm run yahoo:auth` | One-time Yahoo sign-in |
| `npm test` | Unit tests |
| `npm run typecheck` | TypeScript check |

## Later

Trades, injuries/news (Yahoo already sends player status), and NHL per-game stats for custom windows and splits.
