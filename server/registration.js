import { transaction } from './db.js';

export class DomainError extends Error {
  constructor(message, status = 409) {
    super(message);
    this.status = status;
  }
}

export function catalog(db) {
  const meetings = db
    .prepare('SELECT section_id, day, start, end FROM meetings ORDER BY day, start')
    .all();
  return db
    .prepare(
      `SELECT s.*, c.title, c.department, c.credits, c.description, c.color,
    (SELECT COUNT(*) FROM registrations r WHERE r.section_id=s.id AND r.status='enrolled') AS enrolled,
    (SELECT COUNT(*) FROM registrations r WHERE r.section_id=s.id AND r.status='waitlisted') AS waiting
    FROM sections s JOIN courses c ON c.id=s.course_id ORDER BY c.id, s.label`,
    )
    .all()
    .map((s) => ({ ...s, meetings: meetings.filter((m) => m.section_id === s.id) }));
}

export function overlaps(a, b) {
  return a.meetings.some((x) =>
    b.meetings.some((y) => x.day === y.day && x.start < y.end && y.start < x.end),
  );
}

function eligibility(db, userId, section) {
  const enrolled = db
    .prepare(
      `SELECT s.id, s.course_id, c.credits FROM registrations r
    JOIN sections s ON s.id=r.section_id JOIN courses c ON c.id=s.course_id
    WHERE r.user_id=? AND r.status='enrolled'`,
    )
    .all(userId);
  if (enrolled.some((s) => s.course_id === section.course_id))
    return 'You are already enrolled in this course.';
  if (enrolled.reduce((n, s) => n + s.credits, 0) + section.credits > 18)
    return 'This would exceed the 18-credit semester limit.';
  for (const other of enrolled) {
    other.meetings = db
      .prepare('SELECT day, start, end FROM meetings WHERE section_id=?')
      .all(other.id);
    if (overlaps(section, other))
      return `This section clashes with ${other.course_id}. Choose another section.`;
  }
  return null;
}

function audit(db, user, action, section) {
  db.prepare('INSERT INTO audit_log(user_id, action, section_id) VALUES (?, ?, ?)').run(
    user,
    action,
    section,
  );
}

export function register(db, userId, sectionId) {
  return transaction(db, () => registerInTransaction(db, userId, sectionId));
}

export function registerBatch(db, userId, sectionIds) {
  return transaction(db, () => sectionIds.map((id) => registerInTransaction(db, userId, id)));
}

function registerInTransaction(db, userId, sectionId) {
  const section = catalog(db).find((s) => s.id === sectionId);
  if (!section) throw new DomainError('Section not found.', 404);
  const existing = db
    .prepare(
      `SELECT r.id FROM registrations r JOIN sections s ON s.id=r.section_id
      WHERE r.user_id=? AND s.course_id=?`,
    )
    .get(userId, section.course_id);
  if (existing)
    throw new DomainError(
      'You have already registered for this course. Remove it first to change sections.',
    );
  const problem = eligibility(db, userId, section);
  if (problem) throw new DomainError(problem);
  const status =
    section.enrolled < section.capacity && section.waiting === 0 ? 'enrolled' : 'waitlisted';
  db.prepare('INSERT INTO registrations(user_id, section_id, status) VALUES (?, ?, ?)').run(
    userId,
    sectionId,
    status,
  );
  audit(db, userId, status, sectionId);
  if (status === 'waitlisted')
    db.prepare('INSERT OR IGNORE INTO jobs(section_id) VALUES (?)').run(sectionId);
  return { status };
}

export function drop(db, userId, sectionId) {
  return transaction(db, () => {
    const result = db
      .prepare('DELETE FROM registrations WHERE user_id=? AND section_id=?')
      .run(userId, sectionId);
    if (!result.changes) throw new DomainError('Registration not found.', 404);
    audit(db, userId, 'dropped', sectionId);
    db.prepare('INSERT OR IGNORE INTO jobs(section_id) VALUES (?)').run(sectionId);
    // Dropping a course may also make this student's other waitlists eligible.
    db.prepare(
      "INSERT OR IGNORE INTO jobs(section_id) SELECT section_id FROM registrations WHERE user_id=? AND status='waitlisted'",
    ).run(userId);
  });
}

export function promoteWaitlists(db) {
  return transaction(db, () => {
    let promoted = 0;
    const sections = catalog(db);
    for (const job of db
      .prepare('SELECT section_id FROM jobs ORDER BY created_at, section_id')
      .all()) {
      const section = sections.find((s) => s.id === job.section_id);
      let seats = section.capacity - section.enrolled;
      const queue = db
        .prepare(
          "SELECT id, user_id FROM registrations WHERE section_id=? AND status='waitlisted' ORDER BY id",
        )
        .all(section.id);
      for (const entry of queue) {
        if (seats <= 0) break;
        if (eligibility(db, entry.user_id, section)) continue;
        db.prepare("UPDATE registrations SET status='enrolled' WHERE id=?").run(entry.id);
        db.prepare('INSERT INTO notifications(user_id, message) VALUES (?, ?)').run(
          entry.user_id,
          `You're in! A seat opened in ${section.course_id}, section ${section.label}. You are now enrolled.`,
        );
        audit(db, entry.user_id, 'promoted', section.id);
        seats--;
        promoted++;
      }
      db.prepare('DELETE FROM jobs WHERE section_id=?').run(section.id);
    }
    return promoted;
  });
}

export function registrations(db, userId) {
  return db
    .prepare(
      `SELECT r.section_id, r.status,
    CASE WHEN r.status='waitlisted' THEN (SELECT COUNT(*) FROM registrations q
      WHERE q.section_id=r.section_id AND q.status='waitlisted' AND q.id<=r.id) ELSE 0 END AS position
    FROM registrations r WHERE user_id=? ORDER BY r.id`,
    )
    .all(userId);
}

export function buildSchedule(db, userId, courseIds, includeFull = false) {
  const all = catalog(db);
  const current = registrations(db, userId);
  const fixed = current
    .filter((r) => r.status === 'enrolled')
    .map((r) => all.find((s) => s.id === r.section_id));
  const registeredCourses = new Set(
    current.map((r) => all.find((s) => s.id === r.section_id).course_id),
  );
  const wanted = [...new Set(courseIds)].filter((id) => !registeredCourses.has(id));
  if (!wanted.length)
    throw new DomainError('Select at least one course you have not registered for.', 400);
  const groups = wanted.map((id) =>
    all
      .filter((s) => s.course_id === id && (includeFull || (s.enrolled < s.capacity && !s.waiting)))
      .sort((a, b) => b.capacity - b.enrolled - (a.capacity - a.enrolled)),
  );
  groups.sort((a, b) => a.length - b.length);
  let result = null;
  function solve(index, selected, credits) {
    if (index === groups.length) {
      result = selected;
      return true;
    }
    for (const section of groups[index]) {
      if (
        credits + section.credits > 18 ||
        [...fixed, ...selected].some((s) => overlaps(s, section))
      )
        continue;
      if (solve(index + 1, [...selected, section], credits + section.credits)) return true;
    }
    return false;
  }
  solve(
    0,
    [],
    fixed.reduce((n, s) => n + s.credits, 0),
  );
  if (!result)
    throw new DomainError(
      'No clash-free combination is available. Try fewer courses or include full sections.',
    );
  return result.map((s) => s.id);
}
