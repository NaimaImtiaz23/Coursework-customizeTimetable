# Coursework

A complete student registration app with a searchable course catalog, weekly timetable, automatic section selection, seat limits, waitlists, and calendar export.

## Run locally

Requires Node.js 24 or newer.

```sh
npm install
npm run dev
```

Open http://localhost:3000. Choose **Try demo** for a separate sample student with three courses, or create an account with a password of at least 12 characters. Demo access is disabled in production. The catalog is sample data, not a university integration.

SQLite is connected automatically. Persistent data lives in `data/coursework.db`; no separate database installation or credentials are needed. Restarting the server preserves accounts, sessions, courses, and queues. The single-seat CS 240 section A makes waitlist behavior easy to exercise using two accounts in separate browser profiles.

## Commands

```sh
npm test             # domain, API security, and multi-connection race tests
npm run build       # production frontend
npm start           # production server, configuration required below
npm run worker      # optional separate promotion worker
npx playwright test # starts an isolated test server automatically
```

The application runs a promotion worker every three seconds. A standalone worker can share the same local database; transaction locks make concurrent workers safe. API polling refreshes signed-in workspaces every ten seconds.

Browser tests use locally installed Microsoft Edge. On systems without Edge, install Playwright Chromium with `npx playwright install chromium` and set `PLAYWRIGHT_CHANNEL=chromium`. Tests start their own server on port 3100 with a fresh in-memory database and refuse to reuse an existing server. Your development database is untouched.

## Publishing to GitHub

Commit the source, tests, `package.json`, `package-lock.json`, configuration files, and this README. `.env.example` contains placeholders and is safe to share. The `.gitignore` excludes local environment files, database files (including SQLite sidecars), backups, logs, browser test artifacts, dependencies, build output, and machine-specific settings.

Before each commit, inspect `git status --short` and `git diff --cached`. Do not force-add ignored files. Ignore rules are not encryption and do not remove files from existing Git history. If a credential is ever committed, revoke or rotate it before cleaning the history. A fresh clone creates its own sample database when started; your existing accounts and registrations remain local.

## Configuration and deployment

The server reads `.env` if present. See `.env.example`. In production set:

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
APP_ORIGIN=https://courses.example.edu
COOKIE_SECURE=true
DATABASE_PATH=/srv/coursework/data/coursework.db
TRUSTED_PROXIES=127.0.0.1/32,::1/128
```

Build before starting. Terminate HTTPS at a reverse proxy and forward to the app on its loopback port. The server refuses production startup without an explicit origin and secure cookies. Mount the database directory on a persistent **local** disk. Do not use SQLite WAL on a network filesystem. This implementation targets one application host; for multiple hosts, migrate the transaction layer to PostgreSQL and use row locking.

Back up SQLite with its backup API or stop all app/worker processes before copying the database together with any WAL files. Restrict OS access to the database and backups. Keep dependencies updated and run `npm audit` before deploying. This is a working project, not a security certification or an institution-ready identity system. University SSO, email verification/recovery, institutional enrollment rules, catalog administration, and operational monitoring require institution-specific integration.

## Architecture

Set `TRUSTED_PROXIES` only to your reverse proxy's actual addresses or CIDRs. Leave it empty for direct connections. The proxy must overwrite forwarding headers; trusting arbitrary clients would allow rate-limit evasion. The example above trusts only a proxy on the same machine.

- `server/db.js`: schema, indexes, capacity triggers, sample catalog, transaction boundary.
- `server/registration.js`: enrollment, clash and credit checks, FIFO eligible promotion, atomic batch registration, backtracking planner.
- `server/auth.js`: salted scrypt password hashes and opaque server-side sessions.
- `server/app.js`: validated HTTP endpoints, authorization and security middleware.
- `server/worker.js`: durable job processing and expired session cleanup.
- `src/main.jsx`: student workspace, accessible dialogs, course filtering, planner preview, weekly/day views, notifications, ICS download.
- `src/styles.css`: responsive interface and timetable layout.

Every enrollment and promotion uses `BEGIN IMMEDIATE`. This serializes competing SQLite writers across processes, so seat counts and writes happen under the same lock. Database triggers add an independent seat-capacity invariant. Batch confirmation commits all selections or rolls them all back. A dropped seat and its promotion job are committed together. A crashed worker leaves its transaction and job available for retry; successful promotion and its notification commit together.

Waitlists use registration IDs for deterministic FIFO ordering. Promotion checks conflicts, duplicate courses, and the 18-credit maximum again. Ineligible students keep their position while the next eligible student can be promoted. Dropping a conflicting enrollment requeues the student's waitlisted sections. Waitlisted courses do not hold calendar slots. New registrations cannot bypass an existing waitlist.

The planner keeps current enrollments fixed, searches section combinations, and prunes overlaps and excessive credit loads. Availability is advisory until confirmation; a section that fills between preview and confirmation is waitlisted. The semester is fixed to Fall 2026 in this version. Calendar exports use floating campus-local times, recurring from September 7 through December 18.

## Security controls

Parameterized SQL, bounded request bodies, Zod validation, account-scoped queries, scrypt password hashing, hashed session tokens, HttpOnly/SameSite cookies, CSRF tokens, strict mutation-origin checks, rate limiting, Helmet headers, production CSP, and audit events are implemented. Session lifetime is seven days. Authentication errors do not reveal whether login emails exist. React escapes user content; no raw HTML injection is used. Demo accounts have random inaccessible passwords and are only available in development.

## Interface references

The design uses compact navigation, explicit labels, restrained color, and persistent enrollment status. Research references: [NN/g on minimalist interfaces](https://www.nngroup.com/articles/characteristics-minimalism/) and [GOV.UK on validation feedback](https://design-system.service.gov.uk/components/error-summary/).

Fonts: DM Sans and Manrope, licensed under the SIL Open Font License.
