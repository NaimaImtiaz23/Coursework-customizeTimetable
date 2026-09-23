import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword, createSession, getSession } from './auth.js';
import {
  catalog,
  register,
  registerBatch,
  drop,
  registrations,
  buildSchedule,
  DomainError,
} from './registration.js';

export function createApp(
  db,
  { production = false, origin = 'http://localhost:3000', trustedProxies = [] } = {},
) {
  const app = express();
  if (trustedProxies.length) app.set('trust proxy', trustedProxies);
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: production ? undefined : false,
      strictTransportSecurity: production ? undefined : false,
    }),
  );
  app.use(express.json({ limit: '16kb' }));
  app.use(
    '/api',
    rateLimit({ windowMs: 60000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false }),
  );
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== origin) {
      return res.status(403).json({ error: 'Request origin is not allowed.' });
    }
    req.user = getSession(db, req);
    next();
  });
  const secure = process.env.COOKIE_SECURE === 'true';
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    path: '/',
    maxAge: 7 * 86400000,
  };
  const login = (res, userId) => {
    const session = createSession(db, userId);
    res.cookie('session', session.token, cookieOptions);
    res.json({ csrf: session.csrf });
  };
  const authLimiter = rateLimit({
    windowMs: 15 * 60000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });
  const credentials = z.object({
    email: z
      .email()
      .max(254)
      .transform((s) => s.toLowerCase().trim()),
    password: z.string().min(12).max(128),
  });
  app.post('/api/auth/signup', authLimiter, async (req, res) => {
    const input = credentials.extend({ name: z.string().trim().min(2).max(80) }).parse(req.body);
    const hash = await hashPassword(input.password);
    try {
      const user = db
        .prepare('INSERT INTO users(name, email, password_hash) VALUES (?, ?, ?)')
        .run(input.name, input.email, hash);
      login(res, Number(user.lastInsertRowid));
    } catch (error) {
      if (error.message.includes('UNIQUE'))
        throw new DomainError('Unable to create an account with this email. Try signing in.', 409);
      throw error;
    }
  });
  const dummyHash = hashPassword(randomBytes(32).toString('hex'));
  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const input = credentials.parse(req.body);
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(input.email);
    const valid = await verifyPassword(input.password, user?.password_hash || (await dummyHash));
    if (!user || !valid) throw new DomainError('Email or password is incorrect.', 401);
    login(res, user.id);
  });
  // Demo access creates a separate student, never a shared authenticated account.
  if (!production)
    app.post('/api/auth/demo', authLimiter, async (req, res) => {
      const id = randomBytes(12).toString('hex');
      const hash = await hashPassword(randomBytes(32).toString('hex'));
      const user = db
        .prepare('INSERT INTO users(name, email, password_hash) VALUES (?, ?, ?)')
        .run('Alex Morgan', `demo-${id}@example.invalid`, hash);
      const userId = Number(user.lastInsertRowid);
      for (const section of [1, 5, 7]) register(db, userId, section);
      login(res, userId);
    });
  app.get('/api/catalog', (req, res) =>
    res.json({ sections: catalog(db), demoEnabled: !production }),
  );
  app.get('/api/me', (req, res) => {
    if (!req.user) return res.json({ user: null });
    const { id, name, email, csrf } = req.user;
    res.json({
      user: { id, name, email },
      csrf,
      registrations: registrations(db, id),
      notifications: db
        .prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 30')
        .all(id),
    });
  });
  app.use('/api', (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Please sign in to continue.' });
    if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-csrf-token'] !== req.user.csrf) {
      return res
        .status(403)
        .json({ error: 'Your session changed. Refresh the page and try again.' });
    }
    next();
  });
  app.post('/api/auth/logout', (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.user.token_hash);
    res.clearCookie('session', { ...cookieOptions, maxAge: undefined });
    res.json({ ok: true });
  });
  app.post('/api/registrations', (req, res) => {
    const { sectionId } = z.object({ sectionId: z.number().int().positive() }).parse(req.body);
    res.status(201).json(register(db, req.user.id, sectionId));
  });
  app.delete('/api/registrations/:id', (req, res) => {
    const sectionId = z.coerce.number().int().positive().parse(req.params.id);
    drop(db, req.user.id, sectionId);
    res.json({ ok: true });
  });
  app.post('/api/planner', (req, res) => {
    const input = z
      .object({
        courseIds: z.array(z.string().max(20)).min(1).max(8),
        includeFull: z.boolean().default(false),
      })
      .parse(req.body);
    res.json({ sectionIds: buildSchedule(db, req.user.id, input.courseIds, input.includeFull) });
  });
  app.post('/api/planner/confirm', (req, res) => {
    const { sectionIds } = z
      .object({ sectionIds: z.array(z.number().int().positive()).min(1).max(8) })
      .parse(req.body);
    const results = registerBatch(db, req.user.id, sectionIds);
    res.json({ results });
  });
  app.post('/api/notifications/read', (req, res) => {
    db.prepare('UPDATE notifications SET read=1 WHERE user_id=?').run(req.user.id);
    res.json({ ok: true });
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
  app.use((error, req, res, next) => {
    if (error instanceof z.ZodError)
      return res
        .status(400)
        .json({ error: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' ') });
    if (error instanceof DomainError)
      return res.status(error.status).json({ error: error.message });
    if (error.type === 'entity.parse.failed')
      return res.status(400).json({ error: 'Invalid JSON request.' });
    if (error.type === 'entity.too.large')
      return res.status(413).json({ error: 'Request is too large.' });
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });
  return app;
}
