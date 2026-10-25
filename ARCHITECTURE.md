# Architecture

## Overview

```
web (React SPA) ──/api──▶ server (Express) ──Prisma──▶ SQLite (Postgres-ready)
        ▲                        │
        └──── shared (zod schemas · enums · RBAC · calculations) ────┘
```

`shared` is the typed contract between the two sides:

- The same zod schema validates a form in the browser and the request body on the server.
- Enum lists drive both the UI's select options and the server's validation.
- Calculations shared by both sides (quote totals, merge-tag rendering) live here too.

## Data model (server/prisma/schema.prisma)

- **Tenancy.** `Organization` is the tenant. Every row carries `orgId`, and every query is scoped by it.
- **People.** `User` (role rep/manager/admin, team, monthly quota, territory) and `Team` (manager plus members).
- **CRM records.** Each of these has `customFields` (JSON validated against `CustomField` definitions) and soft-delete via `deletedAt`:
  - `Company` and `Contact`, both with tags through an implicit many-to-many to `Tag`
  - `Lead`, with score and its explanation (`scoreBreakdown`), plus assignment, response and conversion fields
  - `Pipeline` → `Stage` (ordered, each with a win probability) → `Deal` (open/won/lost, lost reason, `stageChangedAt`, `lastActivityAt`) → `DealStageHistory`
- **Work.**
  - `Activity` holds calls, emails, meetings and notes. A note is simply an activity of type `note`, so the timeline has one source.
  - `Task` covers priority, status, assignee and reminders.
  - Both relate to contact, company, deal, lead or ticket through nullable foreign keys.
- **Commerce and service.** `Product`, `Quote` → `QuoteLineItem` (totals computed server-side), `Ticket` (per-org sequential number, SLA deadline from priority) and `Campaign` (lead and deal attribution, ROI).
- **Platform.**
  - `Attachment`, `AuditLog` (field-level diffs), `Notification` and `SavedView`
  - `Workflow` → `WorkflowRun`, `EmailTemplate` and `Report` (saved builder configs with a schedule)

SQLite has no native enums, so they are strings validated by zod. That keeps the move to Postgres a provider change.

## Security and RBAC

- **Authentication.** A JWT in an httpOnly, SameSite=Lax cookie, or a Bearer token for API clients. The user is reloaded on every request, so deactivation, role changes and password changes (which bump `tokenVersion`) take effect immediately.
- **CSRF.** Cookie-authenticated writes must send `X-Requested-With`, which a cross-site form cannot send.
- **Row-level scoping** lives in `server/src/lib/scope.ts`. The generic resource router (`lib/resource.ts`) applies it to every list, read, update, delete, bulk action, export and search:
  - Admins (`records:view_all`) see the whole org.
  - Managers (`records:view_team`) see their team's records plus unassigned ones.
  - Reps see only their own records.
- **Granular permissions** are in `shared/src/permissions.ts`, such as delete, export, import, reassign, team reports and workflow management. Admins can override them per org (Settings → Roles), and the server enforces them.
- **Linked records** must belong to the same org (`assertInOrg`), which blocks cross-tenant references.
- **Other safeguards:**
  - Rate limiting on auth and on the public lead endpoint
  - Helmet security headers and a content security policy
  - CSV exports neutralize spreadsheet formulas
  - Uploads are stored under random names and served as downloads

## Key decisions

- **Generic resource router.** Contacts, companies, leads, deals, activities, tasks, tickets, products and campaigns all share one implementation of server-side pagination, filtering, sorting, search, saved views, bulk actions, CSV import/export and audit logging. Module-specific behavior goes in hooks (`prepare`, `afterCreate`, `afterUpdate`, `extend`, `decorate`).
- **The automation engine** (`services/automation.ts`) follows trigger → conditions → actions. Its actions write directly to the database and never emit events themselves, so workflows cannot loop. Every run is recorded.
- **The AI layer** (`services/ai.ts`) sits behind an `AIProvider` interface. The default is rule-based and runs locally:
  - next-best-actions, ranked by urgency and value
  - deal-risk flags
  - lead-scoring insight
  - a summary of each contact's timeline

  An LLM-backed provider can replace it without touching any route.
