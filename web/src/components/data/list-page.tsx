import * as React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import Papa from 'papaparse';
import { toast } from 'sonner';
import {
  ArrowDown, ArrowUp, ArrowUpDown, Bookmark, ChevronLeft, ChevronRight, Download, Filter, MoreHorizontal, Search,
  Tag as TagIcon, Trash2, Upload, UserRound, X, type LucideIcon,
} from 'lucide-react';
import { labelize, type Paginated } from '@crm/shared';
import { api, download } from '@/lib/api';
import { cn, num } from '@/lib/utils';
import { useAction, useCan, useList, useUsers, useViews } from '@/hooks/data';
import { Button } from '@/components/ui/button';
import { Checkbox, Input, Select } from '@/components/ui/form';
import { Card, EmptyState, Skeleton } from '@/components/ui/display';
import {
  confirm, Dialog, DialogContent, DialogFooter, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/overlay';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  sortKey?: string;
  className?: string;
  hideBelow?: 'sm' | 'md' | 'lg';
  /** Inline edit: renders a select that PATCHes the field optimistically. */
  edit?: { field: string; options: readonly (string | { value: string; label: string })[]; value: (row: T) => string };
}

export type FilterDef =
  | { key: string; label: string; type: 'select'; options: readonly string[] | { value: string; label: string }[] }
  | { key: string; label: string; type: 'user' }
  | { key: string; label: string; type: 'date'; field: string };

const HIDE = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' };
const RESERVED = new Set(['q', 'page', 'sort', 'order', 'view']);

