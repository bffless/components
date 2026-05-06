import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import type { UseSchedulingAdminResult } from '../../../hooks/useSchedulingAdmin';
import type {
  SchedulingSettings,
  SchedulingVerticalPreset,
} from '../../../types/scheduling';
import {
  DEFAULT_TIMEZONE_GROUPS,
  detectBrowserTimezone,
  isInTimezoneGroups,
  type SchedulingTimezoneGroup,
} from '../../../lib/schedulingTimezones';

// ─── Context ──────────────────────────────────────────────────────────────────

interface PanelContextValue {
  admin: UseSchedulingAdminResult;
  settings: SchedulingSettings | null;
  draft: Partial<SchedulingSettings>;
  setDraft: (next: Partial<SchedulingSettings>) => void;
  change: <K extends keyof SchedulingSettings>(key: K, value: SchedulingSettings[K]) => void;
  labelsText: string;
  setLabelsText: (next: string) => void;
  labelsError: string | null;
  setLabelsError: (next: string | null) => void;
  savedAt: number | null;
  setSavedAt: (next: number | null) => void;
}

const PanelContext = createContext<PanelContextValue | null>(null);

function usePanelContext(): PanelContextValue {
  const ctx = useContext(PanelContext);
  if (!ctx) {
    throw new Error('<SchedulingSettingsPanel.*> must be inside <SchedulingSettingsPanel>.');
  }
  return ctx;
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export interface SchedulingSettingsPanelProps {
  admin: UseSchedulingAdminResult;
  className?: string;
  children: ReactNode;
  /**
   * Override the default form-submit handler. Receives the merged draft
   * (including parsed labels). When omitted, the panel calls
   * `admin.settings.update(draft)` directly. Useful when consumers want to
   * intercept (e.g. confirm modal) before the server write.
   */
  onSubmit?: (draft: Partial<SchedulingSettings>) => Promise<void> | void;
}

function SchedulingSettingsPanelRoot({
  admin,
  className,
  children,
  onSubmit,
}: SchedulingSettingsPanelProps) {
  const settings = admin.settings.value;
  const [draft, setDraft] = useState<Partial<SchedulingSettings>>({});
  const [labelsText, setLabelsText] = useState('{}');
  const [labelsError, setLabelsError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Sync the editable draft with the latest server value whenever it lands.
  // Without this, a refresh wouldn't clear stale local edits after a remote
  // update.
  useEffect(() => {
    if (settings) {
      setDraft(settings);
      setLabelsText(JSON.stringify(settings.labels ?? {}, null, 2));
    }
  }, [settings]);

  const change = useCallback(
    <K extends keyof SchedulingSettings>(key: K, value: SchedulingSettings[K]) =>
      setDraft((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const handleFormSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLabelsError(null);

    // Parse labels on submit (not per-keystroke). Surfaces invalid JSON so
    // the consumer can show a useful error instead of silently dropping it.
    let parsedLabels: Record<string, string> = {};
    try {
      const parsed = JSON.parse(labelsText || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        parsedLabels = parsed as Record<string, string>;
      } else {
        setLabelsError('Label overrides must be a JSON object.');
        return;
      }
    } catch {
      setLabelsError('Invalid JSON for label overrides.');
      return;
    }

    const merged: Partial<SchedulingSettings> = { ...draft, labels: parsedLabels };
    if (onSubmit) {
      await onSubmit(merged);
    } else {
      await admin.settings.update(merged);
    }
    setSavedAt(Date.now());
  };

  const value: PanelContextValue = {
    admin,
    settings,
    draft,
    setDraft,
    change,
    labelsText,
    setLabelsText,
    labelsError,
    setLabelsError,
    savedAt,
    setSavedAt,
  };

  // Keep the early-return cases (loading / no settings) inside the provider so
  // sub-primitives don't have to special-case them. Consumers can render
  // SchedulingSettingsPanel.NotReady or check admin.settings.value themselves
  // if they want a custom skeleton.
  return (
    <PanelContext.Provider value={value}>
      <form className={className} onSubmit={handleFormSubmit} noValidate>
        {children}
      </form>
    </PanelContext.Provider>
  );
}

// ─── Field shells ─────────────────────────────────────────────────────────────
//
// Internal helper — keeps the per-field boilerplate (label + help + suffix)
// out of every sub-primitive. NOT exported; consumers wire className strings
// per sub-primitive.

interface FieldShellProps {
  className?: string;
  labelClassName?: string;
  helpClassName?: string;
  suffixClassName?: string;
  actionClassName?: string;
  label: ReactNode;
  help?: ReactNode;
  suffix?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}

function FieldShell({
  className,
  labelClassName,
  helpClassName,
  suffixClassName,
  actionClassName,
  label,
  help,
  suffix,
  action,
  children,
}: FieldShellProps) {
  // The wrapper is a <div>, not a <label> — putting interactive elements
  // (e.g. the "Use browser timezone" action button) inside a <label> pollutes
  // the accessible name of those buttons with the surrounding label text.
  // The label element wraps only the static label string.
  const labelEl = <label className={labelClassName}>{label}</label>;
  const actionEl = action ? <span className={actionClassName}>{action}</span> : null;
  const labelRow =
    actionEl ? (
      <div>
        {labelEl}
        {actionEl}
      </div>
    ) : (
      labelEl
    );

  const body = suffix ? (
    <div>
      {children}
      <span className={suffixClassName}>{suffix}</span>
    </div>
  ) : (
    children
  );

  return (
    <div className={className}>
      {labelRow}
      {body}
      {help ? <span className={helpClassName}>{help}</span> : null}
    </div>
  );
}

// ─── Timezone ─────────────────────────────────────────────────────────────────

export interface SchedulingSettingsTimezoneProps {
  className?: string;
  labelClassName?: string;
  helpClassName?: string;
  inputClassName?: string;
  customInputClassName?: string;
  actionClassName?: string;
  /**
   * Curated IANA groups for the dropdown. Defaults to DEFAULT_TIMEZONE_GROUPS.
   * Pass `null` to render a free-text input instead.
   */
  groups?: SchedulingTimezoneGroup[] | null;
  /**
   * When true (default) and the browser timezone differs from the current
   * value AND `groups` is set, render a "Use my browser timezone (…)"
   * shortcut. Pass false to suppress.
   */
  showBrowserShortcut?: boolean;
  /**
   * Override the detected browser timezone. Default: detectBrowserTimezone().
   * Pass `null` to force-suppress the shortcut even if the browser exposes
   * one. Useful for SSR (where Intl may resolve differently than the user)
   * and for tests.
   */
  browserTimezone?: string | null;
  label?: ReactNode;
  help?: ReactNode;
}

function Timezone({
  className,
  labelClassName,
  helpClassName,
  inputClassName,
  customInputClassName,
  actionClassName,
  groups = DEFAULT_TIMEZONE_GROUPS,
  showBrowserShortcut = true,
  browserTimezone,
  label = 'Timezone',
  help,
}: SchedulingSettingsTimezoneProps) {
  const { draft, change } = usePanelContext();
  const tz = String(draft.timezone ?? '');
  // Memoize the platform detection so changing timezone state doesn't
  // re-invoke Intl on every render. The `browserTimezone` prop, when supplied,
  // takes precedence (SSR / test injection).
  const detected = useMemo(() => detectBrowserTimezone(), []);
  const browserTz = browserTimezone === undefined ? detected : browserTimezone;

  // Free-text mode (groups === null) — single text input.
  if (!groups) {
    return (
      <FieldShell
        className={className}
        labelClassName={labelClassName}
        helpClassName={helpClassName}
        label={label}
        help={help}
      >
        <input
          type="text"
          value={tz}
          onChange={(e) => change('timezone', e.target.value)}
          placeholder="Australia/Sydney"
          className={inputClassName}
        />
      </FieldShell>
    );
  }

  // Curated mode — dropdown + custom-fallback text input.
  const tzInList = isInTimezoneGroups(tz, groups);
  const action =
    showBrowserShortcut && browserTz && browserTz !== tz ? (
      <button
        type="button"
        onClick={() => change('timezone', browserTz)}
        className={actionClassName}
      >
        Use my browser timezone ({browserTz})
      </button>
    ) : null;

  return (
    <FieldShell
      className={className}
      labelClassName={labelClassName}
      helpClassName={helpClassName}
      actionClassName={actionClassName}
      label={label}
      help={help}
      action={action}
    >
      <select
        value={tzInList ? tz : '__custom__'}
        onChange={(e) => {
          // Selecting "Custom…" leaves the current value intact and reveals
          // the text input for fine-grained editing.
          if (e.target.value === '__custom__') return;
          change('timezone', e.target.value);
        }}
        className={inputClassName}
      >
        {groups.map((group) => (
          <optgroup key={group.region} label={group.region}>
            {group.values.map((v) => (
              <option key={v.tz} value={v.tz}>
                {v.label}
              </option>
            ))}
          </optgroup>
        ))}
        <option value="__custom__">Custom…</option>
      </select>
      {!tzInList ? (
        <input
          type="text"
          value={tz}
          onChange={(e) => change('timezone', e.target.value)}
          placeholder="e.g. Europe/Lisbon"
          className={customInputClassName}
        />
      ) : null}
    </FieldShell>
  );
}

// ─── Granularity ──────────────────────────────────────────────────────────────

export type SchedulingSettingsGranularityOption =
  | number
  | { value: number; label: ReactNode };

export interface SchedulingSettingsGranularityProps {
  className?: string;
  labelClassName?: string;
  helpClassName?: string;
  inputClassName?: string;
  options?: SchedulingSettingsGranularityOption[];
  label?: ReactNode;
  help?: ReactNode;
}

const DEFAULT_GRANULARITIES: SchedulingSettingsGranularityOption[] = [
  { value: 15, label: 'Every 15 minutes' },
  { value: 30, label: 'Every 30 minutes' },
  { value: 60, label: 'Every hour' },
];

function Granularity({
  className,
  labelClassName,
  helpClassName,
  inputClassName,
  options = DEFAULT_GRANULARITIES,
  label = 'Slot granularity',
  help,
}: SchedulingSettingsGranularityProps) {
  const { draft, settings, change } = usePanelContext();
  const value = Number(draft.slot_granularity_minutes ?? settings?.slot_granularity_minutes ?? 30);
  return (
    <FieldShell
      className={className}
      labelClassName={labelClassName}
      helpClassName={helpClassName}
      label={label}
      help={help}
    >
      <select
        value={value}
        onChange={(e) => change('slot_granularity_minutes', Number(e.target.value))}
        className={inputClassName}
      >
        {options.map((opt) => {
          const v = typeof opt === 'number' ? opt : opt.value;
          const lbl = typeof opt === 'number' ? `${opt} minutes` : opt.label;
          return (
            <option key={v} value={v}>
              {lbl}
            </option>
          );
        })}
      </select>
    </FieldShell>
  );
}

// ─── Number fields (lead time / max advance / cancellation window) ───────────

interface NumberFieldProps {
  className?: string;
  labelClassName?: string;
  helpClassName?: string;
  inputClassName?: string;
  suffixClassName?: string;
  label?: ReactNode;
  help?: ReactNode;
  suffix?: ReactNode;
  min?: number;
  step?: number;
}

function makeNumberField(
  field: 'min_lead_time_minutes' | 'max_advance_days' | 'cancellation_window_hours',
  defaults: { label: ReactNode; suffix: ReactNode; min: number; step?: number },
) {
  return function NumberField({
    className,
    labelClassName,
    helpClassName,
    inputClassName,
    suffixClassName,
    label = defaults.label,
    help,
    suffix = defaults.suffix,
    min = defaults.min,
    step = defaults.step,
  }: NumberFieldProps) {
    const { draft, change } = usePanelContext();
    const value = Number(draft[field] ?? 0);
    return (
      <FieldShell
        className={className}
        labelClassName={labelClassName}
        helpClassName={helpClassName}
        suffixClassName={suffixClassName}
        label={label}
        help={help}
        suffix={suffix}
      >
        <input
          type="number"
          min={min}
          step={step}
          value={value}
          onChange={(e) => change(field, Number(e.target.value))}
          className={inputClassName}
        />
      </FieldShell>
    );
  };
}

const MinLeadTime = makeNumberField('min_lead_time_minutes', {
  label: 'Min lead time',
  suffix: 'minutes',
  min: 0,
  step: 5,
});

const MaxAdvance = makeNumberField('max_advance_days', {
  label: 'Max advance',
  suffix: 'days',
  min: 1,
});

const CancellationWindow = makeNumberField('cancellation_window_hours', {
  label: 'Cancellation window',
  suffix: 'hours before',
  min: 0,
});

export type SchedulingSettingsMinLeadTimeProps = NumberFieldProps;
export type SchedulingSettingsMaxAdvanceProps = NumberFieldProps;
export type SchedulingSettingsCancellationWindowProps = NumberFieldProps;

// ─── Vertical preset ──────────────────────────────────────────────────────────

export type SchedulingSettingsPresetOption =
  | SchedulingVerticalPreset
  | { value: SchedulingVerticalPreset; label: ReactNode };

export interface SchedulingSettingsVerticalPresetProps {
  className?: string;
  labelClassName?: string;
  helpClassName?: string;
  inputClassName?: string;
  presets?: SchedulingSettingsPresetOption[];
  label?: ReactNode;
  help?: ReactNode;
}

const DEFAULT_PRESETS: SchedulingSettingsPresetOption[] = [
  { value: 'salon', label: 'Salon (Stylist · Service · Booking)' },
  { value: 'generic', label: 'Generic (Provider · Service · Booking)' },
];

function VerticalPreset({
  className,
  labelClassName,
  helpClassName,
  inputClassName,
  presets = DEFAULT_PRESETS,
  label = 'Vertical preset',
  help,
}: SchedulingSettingsVerticalPresetProps) {
  const { draft, settings, change } = usePanelContext();
  const value = String(draft.vertical_preset ?? settings?.vertical_preset ?? 'salon');
  return (
    <FieldShell
      className={className}
      labelClassName={labelClassName}
      helpClassName={helpClassName}
      label={label}
      help={help}
    >
      <select
        value={value}
        onChange={(e) =>
          change('vertical_preset', e.target.value as SchedulingVerticalPreset)
        }
        className={inputClassName}
      >
        {presets.map((p) => {
          const v = typeof p === 'string' ? p : p.value;
          const lbl = typeof p === 'string' ? p : p.label;
          return (
            <option key={v} value={v}>
              {lbl}
            </option>
          );
        })}
      </select>
    </FieldShell>
  );
}

// ─── Labels (jsonb) ───────────────────────────────────────────────────────────

export interface SchedulingSettingsLabelsProps {
  className?: string;
  labelClassName?: string;
  helpClassName?: string;
  inputClassName?: string;
  errorClassName?: string;
  label?: ReactNode;
  help?: ReactNode;
  rows?: number;
}

function Labels({
  className,
  labelClassName,
  helpClassName,
  inputClassName,
  errorClassName,
  label = 'Label overrides',
  help,
  rows = 4,
}: SchedulingSettingsLabelsProps) {
  const { labelsText, setLabelsText, labelsError } = usePanelContext();
  return (
    <FieldShell
      className={className}
      labelClassName={labelClassName}
      helpClassName={helpClassName}
      label={label}
      help={help}
    >
      <textarea
        value={labelsText}
        onChange={(e) => setLabelsText(e.target.value)}
        rows={rows}
        className={inputClassName}
      />
      {labelsError ? (
        <span className={errorClassName} role="alert">
          {labelsError}
        </span>
      ) : null}
    </FieldShell>
  );
}

// ─── Submit ───────────────────────────────────────────────────────────────────

export interface SchedulingSettingsSubmitProps {
  className?: string;
  /** Default: 'Save settings'. */
  children?: ReactNode;
  /** Default: 'Saving…'. */
  loadingLabel?: ReactNode;
}

function Submit({
  className,
  children,
  loadingLabel,
}: SchedulingSettingsSubmitProps) {
  const { admin } = usePanelContext();
  return (
    <button type="submit" disabled={admin.settings.loading} className={className}>
      {admin.settings.loading
        ? (loadingLabel ?? 'Saving…')
        : (children ?? 'Save settings')}
    </button>
  );
}

// ─── Saved indicator ──────────────────────────────────────────────────────────

export interface SchedulingSettingsSavedProps {
  className?: string;
  children?: ReactNode;
  /** How long to show the indicator after a successful save. Default 4000ms. */
  durationMs?: number;
}

function Saved({
  className,
  children,
  durationMs = 4000,
}: SchedulingSettingsSavedProps) {
  const { savedAt, setSavedAt } = usePanelContext();
  // Auto-clear so the indicator naturally disappears even without re-renders.
  useEffect(() => {
    if (savedAt == null) return;
    const handle = setTimeout(() => setSavedAt(null), durationMs);
    return () => clearTimeout(handle);
  }, [savedAt, durationMs, setSavedAt]);

  if (savedAt == null) return null;
  return <span className={className}>{children ?? 'Saved.'}</span>;
}

// ─── Error ────────────────────────────────────────────────────────────────────

export interface SchedulingSettingsErrorProps {
  className?: string;
  children?: (message: string) => ReactNode;
}

function ErrorMessage({ className, children }: SchedulingSettingsErrorProps) {
  const { admin } = usePanelContext();
  if (!admin.settings.error) return null;
  return (
    <div className={className} role="alert">
      {children ? children(admin.settings.error) : admin.settings.error}
    </div>
  );
}

// ─── Compound export ──────────────────────────────────────────────────────────

export const SchedulingSettingsPanel = Object.assign(SchedulingSettingsPanelRoot, {
  Timezone,
  Granularity,
  MinLeadTime,
  MaxAdvance,
  CancellationWindow,
  VerticalPreset,
  Labels,
  Submit,
  Saved,
  Error: ErrorMessage,
});
