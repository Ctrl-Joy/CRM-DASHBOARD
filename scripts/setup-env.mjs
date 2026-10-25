// Create server/.env from the example with a random JWT secret (no-op if it exists).
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { randomBytes } from 'crypto';

const target = new URL('../server/.env', import.meta.url);
if (existsSync(target)) {
  console.log('server/.env already exists — leaving it unchanged.');
} else {
  copyFileSync(new URL('../server/.env.example', import.meta.url), target);
  const env = readFileSync(target, 'utf8').replace('change-me-to-a-long-random-string', randomBytes(32).toString('hex'));
  writeFileSync(target, env);
  console.log('Created server/.env with a random JWT_SECRET.');
}
