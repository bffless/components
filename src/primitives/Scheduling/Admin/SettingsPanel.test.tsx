import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, act } from '@testing-library/react';
import { SchedulingSettingsPanel } from './SettingsPanel';
import type { UseSchedulingAdminResult } from '../../../hooks/useSchedulingAdmin';
import type {
  SchedulingSettings,
} from '../../../types/scheduling';
import { DEFAULT_TIMEZONE_GROUPS } from '../../../lib/schedulingTimezones';

// ─── Test helpers ────────────────────────────────────────────────────────────

const SETTINGS: SchedulingSettings = {
  id: 1,
  timezone: 'America/New_York',
  slot_granularity_minutes: 30,
  min_lead_time_minutes: 60,
  max_advance_days: 60,
  cancellation_window_hours: 24,
  vertical_preset: 'salon',
  labels: { resource: 'Stylist' },
  updated_at: '2026-05-01T00:00:00.000Z',
};

function stubAdmin(over: Partial<UseSchedulingAdminResult['settings']> = {}): UseSchedulingAdminResult {
  const settings = {
    value: SETTINGS,
    loading: false,
    error: null,
    refresh: vi.fn(async () => {}),
    update: vi.fn(async (patch: Partial<SchedulingSettings>) => ({ ...SETTINGS, ...patch })),
    ...over,
  };
  // Other CRUD shapes aren't exercised by the panel; cast to satisfy the type.
  return { settings } as unknown as UseSchedulingAdminResult;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Provider ────────────────────────────────────────────────────────────────

describe('SchedulingSettingsPanel — context guard', () => {
  it('throws when sub-primitives are rendered outside the provider', () => {
    expect(() =>
      render(<SchedulingSettingsPanel.Submit>Save</SchedulingSettingsPanel.Submit>),
    ).toThrow(/SchedulingSettingsPanel/);
  });
});

// ─── Initial sync ────────────────────────────────────────────────────────────

describe('SchedulingSettingsPanel — draft sync from server settings', () => {
  it('seeds the draft from admin.settings.value on mount', () => {
    render(
      <SchedulingSettingsPanel admin={stubAdmin()}>
        <SchedulingSettingsPanel.Granularity />
        <SchedulingSettingsPanel.MinLeadTime />
      </SchedulingSettingsPanel>,
    );
    const granularity = screen.getByRole('combobox') as HTMLSelectElement;
    expect(Number(granularity.value)).toBe(30);
    const lead = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(Number(lead.value)).toBe(60);
  });
});

// ─── Timezone modes ──────────────────────────────────────────────────────────

describe('SchedulingSettingsPanel.Timezone — modes', () => {
  it('renders the curated dropdown by default and selecting an option updates the draft', () => {
    render(
      <SchedulingSettingsPanel admin={stubAdmin()}>
        <SchedulingSettingsPanel.Timezone />
      </SchedulingSettingsPanel>,
    );
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('America/New_York');
    fireEvent.change(select, { target: { value: 'Australia/Sydney' } });
    expect(select.value).toBe('Australia/Sydney');
  });

  it('renders a free-text input when groups={null}', () => {
    render(
      <SchedulingSettingsPanel admin={stubAdmin()}>
        <SchedulingSettingsPanel.Timezone groups={null} />
      </SchedulingSettingsPanel>,
    );
    const input = screen.getByPlaceholderText('Australia/Sydney') as HTMLInputElement;
    expect(input.value).toBe('America/New_York');
    fireEvent.change(input, { target: { value: 'Etc/UTC' } });
    expect(input.value).toBe('Etc/UTC');
  });

  it('falls into Custom… text input when the current value is not in the curated set', () => {
    const admin = stubAdmin();
    admin.settings.value = { ...SETTINGS, timezone: 'Etc/UTC' };
    render(
      <SchedulingSettingsPanel admin={admin}>
        <SchedulingSettingsPanel.Timezone />
      </SchedulingSettingsPanel>,
    );
    // Dropdown shows "__custom__" (selected) AND a fallback text input is rendered.
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('__custom__');
    const fallback = screen.getByPlaceholderText('e.g. Europe/Lisbon') as HTMLInputElement;
    expect(fallback.value).toBe('Etc/UTC');
  });

  it('exposes the browser-timezone shortcut when it differs from the current value', () => {
    render(
      <SchedulingSettingsPanel admin={stubAdmin()}>
        <SchedulingSettingsPanel.Timezone browserTimezone="Australia/Melbourne" />
      </SchedulingSettingsPanel>,
    );

    const button = screen.getByRole('button', {
      name: /Use my browser timezone \(Australia\/Melbourne\)/,
    });
    fireEvent.click(button);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('Australia/Melbourne');
  });

  it('hides the browser shortcut when showBrowserShortcut={false}', () => {
    render(
      <SchedulingSettingsPanel admin={stubAdmin()}>
        <SchedulingSettingsPanel.Timezone
          browserTimezone="Australia/Melbourne"
          showBrowserShortcut={false}
        />
      </SchedulingSettingsPanel>,
    );
    expect(screen.queryByText(/Use my browser timezone/)).toBeNull();
  });

  it('hides the browser shortcut when browserTimezone matches the current value', () => {
    render(
      <SchedulingSettingsPanel admin={stubAdmin()}>
        <SchedulingSettingsPanel.Timezone browserTimezone="America/New_York" />
      </SchedulingSettingsPanel>,
    );
    expect(screen.queryByText(/Use my browser timezone/)).toBeNull();
  });
});

// ─── Options accept either shape ─────────────────────────────────────────────

describe('SchedulingSettingsPanel — option shape flexibility', () => {
  it('Granularity accepts a plain number[] and renders default labels', () => {
    render(
      <SchedulingSettingsPanel admin={stubAdmin()}>
        <SchedulingSettingsPanel.Granularity options={[10, 30, 90]} />
      </SchedulingSettingsPanel>,
    );
    expect(screen.getByText('10 minutes')).toBeInTheDocument();
    expect(screen.getByText('30 minutes')).toBeInTheDocument();
    expect(screen.getByText('90 minutes')).toBeInTheDocument();
  });

  it('VerticalPreset accepts a plain string[] and renders the raw enum', () => {
    render(
      <SchedulingSettingsPanel admin={stubAdmin()}>
        <SchedulingSettingsPanel.VerticalPreset presets={['salon', 'generic']} />
      </SchedulingSettingsPanel>,
    );
    const options = screen.getAllByRole('option');
    expect(options.map((o) => (o as HTMLOptionElement).value)).toEqual([
      'salon',
      'generic',
    ]);
  });
});

// ─── Submit + labels validation ──────────────────────────────────────────────

describe('SchedulingSettingsPanel — submit + labels JSON validation', () => {
  it('submits the merged draft (including parsed labels) to admin.settings.update', async () => {
    const admin = stubAdmin();
    render(
      <SchedulingSettingsPanel admin={admin}>
        <SchedulingSettingsPanel.MaxAdvance />
        <SchedulingSettingsPanel.Labels />
        <SchedulingSettingsPanel.Submit>Save</SchedulingSettingsPanel.Submit>
      </SchedulingSettingsPanel>,
    );

    // Bump max_advance to 90 days.
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '90' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    expect(admin.settings.update).toHaveBeenCalledTimes(1);
    const call = (admin.settings.update as any).mock.calls[0][0];
    expect(call.max_advance_days).toBe(90);
    // Labels were synced from initial settings (resource: Stylist) and parsed back unchanged.
    expect(call.labels).toEqual({ resource: 'Stylist' });
  });

  it('blocks submit and surfaces an error when labels JSON is malformed', async () => {
    const admin = stubAdmin();
    render(
      <SchedulingSettingsPanel admin={admin}>
        <SchedulingSettingsPanel.Labels errorClassName="lbl-err" />
        <SchedulingSettingsPanel.Submit>Save</SchedulingSettingsPanel.Submit>
      </SchedulingSettingsPanel>,
    );

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '{ broken' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    expect(admin.settings.update).not.toHaveBeenCalled();
    expect(screen.getByText('Invalid JSON for label overrides.')).toBeInTheDocument();
  });

  it('blocks submit when labels parses to an array (not a JSON object)', async () => {
    const admin = stubAdmin();
    render(
      <SchedulingSettingsPanel admin={admin}>
        <SchedulingSettingsPanel.Labels />
        <SchedulingSettingsPanel.Submit>Save</SchedulingSettingsPanel.Submit>
      </SchedulingSettingsPanel>,
    );

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '["a","b"]' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    expect(admin.settings.update).not.toHaveBeenCalled();
    expect(screen.getByText('Label overrides must be a JSON object.')).toBeInTheDocument();
  });

  it('routes through onSubmit when provided', async () => {
    const admin = stubAdmin();
    const onSubmit = vi.fn(async () => {});
    render(
      <SchedulingSettingsPanel admin={admin} onSubmit={onSubmit}>
        <SchedulingSettingsPanel.Submit>Save</SchedulingSettingsPanel.Submit>
      </SchedulingSettingsPanel>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(admin.settings.update).not.toHaveBeenCalled();
  });
});

// ─── Saved indicator ─────────────────────────────────────────────────────────

describe('SchedulingSettingsPanel.Saved', () => {
  it('appears after a successful submit and clears after durationMs', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const admin = stubAdmin();
    render(
      <SchedulingSettingsPanel admin={admin}>
        <SchedulingSettingsPanel.Submit>Save</SchedulingSettingsPanel.Submit>
        <SchedulingSettingsPanel.Saved durationMs={2000} />
      </SchedulingSettingsPanel>,
    );

    expect(screen.queryByText('Saved.')).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    expect(screen.getByText('Saved.')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2100);
    });

    expect(screen.queryByText('Saved.')).toBeNull();
    vi.useRealTimers();
  });
});

