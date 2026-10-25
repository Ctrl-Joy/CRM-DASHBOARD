import * as React from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { toast } from 'sonner';
import {
  Building, ChevronDown, ChevronRight, Copy, GitBranch, GripVertical, KeyRound, ListPlus, Lock, Plus, RefreshCw, ScrollText, Shield,
  Star, Tags, Trash2, UserCog, UserRound, Users,
} from 'lucide-react';
import {
  CURRENCIES, CUSTOM_FIELD_ENTITIES, CUSTOM_FIELD_TYPES, labelize, PERMISSIONS, ROLE_LABELS, ROLES, changePasswordSchema, inviteUserSchema,
  profileSchema, teamSchema, type AuditLog, type CustomField, type Paginated, type Permission, type Pipeline, type Role, type Team, type User,
} from '@crm/shared';
import { api } from '@/lib/api';
import { cn, dateTime, money, num } from '@/lib/utils';
import { useAction, useCan, useCustomFields, useMe, usePipelines, useTags, useTeams, useUsers } from '@/hooks/data';
import { useUi } from '@/stores/ui';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Skeleton } from '@/components/ui/display';
import { Checkbox, Field, Input, Select, Switch } from '@/components/ui/form';
import { confirm, Dialog, DialogContent, DialogFooter } from '@/components/ui/overlay';
import { RecordFormDialog, toFormValues, type FieldDef } from '@/components/records/record-form';
import { UserChip } from '@/components/records/pickers';

const SECTIONS: { to: string; label: string; icon: typeof UserRound; perm?: Permission }[] = [
  { to: 'profile', label: 'Profile', icon: UserRound },
  { to: 'organization', label: 'Organization', icon: Building, perm: 'settings:manage' },
  { to: 'users', label: 'Users & quotas', icon: UserCog, perm: 'users:manage' },
  { to: 'teams', label: 'Teams', icon: Users, perm: 'users:manage' },
  { to: 'roles', label: 'Roles & permissions', icon: Shield, perm: 'users:manage' },
  { to: 'pipelines', label: 'Pipelines', icon: GitBranch, perm: 'pipelines:manage' },
  { to: 'fields', label: 'Custom fields', icon: ListPlus, perm: 'settings:manage' },
  { to: 'tags', label: 'Tags', icon: Tags, perm: 'settings:manage' },
  { to: 'lead-capture', label: 'Lead capture & API', icon: KeyRound, perm: 'settings:manage' },
  { to: 'audit', label: 'Audit log', icon: ScrollText, perm: 'audit:read' },
];

