import { useState } from 'react';
import type { StreamingView } from '../server/views.ts';
import { Badge, fmtDay, num, playerMeta, StateCard, type Tone } from './ui.tsx';
import { useApi } from './useApi.ts';

type PlanMove = NonNullable<StreamingView['plan']>['moves'][number];
type DayRow = NonNullable<StreamingView['dayView']>['rows'][number];

const short = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
const head = (day: string) => `${short(day).toUpperCase()} ${Number(day.slice(8))}`;
const long = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
const pts = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Goalie start, waiver claim or "in plan", as shown in the design's status badges.
function status(r: { claim: string | null; startStatus?: string | null; goalieStart?: string | null; inPlan?: string | null }): [string, Tone] | null {
  const start = r.startStatus ?? r.goalieStart;
  if (start === 'Confirmed' || start === 'Likely') return [`${start} start`, 'positive'];
  if (start === 'Projected') return ['Projected, not counted', 'neutral'];
  if (start === 'Unconfirmed') return ['Unconfirmed, not counted', 'neutral'];
  if (start === 'Not starting') return ['Not starting', 'negative'];
  if (r.claim) return [`Claim, not guaranteed · clears ${short(r.claim)}`, 'warning'];
  if (r.inPlan) return ['In plan', 'neutral'];
  return null;
}

function Move({ m }: { m: PlanMove }) {
  const s = status({ ...m.add, goalieStart: m.goalieStart });
  const reason = [
    `${plural(m.startDays.length, 'open start')}${m.startDays.length ? ` (${m.startDays.map(short).join(', ')})` : ''}`,
    `L30 ${num(m.l30)} FP/G`,
    m.opponents.join(', '),
  ].filter(Boolean).join(' · ');
  return (
    <div className="move">
      <div className="move-top">
        <span className="overline">{fmtDay(m.day)}</span>
        {s && <Badge tone={s[1]}>{s[0]}</Badge>}
        <span className="move-gain">{pts(m.gain)} pts</span>
      </div>
      <div className="move-add">Add {m.add.name} · {playerMeta(m.add.positions, m.add.team)}</div>
      <div className="secondary">{m.drop ? `Drop ${m.drop.name} · streamer slot (${m.drop.reason})` : 'No drop · empty roster spot (free stream)'}</div>
      <div className="caption">{reason}</div>
    </div>
  );
}

