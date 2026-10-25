import * as React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeftRight, Banknote, Bell, Check, ChevronDown, ChevronRight, CreditCard, Home, Landmark, ListChecks,
  MoreVertical, Play, Plus, Search, Send, Settings, Wallet, Workflow,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDemoAvailable, useDemoLogin } from './auth';
import { cn } from '@/lib/utils';

const VIDEO = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260319_015952_e1deeb12-8fb7-4071-a42a-60779fc64ab6.mp4';
const fadeUp = (y: number, duration: number, delay = 0) => ({
  initial: { opacity: 0, y },
  animate: { opacity: 1, y: 0 },
  transition: { duration, delay, ease: 'easeOut' as const },
});

/** Marketing page: Navbar + Hero filling exactly one viewport. Light only. */
export function LandingPage() {
  React.useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    root.classList.remove('dark');
    return () => { if (wasDark) root.classList.add('dark'); };
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <Navbar />
      <Hero />
    </div>
  );
}

function Navbar() {
  return (
    <nav className="relative z-20 flex items-center justify-between px-6 py-5 font-body md:px-12 lg:px-20" aria-label="Main">
      <Link to="/" className="text-xl font-semibold tracking-tight text-foreground">✦ Nexora</Link>
      <div className="hidden items-center gap-8 md:flex">
        {['Home', 'Pricing', 'About', 'Contact'].map((l) => (
          <Link key={l} to="/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">{l}</Link>
        ))}
      </div>
      <Button asChild className="rounded-full px-5 text-sm font-medium"><Link to="/login">Sign in</Link></Button>
    </nav>
  );
}

