import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BookingFlow } from './BookingFlow';
import type { UseSchedulingResult } from '../../hooks/useScheduling';
import type { SchedulingState } from '../../types/scheduling';

// ─── A stub UseSchedulingResult — lets us drive each render scenario without
// running through the actual hook + mocked fetch.
function stubScheduling(state: SchedulingState): UseSchedulingResult {
  return {
    basePath: '/api/scheduling',
    state,
    services: [],
    resources: [],
    slots: [],
    loading: false,
    error: null,
    loadServices: vi.fn(async () => {}),
    pickService: vi.fn(async () => {}),
    pickResource: vi.fn(async () => {}),
    loadAvailability: vi.fn(async () => {}),
    pickSlot: vi.fn(),
    setDetails: vi.fn(),
    submit: vi.fn(async () => {}),
    reset: vi.fn(),
    back: vi.fn(),
  };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

// ─── State-gated rendering ───────────────────────────────────────────────────

describe('BookingFlow.* — state-gated rendering', () => {
  it('Service renders only when status === idle', () => {
    const { rerender, container } = render(
      <BookingFlow scheduling={stubScheduling({ status: 'idle' })}>
        <BookingFlow.Service className="svc" />
      </BookingFlow>,
    );
    // idle: empty list rendered (no services), but the wrapper div exists.
    expect(container.querySelector('.svc')).toBeInTheDocument();

    rerender(
      <BookingFlow
        scheduling={stubScheduling({
          status: 'service_selected',
          service: { id: 's1', name: 'Cut', duration_minutes: 30, active: true },
        })}
      >
        <BookingFlow.Service className="svc" />
      </BookingFlow>,
    );
    expect(container.querySelector('.svc')).not.toBeInTheDocument();
  });

  it('Resource renders only when status === service_selected', () => {
    const { container } = render(
      <BookingFlow scheduling={stubScheduling({ status: 'idle' })}>
        <BookingFlow.Resource className="res" />
      </BookingFlow>,
    );
    expect(container.querySelector('.res')).not.toBeInTheDocument();
  });

  it('Confirm renders only when status === confirmed', () => {
    const confirmed: SchedulingState = {
      status: 'confirmed',
      service: { id: 's1', name: 'Cut', duration_minutes: 30, active: true },
      resource: { id: 'r1', name: 'Camille', active: true },
      slot: {
        start: '2026-05-10T14:00:00.000Z',
        end: '2026-05-10T14:30:00.000Z',
        resource_id: 'r1',
      },
      details: { customer_name: 'Test', customer_email: 't@example.com' },
      booking: { id: 'bk-1', reschedule_token: null, calendar_event_link: null },
    };
    render(
      <BookingFlow scheduling={stubScheduling(confirmed)}>
        <BookingFlow.Confirm>
          {(state) => <p>booked-{state.service.name}</p>}
        </BookingFlow.Confirm>
      </BookingFlow>,
    );
    expect(screen.getByText('booked-Cut')).toBeInTheDocument();
  });
});

// ─── className passthrough ───────────────────────────────────────────────────

describe('BookingFlow.* — className passthrough', () => {
  it('Service applies className to the root element of the picker', () => {
    const stub = stubScheduling({ status: 'idle' });
    stub.services = [
      { id: 's1', name: 'Cut', duration_minutes: 30, active: true },
    ];
    const { container } = render(
      <BookingFlow scheduling={stub}>
        <BookingFlow.Service className="svc-grid" itemClassName="svc-item" />
      </BookingFlow>,
    );
    expect(container.querySelector('.svc-grid')).toBeInTheDocument();
    expect(container.querySelector('.svc-item')).toBeInTheDocument();
  });

  it('Confirm applies className to its custom-render wrapper', () => {
    const confirmed: SchedulingState = {
      status: 'confirmed',
      service: { id: 's1', name: 'Cut', duration_minutes: 30, active: true },
      resource: null,
      slot: {
        start: '2026-05-10T14:00:00.000Z',
        end: '2026-05-10T14:30:00.000Z',
        resource_id: 'r1',
      },
      details: { customer_name: 'Test', customer_email: 't@example.com' },
      booking: { id: 'bk-1', reschedule_token: null, calendar_event_link: null },
    };
    const { container } = render(
      <BookingFlow scheduling={stubScheduling(confirmed)}>
        <BookingFlow.Confirm className="confirm-card">
          {() => <p>ok</p>}
        </BookingFlow.Confirm>
      </BookingFlow>,
    );
    expect(container.querySelector('.confirm-card')).toBeInTheDocument();
  });
});

// ─── Compound primitive context error ───────────────────────────────────────

describe('BookingFlow.* — context error', () => {
  it('Service throws a clear error when rendered outside <BookingFlow>', () => {
    expect(() => render(<BookingFlow.Service />)).toThrow(
      /must be rendered inside <BookingFlow>/,
    );
  });

  it('Resource throws a clear error when rendered outside <BookingFlow>', () => {
    expect(() => render(<BookingFlow.Resource />)).toThrow(
      /must be rendered inside <BookingFlow>/,
    );
  });
});