export function Streaming({ reloadKey }: { reloadKey: number }) {
  const [day, setDay] = useState<string>();
  const { data, error } = useApi<StreamingView | null>(`/api/streaming${day ? `?day=${day}` : ''}`, reloadKey);
  if (error) return <StateCard title="Couldn't load the Streaming Center" tone="negative">{error}</StateCard>;
  if (data === null) return <StateCard title="No data yet">Press Refresh to load your team from Yahoo.</StateCard>;
  if (!data) return null;

  const { plan, dayView, grid } = data;
  const streamerLine = [
    ...data.streamers.map((s) => `${s.name} (${s.reason})`),
    ...(data.emptySpots ? [plural(data.emptySpots, 'empty roster spot')] : []),
  ];
  const emptyPlan =
    data.addsLeft === 0 ? 'No adds left this week.'
    : !streamerLine.length ? 'No streamer slots yet. Mark the players you can drop on the Lineup tab, then Refresh.'
    : 'No stream beats your current roster for the rest of this week.';

  return (
    <>
      <div className="title-row">
        <div className="title-stack">
          <h1>Streaming Center</h1>
          <div className="caption">Week {data.week} ({fmtDay(data.weekStart)} – {fmtDay(data.weekEnd)}) · projections are L30 FP/G per open start, ±15% for opponent strength</div>
          <div className="secondary small">Streamer slots: {streamerLine.length ? streamerLine.join(' · ') : 'none marked'}</div>
        </div>
        <div className="stats">
          <div className="stat-box">
            <span className="overline">Adds left</span>
            <span className="stat-value">{data.maxAdds == null ? 'No limit' : `${data.addsLeft} of ${data.maxAdds}`}</span>
            <span className="caption">{plan ? `plan uses ${plan.moves.length}` : 'no plan yet'}</span>
          </div>
          <div className="stat-box">
            <span className="overline">Plan net gain</span>
            <span className="stat-value positive">{pts(plan?.gain ?? 0)}</span>
            <span className="caption">pts this week</span>
          </div>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Open starts with your current roster</h2>
          <span className="caption">Empty active slots after your bench fills in. Pick a day to open the day view.</span>
        </div>
        <div className="grid-scroll">
          <table className="grid">
            <thead>
              <tr>
                <th className="pos">Pos</th>
                {grid.days.map((g) => (
                  <th key={g.day} className={`${g.day === dayView?.day ? 'selected' : ''} ${g.past ? 'past' : ''}`}>
                    <button disabled={g.past} onClick={() => setDay(g.day)} aria-pressed={g.day === dayView?.day}>
                      <span className="overline">{head(g.day)}</span>
                      <span className="caption">{plural(g.games, 'game')}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.slots.map((slot) => (
                <tr key={slot}>
                  <td className="pos">{slot}</td>
                  {grid.days.map((g) => (
                    <td key={g.day} className={`${g.day === dayView?.day ? 'selected' : ''} ${g.past ? 'past' : ''}`}>
                      {g.open[slot] ? <span className="open">{g.open[slot]} open</span> : <span className="muted">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="stream-cols">
        <section className="plan">
          <div>
            <h2 className="title">Week plan</h2>
            <div className="caption">Best combination found for your {plural(data.addsLeft, 'add')} left. Make the moves in Yahoo, then Refresh.</div>
          </div>
          {plan?.moves.length ? plan.moves.map((m) => <Move key={`${m.day}-${m.add.key}`} m={m} />) : <div className="move secondary">{plan ? emptyPlan : 'Press Refresh to build this week’s plan.'}</div>}
          {plan?.kept && <div className="caption">Kept from the previous Refresh: the new plan was only {pts(plan.kept.newGain)} pts (needs 2 more than this one).</div>}
          {plan && !plan.complete && <div className="caption">The search ran out of time, so this is the best plan found, not guaranteed the best.</div>}
          <div className="caption">Changed your streamer slots? Refresh to plan again.</div>
        </section>

        <section className="card day-view">
          <div className="card-head">
            <div>
              <h2>Day view · {dayView ? long(dayView.day) : '—'}</h2>
              {dayView && <div className="caption">{plural(dayView.games, 'NHL game')} · roster after the plan's earlier moves</div>}
            </div>
          </div>
          <table className="table flat">
            <thead>
              <tr><th className="slot">Slot</th><th>Best stream</th><th>Opponent</th><th className="num">Proj</th><th>Status</th></tr>
            </thead>
            <tbody>
              {dayView?.rows.length ? dayView.rows.map((r: DayRow) => {
                const s = status(r);
                return (
                  <tr key={r.key}>
                    <td className="slot">{r.slot}</td>
                    <td><div className="name">{r.name}</div><div className="meta">{playerMeta(r.positions, r.team)} · {r.inPlan ? `in plan (${short(r.inPlan)})` : r.claim ? 'on waivers' : 'free agent'}</div></td>
                    <td className="secondary">{r.opp}</td>
                    <td className="num strong">{num(r.shown)}</td>
                    <td>{s ? <Badge tone={s[1]}>{s[0]}</Badge> : <span className="muted">—</span>}</td>
                  </tr>
                );
              }) : <tr><td colSpan={5} className="muted">No open starts this day.</td></tr>}
            </tbody>
          </table>
          <div className="foot caption">
            Goalie starts count only when DailyFaceoff marks them Confirmed or Likely{data.goaliesReported ? '' : ' (no report loaded yet)'}. Games already under way are skipped.
          </div>
        </section>
      </div>
    </>
  );
}
