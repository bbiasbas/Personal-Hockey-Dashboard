import type { MatchupView } from '../server/views.ts';
import { fmtDay, StateCard } from './ui.tsx';
import { useApi } from './useApi.ts';

type Team = MatchupView['teams'][number];

function Side({ team, align }: { team: Team; align: 'left' | 'right' }) {
  return (
    <div className={`side ${align}`}>
      <div className={`overline ${team.isMine ? 'brand-text' : ''}`}>{team.isMine ? 'You' : 'Opponent'}</div>
      <div className="team-name">{team.name}</div>
      <div className={`score ${team.isMine ? '' : 'secondary'}`}>{team.points.toFixed(2)}</div>
      <div className="side-meta"><span className="secondary">Projected {team.projected.toFixed(1)}</span><span className="muted">{team.gamesLeft} games left</span></div>
    </div>
  );
}

function Starters({ team }: { team: Team }) {
  return (
    <table className="table">
      <thead>
        <tr className="section"><td colSpan={4}>{team.isMine ? 'Your starters' : 'Opponent starters'}</td></tr>
        <tr><th className="slot">Slot</th><th>Player</th><th className="num">Games left</th><th className="num">Week pts</th></tr>
      </thead>
      <tbody>
        {team.starters.map((p) => (
          <tr key={p.key}>
            <td className="slot">{p.slot}</td>
            <td className="name">{p.name}</td>
            <td className="num">{p.gamesLeft}</td>
            <td className="num strong">{p.weekPoints.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Matchup({ reloadKey }: { reloadKey: number }) {
  const { data, error } = useApi<MatchupView | null>('/api/matchup', reloadKey);
  if (error) return <StateCard title="Couldn't load your matchup" tone="negative">{error}</StateCard>;
  if (data === null) return <StateCard title="No data yet">Press Refresh to load your matchup from Yahoo.</StateCard>;
  if (!data) return null;

  const [me, opp] = data.teams;
  if (!me || !opp) return <StateCard title="No matchup this week">Yahoo has no opponent for your team this week (bye or off week).</StateCard>;
  const margin = me.projected - opp.projected;
  return (
    <>
      <div className="title-row">
        <h1>Matchup</h1>
        <span className="secondary">Week {data.week} · {fmtDay(data.weekStart)} – {fmtDay(data.weekEnd)} · {data.daysLeft} day{data.daysLeft === 1 ? '' : 's'} left</span>
      </div>
      <section className="card scoreboard">
        <div className="teams">
          <Side team={me} align="left" />
          <span className="vs">vs</span>
          <Side team={opp} align="right" />
        </div>
        <div className="bar" role="img" aria-label={`Projected share: you ${me.projected.toFixed(1)}, opponent ${opp.projected.toFixed(1)}`}>
          <span className="mine" style={{ flexGrow: Math.max(me.projected, 0.01) }} />
          <span style={{ flexGrow: Math.max(opp.projected, 0.01) }} />
        </div>
        <div className="caption">Projected finish: {margin >= 0 ? `you win by ${margin.toFixed(1)}` : `you lose by ${(-margin).toFixed(1)}`}</div>
      </section>
      <div className="two-col">
        <Starters team={me} />
        <Starters team={opp} />
      </div>
    </>
  );
}
