import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { openDatabase } from './db.js';
import { promoteWaitlists } from './registration.js';

export function startWorker(db) {
  const tick = () => {
    try {
      promoteWaitlists(db);
      db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    } catch (error) {
      console.error('Waitlist worker failed; pending jobs will retry.', error);
    }
  };
  tick();
  const timer = setInterval(tick, 3000);
  timer.unref();
  return () => clearInterval(timer);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const db = openDatabase();
  startWorker(db);
  const keepAlive = setInterval(() => {}, 60000);
  process.on('SIGINT', () => {
    clearInterval(keepAlive);
    db.close();
    process.exit(0);
  });
  console.log('Waitlist worker running.');
}
