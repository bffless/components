import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SchedulingResourcesTable } from './ResourcesTable';
import { adminStub } from './__test-helpers';
import type { SchedulingResource } from '../../../types/scheduling';

const RICO: SchedulingResource = {
  id: 'res-rico',
  name: 'rico',
  active: true,
};

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('SchedulingResourcesTable — expandable rows', () => {
  it('does not render an expand toggle when renderExpanded is omitted (back-compat)', () => {
    const admin = adminStub({ resources: { list: [RICO] } });
    render(<SchedulingResourcesTable admin={admin} />);
    expect(screen.queryByRole('button', { name: /Configure/i })).toBeNull();
  });

  it('renders an expand toggle and the panel when renderExpanded is supplied', () => {
    const admin = adminStub({ resources: { list: [RICO] } });
    render(
      <SchedulingResourcesTable
        admin={admin}
        renderExpanded={(resource) => <div>panel for {resource.name}</div>}
      />,
    );
    // Panel hidden initially.
    expect(screen.queryByText('panel for rico')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Configure/i }));
    expect(screen.getByText('panel for rico')).toBeInTheDocument();

    // Toggle re-collapses.
    fireEvent.click(screen.getByRole('button', { name: /Close/i }));
    expect(screen.queryByText('panel for rico')).toBeNull();
  });

  it('passes expanded + toggleExpanded helpers to renderRow', () => {
    const admin = adminStub({ resources: { list: [RICO] } });
    render(
      <SchedulingResourcesTable
        admin={admin}
        renderExpanded={() => <div>panel</div>}
        renderRow={(resource, actions) => (
          <div>
            <span>{resource.name}-{actions.expanded ? 'open' : 'closed'}</span>
            <button onClick={actions.toggleExpanded}>flip</button>
          </div>
        )}
      />,
    );
    expect(screen.getByText('rico-closed')).toBeInTheDocument();
    fireEvent.click(screen.getByText('flip'));
    expect(screen.getByText('rico-open')).toBeInTheDocument();
    expect(screen.getByText('panel')).toBeInTheDocument();
  });
});
