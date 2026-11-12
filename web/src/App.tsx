import * as React from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { ApiError, setUnauthorizedHandler } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useMe } from '@/hooks/data';
import { LandingPage } from '@/features/public/landing';

/** Code-split a named page export. */
const lazy = <T,>(load: () => Promise<T>, name: keyof T) =>
  React.lazy(() => load().then((m) => ({ default: m[name] as unknown as React.ComponentType })));

// The signed-in shell (navigation, search, record forms) stays out of the
// landing and sign-in bundle.
const Shell = lazy(() => import('@/components/layout/shell'), 'Shell');
// Start downloading the signed-in shell and the page being opened straight away,
// in parallel with the session check, instead of one after the other.
const PRELOAD: Record<string, () => Promise<unknown>> = {
  dashboard: () => import('@/features/dashboard/dashboard'), deals: () => import('@/features/deals/deals'),
  contacts: () => import('@/features/contacts/contacts'), tasks: () => import('@/features/work/tasks'), leads: () => import('@/features/leads/leads'),
};
const first = window.location.pathname.split('/')[1] ?? '';
if (!['', 'login', 'signup', 'f', 'quotes'].includes(first)) {
  void import('@/components/layout/shell');
  void PRELOAD[first]?.();
}

const LoginPage = lazy(() => import('@/features/public/auth'), 'LoginPage');
const SignupPage = lazy(() => import('@/features/public/auth'), 'SignupPage');
const PublicLeadForm = lazy(() => import('@/features/public/lead-form'), 'PublicLeadForm');
const Dashboard = lazy(() => import('@/features/dashboard/dashboard'), 'DashboardPage');
const Contacts = lazy(() => import('@/features/contacts/contacts'), 'ContactsPage');
const ContactDetail = lazy(() => import('@/features/contacts/contact-detail'), 'ContactDetailPage');
const Companies = lazy(() => import('@/features/companies/companies'), 'CompaniesPage');
const CompanyDetail = lazy(() => import('@/features/companies/companies'), 'CompanyDetailPage');
const Leads = lazy(() => import('@/features/leads/leads'), 'LeadsPage');
const LeadDetail = lazy(() => import('@/features/leads/leads'), 'LeadDetailPage');
const Deals = lazy(() => import('@/features/deals/deals'), 'DealsPage');
const DealDetail = lazy(() => import('@/features/deals/deal-detail'), 'DealDetailPage');
const QuotePrint = lazy(() => import('@/features/deals/quotes'), 'QuotePrintPage');
const Products = lazy(() => import('@/features/deals/quotes'), 'ProductsPage');
const Tasks = lazy(() => import('@/features/work/tasks'), 'TasksPage');
const Calendar = lazy(() => import('@/features/work/calendar'), 'CalendarPage');
const Inbox = lazy(() => import('@/features/work/inbox'), 'InboxPage');
const Tickets = lazy(() => import('@/features/service/tickets'), 'TicketsPage');
const TicketDetail = lazy(() => import('@/features/service/tickets'), 'TicketDetailPage');
const Campaigns = lazy(() => import('@/features/service/campaigns'), 'CampaignsPage');
const Reports = lazy(() => import('@/features/reports/reports'), 'ReportsPage');
const Automations = lazy(() => import('@/features/automation/automations'), 'AutomationsPage');
const Settings = lazy(() => import('@/features/settings/settings'), 'SettingsPage');

function FullPageSpinner() {
  return <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="Loading"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
}

function RequireAuth() {
  const { data, isLoading, error, refetch } = useMe();
  const location = useLocation();
  if (isLoading) return <FullPageSpinner />;
  // Only a 401 means "signed out"; network blips and server restarts get a retry.
  if (error && !(error instanceof ApiError && error.status === 401)) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-medium">Can't reach the server right now.</p>
        <Button variant="outline" onClick={() => refetch()}>Try again</Button>
      </div>
    );
  }
  if (!data) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return (
<Shell />
  );
}

function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="font-display text-6xl text-muted-foreground">404</p>
      <p className="mt-2 font-medium">This page doesn't exist.</p>
      <Button asChild variant="outline" className="mt-5"><Link to="/dashboard">Back to the dashboard</Link></Button>
    </div>
  );
}

export function App() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  React.useEffect(() => {
    setUnauthorizedHandler(() => {
      qc.removeQueries({ queryKey: ['me'] });
      if (!['/login', '/signup', '/'].includes(window.location.pathname)) navigate('/login', { replace: true });
    });
  }, [qc, navigate]);

  return (
    <React.Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/f/:key" element={<PublicLeadForm />} />
        <Route path="/quotes/:id/print" element={<QuotePrint />} />
        <Route element={<RequireAuth />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/contacts/:id" element={<ContactDetail />} />
          <Route path="/companies" element={<Companies />} />
          <Route path="/companies/:id" element={<CompanyDetail />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/leads/:id" element={<LeadDetail />} />
          <Route path="/deals" element={<Deals />} />
          <Route path="/deals/:id" element={<DealDetail />} />
          <Route path="/products" element={<Products />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/tickets" element={<Tickets />} />
          <Route path="/tickets/:id" element={<TicketDetail />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/automations" element={<Automations />} />
          <Route path="/settings/*" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </React.Suspense>
  );
}
