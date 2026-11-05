import { accessToken } from './oauth.ts';

// Yahoo's JSON is deeply nested and irregular; the parsers in source.ts pick fields out of it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Y = any;

export async function yahoo(path: string): Promise<Y> {
  const url = `https://fantasysports.yahooapis.com/fantasy/v2/${path}${path.includes('?') ? '&' : '?'}format=json`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken()}` } });
  if (!res.ok) throw new Error(`Yahoo ${res.status} for ${path}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).fantasy_content;
}

// Yahoo writes objects as arrays of one-key objects: [{player_key}, {name}, ...] -> {player_key, name, ...}
export function merge(parts: Y): Y {
  if (!Array.isArray(parts)) return parts ?? {};
  return Object.assign({}, ...parts.flat().filter((p: Y) => p && typeof p === 'object' && !Array.isArray(p)));
}

// Yahoo writes lists as {"0": {player: ...}, "1": {...}, count: 2} -> [player, player]
export function list(coll: Y, key: string): Y[] {
  if (!coll || typeof coll !== 'object') return [];
  return Object.keys(coll).filter((k) => k !== 'count').map((k) => coll[k]?.[key]).filter(Boolean);
}
