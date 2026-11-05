import { test } from 'node:test';
import assert from 'node:assert/strict';
import { list, merge } from './api.ts';
import { parsePlayer } from './source.ts';

// Shape of one player in a Yahoo roster/stats response (format=json).
const yahooPlayer = [
  [
    { player_key: '465.p.6743' },
    { player_id: '6743' },
    { name: { full: 'Connor McDavid', first: 'Connor', last: 'McDavid' } },
    [],
    { editorial_team_abbr: 'Edm' },
    { display_position: 'C' },
    { eligible_positions: [{ position: 'C' }, { position: 'Util' }] },
  ],
  { selected_position: [{ coverage_type: 'date' }, { date: '2026-11-04' }, { position: 'C' }] },
  { player_stats: { coverage_type: 'season', stats: [{ stat: { stat_id: '1', value: '10' } }, { stat: { stat_id: '2', value: '-' } }] }, player_points: { coverage_type: 'season', total: '55.5' } },
];

test('parsePlayer reads info, slot and stats', () => {
  const { player, slot, line } = parsePlayer(yahooPlayer);
  assert.deepEqual(player, { key: '465.p.6743', name: 'Connor McDavid', positions: ['C'], nhlTeam: 'EDM', status: null });
  assert.equal(slot, 'C');
  assert.deepEqual(line, { points: 55.5, stats: { '1': 10, '2': 0 } });
});

test('list and merge unwrap Yahoo collections', () => {
  assert.deepEqual(list({ '0': { team: 'a' }, '1': { team: 'b' }, count: 2 }, 'team'), ['a', 'b']);
  assert.deepEqual(list([], 'player'), []);
  assert.deepEqual(merge([{ a: 1 }, [{ b: 2 }]]), { a: 1, b: 2 });
});
