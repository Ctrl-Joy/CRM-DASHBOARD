import os from 'os';
import path from 'path';
import { defineConfig } from 'vitest/config';

// Each run starts a throwaway PostgreSQL (see test/global-setup.ts) on its own
// port with a temp data directory, so tests never touch the development database.
const port = 55000 + (process.pid % 1000);
process.env.TEST_PG_PORT = String(port);
process.env.TEST_PG_DIR = path.join(os.tmpdir(), `nexora-crm-test-${process.pid}-${Date.now()}`);
const url = `postgresql://postgres:postgres@localhost:${port}/crm_test`;

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./test/global-setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: url,
      JWT_SECRET: 'test-secret-not-for-production',
      UPLOAD_DIR: path.join(os.tmpdir(), 'nimbus-crm-test-uploads'),
    },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
