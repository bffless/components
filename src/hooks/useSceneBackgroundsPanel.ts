import { useCallback, useState } from 'react';
import type { SceneBackground } from '../types/wall';
import { useSceneBackgrounds } from './useSceneBackgrounds';

export interface UseSceneBackgroundsPanelOptions {
  /**
   * UI guard — only enables the setter; the central endpoint enforces auth + ownership
   * regardless. When false, `submit()` is a no-op so non-admin consumers can render the
   * primitive read-only.
   */
  isAdmin?: boolean;
  /**
   * Per-site upload endpoint for the reference photo. Default `/api/uploads/wall-photos`.
   * Returns `{ url }`.
   */
  uploadEndpoint?: string;
  /**
   * Centrally hosted generation endpoint. Default `/api/admin/generate-wall-background`.
   * Auth-required + ownership-guarded. Charges 5 credits per generation.
   */
  generateEndpoint?: string;
  /**
   * Per-site backgrounds endpoint that lists/creates/deletes rows. Default
   * `/api/wall-scene-backgrounds`. The POST step is expected to download the
   * (temporary) Replicate URL into a stable upload schema before persisting.
   */
  backgroundsEndpoint?: string;
}

export interface SceneBackgroundsPanelState {
  /** The current list of backgrounds, newest-first. */
  backgrounds: SceneBackground[];
  /** Re-fetch the list. */
  refresh: () => Promise<void>;
  /** Delete one and refresh. */
  remove: (id: string) => Promise<void>;

  /** Title field (e.g. "The Bronx"). */
  name: string;
  setName: (v: string) => void;
  /** Prompt field — used as the Replicate prompt and stored as the row's description. */
  description: string;
  setDescription: (v: string) => void;
  /** Reference photo. */
  file: File | null;
  setFile: (f: File | null) => void;

  /** True when any of upload / generate / save are in flight. */
  generating: boolean;
  /** Human-readable progress label, e.g. "Generating scene with AI…". */
  status: string;
  /** Last error message, or empty string. */
  error: string;

  /** True when name + description + file are all populated and not currently generating. */
  canSubmit: boolean;
  /** Run the full upload → generate → save flow and refresh the list. */
  submit: () => Promise<void>;
  /** Clear name + description + file (does not clear the list). */
  reset: () => void;
}

const DEFAULT_UPLOAD = '/api/uploads/wall-photos';
const DEFAULT_GENERATE = '/api/admin/generate-wall-background';
const DEFAULT_BACKGROUNDS = '/api/wall-scene-backgrounds';

/**
 * Owns the form state + 3-step submission for the scene-background editor:
 *
 *   1. Upload reference photo to `uploadEndpoint` → URL.
 *   2. POST `{ name, description, sourceImageUrl }` to `generateEndpoint`
 *      (centrally credit-metered, returns a Replicate URL).
 *   3. POST `{ name, image_url, description }` to `backgroundsEndpoint`
 *      (the per-site rule downloads the Replicate URL and persists the row).
 *
 * Pair with `<SceneBackgroundsPanel>` for the headless render layer, or wire to
 * your own JSX directly using the returned state.
 */
export function useSceneBackgroundsPanel(
  opts?: UseSceneBackgroundsPanelOptions,
): SceneBackgroundsPanelState {
  const uploadEndpoint = opts?.uploadEndpoint ?? DEFAULT_UPLOAD;
  const generateEndpoint = opts?.generateEndpoint ?? DEFAULT_GENERATE;
  const backgroundsEndpoint = opts?.backgroundsEndpoint ?? DEFAULT_BACKGROUNDS;
  const isAdmin = opts?.isAdmin ?? false;

  const sceneBgs = useSceneBackgrounds({ endpoint: backgroundsEndpoint });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const reset = useCallback(() => {
    setName('');
    setDescription('');
    setFile(null);
  }, []);

  const remove = useCallback(
    async (id: string) => {
      await sceneBgs.remove(id);
      await sceneBgs.refresh();
    },
    [sceneBgs],
  );

  const submit = useCallback(async () => {
    if (!isAdmin) return;
    if (!file || !name.trim() || !description.trim()) return;
    setError('');
    setGenerating(true);
    try {
      // 1. Upload reference image
      setStatus('Uploading reference photo…');
      const fd = new FormData();
      fd.append('file', file);
      const upRes = await fetch(uploadEndpoint, {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });
      if (!upRes.ok) throw new Error('Upload failed');
      const upData: { url?: string } = await upRes.json();
      if (!upData.url) throw new Error('Upload returned no URL');
      const sourceImageUrl =
        typeof window !== 'undefined' && !upData.url.startsWith('http')
          ? window.location.origin + upData.url
          : upData.url;

      // 2. Generate via central pipeline
      setStatus('Generating scene with AI…');
      const genRes = await fetch(generateEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          sourceImageUrl,
        }),
      });
      if (!genRes.ok) {
        const errText = await genRes.text();
        if (errText.includes('NO_CREDITS')) throw new Error('Out of AI credits.');
        throw new Error('Generation failed.');
      }
      const genData: { image_url?: string } = await genRes.json();
      if (!genData.image_url) throw new Error('Generation returned no image.');

      // 3. Persist row (per-site rule downloads the Replicate URL)
      setStatus('Saving background…');
      const saveRes = await fetch(backgroundsEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          image_url: genData.image_url,
          description: description.trim(),
        }),
      });
      if (!saveRes.ok) throw new Error('Failed to save background.');

      await sceneBgs.refresh();
      reset();
      setStatus('Done!');
      setTimeout(() => setStatus(''), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setStatus('');
    } finally {
      setGenerating(false);
    }
  }, [
    isAdmin,
    file,
    name,
    description,
    uploadEndpoint,
    generateEndpoint,
    backgroundsEndpoint,
    sceneBgs,
    reset,
  ]);

  const canSubmit =
    isAdmin && !generating && !!file && name.trim().length > 0 && description.trim().length > 0;

  return {
    backgrounds: sceneBgs.backgrounds,
    refresh: sceneBgs.refresh,
    remove,
    name,
    setName,
    description,
    setDescription,
    file,
    setFile,
    generating,
    status,
    error,
    canSubmit,
    submit,
    reset,
  };
}