export function SettingsPage() {
  const can = useCan();
  const sections = SECTIONS.filter((s) => !s.perm || can(s.perm));
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[13rem_1fr]">
        <nav aria-label="Settings" className="flex gap-1 overflow-x-auto md:flex-col">
          {sections.map((s) => (
            <NavLink key={s.to} to={s.to} className={({ isActive }) => cn('flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium', isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground')}>
              <s.icon className="size-4" />{s.label}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0">
          <Routes>
            <Route index element={<Navigate to="profile" replace />} />
            <Route path="profile" element={<Profile />} />
            {can('settings:manage') && <Route path="organization" element={<Organization />} />}
            {can('users:manage') && <><Route path="users" element={<UsersSection />} /><Route path="teams" element={<TeamsSection />} /><Route path="roles" element={<Roles />} /></>}
            {can('pipelines:manage') && <Route path="pipelines" element={<Pipelines />} />}
            {can('settings:manage') && <><Route path="fields" element={<Fields />} /><Route path="tags" element={<TagsSection />} /><Route path="lead-capture" element={<LeadCapture />} /></>}
            {can('audit:read') && <Route path="audit" element={<Audit />} />}
            <Route path="*" element={<Card><EmptyState icon={Lock} title="Not available" description="You don't have permission to view this section." /></Card>} />
          </Routes>
        </div>
      </div>
    </>
  );
}

// ---------- profile ----------
function Profile() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const { theme, setTheme } = useUi();
  const [profile, setProfile] = React.useState({ name: '', email: '', avatarUrl: '' });
  const [pw, setPw] = React.useState({ current: '', next: '' });
  React.useEffect(() => { if (me) setProfile({ name: me.name, email: me.email, avatarUrl: me.avatarUrl ?? '' }); }, [me]);
  const saveProfile = useAction(() => api.patch('/auth/me', profileSchema.parse(profile)), { success: 'Profile updated', onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }) });
  const savePw = useAction(() => api.post('/auth/me/password', changePasswordSchema.parse(pw)), { success: 'Password changed. Other sessions were signed out.', onSuccess: () => setPw({ current: '', next: '' }) });
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Your profile" description={me ? `${ROLE_LABELS[me.role]} at ${me.org.name}` : undefined} />
        <CardBody>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); saveProfile.mutate(undefined); }}>
            <Field label="Name"><Input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></Field>
            <Field label="Email"><Input type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} /></Field>
            <Field label="Avatar URL" className="sm:col-span-2" hint="Optional. Leave blank to use initials."><Input value={profile.avatarUrl} onChange={(e) => setProfile({ ...profile, avatarUrl: e.target.value })} /></Field>
            <div className="sm:col-span-2"><Button type="submit" loading={saveProfile.isPending}>Save profile</Button></div>
          </form>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Password" />
        <CardBody>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); savePw.mutate(undefined); }}>
            <Field label="Current password"><Input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
            <Field label="New password" hint="At least 8 characters"><Input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
            <div className="sm:col-span-2"><Button type="submit" disabled={!pw.current || pw.next.length < 8} loading={savePw.isPending}>Change password</Button></div>
          </form>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Appearance" />
        <CardBody className="flex gap-2">
          {(['light', 'dark', 'system'] as const).map((t) => <Button key={t} variant={theme === t ? 'default' : 'outline'} aria-pressed={theme === t} onClick={() => setTheme(t)}>{labelize(t)}</Button>)}
        </CardBody>
      </Card>
    </div>
  );
}

