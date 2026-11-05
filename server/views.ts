import { ensureDb, pool } from './db.ts';
import { addDays, BENCH_SLOTS, daysBetween, easternDate, gamesLeft, hotCold, lineupFlag, perGame, projectedFinish, SLOT_ORDER, teamGames, type Game } from './logic.ts';

type PlayerRow = { key: string; name: string; positions: string[]; nhl_team: string; status: string | null };
type Line = { points: number; games: number | null };

// Everything the three views share, from the latest successful refresh.
async function base() {
  await ensureDb();
  const latest = (await pool.query('select id from refreshes where finished_at is not null and error is null order by id desc limit 1')).rows[0];
  if (!latest) return null;
  const league = (await pool.query("select key, name, my_team_key, week, to_char(week_start, 'YYYY-MM-DD') as week_start, to_char(week_end, 'YYYY-MM-DD') as week_end from league")).rows[0];
  if (!league) return null;
  const games: Game[] = (await pool.query("select to_char(day, 'YYYY-MM-DD') as day, home, away, start_utc from nhl_games")).rows.map((g) => ({ day: g.day, home: g.home, away: g.away, startUtc: g.start_utc.toISOString() }));
  const stats = new Map<string, Record<string, Line>>();
  for (const r of (await pool.query('select player_key, period, points::float8 as points, games from player_stats where refresh_id = $1', [latest.id])).rows) {
    stats.set(r.player_key, { ...stats.get(r.player_key), [r.period]: { points: r.points, games: r.games } });
  }
  const today = easternDate();

  // Fantasy points per game in a window; falls back to the team's NHL games when Yahoo had no GP.
  // shortcut: the fallback counts team games, so it overstates GP for scratched/injured players and backup goalies
  const fpg = (p: PlayerRow, period: 'season' | 'lastmonth' | 'lastweek') => {
    const line = stats.get(p.key)?.[period];
    if (!line) return 0;
    const from = period === 'season' ? '0000-01-01' : addDays(today, period === 'lastmonth' ? -30 : -7);
    return perGame(line.points, line.games ?? teamGames(games, p.nhl_team, from, addDays(today, -1)).length);
  };
  const left = (p: PlayerRow) => gamesLeft(games, p.nhl_team, today, league.week_end);
  return { league, games, stats, today, fpg, left };
}

const PLAYER_COLS = 'p.key, p.name, p.positions, p.nhl_team, p.status';

export async function lineupView(day?: string) {
  const b = await base();
  if (!b) return null;
  const days = daysBetween(b.league.week_start, b.league.week_end);
  const d = day && days.includes(day) ? day : days.includes(b.today) ? b.today : days[0];
  const { rows } = await pool.query(`select r.slot, ${PLAYER_COLS} from rosters r join players p on p.key = r.player_key where r.team_key = $1 and r.day = $2`, [b.league.my_team_key, d]);
  const players = rows.map((p) => {
    const game = b.games.find((g) => g.day === d && (g.home === p.nhl_team || g.away === p.nhl_team));
    const tonight = game ? { home: game.home === p.nhl_team, opponent: game.home === p.nhl_team ? game.away : game.home, startUtc: game.startUtc } : null;
    return { key: p.key, name: p.name, positions: p.positions, team: p.nhl_team, status: p.status, slot: p.slot as string, tonight, l30: b.fpg(p, 'lastmonth'), season: b.fpg(p, 'season'), flag: lineupFlag(p.slot, !!game) };
  });
  players.sort((x, y) => SLOT_ORDER.indexOf(x.slot) - SLOT_ORDER.indexOf(y.slot));
  return { day: d, days, players };
}

export async function waiversView() {
  const b = await base();
  if (!b) return null;
  const { rows } = await pool.query(`select ${PLAYER_COLS} from free_agents f join players p on p.key = f.player_key order by f.rank`);
  return rows.map((p) => {
    const l30 = b.fpg(p, 'lastmonth');
    const l7 = b.fpg(p, 'lastweek');
    const gl = b.left(p);
    return { key: p.key, name: p.name, positions: p.positions, team: p.nhl_team, status: p.status, gamesLeft: gl, l30, l7, hotCold: hotCold(l7, l30), season: b.fpg(p, 'season'), score: l30 * gl };
  });
}

export async function matchupView() {
  const b = await base();
  if (!b) return null;
  const teams = (await pool.query('select team_key, name, points::float8 as points, is_mine from matchup order by is_mine desc')).rows;
  const result = [];
  for (const t of teams) {
    // Each team's latest stored lineup (yours has every week day; the opponent's has today).
    const { rows } = await pool.query(
      `select r.slot, ${PLAYER_COLS} from rosters r join players p on p.key = r.player_key
       where r.team_key = $1 and r.day = (select max(day) from rosters where team_key = $1 and day <= $2)`,
      [t.team_key, b.today < b.league.week_start ? b.league.week_start : b.today],
    );
    const starters = rows
      .filter((p) => !BENCH_SLOTS.includes(p.slot))
      .sort((x, y) => SLOT_ORDER.indexOf(x.slot) - SLOT_ORDER.indexOf(y.slot))
      .map((p) => ({ key: p.key, name: p.name, slot: p.slot as string, gamesLeft: b.left(p), fpg: b.fpg(p, 'lastmonth'), weekPoints: b.stats.get(p.key)?.week?.points ?? 0 }));
    result.push({ key: t.team_key, name: t.name, isMine: t.is_mine, points: t.points, gamesLeft: starters.reduce((s, p) => s + p.gamesLeft, 0), projected: projectedFinish(t.points, starters), starters });
  }
  const daysLeft = daysBetween(b.today < b.league.week_start ? b.league.week_start : b.today, b.league.week_end).length;
  return { week: b.league.week, weekStart: b.league.week_start, weekEnd: b.league.week_end, daysLeft, teams: result };
}

export async function lastRefresh() {
  const r = (await pool.query('select finished_at, error, warnings from refreshes where finished_at is not null order by id desc limit 1')).rows[0];
  return r ? { finishedAt: r.finished_at.toISOString() as string, error: r.error as string | null, warnings: r.warnings as string[] } : null;
}

export type LineupView = NonNullable<Awaited<ReturnType<typeof lineupView>>>;
export type WaiverRow = NonNullable<Awaited<ReturnType<typeof waiversView>>>[number];
export type MatchupView = NonNullable<Awaited<ReturnType<typeof matchupView>>>;
export type Status = { yahooConnected: boolean; db: 'ok' | 'down'; dbError?: string; lastRefresh: Awaited<ReturnType<typeof lastRefresh>> };
