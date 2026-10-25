import { execSync } from 'child_process';
import EmbeddedPostgres from 'embedded-postgres';

// Start a throwaway PostgreSQL for this run and create the schema in it.
export default async function setup() {
  const port = Number(process.env.TEST_PG_PORT);
  const pg = new EmbeddedPostgres({
    databaseDir: process.env.TEST_PG_DIR!, port, user: 'postgres', password: 'postgres', persistent: false, onLog: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('crm_test');
  execSync('npx prisma db push --skip-generate', {
    stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: `postgresql://postgres:postgres@localhost:${port}/crm_test` },
  });
  return () => pg.stop();
}
