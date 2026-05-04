// Hooks (state + side effects, no styling concerns)
export { useWallToken } from './hooks/useWallToken';
export type {
  UseWallTokenOptions,
  UseWallTokenResult,
  WallTokenAdmin,
} from './hooks/useWallToken';

export { useWallSettings } from './hooks/useWallSettings';
export type {
  UseWallSettingsOptions,
  UseWallSettingsResult,
} from './hooks/useWallSettings';

export { useWallScenes } from './hooks/useWallScenes';
export type {
  UseWallScenesOptions,
  UseWallScenesResult,
} from './hooks/useWallScenes';

export { useWallPhotoCarousel } from './hooks/useWallPhotoCarousel';
export type {
  UseWallPhotoCarouselOptions,
  UseWallPhotoCarouselResult,
} from './hooks/useWallPhotoCarousel';

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

export { useSceneBackgroundsPanel } from './hooks/useSceneBackgroundsPanel';
export type {
  UseSceneBackgroundsPanelOptions,
  SceneBackgroundsPanelState,
} from './hooks/useSceneBackgroundsPanel';

export { useAdminAccess } from './hooks/useAdminAccess';
export type {
  UseAdminAccessOptions,
  UseAdminAccessResult,
  AdminAccessMethod,
  SessionUser,
  SessionData,
} from './hooks/useAdminAccess';

export { useAuth } from './hooks/useAuth';
export type { UseAuthOptions, UseAuthResult } from './hooks/useAuth';

export { useScheduling } from './hooks/useScheduling';
export type {
  UseSchedulingOptions,
  UseSchedulingResult,
} from './hooks/useScheduling';

export { useSchedulingAdmin } from './hooks/useSchedulingAdmin';
export type {
  UseSchedulingAdminOptions,
  UseSchedulingAdminResult,
  CrudResult,
  SingletonResult,
} from './hooks/useSchedulingAdmin';

export { useGoogleCalendarConnect } from './hooks/useGoogleCalendarConnect';
export type {
  UseGoogleCalendarConnectOptions,
  UseGoogleCalendarConnectResult,
  GoogleCalendarConnectStatus,
} from './hooks/useGoogleCalendarConnect';

// Headless primitives (className-pass-through; lib never imports a CSS framework)
export { PhotoboothBanner } from './primitives/Wall/PhotoboothBanner';
export type { PhotoboothBannerProps } from './primitives/Wall/PhotoboothBanner';

export { TokenPanel } from './primitives/Wall/TokenPanel';
export type {
  TokenPanelProps,
  TokenPanelToggleProps,
  TokenPanelPanelProps,
  TokenPanelDescriptionProps,
  TokenPanelControlsProps,
  TokenPanelInputProps,
  TokenPanelGenerateProps,
  TokenPanelSaveProps,
  TokenPanelClearProps,
  TokenPanelShareSectionProps,
  TokenPanelShareLinkProps,
  TokenPanelQRProps,
  TokenPanelDownloadProps,
} from './primitives/Wall/TokenPanel';

export { SceneBackgroundsPanel } from './primitives/Wall/SceneBackgroundsPanel';
export type {
  SceneBackgroundsPanelProps,
  SceneBackgroundsPanelAddFormProps,
  SceneBackgroundsPanelTitleProps,
  SceneBackgroundsPanelFileInputProps,
  SceneBackgroundsPanelPromptProps,
  SceneBackgroundsPanelSubmitProps,
  SceneBackgroundsPanelStatusProps,
  SceneBackgroundsPanelErrorProps,
} from './primitives/Wall/SceneBackgroundsPanel';

export { BookingFlow } from './primitives/Scheduling/BookingFlow';
export type {
  BookingFlowProps,
  BookingFlowServiceProps,
  BookingFlowResourceProps,
  BookingFlowDateTimeProps,
  BookingFlowDetailsProps,
  BookingFlowConfirmProps,
} from './primitives/Scheduling/BookingFlow';

export {
  SchedulingSettingsPanel,
  SchedulingServicesTable,
  SchedulingResourcesTable,
  SchedulingCalendarConnect,
} from './primitives/Scheduling/Admin';
export type {
  SchedulingSettingsPanelProps,
  SchedulingServicesTableProps,
  SchedulingResourcesTableProps,
  SchedulingCalendarConnectProps,
} from './primitives/Scheduling/Admin';

export { AuthDialog } from './primitives/Auth/AuthDialog';
export type {
  AuthDialogProps,
  AuthDialogOverlayProps,
  AuthDialogPanelProps,
  AuthDialogHeaderProps,
  AuthDialogTitleProps,
  AuthDialogCloseProps,
  AuthDialogErrorProps,
  AuthDialogSignInFormProps,
  AuthDialogSignUpFormProps,
  AuthDialogForgotPasswordFormProps,
  AuthDialogResetPasswordFormProps,
  AuthDialogVerifyEmailNoticeProps,
  AuthDialogModeSwitchProps,
  AuthDialogForgotPasswordLinkProps,
  AuthDialogPoweredByProps,
  AuthDialogAccountExistsHintProps,
} from './primitives/Auth/AuthDialog';

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

export type {
  SchedulingService,
  SchedulingResource,
  SchedulingResourceServiceLink,
  SchedulingWorkingHours,
  SchedulingTimeOff,
  SchedulingBooking,
  SchedulingBookingStatus,
  SchedulingSettings,
  SchedulingVerticalPreset,
  SchedulingSlot,
  SchedulingBookingDetails,
  SchedulingConfirmedBooking,
  SchedulingState,
  SchedulingCalendarSummary,
  Service,
  Resource,
  Slot,
  BookingDetails,
} from './types/scheduling';

export {
  resolveSchedulingBasePath,
  SchedulingClientError,
} from './lib/schedulingClient';

export { resolveAuthBasePath, AuthClientError } from './lib/authClient';
export type {
  AuthUser,
  AuthMode,
  AuthError,
  AuthErrorCode,
  LoginMethods,
  SignInResult,
  SignUpResult,
  ResetPasswordResult,
  VerifyEmailResult,
  SessionResult,
} from './types/auth';