// ---------- organization ----------
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function Organization() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['org'], queryFn: () => api.get<{ name: string; currency: string; currencies: string[]; fiscalYearStartMonth: number; autoAssignLeads: boolean; assignmentMode: string }>('/settings/org') });
  const [form, setForm] = React.useState<typeof data>();
  React.useEffect(() => { if (data) setForm(data); }, [data]);
  const save = useAction(() => api.patch('/settings/org', form), { success: 'Organization updated', onSuccess: () => { qc.invalidateQueries({ queryKey: ['org'] }); qc.invalidateQueries({ queryKey: ['me'] }); } });
  if (!form) return <Skeleton className="h-64" />;
  return (
    <Card>
      <CardHeader title="Organization" description="Company details, currencies and lead routing." />
      <CardBody className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Organization name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Default currency"><Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Fiscal year starts"><Select value={form.fiscalYearStartMonth} onChange={(e) => setForm({ ...form, fiscalYearStartMonth: Number(e.target.value) })}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</Select></Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Currencies available on deals</legend>
          <div className="flex flex-wrap gap-3">
            {CURRENCIES.map((c) => (
              <label key={c} className="flex items-center gap-1.5 text-sm">
                <Checkbox checked={form.currencies.includes(c)} disabled={c === form.currency}
                  onCheckedChange={(v) => setForm({ ...form, currencies: v ? [...form.currencies, c] : form.currencies.filter((x) => x !== c) })} />{c}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="rounded-lg border p-4">
          <legend className="px-1 text-sm font-medium">Lead auto-assignment</legend>
          <label className="flex items-center gap-2 text-sm"><Switch checked={form.autoAssignLeads} onCheckedChange={(v) => setForm({ ...form, autoAssignLeads: v })} />Automatically assign inbound leads</label>
          <Field label="Rule" className="mt-3 max-w-sm"><Select value={form.assignmentMode} disabled={!form.autoAssignLeads} onChange={(e) => setForm({ ...form, assignmentMode: e.target.value })}>
            <option value="round_robin">Round-robin across sales reps</option><option value="territory">By territory (falls back to round-robin)</option>
          </Select></Field>
        </fieldset>
        <Button loading={save.isPending} onClick={() => save.mutate(undefined)}>Save changes</Button>
      </CardBody>
    </Card>
  );
}

// ---------- users ----------
const inviteFields: FieldDef[] = [
  { name: 'name', label: 'Name', type: 'text', required: true }, { name: 'email', label: 'Email', type: 'email', required: true },
  { name: 'role', label: 'Role', type: 'select', options: ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] })) },
  { name: 'password', label: 'Temporary password', type: 'text', required: true, hint: 'Share it securely; they can change it in their profile.' },
  { name: 'quota', label: 'Monthly quota', type: 'number' }, { name: 'territory', label: 'Territory', type: 'text' },
];
function UsersSection() {
  const { data: users = [], isLoading } = useUsers();
  const { data: teams = [] } = useTeams();
  const { data: me } = useMe();
  const [inviting, setInviting] = React.useState(false);
  const [editing, setEditing] = React.useState<User | null>(null);
  const invite = useAction((v: Record<string, unknown>) => api.post('/users', v), { success: 'User added', invalidate: [['users']] });
  return (
    <Card>
      <CardHeader title="Users & quotas" description="Monthly quotas drive quota attainment and pipeline coverage on dashboards." action={<Button size="sm" onClick={() => setInviting(true)}><Plus />Add user</Button>} />
      <CardBody className="overflow-x-auto">
        {isLoading ? <Skeleton className="h-40" /> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr>{['User', 'Role', 'Team', 'Quota / mo', 'Territory', 'Status', ''].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y">{users.map((u) => (
              <tr key={u.id}>
                <td className="px-2 py-2"><span className="flex items-center gap-2"><Avatar name={u.name} src={u.avatarUrl} size="sm" /><span><span className="block font-medium">{u.name}{u.id === me?.id && <span className="text-muted-foreground"> (you)</span>}</span><span className="block text-xs text-muted-foreground">{u.email}</span></span></span></td>
                <td className="px-2"><Badge variant={u.role === 'admin' ? 'purple' : u.role === 'manager' ? 'default' : 'secondary'}>{ROLE_LABELS[u.role]}</Badge></td>
                <td className="px-2">{u.team?.name ?? '—'}</td>
                <td className="px-2 tabular">{u.quota ? money(u.quota, me?.org.currency) : '—'}</td>
                <td className="px-2">{u.territory ?? '—'}</td>
                <td className="px-2">{u.active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Deactivated</Badge>}</td>
                <td className="px-2 text-right"><Button size="sm" variant="ghost" onClick={() => setEditing(u)}>Edit</Button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </CardBody>
      <RecordFormDialog open={inviting} onOpenChange={setInviting} title="Add user" schema={inviteUserSchema} fields={inviteFields}
        defaultValues={toFormValues(inviteFields, undefined, { role: 'rep', quota: 0, teamId: null })} onSubmit={(v) => invite.mutateAsync(v)} submitLabel="Add user" />
      {editing && <EditUser user={editing} teams={teams} onClose={() => setEditing(null)} isSelf={editing.id === me?.id} />}
    </Card>
  );
}

function EditUser({ user, teams, onClose, isSelf }: { user: User; teams: Team[]; onClose: () => void; isSelf: boolean }) {
  const [f, setF] = React.useState({ name: user.name, role: user.role, teamId: user.teamId ?? '', quota: String(user.quota), territory: user.territory ?? '', active: user.active });
  const save = useAction(() => api.patch(`/users/${user.id}`, { ...f, teamId: f.teamId || null, quota: Number(f.quota) || 0, territory: f.territory || null }), { success: 'User updated', invalidate: [['users'], ['teams']], onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Edit ${user.name}`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Role" hint={isSelf ? "You can't change your own role" : undefined}><Select value={f.role} disabled={isSelf} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select></Field>
          <Field label="Team"><Select value={f.teamId} onChange={(e) => setF({ ...f, teamId: e.target.value })}><option value="">No team</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          <Field label="Monthly quota"><Input type="number" min={0} value={f.quota} onChange={(e) => setF({ ...f, quota: e.target.value })} /></Field>
          <Field label="Territory"><Input value={f.territory} onChange={(e) => setF({ ...f, territory: e.target.value })} /></Field>
          <Field label="Active"><div className="flex h-9 items-center"><Switch checked={f.active} disabled={isSelf} onCheckedChange={(v) => setF({ ...f, active: v })} aria-label="Active" /></div></Field>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Changing the role or deactivating signs the user out everywhere.</p>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={save.isPending} onClick={() => save.mutate(undefined)}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- teams ----------
const teamFields: FieldDef[] = [{ name: 'name', label: 'Team name', type: 'text', required: true }, { name: 'managerId', label: 'Manager', type: 'user', allowEmpty: 'No manager' }];
function TeamsSection() {
  const { data: teams = [], isLoading } = useTeams();
  const [editing, setEditing] = React.useState<Team | null | 'new'>(null);
  const save = useAction((v: Record<string, unknown>) => (editing && editing !== 'new' ? api.patch(`/teams/${editing.id}`, v) : api.post('/teams', v)), { success: 'Team saved', invalidate: [['teams']] });
  const remove = useAction((id: string) => api.del(`/teams/${id}`), { success: 'Team deleted', invalidate: [['teams'], ['users']] });
  return (
    <Card>
      <CardHeader title="Teams" description="Managers see their team's records and dashboards. Add people to teams from Users." action={<Button size="sm" onClick={() => setEditing('new')}><Plus />New team</Button>} />
      <CardBody>
        {isLoading ? <Skeleton className="h-32" /> : !teams.length ? <EmptyState icon={Users} title="No teams yet" description="Create teams to give managers visibility over their reps." className="py-6" /> : (
          <ul className="divide-y">{teams.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1"><p className="font-medium">{t.name}</p><p className="text-xs text-muted-foreground">Manager: {t.manager?.name ?? 'none'} · {t.members?.length ?? 0} members</p></div>
              <div className="flex -space-x-1.5">{t.members?.slice(0, 6).map((m) => <Avatar key={m.id} name={m.name} src={m.avatarUrl} size="sm" className="ring-2 ring-card" />)}</div>
              <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>Edit</Button>
              <Button size="icon-sm" variant="ghost" className="text-destructive" aria-label={`Delete ${t.name}`} onClick={async () => { if (await confirm({ title: `Delete team "${t.name}"?`, description: 'Members stay in the organization without a team.', destructive: true, confirmLabel: 'Delete' })) remove.mutate(t.id); }}><Trash2 /></Button>
            </li>
          ))}</ul>
        )}
      </CardBody>
      <RecordFormDialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title={editing && editing !== 'new' ? 'Edit team' : 'New team'} schema={teamSchema} fields={teamFields} size="md"
        defaultValues={toFormValues(teamFields, editing && editing !== 'new' ? editing : undefined)} onSubmit={(v) => save.mutateAsync(v)} />
    </Card>
  );
}

// ---------- roles ----------
function Roles() {
  const { data } = useQuery({ queryKey: ['roles'], queryFn: () => api.get<{ roles: Record<Role, Permission[]> }>('/settings/roles') });
  const [roles, setRoles] = React.useState<Record<Role, Permission[]>>();
  React.useEffect(() => { if (data) setRoles(data.roles); }, [data]);
  const save = useAction(() => api.put('/settings/roles', { rep: roles!.rep, manager: roles!.manager }), { success: 'Permissions saved. They apply on users\' next request.', invalidate: [['roles'], ['me']] });
  if (!roles) return <Skeleton className="h-96" />;
  const toggle = (role: 'rep' | 'manager', p: Permission) => setRoles({ ...roles, [role]: roles[role].includes(p) ? roles[role].filter((x) => x !== p) : [...roles[role], p] });
  return (
    <Card>
      <CardHeader title="Roles & permissions" description="Enforced on the server for every request. Admins always have every permission." />
      <CardBody className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2 font-medium">Permission</th>{ROLES.map((r) => <th key={r} className="w-28 py-2 text-center font-medium">{ROLE_LABELS[r]}</th>)}</tr></thead>
          <tbody className="divide-y">{(Object.keys(PERMISSIONS) as Permission[]).map((p) => (
            <tr key={p}>
              <td className="py-2.5">{PERMISSIONS[p]}<span className="block text-xs text-muted-foreground"><code>{p}</code></span></td>
              {(['rep', 'manager'] as const).map((r) => <td key={r} className="text-center"><Checkbox checked={roles[r].includes(p)} onCheckedChange={() => toggle(r, p)} aria-label={`${ROLE_LABELS[r]}: ${PERMISSIONS[p]}`} /></td>)}
              <td className="text-center"><Checkbox checked disabled aria-label={`Admin: ${PERMISSIONS[p]}`} /></td>
            </tr>
          ))}</tbody>
        </table>
        <Button className="mt-4" loading={save.isPending} onClick={() => save.mutate(undefined)}>Save permissions</Button>
      </CardBody>
    </Card>
  );
}

// ---------- pipelines ----------
type DraftStage = { key: string; id?: string; name: string; probability: number };
function SortableStage({ stage, onChange, onRemove, canRemove }: { stage: DraftStage; onChange: (s: DraftStage) => void; onRemove: () => void; canRemove: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.key });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn('flex items-center gap-2 rounded-md border bg-card p-2', isDragging && 'z-10 shadow-lg')}>
      <button {...attributes} {...listeners} className="cursor-grab rounded p-1 text-muted-foreground hover:bg-secondary" aria-label={`Reorder ${stage.name || 'stage'}`}><GripVertical className="size-4" /></button>
      <Input aria-label="Stage name" value={stage.name} onChange={(e) => onChange({ ...stage, name: e.target.value })} />
      <div className="flex w-28 shrink-0 items-center gap-1"><Input aria-label="Win probability" type="number" min={0} max={100} value={stage.probability} onChange={(e) => onChange({ ...stage, probability: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} /><span className="text-sm text-muted-foreground">%</span></div>
      <Button size="icon-sm" variant="ghost" aria-label="Remove stage" disabled={!canRemove} onClick={onRemove}><Trash2 /></Button>
    </li>
  );
}

function PipelineEditor({ pipeline, onClose }: { pipeline: Pipeline | null; onClose: () => void }) {
  const [name, setName] = React.useState(pipeline?.name ?? '');
  const [stages, setStages] = React.useState<DraftStage[]>(pipeline?.stages.map((s) => ({ key: s.id, id: s.id, name: s.name, probability: s.probability })) ?? [
    { key: 'n1', name: 'Qualification', probability: 10 }, { key: 'n2', name: 'Proposal', probability: 50 }, { key: 'n3', name: 'Negotiation', probability: 80 },
  ]);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const save = useAction(() => {
    const body = { name, stages: stages.map(({ id, name: n, probability }) => ({ id, name: n, probability })) };
    return pipeline ? api.put(`/pipelines/${pipeline.id}`, body) : api.post('/pipelines', body);
  }, { success: 'Pipeline saved', invalidate: [['pipelines'], ['/deals']], onSuccess: onClose });
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    setStages((s) => arrayMove(s, s.findIndex((x) => x.key === e.active.id), s.findIndex((x) => x.key === e.over!.id)));
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={pipeline ? `Edit ${pipeline.name}` : 'New pipeline'} description="Drag to reorder. Win probability drives weighted forecasting.">
        <Field label="Pipeline name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <p className="mb-2 mt-4 text-sm font-medium">Stages</p>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={stages.map((s) => s.key)} strategy={verticalListSortingStrategy}>
            <ol className="space-y-2">{stages.map((s) => (
              <SortableStage key={s.key} stage={s} canRemove={stages.length > 1}
                onChange={(n) => setStages((all) => all.map((x) => (x.key === s.key ? n : x)))} onRemove={() => setStages((all) => all.filter((x) => x.key !== s.key))} />
            ))}</ol>
          </SortableContext>
        </DndContext>
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => setStages((s) => [...s, { key: `n${Date.now()}`, name: '', probability: 50 }])}><Plus />Add stage</Button>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!name.trim() || stages.some((s) => !s.name.trim())} loading={save.isPending} onClick={() => save.mutate(undefined)}>Save pipeline</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Pipelines() {
  const { data: pipelines = [], isLoading } = usePipelines();
  const [editing, setEditing] = React.useState<Pipeline | null | 'new'>(null);
  const makeDefault = useAction((id: string) => api.post(`/pipelines/${id}/default`), { success: 'Default pipeline updated', invalidate: [['pipelines']] });
  const remove = useAction((id: string) => api.del(`/pipelines/${id}`), { success: 'Pipeline deleted', invalidate: [['pipelines']] });
  return (
    <Card>
      <CardHeader title="Pipelines" description="Each stage has a win probability used for weighted forecasts." action={<Button size="sm" onClick={() => setEditing('new')}><Plus />New pipeline</Button>} />
      <CardBody className="space-y-3">
        {isLoading ? <Skeleton className="h-32" /> : pipelines.map((p) => (
          <div key={p.id} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{p.name}</p>{p.isDefault && <Badge><Star className="size-3" />Default</Badge>}
              <div className="ml-auto flex gap-1">
                {!p.isDefault && <Button size="sm" variant="ghost" onClick={() => makeDefault.mutate(p.id)}>Make default</Button>}
                <Button size="sm" variant="outline" onClick={() => setEditing(p)}>Edit stages</Button>
                {!p.isDefault && <Button size="icon-sm" variant="ghost" className="text-destructive" aria-label={`Delete ${p.name}`} onClick={async () => { if (await confirm({ title: `Delete "${p.name}"?`, description: 'Only empty pipelines can be deleted.', destructive: true, confirmLabel: 'Delete' })) remove.mutate(p.id); }}><Trash2 /></Button>}
              </div>
            </div>
            <ol className="mt-3 flex flex-wrap gap-1.5">{p.stages.map((s) => <li key={s.id} className="rounded-full bg-muted px-2.5 py-0.5 text-xs">{s.name} · {s.probability}%</li>)}</ol>
          </div>
        ))}
      </CardBody>
      {editing && <PipelineEditor pipeline={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

// ---------- custom fields ----------
function Fields() {
  const [entity, setEntity] = React.useState<string>('contact');
  const { data: fields, isLoading } = useCustomFields(entity);
  const [adding, setAdding] = React.useState(false);
  const [f, setF] = React.useState({ label: '', type: 'text', options: '', required: false });
  const create = useAction(() => api.post('/settings/custom-fields', { entityType: entity, label: f.label, type: f.type, required: f.required, options: f.options.split(',').map((s) => s.trim()).filter(Boolean) }), {
    success: 'Field added', invalidate: [['custom-fields']], onSuccess: () => { setAdding(false); setF({ label: '', type: 'text', options: '', required: false }); },
  });
  const remove = useAction((id: string) => api.del(`/settings/custom-fields/${id}`), { success: 'Field removed', invalidate: [['custom-fields']] });
  return (
    <Card>
      <CardHeader title="Custom fields" description="Add your own fields to records. They appear on forms and detail pages." action={<Button size="sm" onClick={() => setAdding(true)}><Plus />Add field</Button>} />
      <CardBody>
        <div className="mb-4 flex flex-wrap gap-1" role="tablist">
          {CUSTOM_FIELD_ENTITIES.map((e) => <Button key={e} role="tab" aria-selected={entity === e} size="sm" variant={entity === e ? 'secondary' : 'ghost'} onClick={() => setEntity(e)}>{labelize(e)}s</Button>)}
        </div>
        {isLoading ? <Skeleton className="h-24" /> : !fields.length ? <p className="text-sm text-muted-foreground">No custom fields on {entity}s yet.</p> : (
          <ul className="divide-y">{fields.map((cf: CustomField) => (
            <li key={cf.id} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="flex-1 font-medium">{cf.label}{cf.required && <span className="text-destructive"> *</span>}</span>
              <Badge variant="secondary">{labelize(cf.type)}</Badge>
              {cf.options.length > 0 && <span className="hidden max-w-xs truncate text-xs text-muted-foreground sm:block">{cf.options.join(', ')}</span>}
              <Button size="icon-sm" variant="ghost" className="text-destructive" aria-label={`Delete ${cf.label}`} onClick={async () => { if (await confirm({ title: `Delete "${cf.label}"?`, description: 'Stored values stay in the database but are hidden.', destructive: true, confirmLabel: 'Delete' })) remove.mutate(cf.id); }}><Trash2 /></Button>
            </li>
          ))}</ul>
        )}
      </CardBody>
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent title={`New ${entity} field`} size="sm">
          <div className="space-y-3">
            <Field label="Label"><Input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
            <Field label="Type"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{CUSTOM_FIELD_TYPES.map((t) => <option key={t} value={t}>{labelize(t)}</option>)}</Select></Field>
            {f.type === 'select' && <Field label="Options" hint="Comma-separated"><Input value={f.options} onChange={(e) => setF({ ...f, options: e.target.value })} /></Field>}
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.required} onCheckedChange={(v) => setF({ ...f, required: !!v })} />Required</label>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button><Button disabled={!f.label.trim()} loading={create.isPending} onClick={() => create.mutate(undefined)}>Add field</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------- tags ----------
function TagsSection() {
  const { data: tags = [], isLoading } = useTags();
  const [name, setName] = React.useState('');
  const create = useAction(() => api.post('/settings/tags', { name }), { success: 'Tag created', invalidate: [['tags']], onSuccess: () => setName('') });
  const update = useAction((v: { id: string; color: string }) => api.patch(`/settings/tags/${v.id}`, { color: v.color }), { invalidate: [['tags'], ['/contacts'], ['/companies']] });
  const remove = useAction((id: string) => api.del(`/settings/tags/${id}`), { success: 'Tag deleted', invalidate: [['tags'], ['/contacts'], ['/companies']] });
  return (
    <Card>
      <CardHeader title="Tags" description="Used on contacts and companies for filtering and bulk actions." />
      <CardBody>
        <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(undefined); }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New tag name" aria-label="New tag name" className="max-w-xs" /><Button type="submit" loading={create.isPending}>Add</Button>
        </form>
        {isLoading ? <Skeleton className="h-24" /> : !tags.length ? <p className="text-sm text-muted-foreground">No tags yet. Tags are also created when you type them on a record.</p> : (
          <ul className="divide-y">{tags.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
              <input type="color" value={t.color} onChange={(e) => update.mutate({ id: t.id, color: e.target.value })} className="size-7 cursor-pointer rounded border-0 bg-transparent" aria-label={`Color for ${t.name}`} />
              <span className="flex-1 font-medium">{t.name}</span>
              <span className="text-xs text-muted-foreground">{t._count?.contacts ?? 0} contacts · {t._count?.companies ?? 0} companies</span>
              <Button size="icon-sm" variant="ghost" className="text-destructive" aria-label={`Delete ${t.name}`} onClick={() => remove.mutate(t.id)}><Trash2 /></Button>
            </li>
          ))}</ul>
        )}
      </CardBody>
    </Card>
  );
}

// ---------- lead capture ----------
function LeadCapture() {
  const qc = useQueryClient();
  const { data: org } = useQuery({ queryKey: ['org'], queryFn: () => api.get<{ leadApiKey: string }>('/settings/org') });
  const rotate = useAction(() => api.post('/settings/org/lead-api-key'), { success: 'New key generated. Update any forms using the old one.', onSuccess: () => { qc.invalidateQueries({ queryKey: ['org'] }); qc.invalidateQueries({ queryKey: ['me'] }); } });
  if (!org) return <Skeleton className="h-64" />;
  const base = window.location.origin;
  const formUrl = `${base}/f/${org.leadApiKey}`;
  const endpoint = `${base}/api/public/leads/${org.leadApiKey}`;
  const curl = `curl -X POST ${endpoint} \\\n  -H "Content-Type: application/json" \\\n  -d '{"firstName":"Ada","email":"ada@example.com","companyName":"Acme","title":"CTO"}'`;
  const copy = (s: string) => navigator.clipboard.writeText(s).then(() => toast.success('Copied'));
  const Row = ({ label, value }: { label: string; value: string }) => (
    <div><p className="mb-1 text-sm font-medium">{label}</p><div className="flex gap-2"><Input readOnly value={value} aria-label={label} /><Button variant="outline" size="icon" onClick={() => copy(value)} aria-label={`Copy ${label}`}><Copy /></Button></div></div>
  );
  return (
    <Card>
      <CardHeader title="Lead capture & API" description="Inbound leads are scored and auto-assigned using your organization's rules." action={<Button size="sm" variant="outline" loading={rotate.isPending} onClick={async () => { if (await confirm({ title: 'Generate a new key?', description: 'Existing forms and integrations using the current key will stop working.', confirmLabel: 'Generate' })) rotate.mutate(undefined); }}><RefreshCw />Rotate key</Button>} />
      <CardBody className="space-y-4">
        <Row label="Hosted form" value={formUrl} />
        <Row label="API endpoint (POST JSON)" value={endpoint} />
        <div>
          <p className="mb-1 text-sm font-medium">Example request</p>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>{curl}</code></pre>
          <p className="mt-2 text-xs text-muted-foreground">Fields: firstName (required), email (required), lastName, phone, companyName, title, companySize, message, source. CORS is open so website forms can post directly; requests are rate-limited.</p>
        </div>
        <Button asChild variant="outline"><a href={formUrl} target="_blank" rel="noreferrer">Open hosted form</a></Button>
      </CardBody>
    </Card>
  );
}

// ---------- audit ----------
function Audit() {
  const [page, setPage] = React.useState(1);
  const [entityType, setEntityType] = React.useState('');
  const [userId, setUserId] = React.useState('');
  const [open, setOpen] = React.useState<string | null>(null);
  const { data: users = [] } = useUsers();
  const { data, isLoading } = useQuery({ queryKey: ['audit', page, entityType, userId], queryFn: () => api.get<Paginated<AuditLog>>('/settings/audit-log', { page, pageSize: 50, entityType, userId }) });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <Card>
      <CardHeader title="Audit log" description="Every create, update, delete, import, export and sign-in in your organization." />
      <CardBody>
        <div className="mb-3 flex flex-wrap gap-2">
          <Select aria-label="Record type" className="w-40" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }}>
            <option value="">All record types</option>{['contact', 'company', 'lead', 'deal', 'task', 'activity', 'ticket', 'quote', 'product', 'campaign', 'workflow', 'pipeline', 'user', 'team', 'organization', 'roles'].map((t) => <option key={t} value={t}>{labelize(t)}</option>)}
          </Select>
          <Select aria-label="User" className="w-40" value={userId} onChange={(e) => { setUserId(e.target.value); setPage(1); }}><option value="">All users</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
        </div>
        {isLoading ? <Skeleton className="h-64" /> : !data?.data.length ? <p className="py-6 text-center text-sm text-muted-foreground">No entries.</p> : (
          <ul className="divide-y text-sm">
            {data.data.map((a) => {
              const hasChanges = a.changes && Object.keys(a.changes).length > 0;
              return (
                <li key={a.id} className="py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {hasChanges ? <button onClick={() => setOpen(open === a.id ? null : a.id)} aria-expanded={open === a.id} aria-label="Show changes">{open === a.id ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</button> : <span className="w-4" />}
                    <UserChip user={a.user} />
                    <Badge variant={a.action === 'delete' ? 'destructive' : a.action === 'create' ? 'success' : 'secondary'}>{labelize(a.action)}</Badge>
                    <span>{labelize(a.entityType)}</span><code className="text-xs text-muted-foreground">{a.entityId.slice(-8)}</code>
                    <span className="ml-auto text-xs text-muted-foreground">{dateTime(a.createdAt)}</span>
                  </div>
                  {open === a.id && hasChanges && (
                    <pre className="ml-6 mt-2 overflow-x-auto rounded bg-muted p-2 text-xs">{JSON.stringify(a.changes, null, 2)}</pre>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {data && data.total > data.pageSize && (
          <div className="mt-3 flex items-center justify-end gap-2 text-xs text-muted-foreground">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <span>Page {page} of {pages} · {num(data.total)} entries</span>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
