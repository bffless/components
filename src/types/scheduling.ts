// Mirrors the seven scheduling_* schemas from
// stories/backlog/0044-generic-scheduling/reference/data-model.md.
// Field shapes match the wire format returned by per-site scheduling pipelines.

export interface SchedulingService {
  id: string;
  name: string;
  description?: string | null;
  duration_minutes: number;
  buffer_before_minutes?: number | null;
  buffer_after_minutes?: number | null;
  price_cents?: number | null;
  color?: string | null;
  category?: string | null;
  active?: boolean;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
}

export interface SchedulingResource {
  id: string;
  name: string;
  bio?: string | null;
  photo_url?: string | null;
  email?: string | null;
  google_calendar_id?: string | null;
  timezone?: string | null;
  active?: boolean;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
}

export interface SchedulingResourceServiceLink {
  resource_id: string;
  service_id: string;
  created_at?: string;
}

export interface SchedulingWorkingHours {
  id: string;
  resource_id: string | null;
  day_of_week: number; // 0..6, 0 = Sunday
  start_time: string; // 'HH:MM'
  end_time: string;
  created_at?: string;
  updated_at?: string;
}

export interface SchedulingTimeOff {
  id: string;
  resource_id: string | null;
  starts_at: string;
  ends_at: string;
  reason?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type SchedulingBookingStatus =
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'no_show';

export interface SchedulingBooking {
  id: string;
  service_id: string;
  resource_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string | null;
  notes?: string | null;
  starts_at: string;
  ends_at: string;
  status: SchedulingBookingStatus;
  google_event_id?: string | null;
  reschedule_token?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type SchedulingVerticalPreset =
  | 'salon'
  | 'generic'
  | 'dentist'
  | 'tutor'
  | 'yoga';

export interface SchedulingSettings {
  id: number;
  timezone: string;
  slot_granularity_minutes: number;
  min_lead_time_minutes: number;
  max_advance_days: number;
  cancellation_window_hours: number;
  vertical_preset: SchedulingVerticalPreset;
  labels: Record<string, string>;
  updated_at?: string;
}

// A single bookable slot returned by GET /availability.
export interface SchedulingSlot {
  start: string; // ISO UTC
  end: string;
  resource_id: string;
}

// Customer-supplied details captured by DetailsForm.
export interface SchedulingBookingDetails {
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  notes?: string;
}

// Outcome of POST /bookings — the response_handler returns these fields.
export interface SchedulingConfirmedBooking {
  id: string;
  reschedule_token?: string | null;
  calendar_event_link?: string | null;
  googleSkipped?: boolean;
}

// Public booking flow state machine.
//
// The hook narrows `state.status` so primitives can render conditionally
// without re-deriving "is this step ready" predicates. Each transitional
// status carries the minimum data needed to render the next step's UI.
export type SchedulingState =
  | { status: 'idle' }
  | {
      status: 'service_selected';
      service: SchedulingService;
    }
  | {
      status: 'resource_selected';
      service: SchedulingService;
      resource: SchedulingResource | null; // null = "any available"
    }
  | {
      status: 'slot_selected';
      service: SchedulingService;
      resource: SchedulingResource | null;
      slot: SchedulingSlot;
    }
  | {
      status: 'details_filled';
      service: SchedulingService;
      resource: SchedulingResource | null;
      slot: SchedulingSlot;
      details: SchedulingBookingDetails;
    }
  | {
      status: 'submitting';
      service: SchedulingService;
      resource: SchedulingResource | null;
      slot: SchedulingSlot;
      details: SchedulingBookingDetails;
    }
  | {
      status: 'confirmed';
      service: SchedulingService;
      resource: SchedulingResource | null;
      slot: SchedulingSlot;
      details: SchedulingBookingDetails;
      booking: SchedulingConfirmedBooking;
    }
  | { status: 'error'; error: string };

// Public-facing aliases so consumers don't have to type the long Scheduling*
// prefix in every file.
export type Service = SchedulingService;
export type Resource = SchedulingResource;
export type Slot = SchedulingSlot;
export type BookingDetails = SchedulingBookingDetails;

// Sub-calendar entry returned by /admin/google/calendars when the project's
// Google Calendar integration is connected.
export interface SchedulingCalendarSummary {
  id: string;
  summary: string;
  primary?: boolean;
  backgroundColor?: string;
  foregroundColor?: string;
  accessRole?: string;
}
