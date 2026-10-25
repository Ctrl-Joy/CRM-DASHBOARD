# Nexora CRM

A full-stack CRM whose dashboard tells your team what to do next.

- React 18, TypeScript and Vite on the front end
- Tailwind with shadcn-style components (Radix primitives), Recharts, TanStack Query, Zustand and dnd-kit
- Express, Prisma and SQLite on the back end
- JWT cookie authentication with role-based access control (RBAC)

**New accounts start empty.** Signing up creates a fresh organization containing just you (as admin) and one empty pipeline. Demo data is opt-in (see below) and lives in its own separate organization.

## Quick start

You need Node.js 20.11 or newer.

```bash
npm run setup     # install, create server/.env with a random JWT secret, migrate the database
npm run dev       # API on :4000 and web on :5173 (http://localhost:5173)
```

Open http://localhost:5173, choose **Sign in → Create account**, and you are the admin of a new, empty workspace.

### Optional demo data

```bash
npm run seed
```

The seed creates (or recreates) a separate **Northwind Demo** organization:

- 5 users and 1 team
- 20 companies and 60 contacts
- 40 deals across 2 pipelines
- 32 leads, 170 activities and 40 tasks
- 6 products and 6 quotes
- 12 tickets and 4 campaigns
- workflows and email templates

It never touches other organizations. Sign in with one of these accounts. They are local test credentials, also printed by the seed:

| Role | Email | Password |
|---|---|---|
| Admin | admin@demo.nimbus.test | demo-password-2026 |
| Manager | manager@demo.nimbus.test | demo-password-2026 |
| Rep | sam@demo.nimbus.test | demo-password-2026 |

#### Live demo for showcasing

Once the demo organization exists, visitors don't need these passwords. The home page shows **Try the live demo**, and the sign-in page offers one-click **Admin / Manager / Sales rep** buttons. Inside the demo, a banner reminds visitors that it's sample data shared with other visitors. Profile, password and user settings are read-only there, so nobody can lock others out.

- Run `npm run seed` again at any time to reset the demo to its original state. Dates are relative to when you seed, so re-seeding also keeps it looking current.
- Set `DEMO_LOGIN=false` in `server/.env` to hide the demo buttons. The demo accounts still work with their passwords.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API (tsx watch) and Vite dev server |
| `npm run build` | Typecheck and build the web app into `web/dist` |
| `npm start` | Production: the API serves `web/dist` on one port (`PORT`, default 4000) |
| `npm test` | API integration tests (vitest + supertest) against a throwaway temp database |
| `npm run typecheck` | Typecheck shared, server and web |
| `npm run db:migrate` | Create or apply Prisma migrations during development |
| `npm run seed` | Load the opt-in demo organization |

## Configuration (`server/.env`)

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | To use PostgreSQL, switch `provider` in `server/prisma/schema.prisma` and use a `postgresql://` URL |
| `JWT_SECRET` | random (written by setup) | Required. The server refuses `change-me…` values in production |
| `PORT` / `API_PORT` | 4000 | `API_PORT` wins if both are set |
| `SECURE_COOKIES` | 0 | Set to 1 behind HTTPS |
| `UPLOAD_DIR` | `server/uploads` | Where attachments are stored |

## Project layout

```
shared/   zod schemas, enums, permissions and calculations shared by API and UI (the typed contract)
server/   Express API · prisma/ (schema, migrations, seed) · src/routes · src/services · test/
web/      React app · src/components (ui kit, data table, records) · src/features/<module>
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the data model, RBAC, and what is fully working versus stubbed.
