// Pure fantasy math. No imports, so the web app can use it too.

export const BENCH_SLOTS = ['BN', 'IR', 'IR+', 'NA'];
export const IR_SLOTS = ['IR', 'IR+', 'NA'];
export const SLOT_ORDER = ['C', 'LW', 'RW', 'F', 'W', 'D', 'Util', 'G', 'BN', 'IR', 'IR+', 'NA'];

export type Game = { day: string; home: string; away: string; startUtc: string };

export function fantasyPoints(stats: Record<string, number>, weights: Record<string, number>) {
  let total = 0;
  for (const [stat, weight] of Object.entries(weights)) total += (stats[stat] ?? 0) * weight;
  return Math.round(total * 100) / 100;
}

export const perGame = (points: number, games: number) => (games > 0 ? points / games : 0);

export const teamGames = (games: Game[], team: string, from: string, to: string) =>
  games.filter((g) => g.day >= from && g.day <= to && (g.home === team || g.away === team));

export const gamesLeft = (games: Game[], team: string, today: string, weekEnd: string, now = new Date()) =>
  teamGames(games, team, today, weekEnd).filter((g) => new Date(g.startUtc) > now).length;

export const projectedFinish = (current: number, starters: { fpg: number; gamesLeft: number }[]) =>
  current + starters.reduce((sum, p) => sum + p.fpg * p.gamesLeft, 0);

export function lineupFlag(slot: string, hasGame: boolean): 'NO GAME' | 'PLAYS' | null {
  if (!BENCH_SLOTS.includes(slot) && !hasGame) return 'NO GAME';
  if (slot === 'BN' && hasGame) return 'PLAYS';
  return null;
}

// shortcut: fixed ±20% bands of L7 vs L30; tune once real data shows how noisy L7 is
export function hotCold(l7: number, l30: number): 'HOT' | 'COLD' | null {
  if (l30 <= 0) return null;
  if (l7 >= l30 * 1.2) return 'HOT';
  if (l7 <= l30 * 0.8) return 'COLD';
  return null;
}

export const NHL_TEAMS = new Set('ANA BOS BUF CGY CAR CHI COL CBJ DAL DET EDM FLA LAK MIN MTL NSH NJD NYI NYR OTT PHI PIT SJS SEA STL TBL TOR UTA VAN VGK WSH WPG'.split(' '));
// shortcut: Yahoo abbreviations that differ from the NHL's are a best guess; refresh warns about any it can't match
const YAHOO_TO_NHL: Record<string, string> = { NJ: 'NJD', TB: 'TBL', LA: 'LAK', SJ: 'SJS', MON: 'MTL', WAS: 'WSH', CLS: 'CBJ', CAL: 'CGY', ANH: 'ANA', NAS: 'NSH', UTAH: 'UTA' };
export function toNhlTeam(yahooAbbr: string) {
  const up = (yahooAbbr ?? '').toUpperCase();
  return YAHOO_TO_NHL[up] ?? up;
}

// The NHL's "day" is the Eastern date, and Yahoo lineups lock by it too.
export const easternDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);

export function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

// NHL seasons start in October; anything from July on belongs to the season starting that year.
export function seasonStart(today: string) {
  const [y, m] = today.split('-').map(Number);
  return `${m >= 7 ? y : y - 1}-10-01`;
}
