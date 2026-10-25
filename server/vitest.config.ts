import os from 'os';
import path from 'path';
import { defineConfig } from 'vitest/config';

// Each run gets a brand-new SQLite file in the OS temp directory, so tests never
// touch (or need to reset) the development database.
const dbFile = path.join(os.tmpdir(), `nimbus-crm-test-${process.pid}-${Date.now()}.db`).replace(/\\/g, '/');
process.env.TEST_DATABASE_URL = `file:${dbFile}`;

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./test/global-setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: `file:${dbFile}`,
      JWT_SECRET: 'test-secret-not-for-production',
      UPLOAD_DIR: path.join(os.tmpdir(), 'nimbus-crm-test-uploads'),
    },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
