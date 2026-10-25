import * as React from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Command } from 'cmdk';
import {
  BarChart3, Bell, Briefcase, Building2, CalendarDays, CheckSquare, ChevronsLeft, ChevronsRight, Contact, Headphones, Inbox,
  LayoutDashboard, LifeBuoy, LogOut, Megaphone, Menu, Monitor, Moon, Package, Plus, Search, Settings, Sun, Target, UserRound, Workflow,
  type LucideIcon,
} from 'lucide-react';
import type { Notification, Permission, SearchResult } from '@crm/shared';
import { api } from '@/lib/api';
import { ago, cn } from '@/lib/utils';
import { useCan, useMe } from '@/hooks/data';
import { useUi } from '@/stores/ui';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/display';
import {
  Dialog, DialogContent, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger, SheetContent, Tooltip,
} from '@/components/ui/overlay';
import { useQuickCreate } from '@/features/forms';

interface NavItem { to: string; label: string; icon: LucideIcon; perm?: Permission }
const NAV: { group: string; items: NavItem[] }[] = [
  { group: '', items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
  { group: 'Sales', items: [
    { to: '/leads', label: 'Leads', icon: Target }, { to: '/contacts', label: 'Contacts', icon: Contact },
    { to: '/companies', label: 'Companies', icon: Building2 }, { to: '/deals', label: 'Deals', icon: Briefcase },
    { to: '/products', label: 'Products & quotes', icon: Package },
  ] },
  { group: 'Work', items: [
    { to: '/tasks', label: 'Tasks', icon: CheckSquare }, { to: '/calendar', label: 'Calendar', icon: CalendarDays }, { to: '/inbox', label: 'Inbox', icon: Inbox },
  ] },
  { group: 'Service & marketing', items: [{ to: '/tickets', label: 'Tickets', icon: Headphones }, { to: '/campaigns', label: 'Campaigns', icon: Megaphone }] },
  { group: 'Insights', items: [{ to: '/reports', label: 'Reports', icon: BarChart3 }, { to: '/automations', label: 'Automations', icon: Workflow }] },
];

function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link to="/dashboard" className="flex items-center gap-1.5 text-xl font-semibold tracking-tight text-foreground" aria-label="Nexora home">
      <span className="text-accent" aria-hidden>✦</span>
      {!collapsed && <span>Nexora</span>}
    </Link>
  );
}

