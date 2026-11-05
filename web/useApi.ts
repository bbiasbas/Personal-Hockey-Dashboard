import { useEffect, useState } from 'react';

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body as T;
}

// Loads a GET endpoint; changing reloadKey fetches again.
export function useApi<T>(url: string, reloadKey = 0) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    api<T>(url).then(
      (data) => live && setState({ data, loading: false }),
      (e: Error) => live && setState({ error: e.message, loading: false }),
    );
    return () => {
      live = false;
    };
  }, [url, reloadKey]);
  return state;
}
