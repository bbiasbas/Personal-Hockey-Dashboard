import { useState } from 'react';
import type { Status } from '../server/views.ts';
import { Lineup } from './Lineup.tsx';
import { Matchup } from './Matchup.tsx';
import { StateCard } from './ui.tsx';
import { api, useApi } from './useApi.ts';
import { Waivers } from './Waivers.tsx';

const TABS = ['Lineup', 'Waivers', 'Matchup'] as const;
type Tab = (typeof TABS)[number];

function ago(iso: string) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return 'just now';
  return min < 60 ? `${min} min ago` : `${Math.round(min / 60)} h ago`;
}

export function App() {
  const [tab, setTab] = useState<Tab>('Lineup');
  const [reload, setReload] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string>();
  const status = useApi<Status>('/api/status', reload);
  const s = status.data;

  async function refresh() {
    setRefreshing(true);
    setRefreshError(undefined);
    try {
      await api('/api/refresh', { method: 'POST' });
    } catch (e) {
      setRefreshError((e as Error).message);
    } finally {
      setRefreshing(false);
      setReload((n) => n + 1);
    }
  }

  let body;
  if (status.error) {
    body = <StateCard title="Can't reach the dashboard server" tone="negative">Start it with <code>npm run dev</code>. ({status.error})</StateCard>;
  } else if (!s) {
    body = null;
  } else if (!s.yahooConnected) {
    body = (
      <StateCard title="Connect your Yahoo league" action={{ label: 'Check again', onClick: () => setReload((n) => n + 1) }}>
        Run <code>npm run yahoo:auth</code> in a terminal, approve access in the browser, then paste the code back. You only do this once.
      </StateCard>
    );
  } else if (s.db === 'down') {
    body = (
      <StateCard title="Can't reach the database" tone="negative" action={{ label: 'Try again', onClick: () => setReload((n) => n + 1) }}>
        Postgres isn't running. Start Docker Desktop, run <code>npm run db:up</code> in the project folder, then press Refresh.
      </StateCard>
    );
  } else if (refreshing) {
    body = (
      <StateCard title="Refreshing your data">
        Pulling your roster, matchup and free agents from Yahoo, and the schedule from the NHL.
        <div className="progress" />
      </StateCard>
    );
  } else if (!s.lastRefresh) {
    body = <StateCard title="No data yet" action={{ label: 'Refresh', onClick: refresh }}>Press Refresh to load your team from Yahoo.</StateCard>;
  } else {
    body = tab === 'Lineup' ? <Lineup reloadKey={reload} /> : tab === 'Waivers' ? <Waivers reloadKey={reload} /> : <Matchup reloadKey={reload} />;
  }

  const problem = refreshError ?? s?.lastRefresh?.error;
  return (
    <>
      <header className="app-header">
        <div className="header-left">
          <span className="brand">Fantasy Hockey</span>
          <nav className="tabs">
            {TABS.map((t) => (
              <button key={t} className={`tab ${t === tab ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
            ))}
          </nav>
        </div>
        <div className="header-right">
          <span className="caption">{s?.lastRefresh ? `Updated ${ago(s.lastRefresh.finishedAt)}` : 'Never updated'}</span>
          <button className={`btn ${refreshing ? 'secondary' : 'primary'}`} onClick={refresh} disabled={refreshing || !s?.yahooConnected || s?.db !== 'ok'}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>
      {problem && !refreshing && <div className="banner negative">Last refresh failed: {problem}</div>}
      {!!s?.lastRefresh?.warnings.length && !refreshing && (
        <details className="banner warning">
          <summary>{s.lastRefresh.warnings.length} data warning(s)</summary>
          <ul>{s.lastRefresh.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </details>
      )}
      <main className="body">{body}</main>
    </>
  );
}
