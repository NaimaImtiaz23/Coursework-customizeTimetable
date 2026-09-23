import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDatabase(path = process.env.DATABASE_PATH || 'data/coursework.db') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, department TEXT NOT NULL,
      credits INTEGER NOT NULL CHECK(credits > 0), description TEXT NOT NULL, color TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sections (
      id INTEGER PRIMARY KEY, course_id TEXT NOT NULL REFERENCES courses(id),
      label TEXT NOT NULL, instructor TEXT NOT NULL, room TEXT NOT NULL,
      capacity INTEGER NOT NULL CHECK(capacity > 0), UNIQUE(course_id, label)
    );
    CREATE TABLE IF NOT EXISTS meetings (
      id INTEGER PRIMARY KEY, section_id INTEGER NOT NULL REFERENCES sections(id),
      day INTEGER NOT NULL CHECK(day BETWEEN 0 AND 4),
      start INTEGER NOT NULL, end INTEGER NOT NULL CHECK(end > start)
    );
    CREATE TABLE IF NOT EXISTS registrations (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
      section_id INTEGER NOT NULL REFERENCES sections(id),
      status TEXT NOT NULL CHECK(status IN ('enrolled', 'waitlisted')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, section_id)
    );
    CREATE INDEX IF NOT EXISTS registrations_section ON registrations(section_id, status, id);
    CREATE INDEX IF NOT EXISTS registrations_user ON registrations(user_id);
    CREATE TABLE IF NOT EXISTS jobs (
      section_id INTEGER PRIMARY KEY REFERENCES sections(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
      message TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL, section_id INTEGER REFERENCES sections(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TRIGGER IF NOT EXISTS prevent_overbooking_insert
    BEFORE INSERT ON registrations WHEN NEW.status = 'enrolled'
    BEGIN
      SELECT CASE WHEN (SELECT COUNT(*) FROM registrations WHERE section_id = NEW.section_id AND status = 'enrolled')
      >= (SELECT capacity FROM sections WHERE id = NEW.section_id) THEN RAISE(ABORT, 'Section is full') END;
    END;
    CREATE TRIGGER IF NOT EXISTS prevent_overbooking_update
    BEFORE UPDATE OF status, section_id ON registrations WHEN NEW.status = 'enrolled'
    BEGIN
      SELECT CASE WHEN (SELECT COUNT(*) FROM registrations WHERE section_id = NEW.section_id AND status = 'enrolled' AND id != NEW.id)
      >= (SELECT capacity FROM sections WHERE id = NEW.section_id) THEN RAISE(ABORT, 'Section is full') END;
    END;
  `);
  return db;
}

export function transaction(db, operation) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function seedCatalog(db) {
  if (db.prepare('SELECT COUNT(*) AS n FROM courses').get().n) return;
  transaction(db, () => {
    const courses = [
      [
        'CS 201',
        'Data Structures',
        'Computer Science',
        3,
        'Lists, trees, graphs, and the algorithms that bring them to life.',
        'green',
      ],
      [
        'CS 240',
        'Database Systems',
        'Computer Science',
        3,
        'Relational design, SQL, transactions, and reliable data storage.',
        'blue',
      ],
      [
        'MATH 210',
        'Linear Algebra',
        'Mathematics',
        3,
        'Vectors, matrices, and linear transformations with practical applications.',
        'purple',
      ],
      [
        'CS 310',
        'Software Engineering',
        'Computer Science',
        3,
        'Design, build, and test software as part of a collaborative team.',
        'amber',
      ],
      [
        'ENG 102',
        'Academic Writing',
        'Humanities',
        3,
        'Develop a clear voice through research, argument, and revision.',
        'rose',
      ],
      [
        'STAT 201',
        'Probability & Statistics',
        'Mathematics',
        3,
        'Probability models, statistical inference, and working with data.',
        'teal',
      ],
      [
        'CS 330',
        'Computer Networks',
        'Computer Science',
        3,
        'Protocols, distributed communication, and the architecture of the internet.',
        'blue',
      ],
      [
        'HUM 110',
        'Design & Society',
        'Humanities',
        2,
        'Explore how everyday design shapes communities and culture.',
        'rose',
      ],
    ];
    const addCourse = db.prepare('INSERT INTO courses VALUES (?, ?, ?, ?, ?, ?)');
    courses.forEach((row) => addCourse.run(...row));
    const sections = [
      [1, 'CS 201', 'A', 'Dr. Sara Ahmed', 'Block A · 204', 30, [0, 2], 540, 615],
      [2, 'CS 201', 'B', 'Dr. Omar Khan', 'Block A · 208', 25, [1, 3], 660, 735],
      [3, 'CS 240', 'A', 'Dr. Ali Hassan', 'Computing Lab 2', 1, [1, 3], 540, 615],
      [4, 'CS 240', 'B', 'Dr. Ali Hassan', 'Computing Lab 2', 25, [0, 2], 780, 855],
      [5, 'MATH 210', 'A', 'Dr. Ayesha Malik', 'Block B · 103', 35, [0, 2], 660, 735],
      [6, 'MATH 210', 'B', 'Dr. Ayesha Malik', 'Block B · 105', 30, [1, 3], 780, 855],
      [7, 'CS 310', 'A', 'Prof. Hamza Raza', 'Block A · 301', 30, [1, 3], 660, 735],
      [8, 'ENG 102', 'A', 'Ms. Maryam Shah', 'Block C · 112', 25, [4], 540, 690],
      [9, 'STAT 201', 'A', 'Dr. Bilal Ahmed', 'Block B · 201', 30, [0, 2], 540, 615],
      [10, 'CS 330', 'A', 'Dr. Zain Abbas', 'Computing Lab 1', 25, [1, 3], 870, 945],
      [11, 'HUM 110', 'A', 'Ms. Noor Hassan', 'Design Studio', 20, [4], 780, 900],
    ];
    for (const [id, course, label, instructor, room, capacity, days, start, end] of sections) {
      db.prepare('INSERT INTO sections VALUES (?, ?, ?, ?, ?, ?)').run(
        id,
        course,
        label,
        instructor,
        room,
        capacity,
      );
      for (const day of days)
        db.prepare('INSERT INTO meetings(section_id, day, start, end) VALUES (?, ?, ?, ?)').run(
          id,
          day,
          start,
          end,
        );
    }
  });
}
