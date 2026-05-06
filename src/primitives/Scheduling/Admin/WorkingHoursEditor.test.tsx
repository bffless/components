import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SchedulingWorkingHoursEditor } from './WorkingHoursEditor';
import { adminStub } from './__test-helpers';
import type { SchedulingWorkingHours } from '../../../types/scheduling';

const RICO_ID = 'res-rico';
const ALEX_ID = 'res-alex';

function row(over: Partial<SchedulingWorkingHours>): SchedulingWorkingHours {
  return {
    id: over.id ?? 'wh-1',
    resource_id: over.resource_id ?? RICO_ID,
    day_of_week: over.day_of_week ?? 2,
    start_time: over.start_time ?? '09:00',
    end_time: over.end_time ?? '17:00',
    ...over,
  };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('SchedulingWorkingHoursEditor — scope filtering', () => {
  it('renders rows belonging to the supplied resourceId only', () => {
    const admin = adminStub({
      workingHours: {
        list: [
          row({ id: 'rico-tue', resource_id: RICO_ID, day_of_week: 2, start_time: '10:00', end_time: '19:00' }),
          row({ id: 'alex-tue', resource_id: ALEX_ID, day_of_week: 2, start_time: '08:00', end_time: '16:00' }),
        ],
      },
    });
    render(<SchedulingWorkingHoursEditor admin={admin} resourceId={RICO_ID} />);
    // rico's row is rendered: 10:00 start input is present
    const startInputs = screen.getAllByLabelText(/Tuesday start time/i);
    expect(startInputs.map((i) => (i as HTMLInputElement).value)).toContain('10:00');
    expect(startInputs.map((i) => (i as HTMLInputElement).value)).not.toContain('08:00');
  });

  it("includes only resource_id IS NULL rows when resourceId is null (site-wide)", () => {
    const admin = adminStub({
      workingHours: {
        list: [
          row({ id: 'site', resource_id: null, day_of_week: 1, start_time: '09:00', end_time: '17:00' }),
          row({ id: 'rico', resource_id: RICO_ID, day_of_week: 1, start_time: '11:00', end_time: '20:00' }),
        ],
      },
    });
    render(<SchedulingWorkingHoursEditor admin={admin} resourceId={null} />);
    const startInputs = screen.getAllByLabelText(/Monday start time/i);
    expect(startInputs.map((i) => (i as HTMLInputElement).value)).toContain('09:00');
    expect(startInputs.map((i) => (i as HTMLInputElement).value)).not.toContain('11:00');
  });
});

describe('SchedulingWorkingHoursEditor — split shifts', () => {
  it('renders multiple rows for the same day in start-time order', () => {
    const admin = adminStub({
      workingHours: {
        list: [
          row({ id: 'pm', day_of_week: 3, start_time: '14:00', end_time: '18:00' }),
          row({ id: 'am', day_of_week: 3, start_time: '09:00', end_time: '13:00' }),
        ],
      },
    });
    render(<SchedulingWorkingHoursEditor admin={admin} resourceId={RICO_ID} />);
    const startInputs = screen
      .getAllByLabelText(/Wednesday start time/i)
      .map((i) => (i as HTMLInputElement).value);
    // The "new shift" placeholder also matches the label, so skip it. The
    // two persisted rows should appear in chronological order.
    expect(startInputs.slice(0, 2)).toEqual(['09:00', '14:00']);
  });
});

describe('SchedulingWorkingHoursEditor — mutations', () => {
  it('typing into a new-row input then clicking Add creates with the right shape', () => {
    const admin = adminStub({ workingHours: { list: [] } });
    render(<SchedulingWorkingHoursEditor admin={admin} resourceId={RICO_ID} />);
    const startInput = screen.getByLabelText(/Monday new start time/i) as HTMLInputElement;
    const endInput = screen.getByLabelText(/Monday new end time/i) as HTMLInputElement;
    fireEvent.change(startInput, { target: { value: '08:00' } });
    fireEvent.change(endInput, { target: { value: '16:00' } });
    // Day 1 row (Monday) — find its add button. Since each day renders one,
    // the Monday section has one "+ Add hours" button before the next day's.
    const addButtons = screen.getAllByRole('button', { name: /Add hours/i });
    fireEvent.click(addButtons[1]); // [0]=Sun, [1]=Mon
    expect(admin.workingHours.create).toHaveBeenCalledWith(
      expect.objectContaining({
        resource_id: RICO_ID,
        day_of_week: 1,
        start_time: '08:00',
        end_time: '16:00',
      }),
    );
  });

  it('blurring an existing start/end input updates that row', () => {
    const admin = adminStub({
      workingHours: {
        list: [row({ id: 'wh-1', day_of_week: 4, start_time: '10:00', end_time: '17:00' })],
      },
    });
    render(<SchedulingWorkingHoursEditor admin={admin} resourceId={RICO_ID} />);
    const inputs = screen.getAllByLabelText(/Thursday start time/i);
    const persistedStart = inputs[0] as HTMLInputElement;
    fireEvent.blur(persistedStart, { target: { value: '11:00' } });
    expect(admin.workingHours.update).toHaveBeenCalledWith('wh-1', { start_time: '11:00' });
  });

  it('Remove deletes the row by id', () => {
    const admin = adminStub({
      workingHours: {
        list: [row({ id: 'wh-9' })],
      },
    });
    render(<SchedulingWorkingHoursEditor admin={admin} resourceId={RICO_ID} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Remove/i })[0]);
    expect(admin.workingHours.remove).toHaveBeenCalledWith('wh-9');
  });

  it('rejects an invalid range (end <= start) — Add does not fire create', () => {
    const admin = adminStub({ workingHours: { list: [] } });
    render(<SchedulingWorkingHoursEditor admin={admin} resourceId={RICO_ID} />);
    const startInput = screen.getByLabelText(/Sunday new start time/i) as HTMLInputElement;
    const endInput = screen.getByLabelText(/Sunday new end time/i) as HTMLInputElement;
    fireEvent.change(startInput, { target: { value: '10:00' } });
    fireEvent.change(endInput, { target: { value: '09:00' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Add hours/i })[0]);
    expect(admin.workingHours.create).not.toHaveBeenCalled();
  });
});

describe('SchedulingWorkingHoursEditor — closed days', () => {
  it("days with zero rows show the closed-day label", () => {
    const admin = adminStub({ workingHours: { list: [] } });
    render(
      <SchedulingWorkingHoursEditor
        admin={admin}
        resourceId={RICO_ID}
        emptyDayLabel="Closed"
      />,
    );
    // Each day renders the empty label since list is empty — there will be 7.
    const closedNodes = screen.getAllByText('Closed');
    expect(closedNodes.length).toBe(7);
  });
});
