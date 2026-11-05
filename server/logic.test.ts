import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, daysBetween, fantasyPoints, gamesLeft, hotCold, lineupFlag, perGame, projectedFinish, seasonStart, toNhlTeam, type Game } from './logic.ts';

// Our league's scoring (H2H points), as agreed in docs/spec.md.
const WEIGHTS = { G: 5, A: 3.5, PPP: 1.25, SHP: 1.25, SOG: 0.5, HIT: 0.35, BLK: 0.65, W: 3, GA: -1, SV: 0.25, SHO: 3 };

test('skater fantasy points use the league weights', () => {
  // 1 G, 2 A, 1 PPP, 4 SOG, 2 HIT, 1 BLK = 5 + 7 + 1.25 + 2 + 0.7 + 0.65
  assert.equal(fantasyPoints({ G: 1, A: 2, PPP: 1, SOG: 4, HIT: 2, BLK: 1 }, WEIGHTS), 16.6);
});

test('goalie fantasy points: win, 2 GA, 30 saves', () => {
  assert.equal(fantasyPoints({ W: 1, GA: 2, SV: 30 }, WEIGHTS), 3 - 2 + 7.5);
});

test('shutout counts and missing stats are zero', () => {
  assert.equal(fantasyPoints({ W: 1, SV: 25, SHO: 1 }, WEIGHTS), 3 + 6.25 + 3);
  assert.equal(fantasyPoints({}, WEIGHTS), 0);
});

test('per game is 0 with no games', () => {
  assert.equal(perGame(10, 0), 0);
  assert.equal(perGame(10, 4), 2.5);
});

const games: Game[] = [
  { day: '2026-11-04', home: 'EDM', away: 'CGY', startUtc: '2026-11-05T02:00:00Z' },
  { day: '2026-11-06', home: 'VAN', away: 'EDM', startUtc: '2026-11-07T03:00:00Z' },
  { day: '2026-11-09', home: 'EDM', away: 'SEA', startUtc: '2026-11-10T02:00:00Z' },
];

test('games left counts only unstarted games through week end', () => {
  assert.equal(gamesLeft(games, 'EDM', '2026-11-04', '2026-11-08', new Date('2026-11-04T12:00:00Z')), 2);
  assert.equal(gamesLeft(games, 'EDM', '2026-11-04', '2026-11-08', new Date('2026-11-05T03:00:00Z')), 1);
  assert.equal(gamesLeft(games, 'TOR', '2026-11-04', '2026-11-08'), 0);
});

test('projected finish adds each starter fpg x games left', () => {
  assert.equal(projectedFinish(100, [{ fpg: 5, gamesLeft: 2 }, { fpg: 2.5, gamesLeft: 4 }]), 120);
});

test('lineup flags', () => {
  assert.equal(lineupFlag('C', false), 'NO GAME');
  assert.equal(lineupFlag('C', true), null);
  assert.equal(lineupFlag('BN', true), 'PLAYS');
  assert.equal(lineupFlag('BN', false), null);
  assert.equal(lineupFlag('IR', true), null);
});

test('hot/cold bands', () => {
  assert.equal(hotCold(6, 5), 'HOT');
  assert.equal(hotCold(3.9, 5), 'COLD');
  assert.equal(hotCold(5, 5), null);
  assert.equal(hotCold(5, 0), null);
});

test('team abbreviations and dates', () => {
  assert.equal(toNhlTeam('NJ'), 'NJD');
  assert.equal(toNhlTeam('edm'), 'EDM');
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.deepEqual(daysBetween('2026-11-02', '2026-11-04'), ['2026-11-02', '2026-11-03', '2026-11-04']);
  assert.equal(seasonStart('2027-02-10'), '2026-10-01');
  assert.equal(seasonStart('2026-11-04'), '2026-10-01');
});
