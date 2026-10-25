import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import type {
  CustomField, EmailTemplate, Me, Paginated, Permission, Pipeline, SavedView, Tag, Team, User,
} from '@crm/shared';
import { api, ApiError } from '@/lib/api';
import { toast } from 'sonner';

// ---------- session ----------
export const useMe = () => useQuery({
  queryKey: ['me'], queryFn: () => api.get<Me>('/auth/me'), staleTime: 60_000,
  // Retry transient failures (e.g. the API restarting), never a 401.
  retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 3,
  retryDelay: 1000,
});

export function useCan() {
  const { data } = useMe();
  return (perm: Permission) => !!data?.permissions.includes(perm);
}

// ---------- shared lookups (cached across the app) ----------
const lookup = <T>(key: string, path: string) => () =>
  useQuery({ queryKey: [key], queryFn: () => api.get<{ data: T[] }>(path).then((r) => r.data), staleTime: 5 * 60_000 });

export const useUsers = lookup<User>('users', '/users');
export const useTeams = lookup<Team>('teams', '/teams');
export const usePipelines = lookup<Pipeline>('pipelines', '/pipelines');
export const useTags = lookup<Tag>('tags', '/settings/tags');
export const useTemplates = lookup<EmailTemplate>('templates', '/templates');
export const useCustomFields = (entityType: string) => {
  const q = useQuery({ queryKey: ['custom-fields'], queryFn: () => api.get<{ data: CustomField[] }>('/settings/custom-fields').then((r) => r.data), staleTime: 5 * 60_000 });
  return { ...q, data: q.data?.filter((f) => f.entityType === entityType) ?? [] };
};
export const useViews = (entityType: string) =>
  useQuery({ queryKey: ['views', entityType], queryFn: () => api.get<{ data: SavedView[] }>('/views', { entityType }).then((r) => r.data) });

// ---------- generic record hooks ----------
export function useList<T>(path: string, params: Record<string, string | number | undefined>, enabled = true) {
  return useQuery({
    queryKey: [path, 'list', params],
    queryFn: () => api.get<Paginated<T>>(path, params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useRecord<T>(path: string, id: string | undefined, suffix = '') {
  return useQuery({ queryKey: [path, id, suffix], queryFn: () => api.get<T>(`${path}/${id}${suffix}`), enabled: !!id });
}

/** Mutation that toasts on success/failure and invalidates the given cache keys. */
export function useAction<TVars, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  opts: { success?: string | ((r: TResult) => string); invalidate?: QueryKey[]; onSuccess?: (r: TResult, v: TVars) => void } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, v) => {
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(r) : opts.success);
      (opts.invalidate ?? []).forEach((key) => qc.invalidateQueries({ queryKey: key }));
      opts.onSuccess?.(r, v);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
