import { type ReactNode } from 'react';
import {
  SchedulingWorkingHoursEditor,
  type SchedulingWorkingHoursEditorProps,
} from './WorkingHoursEditor';
import {
  SchedulingTimeOffList,
  type SchedulingTimeOffListProps,
} from './TimeOffList';
import type { UseSchedulingAdminResult } from '../../../hooks/useSchedulingAdmin';

export interface SchedulingSiteHoursPanelProps {
  admin: UseSchedulingAdminResult;
  className?: string;
  /**
   * Class for each section's wrapping container. Two sections render below
   * the optional headings: working hours, then closures.
   */
  sectionClassName?: string;
  workingHoursHeading?: ReactNode;
  timeOffHeading?: ReactNode;
  /**
   * Pass-through to the underlying WorkingHoursEditor. `resourceId` is
   * always null in the site panel — the picker scopes to site-wide rows.
   */
  workingHoursProps?: Omit<SchedulingWorkingHoursEditorProps, 'admin' | 'resourceId'>;
  /**
   * Pass-through to the underlying TimeOffList. `resourceId` is always null.
   */
  timeOffProps?: Omit<SchedulingTimeOffListProps, 'admin' | 'resourceId'>;
}

/**
 * Convenience wrapper for the salon-wide hours/closures pair.
 *
 * Site-wide rows in `scheduling_working_hours` and `scheduling_time_off` use
 * `resource_id IS NULL` to apply to every stylist — "the whole salon is
 * closed Sundays" or "we're shut between Christmas and New Year." This
 * panel just stitches the two underlying editors together with `resourceId:
 * null` and lets consumers style the heading wrappers.
 */
export function SchedulingSiteHoursPanel({
  admin,
  className,
  sectionClassName,
  workingHoursHeading,
  timeOffHeading,
  workingHoursProps,
  timeOffProps,
}: SchedulingSiteHoursPanelProps) {
  return (
    <div className={className}>
      <section className={sectionClassName}>
        {workingHoursHeading}
        <SchedulingWorkingHoursEditor
          admin={admin}
          resourceId={null}
          {...workingHoursProps}
        />
      </section>
      <section className={sectionClassName}>
        {timeOffHeading}
        <SchedulingTimeOffList
          admin={admin}
          resourceId={null}
          {...timeOffProps}
        />
      </section>
    </div>
  );
}
