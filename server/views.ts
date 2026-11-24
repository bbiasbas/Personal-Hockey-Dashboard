import { ensureDb, pool } from './db.ts';
import { addDays, BENCH_SLOTS, daysBetween, easternDate, gamesLeft, hotCold, IR_SLOTS, lineupFlag, perGame, projectedFinish, SLOT_ORDER, teamGames, type Game } from './logic.ts';
import { bestLineup, oppFactor, planWeek, scorePlan, STICKY_PTS, type Move, type PlanInput } from './streaming.ts';

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
  const marks = await markedKeys();
  const added: string[] = (await pool.query('select added_this_week from league')).rows[0]?.added_this_week ?? [];
  const players = rows.map((p) => {
    const game = b.games.find((g) => g.day === d && (g.home === p.nhl_team || g.away === p.nhl_team));
    const tonight = game ? { home: game.home === p.nhl_team, opponent: game.home === p.nhl_team ? game.away : game.home, startUtc: game.startUtc } : null;
    const streamer: 'marked' | 'added' | null = marks.has(p.key) ? 'marked' : added.includes(p.key) ? 'added' : null;
    return { key: p.key, name: p.name, positions: p.positions, team: p.nhl_team, status: p.status, slot: p.slot as string, tonight, l30: b.fpg(p, 'lastmonth'), season: b.fpg(p, 'season'), flag: lineupFlag(p.slot, !!game), streamer };
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

// ---- Streaming Center ----

const markedKeys = async () => new Set<string>((await pool.query('select player_key from streamer_marks')).rows.map((r) => r.player_key));

export async function setStreamerMark(key: string, marked: boolean) {
  await ensureDb();
  if (marked) await pool.query('insert into streamer_marks (player_key) values ($1) on conflict do nothing', [key]);
  else await pool.query('delete from streamer_marks where player_key = $1', [key]);
  return { key, marked };
}

const OUT = ['O', 'IR', 'IR-LT', 'IR-NR', 'NA', 'SUSP'];
const COUNTED_STARTS = ['Confirmed', 'Likely'];
const CANDIDATES_PER_POSITION = 15;
const norm = (s: string) => s.normalize('NFD').replace(/[^a-zA-Z]/g, '').toLowerCase();

// Everything the planner and the Streaming Center tab need, from the latest refresh.
async function streamingBase() {
  const b = await base();
  if (!b) return null;
  const lg = (await pool.query('select max_weekly_adds, roster_slots, adds_used, added_this_week from league')).rows[0];
  const days = daysBetween(b.today < b.league.week_start ? b.league.week_start : b.today, b.league.week_end);
  const rosterDay = days[0] ?? b.league.week_end;
  const mine = (await pool.query(`select r.slot, ${PLAYER_COLS} from rosters r join players p on p.key = r.player_key where r.team_key = $1 and r.day = $2`, [b.league.my_team_key, rosterDay])).rows;
  const fas = (await pool.query(`select to_char(f.waiver_date, 'YYYY-MM-DD') as waiver_date, ${PLAYER_COLS} from free_agents f join players p on p.key = f.player_key order by f.rank`)).rows;
  const strength = new Map<string, { gf: number; ga: number }>((await pool.query('select team, gf_per_game::float8 as gf, ga_per_game::float8 as ga from team_strength')).rows.map((r) => [r.team, r]));
  const leagueAvg = strength.size ? [...strength.values()].reduce((s, t) => s + t.gf, 0) / strength.size : 0;
  const starts = new Map<string, { goalie: string; status: string }>((await pool.query("select to_char(day, 'YYYY-MM-DD') as day, team, goalie, status from goalie_starts")).rows.map((r) => [`${r.day}|${r.team}`, r]));
  const marks = await markedKeys();

  const people = new Map<string, PlayerRow & { waiver_date?: string | null }>([...mine, ...fas].map((p) => [p.key, p]));
  const roster = mine.filter((p) => !IR_SLOTS.includes(p.slot)).map((p) => p.key as string);
  const added: string[] = lg.added_this_week ?? [];
  const droppable = roster.filter((k) => marks.has(k) || added.includes(k));
  const slots: Record<string, number> = lg.roster_slots ?? {};
  const cap = Object.values(slots).reduce((s, n) => s + n, 0);
  const now = new Date();

  const gameOn = (team: string, day: string) => b.games.find((g) => g.day === day && (g.home === team || g.away === team) && new Date(g.startUtc) > now);
  // shown = projection whether or not we know the goalie starts; counted = what the planner may use.
  const projection = (key: string, day: string) => {
    const p = people.get(key);
    const g = p && gameOn(p.nhl_team, day);
    if (!p || !g || OUT.includes(p.status ?? '')) return null;
    const goalie = p.positions.includes('G');
    const opp = g.home === p.nhl_team ? g.away : g.home;
    const start = goalie ? starts.get(`${day}|${p.nhl_team}`) : undefined;
    const startStatus = !goalie ? null : !start ? 'Projected' : norm(start.goalie) === norm(p.name) ? start.status : 'Not starting';
    const shown = b.fpg(p, 'lastmonth') * oppFactor(strength.get(opp), leagueAvg, goalie);
    // A goalie you'd add counts only with a Confirmed/Likely start. Your own goalies keep unreported starts,
    // or the planner would see them as free to drop after DailyFaceoff's two-day window.
    const counts = !goalie || COUNTED_STARTS.includes(startStatus!) || (startStatus === 'Projected' && roster.includes(key));
    return { shown, counted: counts ? shown : 0, opp: `${g.home === p.nhl_team ? 'vs' : '@'} ${opp}`, startStatus };
  };
  const gameValue = (key: string, day: string) => projection(key, day)?.counted ?? 0;

  // Candidates: free agents with at least one counted game left, top 15 per position by L30 FP/G.
  const pool15 = new Set<string>();
  for (const pos of ['C', 'LW', 'RW', 'D', 'G']) {
    fas.filter((p) => p.positions.includes(pos) && days.some((d) => gameValue(p.key, d) > 0))
      .sort((x, y) => b.fpg(y, 'lastmonth') - b.fpg(x, 'lastmonth'))
      .slice(0, CANDIDATES_PER_POSITION)
      .forEach((p) => pool15.add(p.key));
  }
  const input: PlanInput = {
    days,
    slots,
    cap,
    roster,
    droppable,
    locked: roster.filter((k) => b.games.some((g) => g.day === days[0] && (g.home === people.get(k)!.nhl_team || g.away === people.get(k)!.nhl_team) && new Date(g.startUtc) <= now)),
    candidates: fas.filter((p) => pool15.has(p.key)).map((p) => ({ key: p.key, from: p.waiver_date && p.waiver_date > days[0] ? p.waiver_date : days[0] })),
    addsLeft: lg.max_weekly_adds == null ? days.length : Math.max(0, lg.max_weekly_adds - lg.adds_used),
    positions: new Map([...people.values()].map((p) => [p.key, p.positions])),
    gameValue,
  };
  return { b, lg, days, input, people, marks, added, projection, now, starts };
}

// Runs during Refresh. Keeps the previous plan unless the new one is STICKY_PTS better (CONTEXT.md: week plan).
export async function savePlan(refreshId: number) {
  const s = await streamingBase();
  if (!s) return;
  const seconds = Math.min(Number(process.env.PLAN_SEARCH_SECONDS) || 25, 15 * 60); // capped at 15 minutes
  const fresh = planWeek(s.input, Date.now() + seconds * 1000);
  let plan = { moves: fresh.moves, gain: fresh.gain, complete: fresh.complete, kept: null as null | { newGain: number } };
  const prev = (await pool.query('select plan from streaming_plans where week = $1 and refresh_id < $2 order by refresh_id desc limit 1', [s.b.league.week, refreshId])).rows[0];
  if (prev) {
    const old = scorePlan(s.input, (prev.plan.moves as Move[]).filter((m) => m.day >= s.days[0]));
    const same = old && JSON.stringify(old.moves.map((m) => [m.day, m.add, m.drop])) === JSON.stringify(fresh.moves.map((m) => [m.day, m.add, m.drop]));
    if (old && old.moves.length && !same && fresh.gain < old.gain + STICKY_PTS) plan = { moves: old.moves, gain: old.gain, complete: fresh.complete, kept: { newGain: fresh.gain } };
  }
  await pool.query('insert into streaming_plans (refresh_id, week, plan) values ($1, $2, $3)', [refreshId, s.b.league.week, JSON.stringify(plan)]);
}

export async function streamingView(day?: string) {
  const s = await streamingBase();
  if (!s) return null;
  const { b, lg, days, input, people, projection } = s;
  const saved = (await pool.query('select plan from streaming_plans where week = $1 order by refresh_id desc limit 1', [b.league.week])).rows[0]?.plan as { moves: Move[]; gain: number; complete: boolean; kept: { newGain: number } | null } | undefined;
  const moves = (saved?.moves ?? []).filter((m) => days.includes(m.day));
  const info = (key: string) => {
    const p = people.get(key)!;
    return { key, name: p?.name ?? key, positions: p?.positions ?? [], team: p?.nhl_team ?? '', claim: p?.waiver_date ?? null };
  };

  // Roster on each day after the plan's moves up to and including that day.
  const rosterOn = (d: string) => moves.filter((m) => m.day <= d).reduce((r, m) => [...r.filter((k) => k !== m.drop), m.add], input.roster);
  const shown = (key: string, d: string) => projection(key, d)?.shown ?? 0;
  const lineupOn = (keys: string[], d: string) =>
    bestLineup(keys.map((k) => ({ key: k, positions: input.positions.get(k) ?? [], value: shown(k, d) })), input.slots);

  // Grid: open seats per starting slot per day with today's roster.
  const startingSlots = Object.keys(input.slots).filter((s) => s !== 'BN');
  const weekDays = daysBetween(b.league.week_start, b.league.week_end);
  const grid = weekDays.map((d) => {
    const past = !days.includes(d);
    // An empty seat is only an open start if some game that day hasn't started yet.
    const playable = !past && b.games.some((g) => g.day === d && new Date(g.startUtc) > s.now);
    const open = playable ? lineupOn(input.roster, d).open : [];
    return { day: d, past, games: b.games.filter((g) => g.day === d).length, open: Object.fromEntries(startingSlots.map((sl) => [sl, open.filter((o) => o === sl).length])) };
  });

  const planMoves = moves.map((m) => {
    const startDays = days.filter((d) => d >= m.day && lineupOn(rosterOn(d), d).seatOf.has(m.add));
    const p = projection(m.add, m.day);
    const opps = startDays.map((d) => projection(m.add, d)?.opp).filter(Boolean);
    const add = info(m.add);
    return {
      day: m.day,
      gain: m.gain,
      add,
      drop: m.drop ? { ...info(m.drop), reason: s.marks.has(m.drop) ? 'marked' : s.added.includes(m.drop) ? 'added this week' : 'streamed in by this plan' } : null,
      startDays,
      opponents: opps as string[],
      l30: b.fpg(people.get(m.add)!, 'lastmonth'),
      goalieStart: p?.startStatus ?? null,
    };
  });

  // Day view: the chosen day's roster after the plan's moves, then the best free agent for each open seat.
  const d = day && days.includes(day) ? day : days.find((x) => grid.find((g) => g.day === x && Object.values(g.open).some(Boolean))) ?? days[0];
  const dayRows = [];
  if (d) {
    const roster = rosterOn(d);
    const plannedToday = new Map(moves.filter((m) => m.day <= d).map((m) => [m.add, m.day]));
    let lineup = lineupOn(roster, d);
    for (const [key, slot] of lineup.seatOf) if (plannedToday.has(key)) dayRows.push({ slot, ...info(key), ...projection(key, d)!, inPlan: plannedToday.get(key)! });
    const gone = new Set(moves.map((m) => m.drop).filter(Boolean));
    let chosen = [...roster];
    const pool = [...people.values()].filter((p) => !roster.includes(p.key) && !gone.has(p.key) && 'waiver_date' in p && (!p.waiver_date || p.waiver_date <= d) && shown(p.key, d) > 0)
      .sort((x, y) => shown(y.key, d) - shown(x.key, d));
    for (const p of pool) {
      if (!lineup.open.length) break;
      const next = lineupOn([...chosen, p.key], d);
      if (next.value > lineup.value + 1e-9 && next.open.length < lineup.open.length) {
        chosen = [...chosen, p.key];
        lineup = next;
        dayRows.push({ slot: next.seatOf.get(p.key)!, ...info(p.key), ...projection(p.key, d)!, inPlan: null });
      }
    }
    dayRows.sort((x, y) => SLOT_ORDER.indexOf(x.slot) - SLOT_ORDER.indexOf(y.slot));
  }

  return {
    week: b.league.week,
    weekStart: b.league.week_start,
    weekEnd: b.league.week_end,
    maxAdds: lg.max_weekly_adds as number | null,
    addsUsed: lg.adds_used as number,
    addsLeft: input.addsLeft,
    streamers: input.droppable.map((k) => ({ ...info(k), reason: s.marks.has(k) ? 'marked' : 'added this week' })),
    emptySpots: Math.max(0, input.cap - input.roster.length),
    goaliesReported: s.starts.size > 0,
    grid: { slots: startingSlots, days: grid },
    plan: saved ? { moves: planMoves, gain: planMoves.reduce((t, m) => t + m.gain, 0), complete: saved.complete, kept: saved.kept } : null,
    dayView: d ? { day: d, games: b.games.filter((g) => g.day === d).length, rows: dayRows } : null,
  };
}

export async function lastRefresh() {
  const r = (await pool.query('select finished_at, error, warnings from refreshes where finished_at is not null order by id desc limit 1')).rows[0];
  return r ? { finishedAt: r.finished_at.toISOString() as string, error: r.error as string | null, warnings: r.warnings as string[] } : null;
}

export type LineupView = NonNullable<Awaited<ReturnType<typeof lineupView>>>;
export type WaiverRow = NonNullable<Awaited<ReturnType<typeof waiversView>>>[number];
export type MatchupView = NonNullable<Awaited<ReturnType<typeof matchupView>>>;
export type StreamingView = NonNullable<Awaited<ReturnType<typeof streamingView>>>;
export type Status = { yahooConnected: boolean; db: 'ok' | 'down'; dbError?: string; lastRefresh: Awaited<ReturnType<typeof lastRefresh>> };
