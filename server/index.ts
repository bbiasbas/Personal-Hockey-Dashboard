import express, { type Request } from 'express';
import { ensureDb } from './db.ts';
import { refresh } from './refresh.ts';
import { isConnected, NotConnectedError } from './yahoo/oauth.ts';
import { yahooSource } from './yahoo/source.ts';
import { lastRefresh, lineupView, matchupView, waiversView, type Status } from './views.ts';

const app = express();
const PORT = 3001;

const route = (fn: (req: Request) => Promise<unknown>) => async (req: Request, res: express.Response) => {
  try {
    res.json(await fn(req));
  } catch (e) {
    res.status(e instanceof NotConnectedError ? 401 : 500).json({ error: (e as Error).message });
  }
};

async function status(): Promise<Status> {
  const yahooConnected = isConnected();
  try {
    await ensureDb();
    return { yahooConnected, db: 'ok', lastRefresh: await lastRefresh() };
  } catch (e) {
    return { yahooConnected, db: 'down', dbError: (e as Error).message, lastRefresh: null };
  }
}

// One refresh at a time; a second click waits for the running one.
let running: Promise<void> | null = null;

app.get('/api/status', route(status));
app.post('/api/refresh', route(async () => {
  running ??= refresh(yahooSource).finally(() => (running = null));
  await running;
  return status();
}));
app.get('/api/lineup', route((req) => lineupView(typeof req.query.day === 'string' ? req.query.day : undefined)));
app.get('/api/waivers', route(waiversView));
app.get('/api/matchup', route(matchupView));

app.listen(PORT, '127.0.0.1', () => console.log(`API on http://localhost:${PORT}`));