- **Email** (`services/email.ts`) is an `EmailProvider` interface. The default provider only logs. Every send is stored as an `email` activity on the related records.
- **Dashboard.** KPIs are compared with the previous period of equal length. The pipeline value is reconstructed as it stood at the end of each period.
- **Quotes.** "PDF" is a print-optimized page; the browser's *Save as PDF* produces the file.

## What is fully working

Everything below runs end to end against the real API. The automated tests cover the starred items (★).

- Sign-up into an empty organization ★, login and logout, profile, password change (signs out other sessions)
- RBAC: rep, manager and admin scoping ★, plus the editable permission matrix ★
- Contacts and companies: list with search, filters, sort, pagination, saved views, bulk assign/tag/status/delete, inline edit and CSV import/export ★
- Contact 360 view: profile, company, deals, timeline, emails, tasks, tickets, files and AI summary
- Duplicate detection and merge
- Leads: rule-based scoring ★, round-robin and territory auto-assignment ★, one-click conversion to contact, company and deal ★, public capture API and hosted form ★
- Deals: dnd-kit kanban with optimistic moves, Won/Lost drop zones and loss-reason capture, list view with inline stage edit, stage history ★, multiple pipelines, stage editor, weighted forecast
- Activities (call, email, meeting, note), tasks with reminders and overdue views, and a day/week/month calendar
- Email composer with templates and `{{merge_tags}}`, threaded onto records
- Dashboard: 10 KPIs with trends, revenue trend, funnel, deals by owner, lead-source donut, quota coverage gauge, next-best-actions, activity feed, My/Team views and global filters
- Reports: 6 pre-built reports, a custom builder (entity, metric, group-by, filters, chart type), saved reports, CSV export and print-to-PDF
- Automations: trigger → condition → action builder, recipes and run history ★
- Products, quotes with server-computed totals ★, tickets with SLA timers ★, campaigns with ROI
- Custom fields on contacts, companies, leads, deals and tickets, plus tags, teams, quotas, currencies and the audit log viewer
- ⌘K command palette, notifications bell, light and dark mode, responsive layout down to 375px

## What is stubbed

| Area | Status |
|---|---|
| Email delivery | `ConsoleEmailProvider` logs only. Implement `EmailProvider` (SMTP, SES, Resend…) to deliver mail. Inbound email and threading from replies are not implemented. |
| Scheduled report emails | The scheduler runs and records `lastSentAt`, but sends through the stubbed provider. |
| AI | Heuristic provider only. No LLM is called. |
| PDF | The browser's print-to-PDF, not server-generated. |
| Background jobs | In-process intervals (reminders, SLA warnings, reports). Use a queue or cron worker when running more than one instance. |
| Multi-currency | Deals store a currency, but totals do not convert exchange rates. |

## Next 5 improvements

1. **Real email.** Add an SMTP/Resend provider, inbound email parsing and true reply threading.
2. **LLM provider.** Implement `AIProvider` with a hosted LLM for richer summaries, drafted follow-ups and explained scoring.
3. **PostgreSQL in production.** Add case-insensitive search (`mode: 'insensitive'`), plus SQL-level aggregation for dashboards and reports at larger data volumes.
4. **Queue-backed jobs.** Move reminders, scheduled reports and workflows to a durable queue (for example BullMQ) with retries.
5. **Integrations.** Calendar sync (Google/Microsoft), outbound webhooks and an OAuth app model for the public API.

## Reverse-engineering notes (REA)

The original page structure was captured with REA (`capture_browser_scenario`, Evidence `ev_51b9deca…`): a hero with sign-up, testimonials, "by the numbers", five feature tabs and a pricing comparison.

The current Nexora landing page follows the later brand spec instead. Ghidra was not used: there is no native binary to analyze in a website.
