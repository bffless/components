import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { UseSchedulingAdminResult } from '../../../hooks/useSchedulingAdmin';
import type {
  SchedulingSettings,
  SchedulingVerticalPreset,
} from '../../../types/scheduling';

export interface SchedulingSettingsPanelProps {
  admin: UseSchedulingAdminResult;
  className?: string;
  inputClassName?: string;
  submitClassName?: string;
  submitLabel?: ReactNode;
  /**
   * Available presets for the vertical_preset dropdown. Defaults to the
   * MVP set: salon, generic.
   */
  presets?: SchedulingVerticalPreset[];
  /** Granularity options in the dropdown. Defaults to [15, 30, 60]. */
  granularityOptions?: number[];
}

const DEFAULT_PRESETS: SchedulingVerticalPreset[] = ['salon', 'generic'];
const DEFAULT_GRANULARITIES = [15, 30, 60];

export function SchedulingSettingsPanel({
  admin,
  className,
  inputClassName,
  submitClassName,
  submitLabel,
  presets = DEFAULT_PRESETS,
  granularityOptions = DEFAULT_GRANULARITIES,
}: SchedulingSettingsPanelProps) {
  const settings = admin.settings.value;
  const [draft, setDraft] = useState<Partial<SchedulingSettings>>({});

  // Sync the editable draft with the latest server value whenever it lands.
  // Without this, a refresh wouldn't clear stale local edits after a remote
  // update.
  useEffect(() => {
    if (settings) setDraft(settings);
  }, [settings]);

  if (!settings && admin.settings.loading) {
    return <div className={className}>Loading settings…</div>;
  }
  if (!settings) {
    return <div className={className}>{admin.settings.error ?? 'No settings yet.'}</div>;
  }

  const onChange = <K extends keyof SchedulingSettings>(
    key: K,
    value: SchedulingSettings[K],
  ) => setDraft((prev) => ({ ...prev, [key]: value }));

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await admin.settings.update(draft);
  };

  return (
    <form className={className} onSubmit={onSubmit} noValidate>
      <label>
        <span>Timezone</span>
        <input
          type="text"
          value={draft.timezone ?? ''}
          onChange={(e) => onChange('timezone', e.target.value)}
          placeholder="Australia/Sydney"
          className={inputClassName}
        />
      </label>

      <label>
        <span>Slot granularity</span>
        <select
          value={draft.slot_granularity_minutes ?? settings.slot_granularity_minutes}
          onChange={(e) =>
            onChange('slot_granularity_minutes', Number(e.target.value))
          }
          className={inputClassName}
        >
          {granularityOptions.map((m) => (
            <option key={m} value={m}>
              {m} minutes
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>Min lead time (minutes)</span>
        <input
          type="number"
          min={0}
          value={draft.min_lead_time_minutes ?? 0}
          onChange={(e) =>
            onChange('min_lead_time_minutes', Number(e.target.value))
          }
          className={inputClassName}
        />
      </label>

      <label>
        <span>Max advance (days)</span>
        <input
          type="number"
          min={0}
          value={draft.max_advance_days ?? 0}
          onChange={(e) => onChange('max_advance_days', Number(e.target.value))}
          className={inputClassName}
        />
      </label>

      <label>
        <span>Cancellation window (hours)</span>
        <input
          type="number"
          min={0}
          value={draft.cancellation_window_hours ?? 0}
          onChange={(e) =>
            onChange('cancellation_window_hours', Number(e.target.value))
          }
          className={inputClassName}
        />
      </label>

      <label>
        <span>Vertical preset</span>
        <select
          value={draft.vertical_preset ?? settings.vertical_preset}
          onChange={(e) =>
            onChange(
              'vertical_preset',
              e.target.value as SchedulingVerticalPreset,
            )
          }
          className={inputClassName}
        >
          {presets.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend>Label overrides</legend>
        <p>
          Override default copy for the active vertical preset. JSON object,
          e.g. <code>{`{"resource":"Stylist"}`}</code>.
        </p>
        <textarea
          value={JSON.stringify(draft.labels ?? {}, null, 2)}
          onChange={(e) => {
            try {
              onChange('labels', JSON.parse(e.target.value));
            } catch {
              // ignore typing errors — we only commit on submit anyway
            }
          }}
          className={inputClassName}
          rows={6}
        />
      </fieldset>

      {admin.settings.error ? (
        <div role="alert">{admin.settings.error}</div>
      ) : null}

      <button
        type="submit"
        disabled={admin.settings.loading}
        className={submitClassName}
      >
        {submitLabel ?? (admin.settings.loading ? 'Saving…' : 'Save settings')}
      </button>
    </form>
  );
}
