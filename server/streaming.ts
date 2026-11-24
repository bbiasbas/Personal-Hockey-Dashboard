// Pure Streaming Center math. Terms (open start, net gain, week plan...) are defined in CONTEXT.md.

// Which positions each starting slot takes. Slots not listed here (BN, IR...) never start.
export const SLOT_ACCEPTS: Record<string, string[]> = {
  C: ['C'], LW: ['LW'], RW: ['RW'], D: ['D'], G: ['G'],
  W: ['LW', 'RW'], F: ['C', 'LW', 'RW'], Util: ['C', 'LW', 'RW', 'D'],
};
export const STICKY_PTS = 2; // a new plan replaces the saved one only when it is this much better
export const OPP_CAP = 0.15; // opponent strength moves a game's projection by at most ±15%

// One seat per starting slot, specific slots first so flex seats are the ones left open.
export function seats(slots: Record<string, number>) {
  return Object.entries(slots)
    .filter(([s]) => s in SLOT_ACCEPTS)
    .sort(([a], [b]) => SLOT_ACCEPTS[a].length - SLOT_ACCEPTS[b].length)
    .flatMap(([s, n]) => Array<string>(n).fill(s));
}

export type Candidate = { key: string; positions: string[]; value: number };

// Best lineup for one day. Adding players by value and keeping each one that still fits
// (augmenting paths) is optimal, because "players who can all start together" is a matroid.
export function bestLineup(players: Candidate[], slots: Record<string, number>) {
  const S = seats(slots);
  const byValue = players.filter((p) => p.value > 0).sort((a, b) => b.value - a.value);
  const holder: (number | null)[] = S.map(() => null);
  const fits = (pi: number, seen: Set<number>): boolean => {
    for (let s = 0; s < S.length; s++) {
      if (seen.has(s) || !SLOT_ACCEPTS[S[s]].some((pos) => byValue[pi].positions.includes(pos))) continue;
      seen.add(s);
      if (holder[s] === null || fits(holder[s]!, seen)) {
        holder[s] = pi;
        return true;
      }
    }
    return false;
  };
  let value = 0;
  for (let i = 0; i < byValue.length; i++) if (fits(i, new Set())) value += byValue[i].value;
  const seatOf = new Map<string, string>();
  holder.forEach((pi, s) => pi !== null && seatOf.set(byValue[pi].key, S[s]));
  return { value, seatOf, open: S.filter((_, s) => holder[s] === null) };
}

export function oppFactor(opp: { gf: number; ga: number } | undefined, leagueAvg: number, goalie: boolean) {
  if (!opp || leagueAvg <= 0) return 1;
  // Skaters like leaky defenses; goalies like weak offenses.
  const raw = goalie ? leagueAvg / opp.gf : opp.ga / leagueAvg;
  return Math.min(1 + OPP_CAP, Math.max(1 - OPP_CAP, raw));
}

export type Move = { day: string; add: string; drop: string | null; gain: number };

export type PlanInput = {
  days: string[]; // remaining days of the matchup week, in order
  slots: Record<string, number>; // starting slots
  cap: number; // roster spots outside IR
  roster: string[]; // current non-IR roster
  droppable: string[]; // streamer slots
  locked: string[]; // players whose game today has started: Yahoo won't let you drop them until tomorrow
  candidates: { key: string; from: string }[]; // free agents and waiver claims, from = first day he can be added
  addsLeft: number;
  positions: Map<string, string[]>;
  gameValue: (key: string, day: string) => number; // projected points for that day's game, 0 if none
};

// Week value of a roster from day index i on, with a per-day lineup cache.
function scorer(input: PlanInput) {
  const cache = new Map<string, number>();
  const day = (d: string, roster: string[]) => {
    const playing = roster.filter((k) => input.gameValue(k, d) > 0).sort();
    const id = `${d}|${playing.join(',')}`;
    let v = cache.get(id);
    if (v === undefined) {
      v = bestLineup(playing.map((k) => ({ key: k, positions: input.positions.get(k) ?? [], value: input.gameValue(k, d) })), input.slots).value;
      cache.set(id, v);
    }
    return v;
  };
  return (roster: string[], from: number) => {
    let total = 0;
    for (let i = from; i < input.days.length; i++) total += day(input.days[i], roster);
    return total;
  };
}

