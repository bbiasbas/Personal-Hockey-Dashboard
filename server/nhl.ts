import { addDays, type Game } from './logic.ts';

// NHL schedule from the free public API. Each call returns one week starting at the given day.
export async function fetchSchedule(from: string, to: string) {
  const out: (Game & { id: number })[] = [];
  for (let day = from; day <= to; day = addDays(day, 7)) {
    const res = await fetch(`https://api-web.nhle.com/v1/schedule/${day}`);
    if (!res.ok) throw new Error(`NHL schedule ${res.status} for ${day}`);
    const body = await res.json();
    for (const week of body.gameWeek ?? []) {
      for (const g of week.games ?? []) {
        // 2 = regular season, 3 = playoffs (skip preseason)
        if (g.gameType === 2 || g.gameType === 3) {
          out.push({ id: g.id, day: week.date, home: g.homeTeam.abbrev, away: g.awayTeam.abbrev, startUtc: g.startTimeUTC });
        }
      }
    }
  }
  return out;
}

// Goals for/against per game for every team, from today's standings.
export async function fetchStrength() {
  const res = await fetch('https://api-web.nhle.com/v1/standings/now');
  if (!res.ok) throw new Error(`NHL standings ${res.status}`);
  const body = await res.json();
  return (body.standings ?? [])
    .filter((t: { gamesPlayed: number }) => t.gamesPlayed > 0)
    .map((t: { teamAbbrev: { default: string }; goalFor: number; goalAgainst: number; gamesPlayed: number }) => ({
      team: t.teamAbbrev.default,
      gfPerGame: t.goalFor / t.gamesPlayed,
      gaPerGame: t.goalAgainst / t.gamesPlayed,
    })) as { team: string; gfPerGame: number; gaPerGame: number }[];
}

// Starting goalies from DailyFaceoff, through the scraper container (docs/adr/0001).
export async function fetchGoalieStarts(day: string) {
  const res = await fetch(`${process.env.SCRAPER_URL || 'http://localhost:3002'}/goalies?date=${day}`, { signal: AbortSignal.timeout(30000) });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `scraper ${res.status}`);
  return body as { team: string; goalie: string; status: string }[];
}
