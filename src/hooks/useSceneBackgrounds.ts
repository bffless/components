import { useCallback, useEffect, useState } from 'react';
import type { SceneBackground } from '../types/wall';

export interface UseSceneBackgroundsOptions {
  /** Endpoint that returns `{ backgrounds: SceneBackground[] }` and accepts POST/DELETE. Defaults to '/api/wall-scene-backgrounds'. */
  endpoint?: string;
  /** Skip the initial fetch (e.g. wait until isAdmin resolves). Default false. */
  skip?: boolean;
}

export interface UseSceneBackgroundsResult {
  backgrounds: SceneBackground[];
  refresh: () => Promise<void>;
  add: (input: { name: string; image_url: string; description: string }) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

/**
 * Admin scene-background CRUD. Currently only used by 3 of the 9 walls;
 * lifting it makes the feature trivial to enable on the others.
 */
export function useSceneBackgrounds(opts?: UseSceneBackgroundsOptions): UseSceneBackgroundsResult {
  const endpoint = opts?.endpoint ?? '/api/wall-scene-backgrounds';
  const skip = opts?.skip ?? false;
  const [backgrounds, setBackgrounds] = useState<SceneBackground[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(endpoint, { cache: 'no-store' });
      const data: { backgrounds?: SceneBackground[] } = await res.json();
      setBackgrounds(data.backgrounds ?? []);
    } catch {
      /* silent */
    }
  }, [endpoint]);

  useEffect(() => {
    if (skip) return;
    refresh();
  }, [skip, refresh]);

  const add = useCallback(
    async (input: { name: string; image_url: string; description: string }) => {
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
      });
      await refresh();
    },
    [endpoint, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await fetch(endpoint, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id }),
      });
      await refresh();
    },
    [endpoint, refresh],
  );

  return { backgrounds, refresh, add, remove };
}
