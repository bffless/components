import { useCallback, useEffect, useRef, useState } from 'react';
import type { WallScene } from '../types/wall';

export interface UseWallScenesOptions {
  /** Endpoint that returns `{ scenes: WallScene[] }` newest-first. Defaults to '/api/wall-scenes'. */
  scenesEndpoint?: string;
  /** Public scene poll interval. 0 disables polling. Default 10000. */
  pollMs?: number;
  /** Auto-rotation interval. 0 disables rotation. Default 10000. */
  rotationMs?: number;
}

export interface UseWallScenesResult {
  scenes: WallScene[];
  activeScene: WallScene | null;
  /** Index of the active scene in the (newest-first) `scenes` array — useful for thumbnail highlight. */
  activeSceneIndex: number;
  /** Jump rotation to a specific scene; resets the rotation timer. */
  setActiveScene: (id: string) => void;
  /** Re-fetch scenes (used after creating one). */
  refresh: () => Promise<void>;
}

/**
 * Manages the wall scene list, public polling, and the auto-rotating slideshow
 * with new-arrival interrupt logic for TV/live wall mode.
 *
 * Behaviour:
 * - `scenes` is the raw list (newest-first) returned by `scenesEndpoint`. Updated on poll.
 * - On hard reload: rotation order = scenes order; `activeScene` starts at scenes[0].
 * - On 10s rotation tick: advance to the next id in `playOrder`, wrapping at the end.
 * - When poll detects new ids: insert them right after the currently displayed scene
 *   in `playOrder`, jump display to the first new scene (interrupt), and reset the
 *   rotation timer so the new scene gets a full cycle. Thumbnail order (= scenes
 *   array) keeps showing newest first — the rotation order is independent.
 * - Deleted scenes are pruned from `playOrder`.
 */
export function useWallScenes(opts?: UseWallScenesOptions): UseWallScenesResult {
  const scenesEndpoint = opts?.scenesEndpoint ?? '/api/wall-scenes';
  const pollMs = opts?.pollMs ?? 10000;
  const rotationMs = opts?.rotationMs ?? 10000;

  const [scenes, setScenes] = useState<WallScene[]>([]);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);

  const playOrderRef = useRef<string[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const activeSceneIdRef = useRef<string | null>(null);
  const rotationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scenePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setActiveSceneIdSync = useCallback((id: string | null) => {
    activeSceneIdRef.current = id;
    setActiveSceneId(id);
  }, []);

  const startRotation = useCallback(() => {
    if (rotationMs <= 0) return;
    if (rotationTimerRef.current) clearInterval(rotationTimerRef.current);
    rotationTimerRef.current = setInterval(() => {
      const order = playOrderRef.current;
      if (order.length <= 1) return;
      const current = activeSceneIdRef.current;
      const idx = current ? order.indexOf(current) : -1;
      const next = order[(idx + 1) % order.length];
      activeSceneIdRef.current = next;
      setActiveSceneId(next);
    }, rotationMs);
  }, [rotationMs]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(scenesEndpoint, { cache: 'no-store' });
      const data: { scenes?: WallScene[] } = await res.json();
      const newScenes = data.scenes ?? [];
      setScenes(newScenes);

      const allIds = newScenes.map(s => s.id);
      const existingIdSet = new Set(allIds);

      if (seenIdsRef.current.size === 0) {
        // First load: rotation order = scenes order (newest-first).
        playOrderRef.current = allIds.slice();
        seenIdsRef.current = new Set(allIds);
        if (allIds.length > 0) {
          setActiveSceneIdSync(allIds[0]);
          startRotation();
        }
      } else {
        const newIds = allIds.filter(id => !seenIdsRef.current.has(id));
        const cleanedOrder = playOrderRef.current.filter(id =>
          existingIdSet.has(id),
        );

        if (newIds.length > 0) {
          // Insert new ids right after the currently displayed scene, then
          // interrupt rotation by jumping to the first new id.
          const currentId = activeSceneIdRef.current;
          const insertAfter = currentId
            ? cleanedOrder.indexOf(currentId)
            : -1;
          const head = cleanedOrder.slice(0, insertAfter + 1);
          const tail = cleanedOrder.slice(insertAfter + 1);
          playOrderRef.current = [...head, ...newIds, ...tail];
          newIds.forEach(id => seenIdsRef.current.add(id));
          setActiveSceneIdSync(newIds[0]);
          startRotation(); // reset timer so the new scene gets a full cycle
        } else {
          playOrderRef.current = cleanedOrder;
          // If the active scene was deleted, fall back to the first one.
          if (
            activeSceneIdRef.current &&
            !existingIdSet.has(activeSceneIdRef.current)
          ) {
            const first = cleanedOrder[0] || null;
            setActiveSceneIdSync(first);
            startRotation();
          }
        }
      }
    } catch {
      /* network errors are silent — we'll retry on the next poll */
    }
  }, [scenesEndpoint, setActiveSceneIdSync, startRotation]);

  // Initial fetch + public scene poll.
  useEffect(() => {
    refresh();
    if (pollMs > 0) {
      scenePollRef.current = setInterval(() => {
        refresh();
      }, pollMs);
    }
    return () => {
      if (scenePollRef.current) clearInterval(scenePollRef.current);
    };
  }, [refresh, pollMs]);

  // Cleanup rotation timer on unmount.
  useEffect(() => {
    return () => {
      if (rotationTimerRef.current) clearInterval(rotationTimerRef.current);
    };
  }, []);

  const setActiveScene = useCallback(
    (id: string) => {
      setActiveSceneIdSync(id);
      startRotation();
    },
    [setActiveSceneIdSync, startRotation],
  );

  const activeScene =
    scenes.find(s => s.id === activeSceneId) ?? scenes[0] ?? null;
  const activeSceneIndex = activeScene
    ? scenes.findIndex(s => s.id === activeScene.id)
    : 0;

  return {
    scenes,
    activeScene,
    activeSceneIndex,
    setActiveScene,
    refresh,
  };
}
