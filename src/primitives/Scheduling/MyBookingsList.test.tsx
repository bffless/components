import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MyBookingsList } from './MyBookingsList';
import type { UseMyBookingsResult } from '../../hooks/useMyBookings';
import type { SchedulingMyBookingRow } from '../../types/scheduling';

// ─── Test fixtures ────────────────────────────────────────────────────────────

function row(over: Partial<SchedulingMyBookingRow>): SchedulingMyBookingRow {
  return {
    id: 'b-1',
    service_id: 'svc-1',
    service_name: 'Cut',
    resource_id: 'res-1',
    resource_name: 'Camille',
    starts_at: '2026-05-20T14:00:00.000Z',
    ends_at: '2026-05-20T14:30:00.000Z',
    status: 'confirmed',
    notes: null,
    reschedule_token: 'tok',
    manage_url: '/manage?token=tok',
    google_event_id: null,
    created_at: null,
    ...over,
  };
}

// Stub UseMyBookingsResult so tests don't have to mock fetch — we're
// verifying the primitive's gating + render-prop wiring, not the hook itself.
function stub(over: Partial<UseMyBookingsResult>): UseMyBookingsResult {
  return {
    basePath: '/api/scheduling',
    upcoming: [],
    past: [],
    loading: false,
    cancelling: null,
    error: null,
    refresh: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    ...over,
  };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

// ─── State-gated rendering ───────────────────────────────────────────────────

describe('MyBookingsList — state gating', () => {
  it('Loading renders only while loading', () => {
    const { rerender, container } = render(
      <MyBookingsList bookings={stub({ loading: true })}>
        <MyBookingsList.Loading className="loading">Hold on…</MyBookingsList.Loading>
      </MyBookingsList>,
    );
    expect(container.querySelector('.loading')).toBeInTheDocument();

    rerender(
      <MyBookingsList bookings={stub({ loading: false })}>
        <MyBookingsList.Loading className="loading">Hold on…</MyBookingsList.Loading>
      </MyBookingsList>,
    );
    expect(container.querySelector('.loading')).not.toBeInTheDocument();
  });

  it('Error renders only when there is an error and exposes the message via render-prop', () => {
    render(
      <MyBookingsList bookings={stub({ error: 'Boom' })}>
        <MyBookingsList.Error className="err">
          {(message) => <span>!! {message} !!</span>}
        </MyBookingsList.Error>
      </MyBookingsList>,
    );
    expect(screen.getByText('!! Boom !!')).toBeInTheDocument();
  });

  it('Empty hides while loading and reveals when both lists are empty', () => {
    const { rerender } = render(
      <MyBookingsList bookings={stub({ loading: true })}>
        <MyBookingsList.Empty className="empty">No bookings.</MyBookingsList.Empty>
      </MyBookingsList>,
    );
    expect(screen.queryByText('No bookings.')).toBeNull();

    rerender(
      <MyBookingsList bookings={stub({ loading: false })}>
        <MyBookingsList.Empty className="empty">No bookings.</MyBookingsList.Empty>
      </MyBookingsList>,
    );
    expect(screen.getByText('No bookings.')).toBeInTheDocument();
  });

  it('Empty hides when there are bookings', () => {
    render(
      <MyBookingsList bookings={stub({ upcoming: [row({ id: 'a' })] })}>
        <MyBookingsList.Empty className="empty">No bookings.</MyBookingsList.Empty>
      </MyBookingsList>,
    );
    expect(screen.queryByText('No bookings.')).toBeNull();
  });
});

// ─── Render-prop wiring ──────────────────────────────────────────────────────

describe('MyBookingsList — render-prop wiring', () => {
  it('Upcoming/Past invoke renderItem with the right rows', () => {
    render(
      <MyBookingsList
        bookings={stub({
          upcoming: [row({ id: 'up-1', service_name: 'Up Cut' })],
          past: [row({ id: 'past-1', service_name: 'Past Cut', reschedule_token: null })],
        })}
      >
        <MyBookingsList.Upcoming
          renderItem={(b) => <li key={b.id}>UP:{b.service_name}</li>}
        />
        <MyBookingsList.Past
          renderItem={(b) => <li key={b.id}>PAST:{b.service_name}</li>}
        />
      </MyBookingsList>,
    );
    expect(screen.getByText('UP:Up Cut')).toBeInTheDocument();
    expect(screen.getByText('PAST:Past Cut')).toBeInTheDocument();
  });

  it('Item helpers expose cancelling=true for the row currently being cancelled', () => {
    render(
      <MyBookingsList
        bookings={stub({
          upcoming: [row({ id: 'a' }), row({ id: 'b' })],
          cancelling: 'b',
        })}
      >
        <MyBookingsList.Upcoming
          renderItem={(b, { cancelling }) => (
            <span key={b.id}>{b.id}:{cancelling ? 'cancelling' : 'idle'}</span>
          )}
        />
      </MyBookingsList>,
    );
    expect(screen.getByText('a:idle')).toBeInTheDocument();
    expect(screen.getByText('b:cancelling')).toBeInTheDocument();
  });

  it('cancel helper dispatches the row id to the hook', async () => {
    const cancel = vi.fn(async () => {});
    render(
      <MyBookingsList bookings={stub({ upcoming: [row({ id: 'a' })], cancel })}>
        <MyBookingsList.Upcoming
          renderItem={(b, { cancel: cancelRow }) => (
            <button key={b.id} onClick={cancelRow}>
              cancel-{b.id}
            </button>
          )}
        />
      </MyBookingsList>,
    );
    screen.getByText('cancel-a').click();
    expect(cancel).toHaveBeenCalledWith('a');
  });

  it('Upcoming/Past hide entirely when their list is empty (default behavior)', () => {
    const { container } = render(
      <MyBookingsList bookings={stub({ upcoming: [] })}>
        <MyBookingsList.Upcoming
          className="upcoming"
          renderItem={() => <span>x</span>}
        >
          <h3>Upcoming bookings</h3>
        </MyBookingsList.Upcoming>
      </MyBookingsList>,
    );
    expect(container.querySelector('.upcoming')).not.toBeInTheDocument();
    expect(screen.queryByText('Upcoming bookings')).toBeNull();
  });

  it('renderEmpty: true keeps the section visible even when the list is empty', () => {
    render(
      <MyBookingsList bookings={stub({ upcoming: [] })}>
        <MyBookingsList.Upcoming
          renderEmpty
          renderItem={() => <span>x</span>}
        >
          <h3>Upcoming bookings</h3>
        </MyBookingsList.Upcoming>
      </MyBookingsList>,
    );
    expect(screen.getByText('Upcoming bookings')).toBeInTheDocument();
  });
});

// ─── Context guard ───────────────────────────────────────────────────────────

describe('MyBookingsList — context guard', () => {
  it('throws when a subcomponent is rendered outside the provider', () => {
    expect(() =>
      render(<MyBookingsList.Empty>orphaned</MyBookingsList.Empty>),
    ).toThrow(/MyBookingsList\./);
  });
});
