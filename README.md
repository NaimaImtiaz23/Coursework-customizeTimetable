# Coursework

**Course registration, conflict-free timetable planning, and automated waitlist management.**

Coursework is a full-stack student registration application built with React, Express, and SQLite. Students can explore course sections, plan a weekly schedule, reserve available seats, and join waitlists. Transactional registration protects limited seats from concurrent requests, while a background worker promotes eligible students when seats become available.

The application provides a responsive, text-first interface with a searchable catalog, weekly and daily timetable views, and explicit enrollment status.

## Features

- **Course discovery:** Search the sample catalog, filter by department, and find sections with open seats.
- **Timetable planning:** Find section combinations that respect existing enrollments, meeting times, and the 18-credit limit.
- **Registration:** Enroll with duplicate-course and timetable-conflict checks.
- **Waitlists:** Track queue positions and receive in-app notifications after automatic promotion.
- **Calendar export:** Download enrolled classes as a recurring iCalendar (`.ics`) schedule.
- **Student accounts:** Register, sign in, and retain enrollments across sessions and server restarts.

## Technology Stack

| Layer                   | Technology                                             |
| ----------------------- | ------------------------------------------------------ |
| Frontend                | React 19, CSS, Vite                                    |
| Backend                 | Node.js 24+, Express 5                                 |
| Database                | SQLite through Node.js `node:sqlite`, with WAL enabled |
| Validation and security | Zod, Helmet, express-rate-limit, Node.js crypto        |
| Testing                 | Node.js test runner, Playwright                        |

## Quick Start

### Prerequisites

- Node.js **24 or later** and npm
- Git
- Microsoft Edge for the default browser tests, or Playwright Chromium

### Installation

```sh
git clone https://github.com/NaimaImtiaz23/Coursework-customizeTimetable.git
cd Coursework-customizeTimetable
npm ci
npm run dev
```

Open **http://localhost:3000**. Create an account with a password of at least 12 characters, or select **Try demo** to create a separate sample student with initial registrations. Demo access is disabled in production.

The application creates and seeds `data/coursework.db` automatically. A separate database service is not required. Accounts, registrations, sessions, notifications, and pending promotion jobs persist in this file. Local database files are excluded from Git.

### Explore the Waitlist Flow

Use two accounts in separate browser profiles and select **CS 240, section A**, which has one seat in the sample catalog. The first student enrolls; the next joins the waitlist. When the enrolled student drops the section, the worker promotes the next eligible student and creates a notification.

The worker checks pending jobs every three seconds. Signed-in workspaces refresh every ten seconds.

## Available Commands

| Command            | Purpose                                                         |
| ------------------ | --------------------------------------------------------------- |
| `npm run dev`      | Start the API, frontend development server, and embedded worker |
| `npm run build`    | Build the frontend into `dist/`                                 |
| `npm start`        | Start the production server with production configuration       |
| `npm run worker`   | Run an additional standalone promotion worker                   |
| `npm test`         | Run backend, security, and concurrent-registration tests        |
| `npm run test:e2e` | Run desktop and mobile browser tests                            |
| `npm run format`   | Format project source and documentation                         |


## Architecture

```text
src/
  components/          Timetable and dialog components
  lib/                 API client and schedule helpers
  main.jsx             Student workspace and application state
  styles.css           Responsive layout and visual styles
server/
  db.js                Schema, indexes, capacity triggers, seed data
  registration.js      Enrollment rules, planner, and promotion logic
  auth.js              Password hashing and server-side sessions
  app.js               HTTP routes, validation, and security middleware
  worker.js            Promotion jobs and expired-session cleanup
  index.js             Configuration and server startup
tests/
  api.test.js          Authentication, authorization, and proxy tests
  registration.test.js Domain rules and concurrency tests
  race-worker.js       Independent database connection test helper
  browser/             Desktop and mobile workflow tests
```

### Registration and Concurrency

Enrollment and promotion execute inside SQLite `BEGIN IMMEDIATE` transactions. Competing writers are serialized, ensuring that availability checks and seat allocation occur under the same lock. Database triggers independently prevent section capacity from being exceeded.

Batch registration is atomic: either every selected registration succeeds or the transaction rolls back. Dropping a registration and scheduling its promotion job also happen in one transaction. Worker failures leave unfinished jobs available for retry.

### Waitlist Policy

Queue order follows registration IDs. Promotion selects the first eligible student, rechecking timetable conflicts, duplicate enrollment, and the credit limit. An ineligible student retains their queue position while another eligible student may receive the seat. Dropping a conflicting course requeues that student's waitlisted sections for evaluation.

Waitlisted courses do not reserve timetable slots. New registrations cannot bypass an existing queue.

### Timetable Planning

The planner keeps existing enrollments fixed and searches section combinations, rejecting overlaps and excess credits. Students can optionally include full sections. Availability is checked again at confirmation; a section that fills after the preview is waitlisted.

## Security and Data Handling

- Salted scrypt password hashes; plaintext passwords are not stored.
- Random session tokens stored as hashes, with a seven-day session lifetime.
- HttpOnly, SameSite cookies, with Secure cookies required for production startup.
- CSRF tokens and origin validation on authenticated mutations.
- Parameterized SQL, bounded request bodies, and server-side input validation.
- Account-scoped authorization, request rate limits, Helmet headers, and production CSP.
- Audit records for enrollment, removal, and promotion actions.

User data remains in the configured database. Search filters, active views, and unconfirmed planner selections are temporary frontend state and are not saved as account preferences.

The repository excludes local databases, SQLite sidecars, environment files, private keys, backups, logs, test artifacts, dependencies, and build output. Review staged changes before committing; ignore rules do not remove sensitive data already committed to history.

## Testing

```sh
npm test
npm run test:e2e
npm run build
```

Backend tests cover conflict detection, credit limits, duplicate registrations, atomic rollback, queue ordering, promotion eligibility, capacity triggers, and independent database connections competing for one seat. API tests cover authentication, CSRF, ownership, validation, logout, and proxy trust.

Browser tests cover registration, planner confirmation, persistence after reload, calendar export, mobile navigation, and layout fit. Playwright starts an isolated server on port **3100**, uses WebSocket port **24778**, and creates a fresh in-memory database. It refuses to reuse an existing server and does not modify the development database.

The default browser is locally installed Microsoft Edge. To use Chromium instead:

```sh
npx playwright install chromium
```

Then set `PLAYWRIGHT_CHANNEL=chromium` before running `npm run test:e2e`.

## Current Scope

The application includes a sample catalog for **Fall 2026** and does not connect to a university registration system. Calendar exports use campus-local floating times from September 7 through December 18.

University SSO, email verification, password recovery, catalog administration, institutional enrollment policies, and operational monitoring are not included. Production use requires deployment-specific review and integration.

## Collaborators

- [Naima Imtiaz](https://github.com/NaimaImtiaz23)
- [Zoraiz](https://github.com/Zoraiz03)

## Acknowledgments

Interface references include [Nielsen Norman Group's minimalist design research](https://www.nngroup.com/articles/characteristics-minimalism/) and [GOV.UK validation guidance](https://design-system.service.gov.uk/components/error-summary/). DM Sans and Manrope are distributed under the SIL Open Font License.
