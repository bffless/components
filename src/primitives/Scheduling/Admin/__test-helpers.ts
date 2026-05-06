import { vi } from 'vitest';
import type {
  CrudResult,
  SingletonResult,
  UseSchedulingAdminResult,
} from '../../../hooks/useSchedulingAdmin';
import type {
  SchedulingResource,
  SchedulingResourceServiceLink,
  SchedulingService,
  SchedulingSettings,
  SchedulingTimeOff,
  SchedulingWorkingHours,
} from '../../../types/scheduling';

// Minimal CRUD stub so each test only has to specify the slice it cares about.
// All mutation functions return a Promise with a sensible default; tests can
// override to return errors or specific records.
export function crudStub<T extends { id: string }>(
  over: Partial<CrudResult<T>> = {},
): CrudResult<T> {
  return {
    list: [],
    loading: false,
    error: null,
    refresh: vi.fn(async () => {}),
    create: vi.fn(async (input: Partial<T>) => ({ ...input, id: 'new-id' } as unknown as T)),
    update: vi.fn(async (id: string, patch: Partial<T>) => ({ id, ...patch } as unknown as T)),
    remove: vi.fn(async () => true),
    ...over,
  };
}

export function singletonStub<T>(
  over: Partial<SingletonResult<T>> = {},
): SingletonResult<T> {
  return {
    value: null,
    loading: false,
    error: null,
    refresh: vi.fn(async () => {}),
    update: vi.fn(async (patch: Partial<T>) => patch as T),
    ...over,
  };
}

export interface AdminStubOver {
  services?: Partial<CrudResult<SchedulingService>>;
  resources?: Partial<CrudResult<SchedulingResource>>;
  resourceServices?: Partial<
    CrudResult<SchedulingResourceServiceLink & { id: string }>
  >;
  workingHours?: Partial<CrudResult<SchedulingWorkingHours>>;
  timeOff?: Partial<CrudResult<SchedulingTimeOff>>;
  settings?: Partial<SingletonResult<SchedulingSettings>>;
}

export function adminStub(over: AdminStubOver = {}): UseSchedulingAdminResult {
  return {
    basePath: '/api/scheduling',
    services: crudStub<SchedulingService>(over.services),
    resources: crudStub<SchedulingResource>(over.resources),
    resourceServices: crudStub<SchedulingResourceServiceLink & { id: string }>(
      over.resourceServices,
    ),
    workingHours: crudStub<SchedulingWorkingHours>(over.workingHours),
    timeOff: crudStub<SchedulingTimeOff>(over.timeOff),
    settings: singletonStub<SchedulingSettings>(over.settings),
  };
}
