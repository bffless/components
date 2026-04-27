import type { ReactNode } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import type { WallTokenAdmin } from '../../hooks/useWallToken';

export interface TokenPanelClassNames {
  /** Class on the outer wrapper. */
  root?: string;
  /** Class on the toggle button (icon + "Wall Access Token (set)"). */
  toggle?: string;
  /** Class on the icon inside the toggle. */
  toggleIcon?: string;
  /** Class on the collapsible panel. */
  panel?: string;
  /** Class on the description copy. */
  description?: string;
  /** Class on the input row container. */
  controls?: string;
  /** Class on the token <input>. */
  input?: string;
  /** Class on the "Generate" button. */
  generate?: string;
  /** Class on the "Save" button. */
  save?: string;
  /** Class on the "Clear" button. */
  clear?: string;
  /** Class on the share-link block container. */
  shareSection?: string;
  /** Class on the share-link <code>. */
  shareLink?: string;
  /** Class on the framed QR container (background, border). */
  qrFrame?: string;
  /** Class on the right-hand instruction column. */
  qrColumn?: string;
  /** Class on the QR instruction copy. */
  qrInstruction?: string;
  /** Class on the "Download PNG" button. */
  downloadButton?: string;
}

export interface TokenPanelCopy {
  /** Override the toggle label. Receives current token state. */
  toggleLabel?: (state: { loaded: boolean; hasToken: boolean }) => ReactNode;
  /** Override the description shown above the input. */
  description?: ReactNode;
  /** Override the placeholder on the input. Default: "6-char token" */
  inputPlaceholder?: string;
  generateLabel?: ReactNode;
  saveLabel?: ReactNode;
  savingLabel?: ReactNode;
  clearLabel?: ReactNode;
  shareSectionTitle?: ReactNode;
  qrInstruction?: ReactNode;
  downloadButtonLabel?: ReactNode;
}

export interface TokenPanelProps {
  /** Output of `useWallToken().admin`. */
  admin: WallTokenAdmin;
  /** Whether the collapsible panel is open. Lift control to the consumer. */
  open: boolean;
  /** Toggle handler — usually `() => setOpen(o => !o)`. */
  onToggle: () => void;
  /** className overrides per slot. */
  classNames?: TokenPanelClassNames;
  /** Copy / label overrides. */
  copy?: TokenPanelCopy;
  /** Length of token to generate when "Generate" is clicked. Default 6. */
  generateLength?: number;
  /** Whether to render the QR / download row when a token is set. Default true. */
  showQR?: boolean;
  /** QR canvas size in px. Default 512 (canvas), displayed at 160×160. */
  qrSize?: number;
  /** QR display CSS size — passed to <QRCodeCanvas style>. Default 160. */
  qrDisplaySize?: number;
  /** Override the icon in the toggle. */
  toggleIcon?: ReactNode;
  /** Override the icon in the download button. */
  downloadIcon?: ReactNode;
}

const DEFAULT_TOGGLE_ICON = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-4 w-4"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
    />
  </svg>
);

const DEFAULT_DOWNLOAD_ICON = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-3.5 w-3.5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
    />
  </svg>
);

/**
 * Owner-only admin panel for the wall access token.
 *
 * The panel is structured as: a collapsible toggle button → description →
 * (input + Generate + Save + Clear) → share link + QR + Download PNG.
 *
 * Every visual choice is exposed via either `classNames.*` or `copy.*`. The
 * lib bakes in the structure and the canvas-rendered QR (with PNG download via
 * `admin.downloadQR`); consumers bring brand classes.
 */
export function TokenPanel({
  admin,
  open,
  onToggle,
  classNames = {},
  copy = {},
  generateLength = 6,
  showQR = true,
  qrSize = 512,
  qrDisplaySize = 160,
  toggleIcon = DEFAULT_TOGGLE_ICON,
  downloadIcon = DEFAULT_DOWNLOAD_ICON,
}: TokenPanelProps) {
  const hasToken = admin.currentToken.length > 0;
  const toggleLabel = copy.toggleLabel
    ? copy.toggleLabel({ loaded: admin.loaded, hasToken })
    : (
        <>
          Wall Access Token{' '}
          {admin.loaded ? (hasToken ? '(set)' : '(not set)') : ''}
        </>
      );

  return (
    <div className={classNames.root}>
      <button type="button" onClick={onToggle} className={classNames.toggle}>
        <span className={classNames.toggleIcon}>{toggleIcon}</span>
        {toggleLabel}
      </button>
      {open && (
        <div className={classNames.panel}>
          {copy.description !== null && (
            <p className={classNames.description}>
              {copy.description ?? (
                <>
                  Guests need this token in their wall URL (<code>?t=...</code>) to
                  trigger AI scenes. Share via QR code or invite link. Empty means
                  AI scenes always run.
                </>
              )}
            </p>
          )}
          <div className={classNames.controls}>
            <input
              type="text"
              value={admin.input}
              onChange={e => admin.setInput(e.target.value)}
              placeholder={copy.inputPlaceholder ?? '6-char token'}
              className={classNames.input}
            />
            <button
              type="button"
              onClick={() => admin.generate(generateLength)}
              className={classNames.generate}
            >
              {copy.generateLabel ?? 'Generate'}
            </button>
            <button
              type="button"
              disabled={admin.saving}
              onClick={admin.save}
              className={classNames.save}
            >
              {admin.saving
                ? (copy.savingLabel ?? 'Saving...')
                : (copy.saveLabel ?? 'Save')}
            </button>
            {hasToken && (
              <button
                type="button"
                onClick={admin.clear}
                className={classNames.clear}
              >
                {copy.clearLabel ?? 'Clear'}
              </button>
            )}
          </div>
          {showQR && hasToken && admin.shareUrl && (
            <div className={classNames.shareSection}>
              {copy.shareSectionTitle !== null && (
                <p className={classNames.qrInstruction}>
                  {copy.shareSectionTitle ?? 'Share link:'}
                </p>
              )}
              <code className={classNames.shareLink}>
                {`${admin.shareUrl}?t=${admin.currentToken}`}
              </code>
              <div className={classNames.qrColumn}>
                <div className={classNames.qrFrame}>
                  <QRCodeCanvas
                    ref={admin.qrCanvasRef}
                    value={`${admin.shareUrl}?t=${admin.currentToken}`}
                    size={qrSize}
                    level="M"
                    marginSize={4}
                    style={{ width: qrDisplaySize, height: qrDisplaySize }}
                  />
                </div>
                <div>
                  <p className={classNames.qrInstruction}>
                    {copy.qrInstruction ??
                      'Scan to open the wall with the token attached. Print this QR for the event.'}
                  </p>
                  <button
                    type="button"
                    onClick={admin.downloadQR}
                    className={classNames.downloadButton}
                  >
                    {downloadIcon}
                    {copy.downloadButtonLabel ?? 'Download PNG'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
