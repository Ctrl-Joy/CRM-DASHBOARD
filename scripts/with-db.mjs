// Run a command with the database ready.
//
//   node scripts/with-db.mjs npm run dev:app
//
// When DATABASE_URL points at the built-in local database (localhost:5433, the
// default in server/.env.example), this starts a real PostgreSQL from the
// embedded-postgres package with its data in server/.pgdata, creates the
// database if needed, runs the command, then stops Postgres. Nothing to install.
// Any other DATABASE_URL (Neon, Render, your own server) is used as-is.
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const root = fileURLToPath(new URL('..', import.meta.url));
dotenv.config({ path: `${root}server/.env`, quiet: true });

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error('Usage: node scripts/with-db.mjs <command> [args...]');
  process.exit(1);
}

const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const isLocal = url && ['localhost', '127.0.0.1'].includes(url.hostname) && url.port === '5433';

async function reachable() {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL.replace(/\/[^/?]*(\?|$)/, '/postgres$1') });
  try { await client.connect(); return true; } catch { return false; } finally { await client.end().catch(() => {}); }
}

let pgServer = null;
if (isLocal) {
  if (!(await reachable())) {
    const { default: EmbeddedPostgres } = await import('embedded-postgres');
    const dir = `${root}server/.pgdata`;
    pgServer = new EmbeddedPostgres({
      databaseDir: dir, port: 5433, persistent: true,
      user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
      onLog: () => {}, onError: (e) => console.error(String(e)),
    });
    if (!existsSync(`${dir}/PG_VERSION`)) {
      console.log('Setting up the local PostgreSQL database (first run only)…');
      await pgServer.initialise();
    }
    await pgServer.start();
    console.log(`Local PostgreSQL running on port 5433 (data in server/.pgdata).`);
  }
  // Create the database named in DATABASE_URL if it doesn't exist yet.
  const { default: pg } = await import('pg');
  const name = decodeURIComponent(url.pathname.slice(1));
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL.replace(/\/[^/?]*(\?|$)/, '/postgres$1') });
  await client.connect();
  const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
  if (!rowCount) await client.query(`CREATE DATABASE "${name.replace(/"/g, '')}"`);
  await client.end();
}

let stopping = false;
async function stop(code) {
  if (stopping) return;
  stopping = true;
  if (pgServer) await pgServer.stop().catch(() => {});
  process.exit(code);
}

const child = spawn([cmd, ...args].join(' '), { stdio: 'inherit', shell: true, cwd: root });
child.on('exit', (code, signal) => stop(code ?? (signal ? 1 : 0)));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { /* the child gets the signal too; stop once it exits */ });
