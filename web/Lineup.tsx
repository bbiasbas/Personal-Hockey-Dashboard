import { useState } from 'react';
import { BENCH_SLOTS, IR_SLOTS } from '../server/logic.ts';
import type { LineupView } from '../server/views.ts';
import { Badge, fmtDay, fmtTime, num, playerMeta, StateCard, StatusBadge } from './ui.tsx';
import { api, useApi } from './useApi.ts';

type Row = LineupView['players'][number];

export function Lineup({ reloadKey }: { reloadKey: number }) {
  const [day, setDay] = useState<string>();
  const [saved, setSaved] = useState(0);
  const [markError, setMarkError] = useState<string>();
  const { data, error } = useApi<LineupView | null>(`/api/lineup${day ? `?day=${day}` : ''}`, reloadKey + saved); // both only go up, so any change refetches
  if (error) return <StateCard title="Couldn't load your lineup" tone="negative">{error}</StateCard>;
  if (data === null) return <StateCard title="No data yet">Press Refresh to load your team from Yahoo.</StateCard>;
  if (!data) return null;

  async function toggle(p: Row) {
    setMarkError(undefined);
    try {
      await api(`/api/streamers/${encodeURIComponent(p.key)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ marked: p.streamer !== 'marked' }) });
      setSaved((n) => n + 1);
    } catch (e) {
      setMarkError((e as Error).message);
    }
  }

  const i = data.days.indexOf(data.day);
  const noGame = data.players.filter((p) => p.flag === 'NO GAME').length;
  const plays = data.players.filter((p) => p.flag === 'PLAYS').length;
  const sections: [string, Row[]][] = [
    ['Starters', data.players.filter((p) => !BENCH_SLOTS.includes(p.slot))],
    ['Bench', data.players.filter((p) => p.slot === 'BN')],
    ['Injured reserve', data.players.filter((p) => IR_SLOTS.includes(p.slot))],
  ];

  return (
    <>
      <div className="title-row">
        <div className="title-left">
          <h1>Lineup</h1>
          <div className="day-nav">
            <button aria-label="Previous day" disabled={i <= 0} onClick={() => setDay(data.days[i - 1])}>‹</button>
            <span>{fmtDay(data.day)}</span>
            <button aria-label="Next day" disabled={i >= data.days.length - 1} onClick={() => setDay(data.days[i + 1])}>›</button>
          </div>
        </div>
        <div className="summary">
          {noGame > 0 && <Badge tone="negative">{noGame} STARTER{noGame > 1 ? 'S' : ''} WITHOUT A GAME</Badge>}
          {plays > 0 && <Badge tone="positive">{plays} BENCH PLAYER{plays > 1 ? 'S' : ''} PLAY{plays > 1 ? '' : 'S'}</Badge>}
        </div>
      </div>
      {markError && <div className="banner negative">Couldn't save the streamer slot: {markError}</div>}
      <table className="table">
        <thead>
          <tr><th className="slot">Slot</th><th>Player</th><th>Tonight</th><th className="num">L30 FP/G</th><th className="num">Season FP/G</th><th className="num">Flag</th><th className="num">Streamer</th></tr>
        </thead>
        {sections.filter(([, rows]) => rows.length).map(([label, rows]) => (
          <tbody key={label}>
            <tr className="section"><td colSpan={7}>{label}</td></tr>
            {rows.map((p) => (
              <tr key={p.key}>
                <td className="slot">{p.slot}</td>
                <td><div className="name">{p.name} <StatusBadge status={p.status} /></div><div className="meta">{playerMeta(p.positions, p.team)}</div></td>
                <td className={p.tonight ? 'secondary' : 'muted'}>{p.tonight ? `${p.tonight.home ? 'vs' : '@'} ${p.tonight.opponent} ${fmtTime(p.tonight.startUtc)}` : '—'}</td>
                <td className="num strong">{num(p.l30)}</td>
                <td className="num">{num(p.season)}</td>
                <td className="num">{p.flag && <Badge tone={p.flag === 'PLAYS' ? 'positive' : 'negative'}>{p.flag}</Badge>}</td>
                <td className="num">
                  {IR_SLOTS.includes(p.slot) ? null : p.streamer === 'added' ? (
                    <span className="caption" title="Added this week, so the Streaming Center may drop him">Added this week</span>
                  ) : (
                    <button className={`chip ${p.streamer === 'marked' ? 'selected' : ''}`} aria-pressed={p.streamer === 'marked'} onClick={() => toggle(p)}>
                      {p.streamer === 'marked' ? 'Streamer ✓' : 'Streamer'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </>
  );
}