// Projected points a list of moves adds over keeping the roster; null when a move is no longer possible.
export function scorePlan(input: PlanInput, moves: Omit<Move, 'gain'>[]) {
  const rest = scorer(input);
  let roster = [...input.roster];
  const droppable = new Set(input.droppable);
  const avail = new Map(input.candidates.map((c) => [c.key, c.from]));
  const scored: Move[] = [];
  let gain = 0;
  if (moves.length > input.addsLeft) return null;
  for (const m of moves) {
    const i = input.days.indexOf(m.day);
    const from = avail.get(m.add);
    if (i < 0 || from === undefined || from > m.day || roster.includes(m.add)) return null;
    if (m.drop ? !roster.includes(m.drop) || !droppable.has(m.drop) || (i === 0 && input.locked.includes(m.drop)) : roster.length >= input.cap) return null;
    const next = [...roster.filter((k) => k !== m.drop), m.add];
    const g = rest(next, i) - rest(roster, i);
    scored.push({ ...m, gain: g });
    gain += g;
    roster = next;
    droppable.add(m.add);
    avail.delete(m.add);
    if (m.drop) avail.delete(m.drop); // a dropped player goes to waivers; the plan never re-adds him
  }
  return { moves: scored, gain };
}

type State = { roster: string[]; droppable: Set<string>; gone: Set<string>; d0: number };
type Child = { move: Move; next: State };

// Searches every combination of streams (chronological, positive gain each) for the best week plan.
// Limited discrepancy search: pass k tries every plan whose moves stray at most k ranks in total from
// "take the biggest gain", so good alternatives to the first move get tried early instead of after
// one move's whole subtree. Stops at the deadline: complete = false means "best found", not "best possible".
export function planWeek(input: PlanInput, deadline = Date.now() + 25_000) {
  const rest = scorer(input);
  const best = { moves: [] as Move[], gain: 0 };
  const childCache = new Map<string, Child[]>();
  let nodes = 0;
  let outOfTime = false;

  const keyOf = (s: State) => `${s.d0}|${[...s.roster].sort().join(',')}|${[...s.gone].sort().join(',')}`;
  const childrenOf = (s: State, id: string) => {
    let children = childCache.get(id);
    if (children) return children;
    children = [];
    const drops = [...s.roster.filter((k) => s.droppable.has(k)), ...(s.roster.length < input.cap ? [null] : [])];
    for (let di = s.d0; di < input.days.length; di++) {
      const day = input.days[di];
      const keep = rest(s.roster, di);
      for (const c of input.candidates) {
        if (c.from > day || s.gone.has(c.key) || s.roster.includes(c.key) || input.gameValue(c.key, day) <= 0) continue;
        for (const drop of drops) {
          if (di === 0 && drop && input.locked.includes(drop)) continue;
          const roster = [...s.roster.filter((k) => k !== drop), c.key];
          const g = rest(roster, di) - keep;
          if (g <= 1e-9) continue;
          const droppable = new Set(s.droppable).add(c.key);
          const gone = new Set(s.gone);
          if (drop) {
            droppable.delete(drop);
            gone.add(drop);
          }
          children.push({ move: { day, add: c.key, drop, gain: g }, next: { roster, droppable, gone, d0: di } });
        }
      }
    }
    children.sort((a, b) => b.move.gain - a.move.gain);
    childCache.set(id, children);
    return children;
  };

  // Returns true if some branch was skipped for lack of budget (so a bigger pass would see more).
  const search = (s: State, moves: Move[], gain: number, budget: number, seen: Map<string, [number, number]>): boolean => {
    if (gain > best.gain + 1e-9) Object.assign(best, { moves: [...moves], gain });
    if (moves.length >= input.addsLeft) return false;
    if ((++nodes & 255) === 0 && Date.now() > deadline) outOfTime = true;
    if (outOfTime) return true;
    // The same moves in another order reach the same state; skip it unless we now have more gain or budget.
    const id = keyOf(s);
    const prior = seen.get(id);
    if (prior && prior[0] >= gain - 1e-9 && prior[1] >= budget) return false;
    seen.set(id, [gain, budget]);
    const children = childrenOf(s, id);
    let skipped = false;
    for (let rank = 0; rank < children.length; rank++) {
      if (rank > budget) return true;
      skipped = search(children[rank].next, [...moves, children[rank].move], gain + children[rank].move.gain, budget - rank, seen) || skipped;
      if (outOfTime) return true;
    }
    return skipped;
  };

  const start: State = { roster: [...input.roster], droppable: new Set(input.droppable), gone: new Set(), d0: 0 };
  let complete = false;
  for (let k = 0; !outOfTime; k = k === 0 ? 1 : k * 2) {
    if (!search(start, [], 0, k, new Map())) {
      complete = !outOfTime;
      break;
    }
  }
  return { ...best, complete, nodes };
}
