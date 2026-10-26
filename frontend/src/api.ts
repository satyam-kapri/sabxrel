import { useEffect, useState } from 'react';

export function useApi<T>(path: string, revision = 0) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null });
  useEffect(() => {
    const controller = new AbortController();
    setState({ data: null, loading: true, error: null });
    fetch(path, { signal: controller.signal }).then(async response => {
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(typeof body.detail === 'string' ? body.detail : `Request failed (${response.status}). Please check the selected filters.`);
      }
      return response.json() as Promise<T>;
    }).then(data => {
      if (!controller.signal.aborted) setState({ data, loading: false, error: null });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ data: null, loading: false, error: error.message || 'Unable to reach the server.' });
    });
    return () => controller.abort();
  }, [path, revision]);
  return state;
}
