import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WallPost } from '../types/wall';

export interface UseWallPhotoCarouselOptions {
  /**
   * Posts to rotate through, newest-first. Pass the array from `useWallPosts`
   * directly — the hook filters out posts without a `photoUrl` internally.
   */
  posts: WallPost[];
  /** Auto-rotation interval in ms. 0 disables rotation. Default 10000. */
  rotationMs?: number;
}

export interface UseWallPhotoCarouselResult {
  /** Posts that have a photoUrl, newest-first. */
  items: WallPost[];
  /** The currently displayed item, or null if nothing has a photo yet. */
  active: WallPost | null;
  /** Index of `active` in `items`. -1 if none. */
  activeIndex: number;
  /** Jump to a specific post id. Resets the rotation timer. */
  setActive: (id: string) => void;
}

/**
 * Headless rotating-photo carousel for the non-AI wall mode. Mirrors the
 * `useWallScenes` ergonomics ({ items, active, activeIndex, setActive }) but
 * is driven by guest posts instead of AI-generated scenes.
 *
 * Behaviour:
 * - First load: active = items[0] (the newest post with a photo).
 * - Rotation tick: advance one slot; wrap at the end.
 * - New post arrives (id not seen before): jump to that post and reset the
 *   rotation timer so the new arrival gets a full cycle on screen.
 * - Posts deleted upstream: drop from `items`; if the active item disappears,
 *   fall back to items[0].
 */
export function useWallPhotoCarousel(
  opts: UseWallPhotoCarouselOptions,
): UseWallPhotoCarouselResult {
  const rotationMs = opts.rotationMs ?? 10000;

  const items = useMemo(
    () => opts.posts.filter((p): p is WallPost & { photoUrl: string } => !!p.photoUrl),
    [opts.posts],
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const rotationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Mirror the live `items` ids into a ref so the rotation interval can read
  // the latest list without being torn down and recreated each render.
  const itemIdsRef = useRef<string[]>([]);

  const setActiveIdSync = useCallback((id: string | null) => {
    activeIdRef.current = id;
    setActiveId(id);
  }, []);

  const startRotation = useCallback(() => {
    if (rotationMs <= 0) return;
    if (rotationTimerRef.current) clearInterval(rotationTimerRef.current);
    rotationTimerRef.current = setInterval(() => {
      const ids = itemIdsRef.current;
      if (ids.length <= 1) return;
      const current = activeIdRef.current;
      const idx = current ? ids.indexOf(current) : -1;
      const next = ids[(idx + 1) % ids.length];
      activeIdRef.current = next;
      setActiveId(next);
    }, rotationMs);
  }, [rotationMs]);

  useEffect(() => {
    const ids = items.map(p => p.id);
    itemIdsRef.current = ids;
    const idSet = new Set(ids);

    if (seenIdsRef.current.size === 0 && ids.length > 0) {
      // First populated render — pin to the newest item and start rotation.
      seenIdsRef.current = new Set(ids);
      setActiveIdSync(ids[0]);
      startRotation();
      return;
    }

    const newIds = ids.filter(id => !seenIdsRef.current.has(id));
    newIds.forEach(id => seenIdsRef.current.add(id));

    if (newIds.length > 0) {
      // New arrival — jump to the first new id and reset the timer so it gets
      // a full cycle on screen.
      setActiveIdSync(newIds[0]);
      startRotation();
      return;
    }

    // No new ids; ensure active is still valid after upstream deletions.
    if (activeIdRef.current && !idSet.has(activeIdRef.current)) {
      setActiveIdSync(ids[0] ?? null);
      startRotation();
    }
  }, [items, setActiveIdSync, startRotation]);

  // Cleanup rotation timer on unmount.
  useEffect(() => {
    return () => {
      if (rotationTimerRef.current) clearInterval(rotationTimerRef.current);
    };
  }, []);

  const setActive = useCallback(
    (id: string) => {
      setActiveIdSync(id);
      startRotation();
    },
    [setActiveIdSync, startRotation],
  );

  const active = items.find(p => p.id === activeId) ?? items[0] ?? null;
  const activeIndex = active ? items.findIndex(p => p.id === active.id) : -1;

  return { items, active, activeIndex, setActive };
}