function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3 scrollbar-thin" aria-label="Main">
      {NAV.map((g) => (
        <div key={g.group || 'home'}>
          {g.group && !collapsed && <p className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.group}</p>}
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const link = (
                <NavLink to={it.to} onClick={onNavigate}
                  className={({ isActive }) => cn('flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                    collapsed && 'justify-center px-0',
                    isActive ? 'bg-sidebar-accent text-foreground [&_svg]:text-accent' : 'text-sidebar-foreground hover:bg-secondary hover:text-foreground')}>
                  <it.icon className="size-4 shrink-0" aria-hidden />
                  {collapsed ? <span className="sr-only">{it.label}</span> : it.label}
                </NavLink>
              );
              return <li key={it.to}>{collapsed ? <Tooltip content={it.label} side="right">{link}</Tooltip> : link}</li>;
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function NotificationsBell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ['notifications'], queryFn: () => api.get<{ data: Notification[]; unread: number }>('/notifications'), refetchInterval: 30_000,
  });
  const markRead = async (ids?: string[]) => { await api.post('/notifications/read', ids ? { ids } : {}); qc.invalidateQueries({ queryKey: ['notifications'] }); };
  const unread = data?.unread ?? 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
          <Bell />
          {unread > 0 && <span className="absolute right-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-destructive-foreground">{unread > 9 ? '9+' : unread}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && <button className="text-xs text-primary hover:underline" onClick={() => markRead()}>Mark all read</button>}
        </div>
        <ul className="max-h-96 overflow-y-auto">
          {!data?.data.length && <li className="px-3 py-8 text-center text-sm text-muted-foreground">You're all caught up.</li>}
          {data?.data.map((n) => (
            <li key={n.id}>
              <button className={cn('flex w-full gap-2 px-3 py-2.5 text-left text-sm hover:bg-secondary', !n.readAt && 'bg-primary/5')}
                onClick={() => { if (!n.readAt) markRead([n.id]); if (n.link) navigate(n.link); }}>
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-primary')} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{n.title}</span>
                  {n.body && <span className="block truncate text-xs text-muted-foreground">{n.body}</span>}
                  <span className="text-[11px] text-muted-foreground">{ago(n.createdAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

const SEARCH_ICONS: Record<SearchResult['type'], LucideIcon> = { contact: Contact, company: Building2, lead: Target, deal: Briefcase, ticket: LifeBuoy, task: CheckSquare };

export function CommandPalette() {
  const { paletteOpen, setPalette } = useUi();
  const navigate = useNavigate();
  const quick = useQuickCreate((s) => s.open);
  const [q, setQ] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  React.useEffect(() => { const t = setTimeout(() => setDebounced(q), 200); return () => clearTimeout(t); }, [q]);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(!useUi.getState().paletteOpen); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPalette]);
  const { data: results = [], isFetching } = useQuery({
    queryKey: ['search', debounced], queryFn: () => api.get<{ data: SearchResult[] }>('/search', { q: debounced }).then((r) => r.data),
    enabled: debounced.trim().length >= 2,
  });
  const go = (fn: () => void) => { setPalette(false); setQ(''); fn(); };
  const pages = NAV.flatMap((g) => g.items).concat([{ to: '/settings', label: 'Settings', icon: Settings }]);
  const actions: { label: string; kind: Parameters<typeof quick>[0] }[] = [
    { label: 'New deal', kind: 'deal' }, { label: 'New contact', kind: 'contact' }, { label: 'New lead', kind: 'lead' },
    { label: 'New company', kind: 'company' }, { label: 'New task', kind: 'task' }, { label: 'New ticket', kind: 'ticket' },
  ];
  const item = 'flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-secondary [&_svg]:size-4 [&_svg]:text-muted-foreground';
  return (
    <Dialog open={paletteOpen} onOpenChange={(o) => { setPalette(o); if (!o) setQ(''); }}>
      <DialogContent title="Search" size="lg" className="[&>div:first-child]:hidden [&>div:last-child]:p-0">
        <Command shouldFilter={!debounced || debounced.length < 2} loop>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 text-muted-foreground" aria-hidden />
            <Command.Input value={q} onValueChange={setQ} placeholder="Search records, pages and actions…" className="h-12 flex-1 bg-transparent text-sm outline-none" autoFocus />
            <kbd className="rounded border px-1.5 text-[10px] text-muted-foreground">ESC</kbd>
          </div>
          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-muted-foreground">{isFetching ? 'Searching…' : 'No results'}</Command.Empty>
            {results.length > 0 && (
              <Command.Group heading="Records" className="mb-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground">
                {results.map((r) => {
                  const Icon = SEARCH_ICONS[r.type];
                  return (
                    <Command.Item key={`${r.type}-${r.id}`} value={`${r.type}-${r.id}`} onSelect={() => go(() => navigate(r.link))} className={item}>
                      <Icon /><span className="flex-1 truncate">{r.title}</span>
                      <span className="truncate text-xs text-muted-foreground">{r.subtitle}</span>
                      <span className="rounded bg-muted px-1.5 text-[10px] uppercase text-muted-foreground">{r.type}</span>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}
            {(!debounced || debounced.length < 2) && (
              <>
                <Command.Group heading="Quick actions" className="mb-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground">
                  {actions.map((a) => <Command.Item key={a.label} onSelect={() => go(() => quick(a.kind))} className={item}><Plus />{a.label}</Command.Item>)}
                </Command.Group>
                <Command.Group heading="Go to" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground">
                  {pages.map((p) => <Command.Item key={p.to} onSelect={() => go(() => navigate(p.to))} className={item}><p.icon />{p.label}</Command.Item>)}
                </Command.Group>
              </>
            )}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function UserMenu() {
  const { data: me } = useMe();
  const { theme, setTheme } = useUi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  if (!me) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="rounded-full focus-visible:ring-2 focus-visible:ring-ring" aria-label="Account menu"><Avatar name={me.name} src={me.avatarUrl} size="sm" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-semibold text-foreground">{me.name}</p>
          <p className="truncate text-xs">{me.email}</p>
          <p className="mt-0.5 truncate text-xs">{me.org.name} · {me.role}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/settings/profile')}><UserRound />Profile</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/settings')}><Settings />Settings</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        {([['light', Sun], ['dark', Moon], ['system', Monitor]] as const).map(([t, Icon]) => (
          <DropdownMenuItem key={t} onSelect={() => setTheme(t)} className={cn(theme === t && 'text-primary')}><Icon />{t[0].toUpperCase() + t.slice(1)}</DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={async () => { await api.post('/auth/logout'); qc.clear(); navigate('/login'); }}><LogOut />Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell() {
  const { sidebarCollapsed, toggleSidebar, mobileNavOpen, setMobileNav, setPalette } = useUi();
  const quick = useQuickCreate((s) => s.open);
  const can = useCan();
  const location = useLocation();
  React.useEffect(() => { setMobileNav(false); }, [location.pathname, setMobileNav]);

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded focus:bg-card focus:px-3 focus:py-2">Skip to content</a>
      {/* desktop sidebar */}
      <aside className={cn('sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:flex', sidebarCollapsed ? 'w-16' : 'w-60')}>
        <div className={cn('flex h-14 items-center border-b border-sidebar-border px-4', sidebarCollapsed && 'justify-center px-0')}><Logo collapsed={sidebarCollapsed} /></div>
        <SidebarNav collapsed={sidebarCollapsed} />
        <div className="border-t border-sidebar-border p-2">
          <NavLink to="/settings" className={({ isActive }) => cn('flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium', sidebarCollapsed && 'justify-center', isActive ? 'bg-sidebar-accent text-foreground [&_svg]:text-accent' : 'text-sidebar-foreground hover:bg-secondary')}>
            <Settings className="size-4" aria-hidden />{sidebarCollapsed ? <span className="sr-only">Settings</span> : 'Settings'}
          </NavLink>
          <button onClick={toggleSidebar} className={cn('mt-1 flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground hover:bg-secondary', sidebarCollapsed && 'justify-center')}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {sidebarCollapsed ? <ChevronsRight className="size-4" /> : <><ChevronsLeft className="size-4" />Collapse</>}
          </button>
        </div>
      </aside>
      {/* mobile sidebar */}
      <Dialog open={mobileNavOpen} onOpenChange={setMobileNav}>
        <SheetContent title="Navigation" side="left" className="w-72">
          <div className="flex h-14 items-center border-b px-4"><Logo /></div>
          <SidebarNav collapsed={false} onNavigate={() => setMobileNav(false)} />
          <div className="border-t p-2"><NavLink to="/settings" className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium hover:bg-secondary"><Settings className="size-4" />Settings</NavLink></div>
        </SheetContent>
      </Dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur sm:px-5">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu /></Button>
          <button onClick={() => setPalette(true)}
            className="flex h-9 w-full max-w-md items-center gap-2 rounded-md border bg-card px-3 text-sm text-muted-foreground shadow-sm hover:bg-secondary">
            <Search className="size-4" aria-hidden /><span className="flex-1 truncate text-left">Search or jump to…</span>
            <kbd className="hidden rounded border px-1.5 text-[10px] sm:inline">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button size="sm" aria-label="Create new"><Plus /><span className="hidden sm:inline">New</span></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => quick('deal')}><Briefcase />Deal</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => quick('contact')}><Contact />Contact</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => quick('company')}><Building2 />Company</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => quick('lead')}><Target />Lead</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => quick('task')}><CheckSquare />Task</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => quick('ticket')}><LifeBuoy />Ticket</DropdownMenuItem>
                {can('campaigns:manage') && <DropdownMenuItem onSelect={() => quick('campaign')}><Megaphone />Campaign</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
            <NotificationsBell />
            <UserMenu />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1600px] flex-1 animate-fade-in p-3 sm:p-5 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
