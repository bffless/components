import { createContext, useContext, type ReactNode, type FormEvent } from 'react';
import type { SceneBackgroundsPanelState } from '../../hooks/useSceneBackgroundsPanel';

// ─── Context ──────────────────────────────────────────────────────────────────

const SceneBackgroundsPanelContext = createContext<SceneBackgroundsPanelState | null>(null);

function useSceneBackgroundsPanelContext(): SceneBackgroundsPanelState {
  const ctx = useContext(SceneBackgroundsPanelContext);
  if (!ctx) {
    throw new Error('<SceneBackgroundsPanel.*> must be rendered inside <SceneBackgroundsPanel>.');
  }
  return ctx;
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export interface SceneBackgroundsPanelProps {
  /** State from `useSceneBackgroundsPanel()`. */
  admin: SceneBackgroundsPanelState;
  /** Class on the root wrapper. */
  className?: string;
  children?: ReactNode;
}

function Root({ admin, className, children }: SceneBackgroundsPanelProps) {
  return (
    <SceneBackgroundsPanelContext.Provider value={admin}>
      <div className={className}>{children}</div>
    </SceneBackgroundsPanelContext.Provider>
  );
}

// ─── AddForm ──────────────────────────────────────────────────────────────────

export interface SceneBackgroundsPanelAddFormProps {
  className?: string;
  children?: ReactNode;
}

/**
 * Form wrapper that calls `admin.submit()` on submit. Inputs disabled while
 * generating so consumers don't have to wire that themselves.
 */
function AddForm({ className, children }: SceneBackgroundsPanelAddFormProps) {
  const ctx = useSceneBackgroundsPanelContext();
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void ctx.submit();
  };
  return (
    <form className={className} onSubmit={onSubmit}>
      {children}
    </form>
  );
}

// ─── Title input ──────────────────────────────────────────────────────────────

export interface SceneBackgroundsPanelTitleProps {
  className?: string;
  placeholder?: string;
}

function Title({ className, placeholder = 'e.g. The Bronx' }: SceneBackgroundsPanelTitleProps) {
  const ctx = useSceneBackgroundsPanelContext();
  return (
    <input
      type="text"
      value={ctx.name}
      onChange={e => ctx.setName(e.target.value)}
      placeholder={placeholder}
      disabled={ctx.generating}
      className={className}
      required
    />
  );
}

// ─── File input (reference photo) ─────────────────────────────────────────────

export interface SceneBackgroundsPanelFileInputProps {
  className?: string;
  accept?: string;
}

function FileInput({ className, accept = 'image/*' }: SceneBackgroundsPanelFileInputProps) {
  const ctx = useSceneBackgroundsPanelContext();
  return (
    <input
      type="file"
      accept={accept}
      onChange={e => ctx.setFile(e.target.files?.[0] ?? null)}
      disabled={ctx.generating}
      className={className}
      required
    />
  );
}

// ─── Prompt textarea ──────────────────────────────────────────────────────────

export interface SceneBackgroundsPanelPromptProps {
  className?: string;
  placeholder?: string;
  rows?: number;
}

function Prompt({
  className,
  placeholder = 'e.g. Add this person to a photo of the Bronx, leave room beside them so others can be added later.',
  rows = 3,
}: SceneBackgroundsPanelPromptProps) {
  const ctx = useSceneBackgroundsPanelContext();
  return (
    <textarea
      value={ctx.description}
      onChange={e => ctx.setDescription(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      disabled={ctx.generating}
      className={className}
      required
    />
  );
}

// ─── Submit button ────────────────────────────────────────────────────────────

export interface SceneBackgroundsPanelSubmitProps {
  className?: string;
  /** Idle label. Default `Generate background`. */
  idleChildren?: ReactNode;
  /** Loading label. Default `Generating…`. */
  loadingChildren?: ReactNode;
}

function Submit({
  className,
  idleChildren = 'Generate background',
  loadingChildren = 'Generating…',
}: SceneBackgroundsPanelSubmitProps) {
  const ctx = useSceneBackgroundsPanelContext();
  return (
    <button type="submit" disabled={!ctx.canSubmit} className={className}>
      {ctx.generating ? loadingChildren : idleChildren}
    </button>
  );
}

// ─── Status text ──────────────────────────────────────────────────────────────

export interface SceneBackgroundsPanelStatusProps {
  className?: string;
}

/** Shows `admin.status`. Returns null when status is empty. */
function Status({ className }: SceneBackgroundsPanelStatusProps) {
  const ctx = useSceneBackgroundsPanelContext();
  if (!ctx.status) return null;
  return <span className={className}>{ctx.status}</span>;
}

// ─── Error text ───────────────────────────────────────────────────────────────

export interface SceneBackgroundsPanelErrorProps {
  className?: string;
}

/** Shows `admin.error`. Returns null when error is empty. */
function ErrorText({ className }: SceneBackgroundsPanelErrorProps) {
  const ctx = useSceneBackgroundsPanelContext();
  if (!ctx.error) return null;
  return <span className={className}>{ctx.error}</span>;
}

// ─── Compound assembly ───────────────────────────────────────────────────────

/**
 * Headless compound primitive for the wall scene-backgrounds editor. Pair with
 * `useSceneBackgroundsPanel()` for state. The list of existing backgrounds is
 * left to the consumer to render — iterate `admin.backgrounds` directly and
 * call `admin.remove(id)` for delete buttons.
 *
 * Usage:
 * ```tsx
 * const sceneBgPanel = useSceneBackgroundsPanel({ isAdmin });
 * return (
 *   <SceneBackgroundsPanel admin={sceneBgPanel} className="…">
 *     <div className="grid …">
 *       {sceneBgPanel.backgrounds.map(bg => (
 *         <div key={bg.id} className="…">
 *           <img src={bg.image_url} />
 *           <button onClick={() => sceneBgPanel.remove(bg.id)}>×</button>
 *         </div>
 *       ))}
 *     </div>
 *     <SceneBackgroundsPanel.AddForm className="space-y-3">
 *       <SceneBackgroundsPanel.Title className="…" />
 *       <SceneBackgroundsPanel.FileInput className="…" />
 *       <SceneBackgroundsPanel.Prompt className="…" />
 *       <SceneBackgroundsPanel.Submit className="…" />
 *       <SceneBackgroundsPanel.Status className="…" />
 *       <SceneBackgroundsPanel.Error className="…" />
 *     </SceneBackgroundsPanel.AddForm>
 *   </SceneBackgroundsPanel>
 * );
 * ```
 */
export const SceneBackgroundsPanel = Object.assign(Root, {
  AddForm,
  Title,
  FileInput,
  Prompt,
  Submit,
  Status,
  Error: ErrorText,
});
