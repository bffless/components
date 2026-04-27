// Hooks (state + side effects, no styling concerns)
export { useWallToken } from './hooks/useWallToken';
export type {
  UseWallTokenOptions,
  UseWallTokenResult,
  WallTokenAdmin,
} from './hooks/useWallToken';

export { useWallScenes } from './hooks/useWallScenes';
export type {
  UseWallScenesOptions,
  UseWallScenesResult,
} from './hooks/useWallScenes';

export { useWallPosts } from './hooks/useWallPosts';
export type {
  UseWallPostsOptions,
  UseWallPostsResult,
} from './hooks/useWallPosts';

export { useWallSubmit } from './hooks/useWallSubmit';
export type {
  UseWallSubmitOptions,
  UseWallSubmitResult,
  WallSubmitInput,
} from './hooks/useWallSubmit';

export { usePhotoCapture } from './hooks/usePhotoCapture';
export type {
  UsePhotoCaptureOptions,
  UsePhotoCaptureResult,
} from './hooks/usePhotoCapture';

export { useSceneBackgrounds } from './hooks/useSceneBackgrounds';
export type {
  UseSceneBackgroundsOptions,
  UseSceneBackgroundsResult,
} from './hooks/useSceneBackgrounds';

export { useAdminAccess } from './hooks/useAdminAccess';
export type {
  UseAdminAccessOptions,
  UseAdminAccessResult,
  AdminAccessMethod,
  SessionUser,
  SessionData,
} from './hooks/useAdminAccess';

// Headless primitives (className-pass-through; lib never imports a CSS framework)
export { PhotoboothBanner } from './primitives/Wall/PhotoboothBanner';
export type { PhotoboothBannerProps } from './primitives/Wall/PhotoboothBanner';

export { TokenPanel } from './primitives/Wall/TokenPanel';
export type {
  TokenPanelProps,
  TokenPanelClassNames,
  TokenPanelCopy,
} from './primitives/Wall/TokenPanel';

// Helpers
export {
  generateToken,
  sanitizeTokenInput,
  TOKEN_ALPHABET,
  TOKEN_INPUT_PATTERN,
  TOKEN_VALID_PATTERN,
} from './lib/token';

// Types
export type { WallPost, WallScene, SceneBackground } from './types/wall';
