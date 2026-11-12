import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CalendarClock, Check, Clock, Flame, LifeBuoy, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LogoMark } from '@/components/layout/logo';
import { useDemoAvailable, useDemoLogin } from './demo';

const POINTS = [
  { title: 'One thing at a time', body: 'Overdue tasks, breached SLAs, stalled deals and unanswered leads are ranked by urgency and value. The top one is the first thing you see.' },
  { title: 'A pipeline you can move', body: 'Drag deals between stages, drop them on Won or Lost, and watch the weighted forecast follow.' },
  { title: 'Everything on the record', body: 'Calls, emails, meetings, notes, tasks, tickets and quotes live on the contact and the deal they belong to.' },
];

/** Marketing page. */
export function LandingPage() {
  const demo = useDemoAvailable();
  const { start, pending } = useDemoLogin();
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <Link to="/" className="flex items-center gap-1.5 text-xl font-semibold tracking-tight"><LogoMark />Nexora</Link>
        <nav className="flex items-center gap-1" aria-label="Account">
          <Button asChild variant="ghost"><Link to="/login">Sign in</Link></Button>
          <Button asChild className="hidden sm:inline-flex"><Link to="/signup">Create account</Link></Button>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 sm:px-8">
        <section className="grid items-center gap-10 py-10 sm:py-16 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:py-24">
          <div>
            <h1 className="font-display text-[2.75rem] leading-[0.98] tracking-tight sm:text-6xl lg:text-7xl">
              A CRM that tells you <em>what to do next.</em>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
              Nexora reads your pipeline, tasks, tickets and leads, and puts the most urgent one in front of you with the action that clears it.
            </p>
            <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
              {demo && <Button size="lg" loading={pending !== null} onClick={() => start()}>Try the live demo<ArrowRight /></Button>}
              <Button asChild size="lg" variant={demo ? 'outline' : 'default'}><Link to="/signup">Create a free workspace</Link></Button>
            </div>
            {demo && <p className="mt-3 text-xs text-muted-foreground">The demo opens a sample company. No sign-up needed.</p>}
          </div>
          <Preview />
        </section>

        <section className="grid gap-8 border-t py-10 sm:grid-cols-3 sm:py-14" aria-label="What you get">
          {POINTS.map((p) => (
            <div key={p.title}>
              <h2 className="text-sm font-semibold">{p.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-6xl items-center justify-between border-t px-5 py-5 text-xs text-muted-foreground sm:px-8">
        <span>© {new Date().getFullYear()} Nexora</span>
        <Link to="/login" className="hover:text-foreground">Sign in</Link>
      </footer>
    </div>
  );
}

const QUEUE = [
  { icon: LifeBuoy, tone: 'text-destructive', title: '#10 SSO login loop', reason: 'Support SLA · breached 1 hour ago' },
  { icon: CalendarClock, tone: 'text-success', title: 'Initech — team plan', reason: 'Closing soon · in 3 days · $48,000 at 80%' },
  { icon: AlertTriangle, tone: 'text-warning', title: 'Wayne Logistics — expansion', reason: 'Stalled deal · no activity in 16 days' },
  { icon: Flame, tone: 'text-accent', title: 'Priya Nair (Hooli)', reason: 'New lead · score 82 · waiting 5 hours' },
];

/** A static picture of the dashboard's "what to do next" card, drawn in the app's own components. */
function Preview() {
  return (
    <div className="pointer-events-none select-none" aria-hidden>
      <div className="rounded-xl border bg-card p-5 sm:p-6">
        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive"><Clock className="size-3.5" />Overdue task</p>
        <p className="mt-2.5 font-display text-3xl leading-[1.1] tracking-tight">Book technical deep-dive</p>
        <p className="mt-1.5 text-sm text-muted-foreground">Overdue by 2 days · Initech — team plan</p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm font-medium">
          <span className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-primary-foreground"><Check className="size-4" />Mark done</span>
          <span className="inline-flex h-9 items-center gap-2 rounded-md border px-4"><Phone className="size-4" />Log a call</span>
        </div>
      </div>
      <ul className="mx-3 divide-y rounded-b-xl border border-t-0 bg-card px-4 sm:mx-5">
        {QUEUE.map((q) => (
          <li key={q.title} className="flex items-center gap-3 py-2.5">
            <q.icon className={`size-4 shrink-0 ${q.tone}`} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{q.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{q.reason}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
