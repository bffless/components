import { useCallback, useState } from 'react';
import type { RefObject } from 'react';
import type { SceneBackground } from '../types/wall';

export interface WallSubmitInput {
  name: string;
  email: string;
  message: string;
  photoUrl: string;
}

export interface UseWallSubmitOptions {
  /** Reference to the in-memory wall token from `useWallToken`. */
  tokenRef: RefObject<string | null>;
  /** True when the URL carried a token; only then will the AI scene step run. */
  aiEnabled: boolean;
  /** Backgrounds list — one is picked at random for each generation. */
  backgrounds: SceneBackground[];
  /** Defaults: '/api/wall', '/api/generate-wall-scene', '/api/wall-scenes'. */
  postEndpoint?: string;
  generateEndpoint?: string;
  scenesEndpoint?: string;
  /** Called after a successful post (use this to refresh the post list). */
  onPostCreated?: () => void;
  /** Called after a successful AI scene generation (use to refresh scenes). */
  onSceneCreated?: () => void;
}

export interface UseWallSubmitResult {
  submit: (post: WallSubmitInput) => Promise<void>;
  submitting: boolean;
  /** True for ~3s after a successful post — useful for a transient "Posted!" badge. */
  submitted: boolean;
  generating: boolean;
  generationStatus: string;
  creditsExhausted: boolean;
}

const SUBMITTED_FLASH_MS = 3000;

/**
 * Wraps the standard wall posting flow:
 *   1. POST /api/wall to persist the message + photo.
 *   2. Optionally POST /api/generate-wall-scene (only when `aiEnabled`) to
 *      kick off the credit-metered AI scene generation, passing the in-memory
 *      token from `useWallToken`.
 *   3. POST /api/wall-scenes to persist the generated scene.
 *
 * The hook handles the credits-exhausted signal (`NO_CREDITS` in the response
 * body), the transient submitted/generating UI flags, and the optional
 * onPostCreated / onSceneCreated callbacks for the consumer to refresh state.
 */
export function useWallSubmit(opts: UseWallSubmitOptions): UseWallSubmitResult {
  const postEndpoint = opts.postEndpoint ?? '/api/wall';
  const generateEndpoint = opts.generateEndpoint ?? '/api/generate-wall-scene';
  const scenesEndpoint = opts.scenesEndpoint ?? '/api/wall-scenes';

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  const [creditsExhausted, setCreditsExhausted] = useState(false);

  const submit = useCallback(
    async (post: WallSubmitInput) => {
      const { name, email, message, photoUrl } = post;
      if (!name.trim() || !email.trim() || !message.trim() || !photoUrl) {
        return;
      }

      setSubmitting(true);
      try {
        const posterName = name.trim();
        const posterEmail = email.trim();
        const posterMessage = message.trim();
        const posterPhotoUrl = photoUrl;

        const res = await fetch(postEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: posterName,
            email: posterEmail,
            message: posterMessage,
            photoUrl: posterPhotoUrl,
          }),
        });
        if (!res.ok) throw new Error('Failed');

        opts.onPostCreated?.();
        setSubmitted(true);
        setTimeout(() => setSubmitted(false), SUBMITTED_FLASH_MS);
        setSubmitting(false);

        // AI scene generation runs only when token was captured from URL.
        if (opts.aiEnabled && !creditsExhausted && opts.backgrounds.length > 0) {
          setGenerating(true);
          setGenerationStatus('Creating your AI scene...');
          try {
            const bg = opts.backgrounds[Math.floor(Math.random() * opts.backgrounds.length)];
            const origin = window.location.origin;
            const fullPhotoUrl = posterPhotoUrl.startsWith('http')
              ? posterPhotoUrl
              : origin + posterPhotoUrl;
            const fullBgUrl = bg.image_url.startsWith('http')
              ? bg.image_url
              : origin + bg.image_url;

            const genRes = await fetch(generateEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                posterName,
                userEmail: posterEmail,
                message: posterMessage,
                photoUrl: fullPhotoUrl,
                backgroundUrl: fullBgUrl,
                backgroundDescription: bg.description,
                token: opts.tokenRef.current || '',
              }),
            });

            if (!genRes.ok) {
              const errText = await genRes.text();
              if (errText.includes('NO_CREDITS')) {
                setCreditsExhausted(true);
              }
              throw new Error('Generation failed');
            }

            const genData: {
              success?: boolean;
              image_url?: string;
              credits_remaining?: number;
            } = await genRes.json();

            if (genData.success && genData.image_url) {
              setGenerationStatus('Saving scene...');
              await fetch(scenesEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  scene_name: bg.name,
                  image_url: genData.image_url,
                  poster_name: posterName,
                }),
              });

              if (
                genData.credits_remaining !== undefined &&
                genData.credits_remaining <= 0
              ) {
                setCreditsExhausted(true);
              }

              opts.onSceneCreated?.();
            }
          } catch {
            // Scene generation failed — wall post was already saved.
          } finally {
            setGenerating(false);
            setGenerationStatus('');
          }
        }
      } catch {
        setSubmitting(false);
      }
    },
    [
      postEndpoint,
      generateEndpoint,
      scenesEndpoint,
      creditsExhausted,
      opts.aiEnabled,
      opts.tokenRef,
      opts.backgrounds,
      opts.onPostCreated,
      opts.onSceneCreated,
    ],
  );

  return {
    submit,
    submitting,
    submitted,
    generating,
    generationStatus,
    creditsExhausted,
  };
}
