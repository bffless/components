import { useCallback, useEffect, useRef, useState } from 'react';
import type { WallPost } from '../types/wall';

export interface UseWallPostsOptions {
  /** Endpoint that returns `{ posts: WallPost[] }`. Defaults to '/api/wall'. */
  postsEndpoint?: string;
  /**
   * Poll interval in ms. Default 0 (no polling — only manual refresh).
   * Some demos poll posts every 10s for admins; pass 10000 in that case.
   */
  pollMs?: number;
}

export interface UseWallPostsResult {
  posts: WallPost[];
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Fetches and (optionally) polls wall posts. Returns the array, a loading
 * flag for the initial load, and a manual refresh handler.
 */
export function useWallPosts(opts?: UseWallPostsOptions): UseWallPostsResult {
  const postsEndpoint = opts?.postsEndpoint ?? '/api/wall';
  const pollMs = opts?.pollMs ?? 0;

  const [posts, setPosts] = useState<WallPost[]>([]);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(postsEndpoint, { cache: 'no-store' });
      const data: { posts?: WallPost[] } = await res.json();
      setPosts(data.posts ?? []);
    } catch {
      /* silent */
    }
  }, [postsEndpoint]);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    if (pollMs <= 0) return;
    pollRef.current = setInterval(() => {
      refresh();
    }, pollMs);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [pollMs, refresh]);

  return { posts, loading, refresh };
}
