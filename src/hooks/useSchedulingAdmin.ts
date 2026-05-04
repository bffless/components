import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  resolveSchedulingBasePath,
  schedulingDelete,
  schedulingGet,
  schedulingPatch,
  schedulingPost,
  SchedulingClientError,
} from '../lib/schedulingClient';
import type {
  SchedulingResource,
  SchedulingResourceServiceLink,
  SchedulingService,
  SchedulingSettings,
  SchedulingTimeOff,
  SchedulingWorkingHours,
} from '../types/scheduling';

export interface UseSchedulingAdminOptions {
  apiBase?: string;
  /** Skip initial GETs on mount; consumer drives via .refresh(). */
  skipInitialLoad?: boolean;
}

interface AdminEntity {
  id: string;
}

export interface CrudResult<T extends AdminEntity> {
  list: T[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (input: Partial<T>) => Promise<T | null>;
  update: (id: string, patch: Partial<T>) => Promise<T | null>;
  remove: (id: string) => Promise<boolean>;
}

export interface SingletonResult<T> {
  value: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  update: (patch: Partial<T>) => Promise<T | null>;
}

export interface UseSchedulingAdminResult {
  basePath: string;
  services: CrudResult<SchedulingService>;
  resources: CrudResult<SchedulingResource>;
  resourceServices: CrudResult<SchedulingResourceServiceLink & { id: string }>;
  workingHours: CrudResult<SchedulingWorkingHours>;
  timeOff: CrudResult<SchedulingTimeOff>;
  settings: SingletonResult<SchedulingSettings>;
}

interface ListResponse<T> {
  records?: T[];
  // Some pipelines return collection-named keys (e.g. { services: [...] }).
  // The hook tolerates either by reading whichever key is non-empty.
  [k: string]: unknown;
}

function pickList<T>(data: ListResponse<T> | null, key: string): T[] {
  if (!data) return [];
  const namespaced = (data as any)[key];
  if (Array.isArray(namespaced)) return namespaced as T[];
  if (Array.isArray(data.records)) return data.records as T[];
  return [];
}

interface CrudConfig<T extends AdminEntity> {
  basePath: string;
  collection: string; // 'services' | 'resources' | …
  responseKey: string; // 'services' | 'records' | …
  initialLoad: boolean;
}

function useCrudResource<T extends AdminEntity>(
  cfg: CrudConfig<T>,
): CrudResult<T> {
  const { basePath, collection, responseKey, initialLoad } = cfg;
  const [list, setList] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setErr = useCallback((err: unknown, fallback: string) => {
    if (err instanceof SchedulingClientError) setError(err.message);
    else if (err instanceof Error) setError(err.message);
    else setError(fallback);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await schedulingGet<ListResponse<T>>(
        basePath,
        `/admin/${collection}`,
      );
      setList(pickList<T>(data, responseKey));
    } catch (err) {
      setErr(err, `Failed to load ${collection}.`);
    } finally {
      setLoading(false);
    }
  }, [basePath, collection, responseKey, setErr]);

  useEffect(() => {
    if (!initialLoad) return;
    refresh();
  }, [refresh, initialLoad]);

  const create = useCallback(
    async (input: Partial<T>): Promise<T | null> => {
      setError(null);
      try {
        const data = await schedulingPost<{ record?: T } & Record<string, unknown>>(
          basePath,
          `/admin/${collection}`,
          input,
        );
        const created = (data?.record ?? (data as unknown as T)) as T;
        if (created && created.id) {
          setList((prev) => [...prev, created]);
        }
        return created ?? null;
      } catch (err) {
        setErr(err, `Failed to create ${collection.replace(/s$/, '')}.`);
        return null;
      }
    },
    [basePath, collection, setErr],
  );

