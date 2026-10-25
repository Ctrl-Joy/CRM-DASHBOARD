import { execSync } from 'child_process';
import fs from 'fs';

// Create the schema in the fresh temp database chosen by vitest.config.ts.
export default function setup() {
  const url = process.env.TEST_DATABASE_URL!;
  execSync('npx prisma db push --skip-generate', { stdio: 'ignore', env: { ...process.env, DATABASE_URL: url } });
  return () => {
    const file = url.replace(/^file:/, '');
    for (const f of [file, `${file}-journal`]) fs.rmSync(f, { force: true });
  };
}
