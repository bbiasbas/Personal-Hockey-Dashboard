import type { ReactNode } from 'react';

export type Tone = 'positive' | 'negative' | 'warning' | 'neutral';

export const Badge = ({ tone, children }: { tone: Tone; children: ReactNode }) => <span className={`badge ${tone}`}>{children}</span>;

// Yahoo status: DTD is day-to-day (yellow); O, IR, IR-LT, NA etc. are out (red).
export const StatusBadge = ({ status }: { status: string | null }) => (status ? <Badge tone={status === 'DTD' ? 'warning' : 'negative'}>{status}</Badge> : null);

export function StateCard({ title, children, tone, action }: { title: string; children: ReactNode; tone?: 'negative'; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="state">
      <div className={`state-card ${tone ?? ''}`}>
        <h2>{title}</h2>
        <div className="state-text">{children}</div>
        {action && <button className="btn primary" onClick={action.onClick}>{action.label}</button>}
      </div>
    </div>
  );
}

export const num = (n: number) => n.toFixed(2);
export const fmtDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
export const playerMeta = (positions: string[], team: string) => `${positions.join(',')} · ${team}`;
