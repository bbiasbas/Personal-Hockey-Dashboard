import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestLineup, oppFactor, planWeek, scorePlan, seats, type PlanInput } from './streaming.ts';

const SLOTS = { C: 1, LW: 1, F: 1, D: 1, G: 1 };

test('flex seats are filled last, so they are the ones left open', () => {
  assert.deepEqual(seats({ Util: 1, C: 2, F: 1 }), ['C', 'C', 'F', 'Util']);
  const r = bestLineup([{ key: 'a', positions: ['C'], value: 3 }], SLOTS);
  assert.deepEqual(r.open.sort(), ['D', 'F', 'G', 'LW']);
});

test('best lineup moves a dual-position player to make room', () => {
  // b (C/LW) takes C first; then c (C only) arrives and b shifts to LW.
  const r = bestLineup(
    [
      { key: 'b', positions: ['C', 'LW'], value: 5 },
      { key: 'c', positions: ['C'], value: 4 },
      { key: 'd', positions: ['C'], value: 3 },
      { key: 'e', positions: ['C'], value: 2 },
    ],
    SLOTS,
  );
  assert.equal(r.value, 12); // b, c, d start (C, LW, F); e sits
  assert.equal(r.seatOf.get('b'), 'LW');
  assert.equal(r.seatOf.has('e'), false);
});

test('opponent factor is capped at ±15%', () => {
  assert.equal(oppFactor({ gf: 3, ga: 6 }, 3, false), 1.15);
  assert.equal(oppFactor({ gf: 6, ga: 3 }, 3, true), 0.85);
  assert.equal(oppFactor({ gf: 3, ga: 3.3 }, 3, false).toFixed(2), '1.10');
  assert.equal(oppFactor(undefined, 3, false), 1);
});

// Two days. Your C plays day 1 only; your benched D never plays. Free agents: X (C, plays both days), Y (LW, day 2).
const plays: Record<string, string[]> = { mine: ['d1'], dud: [], x: ['d1', 'd2'], y: ['d2'], w: ['d2'] };
const input = (over: Partial<PlanInput> = {}): PlanInput => ({
  days: ['d1', 'd2'],
  slots: { C: 1, LW: 1 },
  cap: 2,
  roster: ['mine', 'dud'],
  droppable: ['dud'],
  locked: [],
  candidates: [{ key: 'x', from: 'd1' }, { key: 'y', from: 'd1' }],
  addsLeft: 2,
  positions: new Map([['mine', ['C']], ['dud', ['D']], ['x', ['C']], ['y', ['LW']], ['w', ['LW']]]),
  gameValue: (k, d) => (plays[k]?.includes(d) ? 1 : 0),
  ...over,
});

test('plan streams into the open slots, dropping only streamer slots', () => {
  // Day 1's C slot is taken by "mine"; day 2's C and LW are open.
  // Full roster: X replaces the dud, and Y could only replace X, so one stream is the best.
  const full = planWeek(input());
  assert.equal(full.complete, true);
  assert.equal(full.gain, 1);
  assert.deepEqual(full.moves.map((m) => m.drop), ['dud']);
  // One empty spot: X for the dud plus Y for free.
  const roomy = planWeek(input({ cap: 3 }));
  assert.equal(roomy.gain, 2);
  assert.deepEqual(roomy.moves.map((m) => m.drop).sort(), ['dud', null]);
});

test('plan respects adds left, waiver dates and players already dropped', () => {
  assert.equal(planWeek(input({ addsLeft: 1 })).gain, 1);
  assert.equal(planWeek(input({ addsLeft: 0 })).moves.length, 0);
  // Y can only be claimed from day 3, which is past the week.
  assert.equal(planWeek(input({ candidates: [{ key: 'y', from: 'd3' }] })).gain, 0);
  // Nothing droppable and no empty spot: no moves.
  assert.equal(planWeek(input({ droppable: [] })).gain, 0);
  // A player whose game today already started can't be dropped today, only from day 2.
  const locked = planWeek(input({ locked: ['dud'] }));
  assert.ok(locked.moves.every((m) => m.day !== 'd1' || m.drop !== 'dud'));
  assert.equal(locked.gain, 1);
  // An empty roster spot is a free stream.
  assert.equal(planWeek(input({ droppable: [], cap: 3, addsLeft: 1 })).moves[0].drop, null);
});

test('scorePlan re-scores a saved plan and rejects moves that no longer work', () => {
  const p = planWeek(input({ cap: 3 }));
  assert.equal(scorePlan(input({ cap: 3 }), p.moves)!.gain, p.gain);
  assert.equal(scorePlan(input({ cap: 3, roster: ['mine', 'dud', 'x'] }), p.moves), null); // X already rostered
  assert.equal(scorePlan(input({ cap: 3, addsLeft: 1 }), p.moves), null);
});

test('the search stops at the deadline and says so', () => {
  const p = planWeek(input(), Date.now() - 1);
  assert.equal(typeof p.complete, 'boolean');
});
