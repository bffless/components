import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SchedulingTimeOffList } from './TimeOffList';
import { adminStub } from './__test-helpers';
import type { SchedulingTimeOff } from '../../../types/scheduling';

const RICO_ID = 'res-rico';
const ALEX_ID = 'res-alex';

function row(over: Partial<SchedulingTimeOff>): SchedulingTimeOff {
  return {
    id: over.id ?? 'to-1',
    resource_id: over.resource_id ?? RICO_ID,
    starts_at: over.starts_at ?? '2026-12-24T00:00:00.000Z',
    ends_at: over.ends_at ?? '2026-12-26T23:59:59.999Z',
    reason: over.reason ?? null,
    ...over,
  };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('SchedulingTimeOffList — scope + sort', () => {
  it('renders only rows belonging to the supplied resourceId', () => {
    const admin = adminStub({
      timeOff: {
        list: [
          row({ id: 'rico-xmas', resource_id: RICO_ID, reason: 'rico-reason' }),
          row({ id: 'alex-vac', resource_id: ALEX_ID, reason: 'alex-reason' }),
        ],
      },
    });
    render(<SchedulingTimeOffList admin={admin} resourceId={RICO_ID} />);
    expect(screen.getByText('rico-reason')).toBeInTheDocument();
    expect(screen.queryByText('alex-reason')).toBeNull();
  });

  it('sorts rows by starts_at ascending (soonest first)', () => {
    const admin = adminStub({
      timeOff: {
        list: [
          row({ id: 'late', starts_at: '2027-01-01T00:00:00.000Z', reason: 'late-block' }),
          row({ id: 'soon', starts_at: '2026-06-01T00:00:00.000Z', reason: 'soon-block' }),
        ],
      },
    });
    render(<SchedulingTimeOffList admin={admin} resourceId={RICO_ID} />);
    const rendered = screen.getAllByText(/-block/).map((n) => n.textContent);
    expect(rendered).toEqual(['soon-block', 'late-block']);
  });

  it("includes only resource_id IS NULL rows when resourceId is null", () => {
    const admin = adminStub({
      timeOff: {
        list: [
          row({ id: 'site', resource_id: null, reason: 'site-wide' }),
          row({ id: 'rico', resource_id: RICO_ID, reason: 'rico-only' }),
        ],
      },
    });
    render(<SchedulingTimeOffList admin={admin} resourceId={null} />);
    expect(screen.getByText('site-wide')).toBeInTheDocument();
    expect(screen.queryByText('rico-only')).toBeNull();
  });
});

describe('SchedulingTimeOffList — mutations', () => {
  it('Add submits a row with ISO timestamps spanning the full day range', async () => {
    const admin = adminStub({ timeOff: { list: [] } });
    render(<SchedulingTimeOffList admin={admin} resourceId={RICO_ID} />);
    fireEvent.change(screen.getByLabelText(/Closure starts on/i), {
      target: { value: '2026-12-24' },
    });
    fireEvent.change(screen.getByLabelText(/Closure ends on/i), {
      target: { value: '2026-12-26' },
    });
    fireEvent.change(screen.getByLabelText(/Closure reason/i), {
      target: { value: 'Christmas' },
    });
    fireEvent.submit(screen.getByLabelText(/Closure starts on/i).closest('form')!);
    expect(admin.timeOff.create).toHaveBeenCalledWith({
      resource_id: RICO_ID,
      starts_at: '2026-12-24T00:00:00.000Z',
      ends_at: '2026-12-26T23:59:59.999Z',
      reason: 'Christmas',
    });
  });

  it('Remove deletes the row by id', () => {
    const admin = adminStub({
      timeOff: { list: [row({ id: 'to-9' })] },
    });
    render(<SchedulingTimeOffList admin={admin} resourceId={RICO_ID} />);
    fireEvent.click(screen.getByRole('button', { name: /Remove/i }));
    expect(admin.timeOff.remove).toHaveBeenCalledWith('to-9');
  });
});

describe('SchedulingTimeOffList — empty state', () => {
  it("renders the default empty message when there are no rows", () => {
    const admin = adminStub({ timeOff: { list: [] } });
    render(<SchedulingTimeOffList admin={admin} resourceId={RICO_ID} />);
    expect(screen.getByText(/No closures scheduled/i)).toBeInTheDocument();
  });

  it('respects a custom emptyState slot', () => {
    const admin = adminStub({ timeOff: { list: [] } });
    render(
      <SchedulingTimeOffList
        admin={admin}
        resourceId={RICO_ID}
        emptyState={<span>quiet calendar</span>}
      />,
    );
    expect(screen.getByText('quiet calendar')).toBeInTheDocument();
  });
});
