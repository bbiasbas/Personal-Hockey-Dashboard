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
