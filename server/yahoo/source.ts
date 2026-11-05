import { toNhlTeam } from '../logic.ts';
import type { FantasySource, LeagueInfo, Period, Player, StatLine } from '../source.ts';
import { list, merge, yahoo, type Y } from './api.ts';

const POSITIONS = ['C', 'LW', 'RW', 'D', 'G'];
const BATCH = 25; // Yahoo's max players per request

const leagueOf = (teamKey: string) => teamKey.split('.t.')[0];

export function parsePlayer(p: Y): { player: Player; slot: string | null; line: StatLine | null } {
  const info = merge(p[0]);
  const rest = merge(p.slice(1));
  const player: Player = {
    key: info.player_key,
    name: info.name?.full ?? info.player_key,
    positions: (info.eligible_positions ?? []).map((e: Y) => e.position).filter((x: string) => POSITIONS.includes(x)),
    nhlTeam: toNhlTeam(info.editorial_team_abbr),
    status: info.status || null,
  };
  const slot = rest.selected_position ? merge(rest.selected_position).position : null;
  const line = rest.player_stats
    ? {
        points: Number(rest.player_points?.total ?? 0),
        stats: Object.fromEntries((rest.player_stats.stats ?? []).map((s: Y) => [String(s.stat.stat_id), Number(s.stat.value) || 0])),
      }
    : null;
  return { player, slot, line };
}

const playersOf = (fc: Y) => list(fc.league?.[1]?.players ?? fc.team?.[1]?.roster?.['0']?.players, 'player').map(parsePlayer);

export const yahooSource: FantasySource = {
  async myTeamKey() {
    const fc = await yahoo('users;use_login=1/games;game_keys=nhl/teams');
    const game = fc.users['0'].user[1].games['0'].game;
    const teams = list(game[1]?.teams, 'team').map((t) => merge(t[0]));
    if (teams.length !== 1) {
      throw new Error(`Found ${teams.length} Yahoo NHL teams. Set YAHOO_TEAM_KEY in .env to one of: ${teams.map((t) => `${t.team_key} (${t.name})`).join(', ')}`);
    }
    return teams[0].team_key;
  },

  async league(teamKey): Promise<LeagueInfo> {
    const lg = (await yahoo(`league/${leagueOf(teamKey)}/settings`)).league;
    const meta = lg[0];
    const settings = merge(lg[1].settings);
    const cats = (settings.stat_categories?.stats ?? []).map((s: Y) => s.stat);
    const mods = (settings.stat_modifiers?.stats ?? []).map((s: Y) => s.stat);
    const week = Number(meta.current_week);
    const m = list((await yahoo(`team/${teamKey}/matchups;weeks=${week}`)).team[1].matchups, 'matchup')[0];
    const teams = list(m['0'].teams, 'team').map((t) => {
      const info = merge(t[0]);
      return { key: info.team_key, name: info.name, points: Number(merge(t.slice(1)).team_points?.total ?? 0) };
    });
    return {
      key: meta.league_key,
      name: meta.name,
      week,
      weekStart: m.week_start,
      weekEnd: m.week_end,
      weights: Object.fromEntries(mods.map((s: Y) => [String(s.stat_id), Number(s.value)])),
      statNames: Object.fromEntries(cats.map((s: Y) => [String(s.stat_id), s.display_name])),
      teams,
    };
  },

  async roster(teamKey, day) {
    return playersOf(await yahoo(`team/${teamKey}/roster;date=${day}/players`)).map(({ player, slot }) => ({ player, slot: slot ?? 'BN' }));
  },

  async freeAgents(leagueKey, count) {
    const out: Player[] = [];
    for (let start = 0; start < count; start += BATCH) {
      const page = playersOf(await yahoo(`league/${leagueKey}/players;status=A;sort=AR;sort_type=lastmonth;start=${start};count=${BATCH}`));
      out.push(...page.map((p) => p.player));
      if (page.length < BATCH) break;
    }
    return out;
  },

  async stats(leagueKey, playerKeys, period: Period) {
    const type = typeof period === 'string' ? `type=${period}` : `type=week;week=${period.week}`;
    const out = new Map<string, StatLine>();
    for (let i = 0; i < playerKeys.length; i += BATCH) {
      const keys = playerKeys.slice(i, i + BATCH).join(',');
      for (const { player, line } of playersOf(await yahoo(`league/${leagueKey}/players;player_keys=${keys}/stats;${type}`))) {
        if (line) out.set(player.key, line);
      }
    }
    return out;
  },
};
