# Nexora CRM

A full-stack CRM whose dashboard tells your team what to do next.

- React 18, TypeScript and Vite on the front end
- Tailwind with shadcn-style components (Radix primitives), Recharts, TanStack Query, Zustand and dnd-kit
- Express, Prisma and PostgreSQL on the back end
- JWT cookie authentication with role-based access control (RBAC)

**New accounts start empty.** Signing up creates a fresh organization containing just you (as admin) and one empty pipeline. Demo data is opt-in (see below) and lives in its own separate organization.

## Quick start

You need Node.js 20.11 or newer.

```bash
npm run setup     # install, create server/.env with a random JWT secret, migrate the database
npm run dev       # API on :4000 and web on :5173 (http://localhost:5173)
```

You don't need to install PostgreSQL. With the default `DATABASE_URL`, every database command (`dev`, `seed`, `db:*`) starts a real local PostgreSQL from the `embedded-postgres` package on port 5433, keeps its data in `server/.pgdata`, and stops it when the command ends. Point `DATABASE_URL` at any other PostgreSQL (Neon, Docker, your own) and it is used as-is.

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
| `npm test` | API integration tests (vitest + supertest) against a throwaway PostgreSQL started for the run |
| `npm run typecheck` | Typecheck shared, server and web |
| `npm run db:migrate` | Create or apply Prisma migrations during development |
| `npm run seed` | Load the opt-in demo organization |

## Configuration (`server/.env`)

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5433/nexora` | The default is the built-in local PostgreSQL. Use any `postgresql://` URL to connect elsewhere |
| `JWT_SECRET` | random (written by setup) | Required. The server refuses `change-me…` values in production |
| `PORT` / `API_PORT` | 4000 | `API_PORT` wins if both are set |
| `SECURE_COOKIES` | 0 | Set to 1 behind HTTPS |
| `UPLOAD_DIR` | `server/uploads` | Where attachments are stored |
| `TRUST_PROXY` | `1` on Railway and Render, else `loopback` | Proxy hops in front of the app (Express `trust proxy`), so rate limits see each visitor's real IP |
| `DEMO_LOGIN` | `true` | Set to `false` to hide the live-demo buttons |

## Deploy for free: Render + Neon

One free Render web service runs the API and serves the built website. The data lives in a free Neon PostgreSQL database. [`render.yaml`](render.yaml) holds the build, start and health-check settings.

1. **Create the database.** Sign up at [neon.tech](https://neon.tech) and create a project. On the dashboard, choose **Connect** and turn **Connection pooling off** (migrations need a direct connection). Copy the connection string; it looks like `postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require`.
2. **Create the web service.** Sign up at [render.com](https://render.com) with GitHub and choose **New → Blueprint**. Pick this repository, and Render reads `render.yaml`.
3. **Paste the Neon string** when Render asks for `DATABASE_URL`, then choose **Apply**. Render generates `JWT_SECRET` itself.
4. Wait for the first deploy to finish. Your site is at `https://nexora-crm.onrender.com`, or similar.
5. **Optional live demo.** Render's free plan has no shell, so load the demo from your own computer, pointed at Neon:
   ```powershell
   $env:DATABASE_URL="<your Neon connection string>"; npm run seed; Remove-Item Env:DATABASE_URL
   ```
   On macOS or Linux: `DATABASE_URL="<your Neon connection string>" npm run seed`

Migrations run on every start, and every push to `main` redeploys. Know the free-plan limits:

- **Sleep:** the service sleeps after about 15 minutes without visitors, and the next visit takes 30–60 seconds to wake it.
- **Uploads:** uploaded files are stored on the service's own disk, which is wiped on every restart or deploy. Everything else is safe in Neon.

## Deploy to Railway

[`railway.json`](railway.json) sets the build, start and health-check commands.

1. On [railway.app](https://railway.app), choose **New Project → Deploy from GitHub repo** and pick this repository.
2. Add a **PostgreSQL** database to the project (**New → Database → PostgreSQL**).
3. Optional, to keep uploads: add a **Volume** to the web service, mounted at `/data`.
4. Under the web service's **Variables**, add:
   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   JWT_SECRET=<at least 32 random characters>
   SECURE_COOKIES=1
   UPLOAD_DIR=/data/uploads
   ```
5. Under **Settings → Networking**, choose **Generate Domain**.
6. Optional: to load the live demo, run `npm run seed` once from the service's shell.

Other hosts work the same way: build with `npm ci --include=dev && npm run build`, start with `npm run db:deploy && npm start`, and set `DATABASE_URL` to a PostgreSQL database.

## Project layout

```
shared/   zod schemas, enums, permissions and calculations shared by API and UI (the typed contract)
server/   Express API · prisma/ (schema, migrations, seed) · src/routes · src/services · test/
web/      React app · src/components (ui kit, data table, records) · src/features/<module>
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the data model, RBAC, and what is fully working versus stubbed.
