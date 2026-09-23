import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import express from 'express';
import { openDatabase, seedCatalog } from './db.js';
import { createApp } from './app.js';
import { startWorker } from './worker.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const production = process.argv.includes('--production') || process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const origin = process.env.APP_ORIGIN || `http://localhost:${port}`;
if (
  production &&
  (!process.env.APP_ORIGIN ||
    !origin.startsWith('https://') ||
    process.env.COOKIE_SECURE !== 'true')
) {
  throw new Error(
    'Production requires APP_ORIGIN and COOKIE_SECURE=true, with HTTPS at your reverse proxy.',
  );
}
const db = openDatabase();
seedCatalog(db);
const trustedProxies = (process.env.TRUSTED_PROXIES || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const app = createApp(db, { production, origin, trustedProxies });
let vite;
if (production) {
  app.use(express.static(resolve('dist')));
  app.get('/{*path}', (req, res) => res.sendFile(resolve('dist/index.html')));
} else {
  const { createServer } = await import('vite');
  vite = await createServer({
    server: { middlewareMode: true, hmr: { port: Number(process.env.HMR_PORT || 24678) } },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}
const stopWorker = startWorker(db);
const server = app.listen(port, host, () => console.log(`Coursework is running at ${origin}`));
function shutdown() {
  stopWorker();
  server.close(async () => {
    await vite?.close();
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