export function ListPage<T extends { id: string }>({
  entityType, path, columns, filters = [], rowLink, empty, toolbarExtra, bulkStatus, tags, importable, exportable = true, pageSize = 25,
}: {
  entityType: string; path: string; columns: Column<T>[]; filters?: FilterDef[]; rowLink?: (row: T) => string;
  empty: { icon: LucideIcon; title: string; description: string; action?: React.ReactNode };
  toolbarExtra?: React.ReactNode; bulkStatus?: { label: string; options: readonly string[] }; tags?: boolean;
  importable?: { columns: string }; exportable?: boolean; pageSize?: number;
}) {
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const can = useCan();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [qDraft, setQDraft] = React.useState(sp.get('q') ?? '');

  const params = Object.fromEntries([...sp.entries()].filter(([k]) => k !== 'view'));
  const queryParams = { pageSize, ...params };
  const { data, isLoading, isError, error, isFetching } = useList<T>(path, queryParams);
  const page = Number(sp.get('page') ?? 1);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const activeFilters = [...sp.keys()].filter((k) => !RESERVED.has(k));

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) v === null || v === '' ? next.delete(k) : next.set(k, v);
    if (!('page' in patch)) next.delete('page');
    next.delete('view');
    setSp(next, { replace: true });
    setSelected(new Set());
  };

  React.useEffect(() => {
    const t = setTimeout(() => { if ((sp.get('q') ?? '') !== qDraft) update({ q: qDraft || null }); }, 300);
    return () => clearTimeout(t);
  }, [qDraft]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSort = (key: string) => {
    const cur = sp.get('sort');
    const order = cur === key && sp.get('order') !== 'desc' ? 'desc' : 'asc';
    update({ sort: key, order });
  };

  const rows = data?.data ?? [];
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const bulk = useAction((body: { action: string; value?: string }) => api.post<{ count: number }>(`${path}/bulk`, { ids: [...selected], ...body }), {
    success: (r) => `Updated ${num(r.count)} record${r.count === 1 ? '' : 's'}`,
    invalidate: [[path]],
    onSuccess: () => setSelected(new Set()),
  });

  // Optimistic inline edit.
  const inlineEdit = async (row: T, field: string, value: string) => {
    const key = [path, 'list', queryParams];
    const prev = qc.getQueryData<Paginated<T>>(key);
    qc.setQueryData<Paginated<T>>(key, (old) => old && { ...old, data: old.data.map((r) => (r.id === row.id ? { ...r, [field]: value } : r)) });
    try {
      await api.patch(`${path}/${row.id}`, { [field]: value });
      qc.invalidateQueries({ queryKey: [path] });
    } catch (e) {
      qc.setQueryData(key, prev);
      toast.error((e as Error).message);
    }
  };

  return (
    <Card className="overflow-hidden">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={qDraft} onChange={(e) => setQDraft(e.target.value)} placeholder="Search…" className="pl-8" aria-label="Search records" />
        </div>
        {filters.length > 0 && <FilterPopover filters={filters} sp={sp} update={update} count={activeFilters.length} />}
        <SavedViews entityType={entityType} params={params} apply={(f) => { setSp(new URLSearchParams(f), { replace: true }); setQDraft(f.q ?? ''); }} />
        {activeFilters.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => { setSp(new URLSearchParams(), { replace: true }); setQDraft(''); }}><X />Clear</Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {toolbarExtra}
          {(importable || exportable) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="More actions"><MoreHorizontal /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {exportable && can('records:export') && <DropdownMenuItem onSelect={() => download(`${path}/export`, params)}><Download />Export CSV</DropdownMenuItem>}
                {importable && can('records:import') && <ImportItem path={path} hint={importable.columns} />}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* bulk bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-primary/5 px-3 py-2 text-sm" role="region" aria-label="Bulk actions">
          <span className="font-medium">{selected.size} selected</span>
          {can('records:reassign') && <BulkAssign onAssign={(id) => bulk.mutate({ action: 'assign', value: id })} />}
          {tags && <BulkTag onTag={(t) => bulk.mutate({ action: 'tag', value: t })} />}
          {bulkStatus && (
            <Select aria-label={`Set ${bulkStatus.label}`} className="w-40" value="" onChange={(e) => e.target.value && bulk.mutate({ action: 'status', value: e.target.value })}>
              <option value="">Set {bulkStatus.label.toLowerCase()}…</option>
              {bulkStatus.options.map((o) => <option key={o} value={o}>{labelize(o)}</option>)}
            </Select>
          )}
          {can('records:delete') && (
            <Button variant="ghost" size="sm" className="text-destructive" onClick={async () => {
              if (await confirm({ title: `Delete ${selected.size} records?`, description: 'They will be removed from lists and reports. Admins can see the deletion in the audit log.', destructive: true, confirmLabel: 'Delete' })) bulk.mutate({ action: 'delete' });
            }}><Trash2 />Delete</Button>
          )}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSelected(new Set())}>Clear selection</Button>
        </div>
      )}

      {/* table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-2.5">
                <Checkbox aria-label="Select all on this page" checked={allSelected ? true : selected.size ? 'indeterminate' : false}
                  onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))} />
              </th>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn('whitespace-nowrap px-3 py-2.5 font-medium', c.hideBelow && HIDE[c.hideBelow], c.className)}
                  aria-sort={sp.get('sort') === c.sortKey ? (sp.get('order') === 'desc' ? 'descending' : 'ascending') : undefined}>
                  {c.sortKey ? (
                    <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort(c.sortKey!)}>
                      {c.header}
                      {sp.get('sort') === c.sortKey ? (sp.get('order') === 'desc' ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />) : <ArrowUpDown className="size-3 opacity-40" />}
                    </button>
                  ) : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={cn('divide-y', isFetching && !isLoading && 'opacity-70 transition-opacity')}>
            {isLoading && Array.from({ length: 6 }).map((_, i) => (
              <tr key={i}><td className="px-3 py-3" colSpan={columns.length + 1}><Skeleton className="h-5 w-full" /></td></tr>
            ))}
            {rows.map((row) => (
              <tr key={row.id} className={cn('group transition-colors hover:bg-muted/40', selected.has(row.id) && 'bg-primary/5', rowLink && 'cursor-pointer')}
                onClick={(e) => { if (rowLink && !(e.target as HTMLElement).closest('a,button,input,select,[role=checkbox]')) navigate(rowLink(row)); }}>
                <td className="px-3 py-2.5">
                  <Checkbox aria-label="Select row" checked={selected.has(row.id)}
                    onCheckedChange={() => setSelected((s) => { const n = new Set(s); n.has(row.id) ? n.delete(row.id) : n.add(row.id); return n; })} />
                </td>
                {columns.map((c, i) => (
                  <td key={c.key} className={cn('px-3 py-2.5 align-middle', c.hideBelow && HIDE[c.hideBelow], c.className)}>
                    {c.edit ? (
                      <select aria-label={`Change ${c.header}`} value={c.edit.value(row)} onChange={(e) => inlineEdit(row, c.edit!.field, e.target.value)}
                        className="-ml-1 cursor-pointer rounded border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-input focus:border-input">
                        {c.edit.options.map((o) => typeof o === 'string'
                          ? <option key={o} value={o}>{labelize(o)}</option>
                          : <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : i === 0 && rowLink ? <Link to={rowLink(row)} className="font-medium hover:underline">{c.cell(row)}</Link> : c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {isError && <EmptyState icon={X} title="Couldn't load records" description={(error as Error).message} />}
        {!isLoading && !isError && rows.length === 0 && (
          activeFilters.length || sp.get('q')
            ? <EmptyState icon={Search} title="No matches" description="Try a different search or clear the filters." />
            : <EmptyState icon={empty.icon} title={empty.title} description={empty.description} action={empty.action} />
        )}
      </div>

      {/* pagination */}
      {data && data.total > 0 && (
        <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
          <span>{num((page - 1) * data.pageSize + 1)}–{num(Math.min(page * data.pageSize, data.total))} of {num(data.total)}</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })} aria-label="Previous page"><ChevronLeft /></Button>
            <span className="px-1">Page {page} of {totalPages}</span>
            <Button variant="ghost" size="icon-sm" disabled={page >= totalPages} onClick={() => update({ page: String(page + 1) })} aria-label="Next page"><ChevronRight /></Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function FilterPopover({ filters, sp, update, count }: { filters: FilterDef[]; sp: URLSearchParams; update: (p: Record<string, string | null>) => void; count: number }) {
  const { data: users = [] } = useUsers();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="default"><Filter />Filters{count > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{count}</span>}</Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3">
        {filters.map((f) => (
          <div key={f.key} className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`flt-${f.key}`}>{f.label}</label>
            {f.type === 'date' ? (
              <div className="flex gap-2">
                <Input id={`flt-${f.key}`} type="date" aria-label={`${f.label} from`} value={sp.get(`${f.field}_from`) ?? ''} onChange={(e) => update({ [`${f.field}_from`]: e.target.value || null })} />
                <Input type="date" aria-label={`${f.label} to`} value={sp.get(`${f.field}_to`)?.slice(0, 10) ?? ''} onChange={(e) => update({ [`${f.field}_to`]: e.target.value ? `${e.target.value}T23:59:59` : null })} />
              </div>
            ) : (
              <Select id={`flt-${f.key}`} value={sp.get(f.key) ?? ''} onChange={(e) => update({ [f.key]: e.target.value || null })}>
                <option value="">Any</option>
                {f.type === 'user'
                  ? <><option value="me">Me</option><option value="none">Unassigned</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</>
                  : f.options.map((o) => typeof o === 'string' ? <option key={o} value={o}>{labelize(o)}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function SavedViews({ entityType, params, apply }: { entityType: string; params: Record<string, string>; apply: (f: Record<string, string>) => void }) {
  const { data: views = [] } = useViews(entityType);
  const [name, setName] = React.useState('');
  const [shared, setShared] = React.useState(false);
  const save = useAction(() => api.post('/views', { entityType, name, filters: Object.fromEntries(Object.entries(params).filter(([k]) => k !== 'page')), shared }), {
    success: 'View saved', invalidate: [['views', entityType]], onSuccess: () => setName(''),
  });
  const remove = useAction((id: string) => api.del(`/views/${id}`), { invalidate: [['views', entityType]] });
  return (
    <Popover>
      <PopoverTrigger asChild><Button variant="outline"><Bookmark />Views</Button></PopoverTrigger>
      <PopoverContent className="w-72">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">Saved views</p>
        {views.length === 0 && <p className="mb-2 text-sm text-muted-foreground">No saved views yet.</p>}
        <ul className="mb-3 space-y-0.5">
          {views.map((v) => (
            <li key={v.id} className="group flex items-center gap-1">
              <button className="flex-1 truncate rounded px-2 py-1 text-left text-sm hover:bg-secondary" onClick={() => apply(v.filters)}>{v.name}{v.shared && <span className="ml-1 text-xs text-muted-foreground">(shared)</span>}</button>
              <button className="rounded p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100 focus:opacity-100" aria-label={`Delete view ${v.name}`} onClick={() => remove.mutate(v.id)}><X className="size-3.5" /></button>
            </li>
          ))}
        </ul>
        <form className="space-y-2 border-t pt-3" onSubmit={(e) => { e.preventDefault(); if (name.trim()) save.mutate(undefined); }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Save current filters as…" aria-label="View name" />
          <label className="flex items-center gap-2 text-xs"><Checkbox checked={shared} onCheckedChange={(c) => setShared(!!c)} />Share with my team</label>
          <Button size="sm" type="submit" className="w-full" disabled={!name.trim()} loading={save.isPending}>Save view</Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function BulkAssign({ onAssign }: { onAssign: (id: string) => void }) {
  const { data: users = [] } = useUsers();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="outline" size="sm"><UserRound />Assign</Button></DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Assign to</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {users.filter((u) => u.active).map((u) => <DropdownMenuItem key={u.id} onSelect={() => onAssign(u.id)}>{u.name}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BulkTag({ onTag }: { onTag: (t: string) => void }) {
  const [tag, setTag] = React.useState('');
  return (
    <Popover>
      <PopoverTrigger asChild><Button variant="outline" size="sm"><TagIcon />Tag</Button></PopoverTrigger>
      <PopoverContent className="w-60">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (tag.trim()) { onTag(tag.trim()); setTag(''); } }}>
          <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Tag name" aria-label="Tag name" autoFocus />
          <Button type="submit" size="sm">Add</Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function ImportItem({ path, hint }: { path: string; hint: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setOpen(true); }}><Upload />Import CSV</DropdownMenuItem>
      <ImportDialog open={open} onOpenChange={setOpen} path={path} hint={hint} />
    </>
  );
}

export function ImportDialog({ open, onOpenChange, path, hint }: { open: boolean; onOpenChange: (o: boolean) => void; path: string; hint: string }) {
  const [rows, setRows] = React.useState<Record<string, string>[]>([]);
  const [result, setResult] = React.useState<{ created: number; failed: { row: number; error: string }[] } | null>(null);
  const run = useAction(() => api.post<{ created: number; failed: { row: number; error: string }[] }>(`${path}/import`, { rows }), {
    invalidate: [[path]], onSuccess: (r) => { setResult(r); toast.success(`Imported ${r.created} record${r.created === 1 ? '' : 's'}`); },
  });
  const reset = () => { setRows([]); setResult(null); };
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent title="Import from CSV" description={`Use a header row. Recognised columns: ${hint}.`}>
        {!result ? (
          <>
            <input type="file" accept=".csv,text/csv" aria-label="CSV file" className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                Papa.parse<Record<string, string>>(file, {
                  header: true, skipEmptyLines: true,
                  complete: (r) => { if (r.data.length > 5000) toast.error('Import up to 5,000 rows at a time'); setRows(r.data.slice(0, 5000)); },
                  error: (err) => toast.error(err.message),
                });
              }} />
            {rows.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-sm font-medium">{num(rows.length)} rows ready. Preview:</p>
                <div className="max-h-48 overflow-auto rounded-md border text-xs">
                  <table className="w-full"><thead className="bg-muted"><tr>{Object.keys(rows[0]).map((h) => <th key={h} className="px-2 py-1 text-left">{h}</th>)}</tr></thead>
                    <tbody>{rows.slice(0, 5).map((r, i) => <tr key={i} className="border-t">{Object.values(r).map((v, j) => <td key={j} className="truncate px-2 py-1">{v}</td>)}</tr>)}</tbody></table>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button disabled={!rows.length} loading={run.isPending} onClick={() => run.mutate(undefined)}>Import {rows.length ? num(rows.length) : ''} rows</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <p className="text-sm"><b>{num(result.created)}</b> imported{result.failed.length > 0 && <>, <b className="text-destructive">{result.failed.length}</b> skipped</>}.</p>
            {result.failed.length > 0 && (
              <ul className="mt-3 max-h-48 space-y-1 overflow-auto text-xs text-muted-foreground">
                {result.failed.slice(0, 100).map((f) => <li key={f.row}>Row {f.row}: {f.error}</li>)}
              </ul>
            )}
            <DialogFooter><Button onClick={() => onOpenChange(false)}>Done</Button></DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
