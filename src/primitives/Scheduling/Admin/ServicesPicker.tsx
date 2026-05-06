import { useMemo, type ReactNode } from 'react';
import type { UseSchedulingAdminResult } from '../../../hooks/useSchedulingAdmin';
import type {
  SchedulingResourceServiceLink,
  SchedulingService,
} from '../../../types/scheduling';

export interface SchedulingServicesPickerProps {
  admin: UseSchedulingAdminResult;
  /**
   * Resource whose service-coverage we're editing. Required — site-wide
   * resource_service rows aren't a thing (services either belong to a stylist
   * or they don't).
   */
  resourceId: string;
  className?: string;
  chipClassName?: string;
  /**
   * Optional override for active-state styling. When omitted the same
   * `chipClassName` is used for both states — consumers typically swap out
   * the className via render-prop instead.
   */
  activeChipClassName?: string;
  emptyState?: ReactNode;
  errorClassName?: string;
  /**
   * Optional renderer for each chip. Receives the service, whether the
   * resource currently performs it, and a `toggle` handler that handles the
   * create-or-delete on the link table.
   */
  renderChip?: (
    service: SchedulingService,
    state: { active: boolean; toggle: () => void; pending: boolean },
  ) => ReactNode;
}

export function SchedulingServicesPicker({
  admin,
  resourceId,
  className,
  chipClassName,
  activeChipClassName,
  emptyState,
  errorClassName,
  renderChip,
}: SchedulingServicesPickerProps) {
  // Build a map: serviceId -> link row id (or undefined if not linked).
  // Reused for the toggle's create/delete decision and for the per-chip
  // active-state styling.
  const linkByServiceId = useMemo(() => {
    const map = new Map<string, string>();
    for (const link of admin.resourceServices.list as Array<
      SchedulingResourceServiceLink & { id: string }
    >) {
      if (link.resource_id === resourceId) {
        map.set(link.service_id, link.id);
      }
    }
    return map;
  }, [admin.resourceServices.list, resourceId]);

  const toggle = (serviceId: string) => {
    const linkId = linkByServiceId.get(serviceId);
    if (linkId) {
      void admin.resourceServices.remove(linkId);
    } else {
      void admin.resourceServices.create({
        resource_id: resourceId,
        service_id: serviceId,
      });
    }
  };

  const activeServices = admin.services.list.filter(
    (s) => s.active === undefined || s.active === true,
  );

  if (admin.services.list.length === 0) {
    return (
      <div className={className}>
        {emptyState ?? <p>Add a service first — there's nothing to pick from.</p>}
      </div>
    );
  }

  // We treat the picker as pending while EITHER catalog is in flight; toggling
  // before both lists resolve risks creating a row against a stale id pair.
  const pending =
    admin.resourceServices.loading || admin.services.loading;
  const error = admin.resourceServices.error;

  return (
    <div className={className}>
      {error ? (
        <div className={errorClassName} role="alert">
          {error}
        </div>
      ) : null}
      {activeServices.map((service) => {
        const active = linkByServiceId.has(service.id);
        const handle = () => toggle(service.id);
        if (renderChip) return renderChip(service, { active, toggle: handle, pending });
        return (
          <button
            key={service.id}
            type="button"
            aria-pressed={active}
            disabled={pending}
            onClick={handle}
            className={active ? activeChipClassName ?? chipClassName : chipClassName}
          >
            {service.name}
          </button>
        );
      })}
    </div>
  );
}
