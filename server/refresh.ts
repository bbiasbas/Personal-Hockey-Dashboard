import { ensureDb, pool } from './db.ts';
import { addDays, daysBetween, easternDate, fantasyPoints, NHL_TEAMS, seasonStart } from './logic.ts';
import { fetchSchedule } from './nhl.ts';
import type { FantasySource, Period, Player, RosterEntry, StatLine } from './source.ts';

const FREE_AGENTS = 100;

// Pulls everything the dashboard shows from Yahoo + the NHL schedule, then writes it in one transaction.
export async function refresh(source: FantasySource) {
  await ensureDb();
  const { rows } = await pool.query('insert into refreshes default values returning id');
  const refreshId: number = rows[0].id;
  try {
    const warnings: string[] = [];
    const today = easternDate();
    const teamKey = process.env.YAHOO_TEAM_KEY || (await source.myTeamKey());
    const lg = await source.league(teamKey);
    const opponent = lg.teams.find((t) => t.key !== teamKey);
    const rosterDay = today < lg.weekStart ? lg.weekStart : today > lg.weekEnd ? lg.weekEnd : today;

    // Your lineup for every day of the matchup week (for the day arrows), the opponent's for today.
    const rosters: { team: string; day: string; entries: RosterEntry[] }[] = [];
    for (const day of daysBetween(lg.weekStart, lg.weekEnd)) rosters.push({ team: teamKey, day, entries: await source.roster(teamKey, day) });
    if (opponent) rosters.push({ team: opponent.key, day: rosterDay, entries: await source.roster(opponent.key, rosterDay) });
    const freeAgents = await source.freeAgents(lg.key, FREE_AGENTS);

    const players = new Map<string, Player>();
    for (const r of rosters) for (const e of r.entries) players.set(e.player.key, e.player);
    for (const p of freeAgents) players.set(p.key, p);
    const keys = [...players.keys()];
    const startersToday = rosters.filter((r) => r.day === rosterDay).flatMap((r) => r.entries.map((e) => e.player.key));

    const periods: [string, Period, string[]][] = [
      ['season', 'season', keys],
      ['lastmonth', 'lastmonth', keys],
      ['lastweek', 'lastweek', keys],
      ['week', { week: lg.week }, startersToday],
    ];
    const lines: [string, Map<string, StatLine>][] = [];
    for (const [name, period, playerKeys] of periods) lines.push([name, await source.stats(lg.key, playerKeys, period)]);

    // Yahoo sends GP when the league tracks it; otherwise views fall back to the team's NHL games.
    const gpIds = Object.keys(lg.statNames).filter((id) => lg.statNames[id] === 'GP');
    const gamesOf = (line: StatLine) => gpIds.map((id) => line.stats[id]).find((v) => v !== undefined) ?? null;

    // Cross-check: our math with your league's weights should match Yahoo's season points.
    for (const r of rosters.filter((r) => r.team === teamKey && r.day === rosterDay)) {
      for (const e of r.entries) {
        const line = lines[0][1].get(e.player.key);
        if (!line) continue;
        const ours = fantasyPoints(line.stats, lg.weights);
        if (Math.abs(ours - line.points) > 0.05) warnings.push(`Points mismatch for ${e.player.name}: Yahoo ${line.points}, ours ${ours}`);
      }
    }
    for (const team of new Set([...players.values()].map((p) => p.nhlTeam))) {
      if (team && !NHL_TEAMS.has(team)) warnings.push(`Unknown NHL team abbreviation from Yahoo: ${team}`);
    }

    // Schedule: from a week before the last stored game day (or season start) through week end.
    const { rows: last } = await pool.query("select to_char(max(day), 'YYYY-MM-DD') as day from nhl_games");
    const from = last[0].day ? addDays(last[0].day, -7) : seasonStart(today);
    const schedule = await fetchSchedule(from, lg.weekEnd);

    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('delete from league; delete from matchup; delete from rosters; delete from free_agents');
      await client.query('insert into league (key, name, my_team_key, week, week_start, week_end) values ($1, $2, $3, $4, $5, $6)', [lg.key, lg.name, teamKey, lg.week, lg.weekStart, lg.weekEnd]);
      for (const t of lg.teams) await client.query('insert into matchup (team_key, name, points, is_mine) values ($1, $2, $3, $4)', [t.key, t.name, t.points, t.key === teamKey]);
      for (const p of players.values()) {
        await client.query(
          `insert into players (key, name, positions, nhl_team, status) values ($1, $2, $3, $4, $5)
           on conflict (key) do update set name = excluded.name, positions = excluded.positions, nhl_team = excluded.nhl_team, status = excluded.status`,
          [p.key, p.name, p.positions, p.nhlTeam, p.status],
        );
      }
      for (const r of rosters) for (const e of r.entries) await client.query('insert into rosters (team_key, day, player_key, slot) values ($1, $2, $3, $4)', [r.team, r.day, e.player.key, e.slot]);
      for (const [i, p] of freeAgents.entries()) await client.query('insert into free_agents (player_key, rank) values ($1, $2) on conflict do nothing', [p.key, i + 1]);
      for (const [period, map] of lines) {
        for (const [key, line] of map) await client.query('insert into player_stats (refresh_id, player_key, period, points, games) values ($1, $2, $3, $4, $5)', [refreshId, key, period, line.points, gamesOf(line)]);
      }
      for (const g of schedule) {
        await client.query('insert into nhl_games (id, day, home, away, start_utc) values ($1, $2, $3, $4, $5) on conflict (id) do update set day = excluded.day, start_utc = excluded.start_utc', [g.id, g.day, g.home, g.away, g.startUtc]);
      }
      await client.query('update refreshes set finished_at = now(), warnings = $2 where id = $1', [refreshId, warnings]);
      await client.query('commit');
    } catch (e) {
      await client.query('rollback');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    await pool.query('update refreshes set finished_at = now(), error = $2 where id = $1', [refreshId, (e as Error).message]);
    throw e;
  }
}
