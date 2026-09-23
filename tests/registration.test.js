import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { openDatabase, seedCatalog } from '../server/db.js';
import {
  catalog,
  register,
  registerBatch,
  drop,
  promoteWaitlists,
  registrations,
  buildSchedule,
  overlaps,
} from '../server/registration.js';

function fixture(t) {
  const db = openDatabase(':memory:');
  seedCatalog(db);
  for (let i = 1; i <= 10; i++)
    db.prepare('INSERT INTO users(id,name,email,password_hash) VALUES (?, ?, ?, ?)').run(
      i,
      `Student ${i}`,
      `${i}@example.test`,
      'unused',
    );
  t.after(() => db.close());
  return db;
}

test('enforces course uniqueness, clashes and adjacent class boundaries', (t) => {
  const db = fixture(t);
  register(db, 1, 1);
  assert.throws(() => register(db, 1, 2), /already registered/);
  assert.throws(() => register(db, 1, 9), /clashes/);
  assert.equal(register(db, 1, 5).status, 'enrolled');
  assert.equal(
    overlaps(
      { meetings: [{ day: 0, start: 500, end: 600 }] },
      { meetings: [{ day: 0, start: 600, end: 700 }] },
    ),
    false,
  );
});

test('full section queues FIFO, releases seats and promotes exactly once', (t) => {
  const db = fixture(t);
  assert.equal(register(db, 1, 3).status, 'enrolled');
  assert.equal(register(db, 2, 3).status, 'waitlisted');
  register(db, 3, 3);
  assert.equal(registrations(db, 3)[0].position, 2);
  drop(db, 1, 3);
  assert.equal(promoteWaitlists(db), 1);
  assert.equal(promoteWaitlists(db), 0);
  assert.equal(registrations(db, 2)[0].status, 'enrolled');
  assert.equal(registrations(db, 3)[0].position, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM notifications').get().n, 1);
});

test('promotion skips ineligible students and revisits after a conflicting course is dropped', (t) => {
  const db = fixture(t);
  register(db, 1, 3);
  register(db, 2, 3);
  register(db, 3, 3);
  db.prepare('UPDATE meetings SET start=540,end=615 WHERE section_id=7').run();
  register(db, 2, 7);
  drop(db, 1, 3);
  promoteWaitlists(db);
  assert.equal(registrations(db, 2).find((r) => r.section_id === 3).status, 'waitlisted');
  assert.equal(registrations(db, 3)[0].status, 'enrolled');
  drop(db, 3, 3);
  promoteWaitlists(db);
  assert.equal(catalog(db).find((s) => s.id === 3).enrolled, 0);
  drop(db, 2, 7);
  promoteWaitlists(db);
  assert.equal(registrations(db, 2)[0].status, 'enrolled');
});

test('batch registration is all or nothing', (t) => {
  const db = fixture(t);
  assert.throws(() => registerBatch(db, 1, [1, 9]), /clashes/);
  assert.equal(registrations(db, 1).length, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM audit_log').get().n, 0);
});

test('planner finds alternatives and respects existing enrollments', (t) => {
  const db = fixture(t);
  register(db, 1, 1);
  const plan = buildSchedule(db, 1, ['CS 240', 'MATH 210', 'CS 310']);
  assert.equal(plan.length, 3);
  registerBatch(db, 1, plan);
  assert.equal(registrations(db, 1).length, 4);
  assert.throws(() => buildSchedule(db, 1, ['STAT 201']), /No clash-free/);
});

test('credit limit is rechecked at registration', (t) => {
  const db = fixture(t);
  db.prepare("UPDATE courses SET credits=16 WHERE id='CS 201'").run();
  register(db, 1, 1);
  assert.throws(() => register(db, 1, 5), /18-credit/);
});

test('database trigger blocks bypassing the seat limit', (t) => {
  const db = fixture(t);
  register(db, 1, 3);
  assert.throws(
    () =>
      db
        .prepare("INSERT INTO registrations(user_id,section_id,status) VALUES (2,3,'enrolled')")
        .run(),
    /Section is full/,
  );
});

test('independent concurrent database connections never double-book the last seat', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'coursework-test-'));
  const path = join(directory, 'race.db');
  const db = openDatabase(path);
  seedCatalog(db);
  for (let i = 1; i <= 8; i++)
    db.prepare('INSERT INTO users(id,name,email,password_hash) VALUES (?, ?, ?, ?)').run(
      i,
      'Student',
      `${i}@race.test`,
      'unused',
    );
  t.after(() => {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const results = await Promise.all(
    Array.from(
      { length: 8 },
      (_, i) =>
        new Promise((resolve, reject) => {
          const worker = new Worker(new URL('./race-worker.js', import.meta.url), {
            workerData: { path, userId: i + 1 },
          });
          let result;
          worker.on('message', (value) => {
            result = value;
          });
          worker.on('error', reject);
          worker.on('exit', (code) =>
            code === 0 ? resolve(result) : reject(new Error(`Worker exit ${code}`)),
          );
        }),
    ),
  );
  assert.equal(results.filter((r) => r.status === 'enrolled').length, 1);
  assert.equal(results.filter((r) => r.status === 'waitlisted').length, 7);
});
