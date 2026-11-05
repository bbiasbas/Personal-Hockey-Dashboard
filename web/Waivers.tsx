import { useState } from 'react';
import type { WaiverRow } from '../server/views.ts';
import { Badge, num, playerMeta, StateCard, StatusBadge } from './ui.tsx';
import { useApi } from './useApi.ts';

const POSITIONS = ['All', 'C', 'LW', 'RW', 'D', 'G'];
type SortKey = 'gamesLeft' | 'l30' | 'l7' | 'season' | 'score';
const COLUMNS: [SortKey, string][] = [['gamesLeft', 'Games left'], ['l30', 'L30 FP/G'], ['l7', 'L7'], ['season', 'Season FP/G'], ['score', 'Score']];

export function Waivers({ reloadKey }: { reloadKey: number }) {
  const [pos, setPos] = useState('All');
  const [sort, setSort] = useState<SortKey>('score');
  const { data, error } = useApi<WaiverRow[] | null>('/api/waivers', reloadKey);
  if (error) return <StateCard title="Couldn't load free agents" tone="negative">{error}</StateCard>;
  if (data === null) return <StateCard title="No data yet">Press Refresh to load free agents from Yahoo.</StateCard>;
  if (!data) return null;

  const rows = data.filter((p) => pos === 'All' || p.positions.includes(pos)).sort((a, b) => b[sort] - a[sort]);
  return (
    <>
      <div className="title-row">
        <div>
          <h1>Waivers</h1>
          <div className="caption">Score = L30 FP/G × games left this week</div>
        </div>
        <div className="chips">
          {POSITIONS.map((p) => <button key={p} className={`chip ${p === pos ? 'selected' : ''}`} onClick={() => setPos(p)}>{p}</button>)}
        </div>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th className="slot">#</th>
            <th>Player</th>
            {COLUMNS.map(([key, label]) => (
              <th key={key} className={`num sortable ${sort === key ? 'sorted' : ''}`} aria-sort={sort === key ? 'descending' : 'none'}>
                <button onClick={() => setSort(key)}>{label}{sort === key ? ' ▼' : ''}</button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={p.key}>
              <td className="slot muted">{i + 1}</td>
              <td><div className="name">{p.name} <StatusBadge status={p.status} /></div><div className="meta">{playerMeta(p.positions, p.team)}</div></td>
              <td className="num">{p.gamesLeft}</td>
              <td className="num">{num(p.l30)}</td>
              <td className="num secondary">{p.hotCold && <Badge tone={p.hotCold === 'HOT' ? 'positive' : 'neutral'}>{p.hotCold}</Badge>} {num(p.l7)}</td>
              <td className="num secondary">{num(p.season)}</td>
              <td className="num strong">{p.score.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