// ─── Submit button loading state ─────────────────────────────────────────────

describe('SchedulingSettingsPanel.Submit', () => {
  it('disables itself and renders the loading label while admin.settings.loading', () => {
    const admin = stubAdmin({ loading: true });
    render(
      <SchedulingSettingsPanel admin={admin}>
        <SchedulingSettingsPanel.Submit loadingLabel="Working…">
          Save
        </SchedulingSettingsPanel.Submit>
      </SchedulingSettingsPanel>,
    );
    const button = screen.getByRole('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe('Working…');
  });
});

// ─── Error ───────────────────────────────────────────────────────────────────

describe('SchedulingSettingsPanel.Error', () => {
  it('renders only when admin.settings.error is set', () => {
    const { rerender } = render(
      <SchedulingSettingsPanel admin={stubAdmin({ error: null })}>
        <SchedulingSettingsPanel.Error className="err" />
      </SchedulingSettingsPanel>,
    );
    expect(document.querySelector('.err')).toBeNull();

    rerender(
      <SchedulingSettingsPanel admin={stubAdmin({ error: 'Boom' })}>
        <SchedulingSettingsPanel.Error className="err">
          {(message) => <span>!! {message} !!</span>}
        </SchedulingSettingsPanel.Error>
      </SchedulingSettingsPanel>,
    );
    expect(screen.getByText('!! Boom !!')).toBeInTheDocument();
  });
});

// ─── DEFAULT_TIMEZONE_GROUPS sanity ──────────────────────────────────────────

describe('DEFAULT_TIMEZONE_GROUPS', () => {
  it('includes at least one entry per region', () => {
    for (const group of DEFAULT_TIMEZONE_GROUPS) {
      expect(group.values.length).toBeGreaterThan(0);
    }
  });
});
