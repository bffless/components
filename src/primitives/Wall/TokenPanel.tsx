import { createContext, useContext, type ReactNode } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import type { WallTokenAdmin } from '../../hooks/useWallToken';

// ─── Context ──────────────────────────────────────────────────────────────────

interface TokenPanelContextValue {
  admin: WallTokenAdmin;
  open: boolean;
  onToggle: () => void;
}

const TokenPanelContext = createContext<TokenPanelContextValue | null>(null);

function useTokenPanelContext(): TokenPanelContextValue {
  const ctx = useContext(TokenPanelContext);
  if (!ctx) {
    throw new Error('<TokenPanel.*> must be rendered inside <TokenPanel>.');
  }
  return ctx;
}

// ─── Default icons ────────────────────────────────────────────────────────────

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

// ─── Root ─────────────────────────────────────────────────────────────────────

export interface TokenPanelProps {
  admin: WallTokenAdmin;
  open: boolean;
  onToggle: () => void;
  className?: string;
  children: ReactNode;
}

function TokenPanelRoot({
  admin,
  open,
  onToggle,
  className,
  children,
}: TokenPanelProps) {
  return (
    <TokenPanelContext.Provider value={{ admin, open, onToggle }}>
      <div className={className}>{children}</div>
    </TokenPanelContext.Provider>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

export interface TokenPanelToggleProps {
  className?: string;
  /** Override the default label ("Wall Access Token (set)" / "(not set)"). */
  children?: ReactNode;
  /** Override the leading icon. Pass `null` to omit. */
  icon?: ReactNode;
}

function Toggle({ className, children, icon }: TokenPanelToggleProps) {
  const { admin, open, onToggle } = useTokenPanelContext();
  const hasToken = admin.currentToken.length > 0;
  const renderedIcon = icon === undefined ? DEFAULT_TOGGLE_ICON : icon;
  return (
    <button
      type="button"
      onClick={onToggle}
      className={className}
      aria-expanded={open}
    >
      {renderedIcon}
      {children ?? (
        <>
          Wall Access Token{' '}
          {admin.loaded ? (hasToken ? '(set)' : '(not set)') : ''}
        </>
      )}
    </button>
  );
}

export interface TokenPanelPanelProps {
  className?: string;
  children: ReactNode;
}

function Panel({ className, children }: TokenPanelPanelProps) {
  const { open } = useTokenPanelContext();
  if (!open) return null;
  return <div className={className}>{children}</div>;
}

export interface TokenPanelDescriptionProps {
  className?: string;
  children?: ReactNode;
}

function Description({ className, children }: TokenPanelDescriptionProps) {
  return (
    <p className={className}>
      {children ?? (
        <>
          Guests need this token in their wall URL (<code>?t=...</code>) to trigger AI scenes.
          Share via QR code or invite link. Empty means AI scenes always run.
        </>
      )}
    </p>
  );
}

export interface TokenPanelControlsProps {
  className?: string;
  children: ReactNode;
}

function Controls({ className, children }: TokenPanelControlsProps) {
  return <div className={className}>{children}</div>;
}

export interface TokenPanelInputProps {
  className?: string;
  placeholder?: string;
}

function Input({ className, placeholder = '6-char token' }: TokenPanelInputProps) {
  const { admin } = useTokenPanelContext();
  return (
    <input
      type="text"
      value={admin.input}
      onChange={e => admin.setInput(e.target.value)}
      placeholder={placeholder}
      className={className}
    />
  );
}

export interface TokenPanelGenerateProps {
  className?: string;
  children?: ReactNode;
  length?: number;
}

function Generate({ className, children, length = 6 }: TokenPanelGenerateProps) {
  const { admin } = useTokenPanelContext();
  return (
    <button
      type="button"
      onClick={() => admin.generate(length)}
      className={className}
    >
      {children ?? 'Generate'}
    </button>
  );
}

export interface TokenPanelSaveProps {
  className?: string;
  /** Label shown when not saving. Default: "Save". */
  children?: ReactNode;
  /** Label shown while saving. Default: "Saving...". */
  savingLabel?: ReactNode;
}

function Save({ className, children, savingLabel }: TokenPanelSaveProps) {
  const { admin } = useTokenPanelContext();
  return (
    <button
      type="button"
      disabled={admin.saving}
      onClick={admin.save}
      className={className}
    >
      {admin.saving ? (savingLabel ?? 'Saving...') : (children ?? 'Save')}
    </button>
  );
}

export interface TokenPanelClearProps {
  className?: string;
  children?: ReactNode;
}

function Clear({ className, children }: TokenPanelClearProps) {
  const { admin } = useTokenPanelContext();
  if (!admin.currentToken) return null;
  return (
    <button type="button" onClick={admin.clear} className={className}>
      {children ?? 'Clear'}
    </button>
  );
}

export interface TokenPanelShareSectionProps {
  className?: string;
  children: ReactNode;
}

function ShareSection({ className, children }: TokenPanelShareSectionProps) {
  const { admin } = useTokenPanelContext();
  if (!admin.currentToken || !admin.shareUrl) return null;
  return <div className={className}>{children}</div>;
}

export interface TokenPanelShareLinkProps {
  className?: string;
}

function ShareLink({ className }: TokenPanelShareLinkProps) {
  const { admin } = useTokenPanelContext();
  return (
    <code className={className}>
      {`${admin.shareUrl}?t=${admin.currentToken}`}
    </code>
  );
}

export interface TokenPanelQRProps {
  /** Canvas size in px (controls download resolution). Default 512. */
  size?: number;
  /** Displayed CSS size in px. Default 160. */
  displaySize?: number;
  level?: 'L' | 'M' | 'Q' | 'H';
  marginSize?: number;
  /** Optional wrapper className (e.g. for a framed background). */
  frameClassName?: string;
}

function QR({
  size = 512,
  displaySize = 160,
  level = 'M',
  marginSize = 4,
  frameClassName,
}: TokenPanelQRProps) {
  const { admin } = useTokenPanelContext();
  const canvas = (
    <QRCodeCanvas
      ref={admin.qrCanvasRef}
      value={`${admin.shareUrl}?t=${admin.currentToken}`}
      size={size}
      level={level}
      marginSize={marginSize}
      style={{ width: displaySize, height: displaySize }}
    />
  );
  if (frameClassName) {
    return <div className={frameClassName}>{canvas}</div>;
  }
  return canvas;
}

export interface TokenPanelDownloadProps {
  className?: string;
  children?: ReactNode;
  icon?: ReactNode;
}

function Download({ className, children, icon }: TokenPanelDownloadProps) {
  const { admin } = useTokenPanelContext();
  const renderedIcon = icon === undefined ? DEFAULT_DOWNLOAD_ICON : icon;
  return (
    <button type="button" onClick={admin.downloadQR} className={className}>
      {renderedIcon}
      {children ?? 'Download PNG'}
    </button>
  );
}

// ─── Compound export ──────────────────────────────────────────────────────────

/**
 * Owner-only admin panel for the wall access token, expressed as a compound
 * component. The root wires up context (admin state + open/toggle); each
 * subcomponent reads from context and accepts its own className.
 *
 * Standard shape:
 *
 * ```tsx
 * <TokenPanel admin={tokenAdmin} open={open} onToggle={...} className="mb-3">
 *   <TokenPanel.Toggle className="..." />
 *   <TokenPanel.Panel className="...">
 *     <TokenPanel.Description className="..." />
 *     <TokenPanel.Controls className="...">
 *       <TokenPanel.Input className="..." />
 *       <TokenPanel.Generate className="..." />
 *       <TokenPanel.Save className="..." />
 *       <TokenPanel.Clear className="..." />
 *     </TokenPanel.Controls>
 *     <TokenPanel.ShareSection className="...">
 *       <TokenPanel.ShareLink className="..." />
 *       <TokenPanel.QR frameClassName="..." />
 *       <TokenPanel.Download className="..." />
 *     </TokenPanel.ShareSection>
 *   </TokenPanel.Panel>
 * </TokenPanel>
 * ```
 *
 * Templates are free to re-arrange, omit, or wrap any subcomponent.
 */
export const TokenPanel = Object.assign(TokenPanelRoot, {
  Toggle,
  Panel,
  Description,
  Controls,
  Input,
  Generate,
  Save,
  Clear,
  ShareSection,
  ShareLink,
  QR,
  Download,
});