function Hero() {
  return (
    <section className="relative flex flex-1 flex-col items-center px-4 pt-6 md:pt-10">
      <video className="absolute inset-0 z-0 h-full w-full object-cover" src={VIDEO} autoPlay muted loop playsInline aria-hidden />
      <div className="relative z-10 flex w-full flex-col items-center">
        <motion.div {...fadeUp(10, 0.5)}
          className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-1.5 font-body text-sm text-muted-foreground">
          Now with GPT-5 support ✨
        </motion.div>

        <motion.h1 {...fadeUp(16, 0.6, 0.1)}
          className="max-w-xl text-center font-display text-5xl leading-[0.95] tracking-tight text-foreground md:text-6xl lg:text-[5rem]">
          The Future of <em className="font-display italic">Smarter</em> Automation
        </motion.h1>

        <motion.p {...fadeUp(16, 0.6, 0.2)}
          className="mt-4 max-w-[650px] text-center font-body text-base leading-relaxed text-muted-foreground md:text-lg">
          Automate your busywork with intelligent agents that learn, adapt, and execute—so your team can focus on what matters most.
        </motion.p>

        <motion.div {...fadeUp(16, 0.6, 0.3)} className="mt-5 flex items-center gap-3">
          <Button asChild className="rounded-full px-6 py-5 font-body text-sm font-medium"><Link to="/signup">Book a demo</Link></Button>
          <LiveDemoButton />
          <Button variant="ghost" aria-label="Watch the product video"
            className="h-11 w-11 rounded-full border-0 bg-background shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:bg-background/80">
            <Play className="h-4 w-4 fill-foreground" />
          </Button>
        </motion.div>

        <motion.div {...fadeUp(30, 0.8, 0.5)} className="mt-8 w-full max-w-5xl">
          <div className="overflow-hidden rounded-2xl p-3 md:p-4"
            style={{ background: 'rgba(255, 255, 255, 0.4)', border: '1px solid rgba(255, 255, 255, 0.5)', boxShadow: 'var(--shadow-dashboard)' }}>
            <DashboardPreview />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/** Shown only when the server has the Northwind Demo workspace. */
function LiveDemoButton() {
  const available = useDemoAvailable();
  const { start, pending } = useDemoLogin();
  if (!available) return null;
  return (
    <Button variant="outline" loading={pending !== null} onClick={() => start()}
      className="rounded-full border-border bg-background px-6 py-5 font-body text-sm font-medium">
      Try the live demo
    </Button>
  );
}

// ---------- coded dashboard preview (decorative) ----------
const SIDEBAR: { icon: typeof Home; label: string; active?: boolean; badge?: string; chevron?: boolean }[] = [
  { icon: Home, label: 'Home', active: true },
  { icon: ListChecks, label: 'Tasks', badge: '10' },
  { icon: ArrowLeftRight, label: 'Transactions' },
  { icon: Send, label: 'Payments', chevron: true },
  { icon: CreditCard, label: 'Cards' },
  { icon: Banknote, label: 'Capital' },
  { icon: Landmark, label: 'Accounts', chevron: true },
];
const WORKFLOWS: { icon: typeof Home; label: string }[] = [
  { icon: Workflow, label: 'Trake rutes' }, { icon: Wallet, label: 'Payments' }, { icon: Bell, label: 'Notifications' }, { icon: Settings, label: 'Settings' },
];
const ACTIONS = ['Send', 'Request', 'Transfer', 'Deposit', 'Pay Bill', 'Create Invoice'];
const ACCOUNTS = [['Credit', '$98,125.50'], ['Treasury', '$6,750,200.00'], ['Operations', '$1,592,864.82']];
const TXNS = [
  { date: 'Mar 18', desc: 'AWS', amount: '-$5,200', status: 'Pending' },
  { date: 'Mar 17', desc: 'Client Payment', amount: '+$125,000', status: 'Completed' },
  { date: 'Mar 15', desc: 'Payroll', amount: '-$85,450', status: 'Completed' },
  { date: 'Mar 14', desc: 'Office Supplies', amount: '-$1,200', status: 'Completed' },
];

function DashboardPreview() {
  return (
    <div className="pointer-events-none select-none overflow-hidden rounded-xl border border-border bg-background font-body text-[11px] text-foreground" aria-hidden>
      {/* top bar */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary text-[10px] font-semibold text-primary-foreground">N</span>
          <span className="font-semibold">Nexora</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </div>
        <div className="mx-auto flex w-full max-w-xs items-center gap-1.5 rounded-md border border-border bg-secondary/50 px-2 py-1 text-muted-foreground">
          <Search className="h-3 w-3" />
          <span className="flex-1">Search</span>
          <span className="rounded border border-border bg-background px-1 text-[9px]">⌘K</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden font-medium sm:inline">Move Money</span>
          <Bell className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[9px] font-semibold">JB</span>
        </div>
      </div>

      <div className="flex">
        {/* sidebar */}
        <aside className="hidden w-40 shrink-0 border-r border-border p-2 sm:block">
          {SIDEBAR.map((it) => (
            <div key={it.label} className={cn('flex items-center gap-2 rounded-md px-2 py-1.5', it.active ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground')}>
              <it.icon className="h-3.5 w-3.5" />
              <span className="flex-1">{it.label}</span>
              {it.badge && <span className="rounded-full bg-accent px-1.5 text-[9px] font-medium text-accent-foreground">{it.badge}</span>}
              {it.chevron && <ChevronRight className="h-3 w-3" />}
            </div>
          ))}
          <p className="mt-3 px-2 pb-1 text-[10px] font-medium text-muted-foreground">Workflows</p>
          {WORKFLOWS.map((it, i) => (
            <div key={`${it.label}-${i}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground">
              <it.icon className="h-3.5 w-3.5" /><span>{it.label}</span>
            </div>
          ))}
        </aside>

        {/* main */}
        <div className="min-w-0 flex-1 bg-secondary/30 p-4">
          <p className="text-sm font-semibold">Welcome, Jane</p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {ACTIONS.map((a, i) => (
              <span key={a} className={cn('rounded-full px-3 py-1 text-[10px] font-medium', i === 0 ? 'bg-accent text-accent-foreground' : 'border border-border bg-background text-foreground')}>{a}</span>
            ))}
            <span className="ml-1 text-[10px] text-muted-foreground">Customize</span>
          </div>

          <div className="mt-4 flex gap-3">
            {/* balance */}
            <div className="flex-1 basis-0 rounded-xl border border-border bg-background p-3">
              <p className="flex items-center gap-1 text-muted-foreground">Mercury Balance <Check className="h-3 w-3 text-accent" /></p>
              <p className="mt-1 text-lg font-semibold tracking-tight">$8,450,190<span className="text-xs text-muted-foreground">.32</span></p>
              <div className="mt-1 flex gap-3 text-[10px]">
                <span className="text-muted-foreground">Last 30 Days</span>
                <span className="text-success">+$1.8M</span>
                <span className="text-destructive">-$900K</span>
              </div>
              <svg viewBox="0 0 300 80" className="mt-2 h-20 w-full" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="balance-fill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M0,62 C30,58 45,48 75,50 C105,52 120,36 150,34 C180,32 195,44 225,30 C255,16 270,20 300,10 L300,80 L0,80 Z" fill="url(#balance-fill)" />
                <path d="M0,62 C30,58 45,48 75,50 C105,52 120,36 150,34 C180,32 195,44 225,30 C255,16 270,20 300,10" fill="none" stroke="hsl(var(--accent))" strokeWidth="1.5" />
              </svg>
            </div>
            {/* accounts */}
            <div className="flex-1 basis-0 rounded-xl border border-border bg-background p-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold">Accounts</p>
                <div className="flex gap-1.5 text-muted-foreground"><Plus className="h-3 w-3" /><MoreVertical className="h-3 w-3" /></div>
              </div>
              {ACCOUNTS.map(([name, amount]) => (
                <div key={name} className="flex justify-between py-3 text-xs">
                  <span className="text-muted-foreground">{name}</span><span className="font-medium">{amount}</span>
                </div>
              ))}
            </div>
          </div>

          {/* transactions */}
          <div className="mt-4 rounded-xl border border-border bg-background p-3">
            <p className="mb-2 font-semibold">Recent Transactions</p>
            <table className="w-full text-left">
              <thead className="text-muted-foreground">
                <tr><th className="pb-1.5 font-medium">Date</th><th className="pb-1.5 font-medium">Description</th><th className="pb-1.5 font-medium">Amount</th><th className="pb-1.5 font-medium">Status</th></tr>
              </thead>
              <tbody>
                {TXNS.map((t) => (
                  <tr key={t.desc} className="border-t border-border">
                    <td className="py-1.5 text-muted-foreground">{t.date}</td>
                    <td className="py-1.5">{t.desc}</td>
                    <td className={cn('py-1.5 font-medium', t.amount.startsWith('+') && 'text-success')}>{t.amount}</td>
                    <td className="py-1.5">
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', t.status === 'Pending' ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success')}>{t.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
