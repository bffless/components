import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SchedulingServicesTable } from './ServicesTable';
import { adminStub } from './__test-helpers';
import type { SchedulingService } from '../../../types/scheduling';

const HAIRCUT: SchedulingService = {
  id: 'svc-haircut',
  name: 'Haircut',
  duration_minutes: 30,
  price_cents: 3000,
  active: true,
};

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Add-row form: dollars → cents conversion ────────────────────────────────

describe('SchedulingServicesTable — new-service form takes dollars', () => {
  it("user types '30' and submit fires create with price_cents: 3000", async () => {
    const admin = adminStub({ services: { list: [] } });
    render(<SchedulingServicesTable admin={admin} />);
    fireEvent.change(screen.getByPlaceholderText('Service name'), {
      target: { value: 'Haircut' },
    });
    fireEvent.change(screen.getByLabelText('Price in dollars'), {
      target: { value: '30' },
    });
    fireEvent.submit(screen.getByPlaceholderText('Service name').closest('form')!);
    expect(admin.services.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Haircut', price_cents: 3000 }),
    );
  });

  it("'29.99' becomes 2999 cents (rounds half-up)", async () => {
    const admin = adminStub({ services: { list: [] } });
    render(<SchedulingServicesTable admin={admin} />);
    fireEvent.change(screen.getByPlaceholderText('Service name'), {
      target: { value: 'Color' },
    });
    fireEvent.change(screen.getByLabelText('Price in dollars'), {
      target: { value: '29.99' },
    });
    fireEvent.submit(screen.getByPlaceholderText('Service name').closest('form')!);
    expect(admin.services.create).toHaveBeenCalledWith(
      expect.objectContaining({ price_cents: 2999 }),
    );
  });

  it("strips a leading '$' and thousand-separator commas (e.g. '$1,200.50')", async () => {
    const admin = adminStub({ services: { list: [] } });
    render(<SchedulingServicesTable admin={admin} />);
    fireEvent.change(screen.getByPlaceholderText('Service name'), {
      target: { value: 'Premium Color' },
    });
    fireEvent.change(screen.getByLabelText('Price in dollars'), {
      target: { value: '$1,200.50' },
    });
    fireEvent.submit(screen.getByPlaceholderText('Service name').closest('form')!);
    expect(admin.services.create).toHaveBeenCalledWith(
      expect.objectContaining({ price_cents: 120050 }),
    );
  });

  it("empty price input creates the service with price_cents: 0 (free)", async () => {
    const admin = adminStub({ services: { list: [] } });
    render(<SchedulingServicesTable admin={admin} />);
    fireEvent.change(screen.getByPlaceholderText('Service name'), {
      target: { value: 'Consult' },
    });
    fireEvent.submit(screen.getByPlaceholderText('Service name').closest('form')!);
    expect(admin.services.create).toHaveBeenCalledWith(
      expect.objectContaining({ price_cents: 0 }),
    );
  });

  it("garbage input (e.g. 'abc') falls back to 0 — no NaN reaches the API", async () => {
    const admin = adminStub({ services: { list: [] } });
    render(<SchedulingServicesTable admin={admin} />);
    fireEvent.change(screen.getByPlaceholderText('Service name'), {
      target: { value: 'Test' },
    });
    fireEvent.change(screen.getByLabelText('Price in dollars'), {
      target: { value: 'abc' },
    });
    fireEvent.submit(screen.getByPlaceholderText('Service name').closest('form')!);
    expect(admin.services.create).toHaveBeenCalledWith(
      expect.objectContaining({ price_cents: 0 }),
    );
  });
});

// ─── Existing rows: editable price + display ─────────────────────────────────

describe('SchedulingServicesTable — existing service rows', () => {
  it("displays price_cents in dollars (3000 → 30) in the editable input", () => {
    const admin = adminStub({ services: { list: [HAIRCUT] } });
    render(<SchedulingServicesTable admin={admin} />);
    const priceInput = screen.getByLabelText('Price for Haircut in dollars') as HTMLInputElement;
    expect(priceInput.value).toBe('30');
  });

  it("blurring the price input updates the row with cents conversion", () => {
    const admin = adminStub({ services: { list: [HAIRCUT] } });
    render(<SchedulingServicesTable admin={admin} />);
    const priceInput = screen.getByLabelText('Price for Haircut in dollars');
    fireEvent.blur(priceInput, { target: { value: '45.50' } });
    expect(admin.services.update).toHaveBeenCalledWith('svc-haircut', { price_cents: 4550 });
  });

  it("blurring with the same value (no-op) does NOT call update", () => {
    const admin = adminStub({ services: { list: [HAIRCUT] } });
    render(<SchedulingServicesTable admin={admin} />);
    const priceInput = screen.getByLabelText('Price for Haircut in dollars');
    fireEvent.blur(priceInput, { target: { value: '30' } });
    expect(admin.services.update).not.toHaveBeenCalled();
  });
});
