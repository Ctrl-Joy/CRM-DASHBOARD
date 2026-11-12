import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';

export type DemoRole = 'admin' | 'manager' | 'rep';

/** Whether the server has the separate Northwind Demo workspace to show off. */
export function useDemoAvailable() {
  const { data } = useQuery({ queryKey: ['demo'], queryFn: () => api.get<{ available: boolean }>('/auth/demo'), staleTime: 60_000, retry: false });
  return data?.available ?? false;
}

/** Signs into the shared demo workspace as the chosen role. */
export function useDemoLogin() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [pending, setPending] = React.useState<DemoRole | null>(null);
  const start = async (role: DemoRole = 'admin') => {
    setPending(role);
    try {
      await api.post('/auth/demo', { role });
      await qc.invalidateQueries({ queryKey: ['me'] });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPending(null);
    }
  };
  return { start, pending };
}