  // Optimistic update: apply the patch locally, send the request, revert on error.
  const update = useCallback(
    async (id: string, patch: Partial<T>): Promise<T | null> => {
      setError(null);
      const snapshot = list;
      setList((prev) =>
        prev.map((row) => (row.id === id ? ({ ...row, ...patch } as T) : row)),
      );
      try {
        const data = await schedulingPatch<{ record?: T } & Record<string, unknown>>(
          basePath,
          `/admin/${collection}/${id}`,
          patch,
        );
        const updated = (data?.record ?? (data as unknown as T)) as T;
        if (updated && updated.id) {
          setList((prev) =>
            prev.map((row) => (row.id === id ? updated : row)),
          );
        }
        return updated ?? null;
      } catch (err) {
        setList(snapshot);
        setErr(err, `Failed to update ${collection.replace(/s$/, '')}.`);
        return null;
      }
    },
    [basePath, collection, list, setErr],
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      setError(null);
      const snapshot = list;
      setList((prev) => prev.filter((row) => row.id !== id));
      try {
        await schedulingDelete(basePath, `/admin/${collection}/${id}`);
        return true;
      } catch (err) {
        setList(snapshot);
        setErr(err, `Failed to remove ${collection.replace(/s$/, '')}.`);
        return false;
      }
    },
    [basePath, collection, list, setErr],
  );

  return { list, loading, error, refresh, create, update, remove };
}

function useSingletonResource<T>(
  basePath: string,
  collection: string,
  initialLoad: boolean,
): SingletonResult<T> {
  const [value, setValue] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setErr = useCallback((err: unknown, fallback: string) => {
    if (err instanceof SchedulingClientError) setError(err.message);
    else if (err instanceof Error) setError(err.message);
    else setError(fallback);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await schedulingGet<{ record?: T } & Record<string, unknown>>(
        basePath,
        `/admin/${collection}`,
      );
      const next = (data?.record ?? (data as unknown as T)) ?? null;
      setValue(next as T | null);
    } catch (err) {
      setErr(err, `Failed to load ${collection}.`);
    } finally {
      setLoading(false);
    }
  }, [basePath, collection, setErr]);

  useEffect(() => {
    if (!initialLoad) return;
    refresh();
  }, [refresh, initialLoad]);

  const update = useCallback(
    async (patch: Partial<T>): Promise<T | null> => {
      setError(null);
      const snapshot = value;
      setValue((prev) => (prev ? ({ ...prev, ...patch } as T) : (patch as T)));
      try {
        const data = await schedulingPatch<{ record?: T } & Record<string, unknown>>(
          basePath,
          `/admin/${collection}`,
          patch,
        );
        const next = (data?.record ?? (data as unknown as T)) ?? null;
        setValue(next as T | null);
        return next as T | null;
      } catch (err) {
        setValue(snapshot);
        setErr(err, `Failed to update ${collection}.`);
        return null;
      }
    },
    [basePath, collection, value, setErr],
  );

  return { value, loading, error, refresh, update };
}

export function useSchedulingAdmin(
  opts: UseSchedulingAdminOptions = {},
): UseSchedulingAdminResult {
  const basePath = useMemo(
    () => opts.apiBase ?? resolveSchedulingBasePath(),
    [opts.apiBase],
  );
  const initialLoad = !opts.skipInitialLoad;

  const services = useCrudResource<SchedulingService>({
    basePath,
    collection: 'services',
    responseKey: 'services',
    initialLoad,
  });
  const resources = useCrudResource<SchedulingResource>({
    basePath,
    collection: 'resources',
    responseKey: 'resources',
    initialLoad,
  });
  // The provisioned pipelines (per Phase C-2) live at the underscore paths
  // matching the schema names: scheduling_resource_service /
  // scheduling_working_hours / scheduling_time_off. The hook previously
  // hyphenated these, which 404'd against every real deployment.
  const resourceServices = useCrudResource<
    SchedulingResourceServiceLink & { id: string }
  >({
    basePath,
    collection: 'resource_services',
    responseKey: 'resource_services',
    initialLoad,
  });
  const workingHours = useCrudResource<SchedulingWorkingHours>({
    basePath,
    collection: 'working_hours',
    responseKey: 'working_hours',
    initialLoad,
  });
  const timeOff = useCrudResource<SchedulingTimeOff>({
    basePath,
    collection: 'time_off',
    responseKey: 'time_off',
    initialLoad,
  });
  const settings = useSingletonResource<SchedulingSettings>(
    basePath,
    'settings',
    initialLoad,
  );

  // Keep a stable reference so consumers can put the result in a Context
  // without churn between renders.
  const lastRef = useRef<UseSchedulingAdminResult | null>(null);
  const next: UseSchedulingAdminResult = {
    basePath,
    services,
    resources,
    resourceServices,
    workingHours,
    timeOff,
    settings,
  };
  lastRef.current = next;
  return next;
}
