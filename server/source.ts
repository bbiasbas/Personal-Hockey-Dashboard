// The one seam between the dashboard and a fantasy platform.
// Yahoo implements it today (server/yahoo/source.ts); Saucy Sports can later.

export type Player = { key: string; name: string; positions: string[]; nhlTeam: string; status: string | null };
export type RosterEntry = { player: Player; slot: string };
// stats are keyed by the platform's stat id; weights use the same ids.
export type StatLine = { points: number; stats: Record<string, number> };
export type Period = 'season' | 'lastmonth' | 'lastweek' | { week: number };

export type LeagueInfo = {
  key: string;
  name: string;
  week: number;
  weekStart: string;
  weekEnd: string;
  weights: Record<string, number>;
  statNames: Record<string, string>;
  // Your team and your opponent this week, with current points.
  teams: { key: string; name: string; points: number }[];
};

export interface FantasySource {
  myTeamKey(): Promise<string>;
  league(teamKey: string): Promise<LeagueInfo>;
  roster(teamKey: string, day: string): Promise<RosterEntry[]>;
  freeAgents(leagueKey: string, count: number): Promise<Player[]>;
  stats(leagueKey: string, playerKeys: string[], period: Period): Promise<Map<string, StatLine>>;
}
