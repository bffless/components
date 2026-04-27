import type { ReactNode } from 'react';

export interface PhotoboothBannerProps {
  /** When false, the banner renders nothing. Pass `useWallToken().aiEnabled`. */
  visible: boolean;
  /** Class on the root inline-flex container. */
  className?: string;
  /** Class on the leading icon span. */
  iconClassName?: string;
  /** Class on the text wrapper span. */
  textClassName?: string;
  /** Override the leading icon. Default: ✨ */
  icon?: ReactNode;
  /** Override the bold title. Default: "Photobooth Mode is on" */
  title?: ReactNode;
  /** Class on just the title. */
  titleClassName?: string;
  /** Override the trailing subtitle. Default: " — your message and photo will become an AI scene." */
  subtitle?: ReactNode;
  /** Class on just the subtitle. */
  subtitleClassName?: string;
}

/**
 * Inline pill that signals "Photobooth Mode is on" to guests when the wall
 * was opened via a `?t=...` link. Render zero structure when `visible` is false.
 *
 * Bring your own classes — the lib never imports a CSS framework.
 */
export function PhotoboothBanner({
  visible,
  className,
  iconClassName,
  textClassName,
  icon = '✨',
  title = 'Photobooth Mode is on',
  titleClassName,
  subtitle = ' — your message and photo will become an AI scene.',
  subtitleClassName,
}: PhotoboothBannerProps) {
  if (!visible) return null;
  return (
    <div className={className}>
      <span aria-hidden="true" className={iconClassName}>
        {icon}
      </span>
      <span className={textClassName}>
        <span className={titleClassName}>{title}</span>
        <span className={subtitleClassName}>{subtitle}</span>
      </span>
    </div>
  );
}
