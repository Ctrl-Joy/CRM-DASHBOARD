import * as React from 'react';
import { Command } from 'cmdk';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import type { Paginated } from '@crm/shared';
import { api } from '@/lib/api';
import { cn, fullName } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/overlay';
import { Avatar } from '@/components/ui/display';
import { Select } from '@/components/ui/form';
import { useTags, useUsers } from '@/hooks/data';

type Option = { id: string; label: string; sub?: string | null };

const SOURCES: Record<string, { path: string; map: (r: any) => Option }> = {
  contact: { path: '/contacts', map: (r) => ({ id: r.id, label: fullName(r), sub: r.email ?? r.company?.name }) },
  company: { path: '/companies', map: (r) => ({ id: r.id, label: r.name, sub: r.domain }) },
  deal: { path: '/deals', map: (r) => ({ id: r.id, label: r.title, sub: r.company?.name }) },
  lead: { path: '/leads', map: (r) => ({ id: r.id, label: fullName(r), sub: r.companyName }) },
  campaign: { path: '/campaigns', map: (r) => ({ id: r.id, label: r.name, sub: r.channel }) },
  product: { path: '/products', map: (r) => ({ id: r.id, label: r.name, sub: r.sku }) },
};
export type PickerEntity = keyof typeof SOURCES;

/** Searchable record combobox (server-side search, keyboard accessible). */
export const EntityPicker = React.forwardRef<HTMLButtonElement, {
  entity: PickerEntity; value: string | null | undefined; onChange: (id: string | null, option?: Option) => void;
  placeholder?: string; initialLabel?: string | null; id?: string; disabled?: boolean;
}>(({ entity, value, onChange, placeholder, initialLabel, id, disabled, ...aria }, ref) => {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [picked, setPicked] = React.useState<Option | null>(null);
  const src = SOURCES[entity];
  const { data, isFetching } = useQuery({
    queryKey: ['picker', entity, q],
    queryFn: () => api.get<Paginated<unknown>>(src.path, { q, pageSize: 20 }).then((r) => r.data.map(src.map)),
    enabled: open,
    staleTime: 30_000,
  });
  const { data: current } = useQuery({
    queryKey: [src.path, value, ''],
    queryFn: () => api.get<unknown>(`${src.path}/${value}`).then(src.map),
    enabled: !!value && !initialLabel && picked?.id !== value,
    staleTime: 60_000,
  });
  const label = value ? (picked?.id === value ? picked.label : initialLabel ?? current?.label ?? '…') : null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative">
        <PopoverTrigger asChild>
          <button ref={ref} id={id} type="button" disabled={disabled} role="combobox" aria-expanded={open} {...aria}
            className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 text-left text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
            <span className={cn('truncate', !label && 'text-muted-foreground')}>{label ?? placeholder ?? `Select ${entity}…`}</span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        </PopoverTrigger>
        {value && !disabled && (
          <button type="button" onClick={() => { onChange(null); setPicked(null); }} aria-label={`Clear ${entity}`}
            className="absolute right-8 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-secondary"><X className="size-3.5" /></button>
        )}
      </div>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-64 p-0">
        <Command shouldFilter={false} className="flex flex-col">
          <Command.Input value={q} onValueChange={setQ} placeholder={`Search ${entity}s…`} className="h-10 border-b bg-transparent px-3 text-sm outline-none" />
          <Command.List className="max-h-64 overflow-y-auto p-1">
            <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">{isFetching ? 'Searching…' : 'No matches'}</Command.Empty>
            {data?.map((o) => (
              <Command.Item key={o.id} value={o.id} onSelect={() => { setPicked(o); onChange(o.id, o); setOpen(false); }}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-secondary">
                <Check className={cn('size-4', value === o.id ? 'opacity-100' : 'opacity-0')} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.sub && <span className="truncate text-xs text-muted-foreground">{o.sub}</span>}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
});
EntityPicker.displayName = 'EntityPicker';

export const UserSelect = React.forwardRef<HTMLSelectElement, {
  value: string | null | undefined; onChange: (id: string | null) => void; allowEmpty?: string; id?: string; disabled?: boolean; className?: string;
}>(({ value, onChange, allowEmpty, ...rest }, ref) => {
  const { data: users = [] } = useUsers();
  return (
    <Select ref={ref} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} {...rest}>
      {allowEmpty !== undefined && <option value="">{allowEmpty}</option>}
      {users.filter((u) => u.active || u.id === value).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
    </Select>
  );
});
UserSelect.displayName = 'UserSelect';

export function UserChip({ user }: { user: { name: string; avatarUrl?: string | null } | null | undefined }) {
  if (!user) return <span className="text-muted-foreground">Unassigned</span>;
  return <span className="inline-flex min-w-0 items-center gap-1.5"><Avatar name={user.name} src={user.avatarUrl} size="xs" /><span className="truncate">{user.name}</span></span>;
}

/** Free-form tag input with suggestions from the org's tag list. */
export function TagInput({ value, onChange, id }: { value: string[]; onChange: (tags: string[]) => void; id?: string }) {
  const [draft, setDraft] = React.useState('');
  const { data: all = [] } = useTags();
  const add = (t: string) => {
    const tag = t.trim();
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setDraft('');
  };
  const suggestions = all.filter((t) => !value.includes(t.name) && t.name.toLowerCase().includes(draft.toLowerCase())).slice(0, 6);
  return (
    <div>
      <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-md border border-input bg-card px-2 py-1 shadow-sm focus-within:ring-2 focus-within:ring-ring">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-xs">
            {t}<button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Remove tag ${t}`}><X className="size-3" /></button>
          </span>
        ))}
        <input id={id} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={value.length ? '' : 'Add tags…'}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ',') && draft.trim()) { e.preventDefault(); add(draft); }
            if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => draft.trim() && add(draft)}
          className="min-w-[6rem] flex-1 bg-transparent py-0.5 text-sm outline-none" />
      </div>
      {draft && suggestions.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {suggestions.map((s) => (
            <button key={s.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(s.name)}
              className="rounded border px-1.5 py-0.5 text-xs hover:bg-secondary">{s.name}</button>
          ))}
        </div>
      )}
    </div>
  );
}
