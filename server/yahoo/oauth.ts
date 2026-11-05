import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';

const TOKEN_FILE = new URL('../../.yahoo-token.json', import.meta.url);
type Token = { access_token: string; refresh_token: string; expires_at: number };

export class NotConnectedError extends Error {}

export const redirectUri = () => process.env.YAHOO_REDIRECT_URI || 'oob';
export const isConnected = () => existsSync(TOKEN_FILE);

export function authUrl() {
  const q = new URLSearchParams({ client_id: clientId(), redirect_uri: redirectUri(), response_type: 'code' });
  return `https://api.login.yahoo.com/oauth2/request_auth?${q}`;
}

function clientId() {
  const id = process.env.YAHOO_CLIENT_ID;
  if (!id || !process.env.YAHOO_CLIENT_SECRET) throw new NotConnectedError('Set YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET in .env');
  return id;
}

// Exchanges a login code or refresh token for a new token, and saves it.
export async function requestToken(params: Record<string, string>) {
  const basic = Buffer.from(`${clientId()}:${process.env.YAHOO_CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ redirect_uri: redirectUri(), ...params }),
  });
  if (!res.ok) throw new Error(`Yahoo sign-in failed (${res.status}): ${await res.text()}`);
  const body = await res.json();
  const token: Token = { access_token: body.access_token, refresh_token: body.refresh_token, expires_at: Date.now() + (body.expires_in - 60) * 1000 };
  await writeFile(TOKEN_FILE, JSON.stringify(token, null, 2));
  return token;
}

export async function accessToken() {
  if (!isConnected()) throw new NotConnectedError('Not connected to Yahoo yet. Run npm run yahoo:auth');
  let token: Token = JSON.parse(await readFile(TOKEN_FILE, 'utf8'));
  if (Date.now() >= token.expires_at) token = await requestToken({ grant_type: 'refresh_token', refresh_token: token.refresh_token });
  return token.access_token;
}
