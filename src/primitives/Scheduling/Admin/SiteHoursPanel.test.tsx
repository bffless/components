import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SchedulingSiteHoursPanel } from './SiteHoursPanel';
import { adminStub } from './__test-helpers';
import type {
  SchedulingTimeOff,
  SchedulingWorkingHours,
} from '../../../types/scheduling';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

const SITE_HOURS: SchedulingWorkingHours = {
  id: 'site-mon',
  resource_id: null,
  day_of_week: 1,
  start_time: '09:00',
  end_time: '17:00',
};

const RICO_HOURS: SchedulingWorkingHours = {
  id: 'rico-mon',
  resource_id: 'res-rico',
  day_of_week: 1,
  start_time: '11:00',
  end_time: '20:00',
};

const SITE_TIME_OFF: SchedulingTimeOff = {
  id: 'site-xmas',
  resource_id: null,
  starts_at: '2026-12-24T00:00:00.000Z',
  ends_at: '2026-12-26T23:59:59.999Z',
  reason: 'site-wide-closure',
};

const RICO_TIME_OFF: SchedulingTimeOff = {
  id: 'rico-vac',
  resource_id: 'res-rico',
  starts_at: '2026-08-01T00:00:00.000Z',
  ends_at: '2026-08-08T23:59:59.999Z',
  reason: 'rico-only-vacation',
};

describe('SchedulingSiteHoursPanel — scope', () => {
  it('renders both editors with resourceId=null — only site-wide rows surface', () => {
    const admin = adminStub({
      workingHours: { list: [SITE_HOURS, RICO_HOURS] },
      timeOff: { list: [SITE_TIME_OFF, RICO_TIME_OFF] },
    });
    render(<SchedulingSiteHoursPanel admin={admin} />);

    // Site-wide working hours show through (Monday 09:00 row).
    const startInputs = screen.getAllByLabelText(/Monday start time/i);
    expect(startInputs.map((i) => (i as HTMLInputElement).value)).toContain('09:00');
    // Rico's per-resource hours are NOT in this panel's scope.
    expect(startInputs.map((i) => (i as HTMLInputElement).value)).not.toContain('11:00');

    // Site-wide time-off shows through.
    expect(screen.getByText('site-wide-closure')).toBeInTheDocument();
    expect(screen.queryByText('rico-only-vacation')).toBeNull();
  });

  it('renders the section headings the consumer supplies', () => {
    const admin = adminStub();
    render(
      <SchedulingSiteHoursPanel
        admin={admin}
        workingHoursHeading={<h3>Salon hours</h3>}
        timeOffHeading={<h3>Salon closures</h3>}
      />,
    );
    expect(screen.getByText('Salon hours')).toBeInTheDocument();
    expect(screen.getByText('Salon closures')).toBeInTheDocument();
  });

  it('Add closure inside the panel passes through resource_id: null', () => {
    const admin = adminStub();
    render(<SchedulingSiteHoursPanel admin={admin} />);
    fireEvent.change(screen.getByLabelText(/Closure starts on/i), {
      target: { value: '2026-07-04' },
    });
    fireEvent.change(screen.getByLabelText(/Closure ends on/i), {
      target: { value: '2026-07-04' },
    });
    fireEvent.submit(screen.getByLabelText(/Closure starts on/i).closest('form')!);
    expect(admin.timeOff.create).toHaveBeenCalledWith(
      expect.objectContaining({ resource_id: null }),
    );
  });
});
