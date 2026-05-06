import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SchedulingServicesPicker } from './ServicesPicker';
import { adminStub } from './__test-helpers';
import type { SchedulingService } from '../../../types/scheduling';

const RICO_ID = 'res-rico';
const ALEX_ID = 'res-alex';

const HAIRCUT: SchedulingService = {
  id: 'svc-haircut',
  name: 'Haircut',
  duration_minutes: 30,
  active: true,
};

const COLOR: SchedulingService = {
  id: 'svc-color',
  name: 'Color',
  duration_minutes: 90,
  active: true,
};

const HIDDEN_SERVICE: SchedulingService = {
  id: 'svc-hidden',
  name: 'Old service',
  duration_minutes: 30,
  active: false,
};

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('SchedulingServicesPicker — chip rendering', () => {
  it('renders a chip per active service; hidden services are filtered out', () => {
    const admin = adminStub({
      services: { list: [HAIRCUT, COLOR, HIDDEN_SERVICE] },
    });
    render(<SchedulingServicesPicker admin={admin} resourceId={RICO_ID} />);
    expect(screen.getByRole('button', { name: 'Haircut' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Color' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Old service' })).toBeNull();
  });

  it('marks chips as pressed when a link row exists for this resource + service', () => {
    const admin = adminStub({
      services: { list: [HAIRCUT, COLOR] },
      resourceServices: {
        list: [
          { id: 'rs-1', resource_id: RICO_ID, service_id: HAIRCUT.id },
        ],
      },
    });
    render(<SchedulingServicesPicker admin={admin} resourceId={RICO_ID} />);
    expect(screen.getByRole('button', { name: 'Haircut' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Color' })).toHaveAttribute('aria-pressed', 'false');
  });

  it("ignores link rows belonging to a different resource", () => {
    const admin = adminStub({
      services: { list: [HAIRCUT] },
      resourceServices: {
        list: [{ id: 'rs-1', resource_id: ALEX_ID, service_id: HAIRCUT.id }],
      },
    });
    render(<SchedulingServicesPicker admin={admin} resourceId={RICO_ID} />);
    expect(screen.getByRole('button', { name: 'Haircut' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('SchedulingServicesPicker — toggle dispatch', () => {
  it('clicking an inactive chip CREATES a link row', () => {
    const admin = adminStub({
      services: { list: [HAIRCUT] },
      resourceServices: { list: [] },
    });
    render(<SchedulingServicesPicker admin={admin} resourceId={RICO_ID} />);
    fireEvent.click(screen.getByRole('button', { name: 'Haircut' }));
    expect(admin.resourceServices.create).toHaveBeenCalledWith({
      resource_id: RICO_ID,
      service_id: HAIRCUT.id,
    });
    expect(admin.resourceServices.remove).not.toHaveBeenCalled();
  });

  it('clicking an active chip REMOVES the link row', () => {
    const admin = adminStub({
      services: { list: [HAIRCUT] },
      resourceServices: {
        list: [{ id: 'rs-1', resource_id: RICO_ID, service_id: HAIRCUT.id }],
      },
    });
    render(<SchedulingServicesPicker admin={admin} resourceId={RICO_ID} />);
    fireEvent.click(screen.getByRole('button', { name: 'Haircut' }));
    expect(admin.resourceServices.remove).toHaveBeenCalledWith('rs-1');
    expect(admin.resourceServices.create).not.toHaveBeenCalled();
  });
});

describe('SchedulingServicesPicker — empty + render-prop', () => {
  it('shows the empty state when no services exist at all', () => {
    const admin = adminStub({ services: { list: [] } });
    render(
      <SchedulingServicesPicker
        admin={admin}
        resourceId={RICO_ID}
        emptyState={<span>nothing yet</span>}
      />,
    );
    expect(screen.getByText('nothing yet')).toBeInTheDocument();
  });

  it('renderChip receives the service + state and replaces the default chip', () => {
    const admin = adminStub({
      services: { list: [HAIRCUT, COLOR] },
      resourceServices: {
        list: [{ id: 'rs-1', resource_id: RICO_ID, service_id: HAIRCUT.id }],
      },
    });
    render(
      <SchedulingServicesPicker
        admin={admin}
        resourceId={RICO_ID}
        renderChip={(service, { active }) => (
          <span key={service.id}>{service.name}:{active ? 'on' : 'off'}</span>
        )}
      />,
    );
    expect(screen.getByText('Haircut:on')).toBeInTheDocument();
    expect(screen.getByText('Color:off')).toBeInTheDocument();
  });
});
