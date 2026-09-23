import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/manrope/latin-800.css';

import './styles.css';
import { api, setCsrfToken } from './lib/api.js';
import { meetingText, clash } from './lib/schedule.js';
import { Modal } from './components/Modal.jsx';
import { Calendar } from './components/Calendar.jsx';

function App() {
  const [sections, setSections] = useState([]);
  const [session, setSession] = useState({ user: null, registrations: [], notifications: [] });
  const [loading, setLoading] = useState(true);
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [view, setView] = useState('courses');
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('All departments');
  const [available, setAvailable] = useState(false);
  const [modal, setModal] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState('CS 201');
  const [mobileNav, setMobileNav] = useState(false);
  const [authMode, setAuthMode] = useState('signup');
  const [selected, setSelected] = useState([]);
  const [includeFull, setIncludeFull] = useState(false);
  const [plan, setPlan] = useState(null);
  const [scheduleMode, setScheduleMode] = useState('week');
  const [day, setDay] = useState(0);

  async function refresh() {
    const [catalog, me] = await Promise.all([api('/catalog'), api('/me')]);
    setCsrfToken(me.csrf || '');
    setSections(catalog.sections);
    setDemoEnabled(catalog.demoEnabled);
    setSession({ registrations: [], notifications: [], ...me });
  }
  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!session.user) return;
    const timer = setInterval(() => refresh().catch(() => {}), 10000);
    return () => clearInterval(timer);
  }, [session.user?.id]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const registrations = session.registrations
    .map((r) => ({ ...sections.find((s) => s.id === r.section_id), ...r }))
    .filter((r) => r.course_id);
  const enrolled = registrations.filter((r) => r.status === 'enrolled');
  const waitlisted = registrations.filter((r) => r.status === 'waitlisted');
  const credits = enrolled.reduce((n, r) => n + r.credits, 0);
  const courses = [...new Set(sections.map((s) => s.course_id))].map((id) => ({
    ...sections.find((s) => s.course_id === id),
    sections: sections.filter((s) => s.course_id === id),
  }));
  const visible = courses.filter(
    (c) =>
      `${c.course_id} ${c.title} ${c.instructor}`.toLowerCase().includes(query.toLowerCase()) &&
      (department === 'All departments' || c.department === department) &&
      (!available || c.sections.some((s) => s.enrolled < s.capacity && !s.waiting)),
  );
  const unread = session.notifications.filter((n) => !n.read).length;

  function open(name) {
    setError('');
    setModal(name);
  }
  async function action(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function requireAuth(fn) {
    if (!session.user) {
      open('auth');
      return;
    }
    fn();
  }
  async function add(section) {
    requireAuth(() =>
      action(async () => {
        const result = await api('/registrations', {
          method: 'POST',
          body: { sectionId: section.id },
        });
        await refresh();
        setToast(
          result.status === 'waitlisted'
            ? `Added to the ${section.course_id} waitlist.`
            : `${section.course_id} added to your timetable.`,
        );
      }),
    );
  }
  async function authenticate(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    await action(async () => {
      await api(`/auth/${authMode}`, { method: 'POST', body: data });
      await refresh();
      setModal(null);
      setToast('You are signed in. Your timetable is saved.');
    });
  }
  function exportCalendar() {
    const stamp = (mins) =>
      `${Math.floor(mins / 60)
        .toString()
        .padStart(2, '0')}${(mins % 60).toString().padStart(2, '0')}00`;
    const escape = (s) =>
      s
        .replaceAll('\\', '\\\\')
        .replaceAll('\n', '\\n')
        .replaceAll(',', '\\,')
        .replaceAll(';', '\\;');
    const events = enrolled.flatMap((s) =>
      s.meetings.map((m) =>
        [
          'BEGIN:VEVENT',
          `UID:coursework-${s.id}-${m.day}@coursework.local`,
          `DTSTAMP:${new Date()
            .toISOString()
            .replace(/[-:]/g, '')
            .replace(/\.\d{3}/, '')}`,
          `DTSTART:202609${String(7 + m.day).padStart(2, '0')}T${stamp(m.start)}`,
          `DTEND:202609${String(7 + m.day).padStart(2, '0')}T${stamp(m.end)}`,
          'RRULE:FREQ=WEEKLY;UNTIL=20261218T235959',
          `SUMMARY:${escape(`${s.course_id} ${s.title}`)}`,
          `LOCATION:${escape(s.room)}`,
          'END:VEVENT',
        ].join('\r\n'),
      ),
    );
    const url = URL.createObjectURL(
      new Blob(
        [
          [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Coursework//Timetable//EN',
            ...events,
            'END:VCALENDAR',
          ].join('\r\n'),
        ],
        { type: 'text/calendar' },
      ),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'coursework-fall-2026.ics';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'is-open' : ''}`}>
        <a className="app-name" href="/" aria-label="Coursework home">
          Coursework
        </a>
        <div className="workspace-label">STUDENT WORKSPACE</div>
        <nav aria-label="Main navigation">
          {[
            ['courses', 'Course registration'],
            ['timetable', 'My timetable'],
            ['waitlist', 'My waitlists'],
          ].map(([id, label]) => (
            <button
              key={id}
              className={`nav-item ${view === id ? 'active' : ''}`}
              onClick={() => {
                setView(id);
                setMobileNav(false);
                setError('');
              }}
            >
              <span>{label}</span>
              {id === 'waitlist' && waitlisted.length > 0 && (
                <span className="nav-count">{waitlisted.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="semester-note">
          Registration open<strong>Fall semester 2026</strong>
          <span>September 7 – December 18</span>
        </div>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => open('help')}>
            Registration details
          </button>
          <div className="profile">
            <div>
              <strong>{session.user?.name || 'Student account'}</strong>
              <span>{session.user ? 'Undergraduate student' : 'Sign in to register'}</span>
            </div>
            <button
              className="utility-button"
              aria-label={session.user ? 'Sign out' : 'Sign in'}
              onClick={() =>
                session.user
                  ? action(async () => {
                      await api('/auth/logout', { method: 'POST' });
                      await refresh();
                      setToast('Signed out.');
                    })
                  : open('auth')
              }
            >
              {session.user ? 'Sign out' : 'Sign in'}
            </button>
          </div>
        </div>
      </aside>
      {mobileNav && <div className="nav-scrim" onClick={() => setMobileNav(false)} />}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="utility-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileNav(true)}
            >
              Menu
            </button>
            <span>Academics</span>

            <strong>
              {view === 'courses'
                ? 'Course registration'
                : view === 'timetable'
                  ? 'My timetable'
                  : 'My waitlists'}
            </strong>
          </div>
          <div className="topbar-actions">
            <span className="term-label">Fall 2026</span>
            <span className="divider" />
            <button
              className="utility-button notification-button"
              aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
              onClick={() => requireAuth(() => open('notifications'))}
            >
              Notifications {unread > 0 && `(${unread})`}
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR SEMESTER, SORTED</div>
              <h1>
                {view === 'courses'
                  ? 'A good semester starts here.'
                  : view === 'timetable'
                    ? 'Your week, at a glance.'
                    : 'A little closer to your seat.'}
              </h1>
              <p>
                {view === 'courses'
                  ? 'Find your courses. Make room for what matters.'
                  : view === 'timetable'
                    ? 'Your registered classes, all in one place.'
                    : 'Track your place in line for the courses you want.'}
              </p>
            </div>
            <button
              className="button primary"
              onClick={() =>
                requireAuth(() => {
                  setPlan(null);
                  setSelected([]);
                  open('planner');
                })
              }
            >
              Build my timetable
            </button>
          </div>
          <div className="summary-strip">
            <div>
              <div>
                <span>Enrolled courses</span>
                <strong>
                  {enrolled.length}
                  <small> this semester</small>
                </strong>
              </div>
            </div>
            <div>
              <div>
                <span>Registered credits</span>
                <strong>
                  {credits}
                  <small> / 18 credits</small>
                </strong>
              </div>
            </div>
            <div>
              <div>
                <span>On the waitlist</span>
                <strong>
                  {waitlisted.length}
                  <small> {waitlisted.length === 1 ? 'section' : 'sections'}</small>
                </strong>
              </div>
            </div>
            <div>
              <div>
                <span>Schedule status</span>
                <strong className="status-value">Clash-free</strong>
              </div>
            </div>
          </div>
          {!session.user && !loading && (
            <div className="welcome-bar">
              <div>
                <strong>Your next semester is taking shape.</strong>
                <span> Sign in to save your courses and reserve your seats.</span>
              </div>
              <div>
                {demoEnabled && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      action(async () => {
                        await api('/auth/demo', { method: 'POST' });
                        await refresh();
                        setToast('Your personal demo workspace is ready.');
                      })
                    }
                  >
                    Try demo
                  </button>
                )}
                <button className="button small" onClick={() => open('auth')}>
                  Get started
                </button>
              </div>
            </div>
          )}
          {error && !modal && (
            <div className="error-banner" role="alert">
              {error}
              <button
                className="utility-button"
                aria-label="Dismiss error"
                onClick={() => setError('')}
              >
                Dismiss
              </button>
            </div>
          )}
          {loading ? (
            <div className="loading-state">Loading your workspace…</div>
          ) : view === 'courses' ? (
            <div className="registration-layout">
              <section className="catalog-panel">
                <div className="section-title">
                  <h2>
                    Explore courses <span>{courses.length}</span>
                  </h2>
                  <span className="muted">Fall 2026</span>
                </div>
                <div className="filters">
                  <label className="search-box">
                    <input
                      aria-label="Search courses"
                      placeholder="Search by course name or code"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    {query && (
                      <button
                        className="utility-button"
                        aria-label="Clear search"
                        onClick={() => setQuery('')}
                      >
                        Clear
                      </button>
                    )}
                  </label>
                  <div className="filter-row">
                    <label className="select-wrap">
                      <select
                        aria-label="Department"
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                      >
                        {['All departments', 'Computer Science', 'Mathematics', 'Humanities'].map(
                          (d) => (
                            <option key={d}>{d}</option>
                          ),
                        )}
                      </select>
                    </label>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={available}
                        onChange={(e) => setAvailable(e.target.checked)}
                      />
                      Open seats only
                    </label>
                  </div>
                </div>
                <div className="course-list">
                  {visible.length === 0 && (
                    <div className="empty-state">
                      <h3>No courses found</h3>
                      <p>Try a different search or department.</p>
                      <button
                        className="text-button"
                        onClick={() => {
                          setQuery('');
                          setDepartment('All departments');
                          setAvailable(false);
                        }}
                      >
                        Clear filters
                      </button>
                    </div>
                  )}
                  {visible.map((course) => {
                    const isExpanded = expanded === course.course_id;
                    const registered = registrations.find((r) => r.course_id === course.course_id);
                    const openSeats = course.sections.reduce(
                      (n, s) => n + s.capacity - s.enrolled,
                      0,
                    );
                    return (
                      <article
                        className={`course-card ${isExpanded ? 'expanded' : ''}`}
                        key={course.course_id}
                      >
                        <button
                          className="course-toggle"
                          aria-expanded={isExpanded}
                          onClick={() => setExpanded(isExpanded ? null : course.course_id)}
                        >
                          <div className="course-overview">
                            <div className="course-code">
                              {course.course_id}
                              <span>·</span>
                              {course.credits} credits
                            </div>
                            <h3>{course.title}</h3>
                            <div className="course-meta">
                              {course.department}
                              <span>·</span>
                              {course.sections.length}{' '}
                              {course.sections.length === 1 ? 'section' : 'sections'}
                            </div>
                          </div>
                          <div className="course-right">
                            {registered ? (
                              <span
                                className={`badge ${registered.status === 'enrolled' ? 'green' : 'amber'}`}
                              >
                                {' '}
                                {registered.status === 'enrolled' ? 'Enrolled' : 'Waitlisted'}
                              </span>
                            ) : (
                              <span className={`seat-summary ${openSeats ? '' : 'full'}`}>
                                {openSeats ? 'Seats available' : 'Waitlist available'}
                              </span>
                            )}
                            <span className="section-toggle-label">
                              {isExpanded ? 'Hide sections' : 'Show sections'}
                            </span>
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="course-details">
                            <p>{course.description}</p>
                            {course.sections.map((section) => {
                              const r = registrations.find((r) => r.section_id === section.id);
                              const conflicting = enrolled.find(
                                (s) => s.course_id !== section.course_id && clash(s, section),
                              );
                              const full =
                                section.enrolled >= section.capacity || section.waiting > 0;
                              return (
                                <div className="section-option" key={section.id}>
                                  <div className="section-option-top">
                                    <strong>Section {section.label}</strong>
                                    <span>{section.instructor}</span>
                                    <span className={`seat-count ${full ? 'amber-text' : ''}`}>
                                      {section.capacity - section.enrolled} / {section.capacity}{' '}
                                      seats
                                    </span>
                                  </div>
                                  <div className="section-option-bottom">
                                    <div>
                                      <span>{meetingText(section)}</span>
                                      <span>{section.room}</span>
                                    </div>
                                    {r ? (
                                      <button
                                        className="button registered small"
                                        onClick={() => open({ type: 'drop', section: r })}
                                      >
                                        {' '}
                                        {r.status === 'enrolled'
                                          ? 'Enrolled'
                                          : `Waitlist #${r.position}`}
                                      </button>
                                    ) : (
                                      <button
                                        disabled={busy || !!registered || !!conflicting}
                                        className={`button small ${full ? '' : 'add-button'}`}
                                        onClick={() => add(section)}
                                      >
                                        {' '}
                                        {full ? 'Join waitlist' : 'Add course'}
                                      </button>
                                    )}
                                  </div>
                                  {conflicting && (
                                    <div className="conflict">
                                      Clashes with {conflicting.course_id}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
                <div className="catalog-footer">
                  {visible.length} of {courses.length} courses
                  <span>All times in campus local time</span>
                </div>
              </section>
              <aside className="schedule-panel">
                <div className="section-title">
                  <h2>Your timetable</h2>
                  <span className="badge green">No clashes</span>
                </div>
                <div className="schedule-subtitle">
                  <span>Weekly overview</span>
                  <button
                    className="utility-button"
                    aria-label="Open full timetable"
                    title="Open full timetable"
                    onClick={() => setView('timetable')}
                  >
                    Full timetable
                  </button>
                </div>
                <Calendar sections={enrolled} compact />
                <div className="schedule-legend">
                  {enrolled.length ? (
                    enrolled.map((s) => (
                      <span key={s.id}>
                        <i className={s.color} />
                        {s.course_id}
                      </span>
                    ))
                  ) : (
                    <span>Your registered courses will appear here.</span>
                  )}
                </div>
                <div className="my-courses-heading">
                  <h3>My courses</h3>
                  <span>{enrolled.length} enrolled</span>
                </div>
                {enrolled.length === 0 ? (
                  <div className="mini-empty">
                    <p>A fresh start for your semester.</p>
                  </div>
                ) : (
                  enrolled.map((s) => (
                    <div className="enrolled-row" key={s.id}>
                      <span className={`course-line ${s.color}`} />
                      <div>
                        <strong>{s.title}</strong>
                        <span>
                          {s.course_id} · Section {s.label} · {s.credits} credits
                        </span>
                      </div>
                      <button
                        className="utility-button"
                        title="Remove course"
                        aria-label={`Remove ${s.course_id}`}
                        onClick={() => open({ type: 'drop', section: s })}
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
                <button
                  className="button export-button"
                  disabled={!enrolled.length}
                  onClick={exportCalendar}
                >
                  Export timetable
                </button>
                <div className="quiet-note">
                  {session.user
                    ? 'Your changes are saved automatically'
                    : 'Sign in to save your timetable'}
                </div>
              </aside>
            </div>
          ) : view === 'timetable' ? (
            <section>
              <div className="section-title full-calendar-heading">
                <h2>Weekly timetable</h2>
                <div className="inline-actions">
                  <div className="segmented">
                    <button
                      className={scheduleMode === 'week' ? 'selected' : ''}
                      onClick={() => setScheduleMode('week')}
                    >
                      Week
                    </button>
                    <button
                      className={scheduleMode === 'day' ? 'selected' : ''}
                      onClick={() => setScheduleMode('day')}
                    >
                      Day
                    </button>
                  </div>
                  <button
                    className="button small"
                    disabled={!enrolled.length}
                    onClick={exportCalendar}
                  >
                    Export
                  </button>
                </div>
              </div>
              {scheduleMode === 'day' && (
                <div className="day-navigation">
                  <button
                    className="utility-button"
                    aria-label="Previous day"
                    onClick={() => setDay((day + 4) % 5)}
                  >
                    Previous
                  </button>
                  <strong>{['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][day]}</strong>
                  <button
                    className="utility-button"
                    aria-label="Next day"
                    onClick={() => setDay((day + 1) % 5)}
                  >
                    Next
                  </button>
                </div>
              )}
              <Calendar sections={enrolled} day={scheduleMode === 'day' ? day : null} />
              <div className="schedule-legend">
                {enrolled.map((s) => (
                  <span key={s.id}>
                    <i className={s.color} />
                    {s.course_id} · {s.title}
                  </span>
                ))}
              </div>
            </section>
          ) : (
            <section>
              <div className="section-title">
                <h2>
                  My waitlists <span>{waitlisted.length}</span>
                </h2>
                <span className="muted">Updated every 10 seconds</span>
              </div>
              {waitlisted.length === 0 ? (
                <div className="empty-state spacious">
                  <h3>You're all caught up.</h3>
                  <p>You aren't on any waitlists at the moment.</p>
                  <button className="button" onClick={() => setView('courses')}>
                    Explore courses
                  </button>
                </div>
              ) : (
                waitlisted.map((s) => (
                  <article className="waitlist-row" key={s.id}>
                    <div>
                      <span className="course-code">
                        {s.course_id} · Section {s.label}
                      </span>
                      <h3>{s.title}</h3>
                      <p>{meetingText(s)}</p>
                    </div>
                    <span className="badge amber">Position #{s.position}</span>
                    <button
                      className="button small"
                      onClick={() => open({ type: 'drop', section: s })}
                    >
                      Leave waitlist
                    </button>
                  </article>
                ))
              )}
            </section>
          )}
          <footer className="page-footer">
            <span>Less scheduling. More learning.</span>
            <span>Coursework · Fall 2026</span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button
            className="utility-button"
            aria-label="Dismiss notification"
            onClick={() => setToast('')}
          >
            Dismiss
          </button>
        </div>
      )}
      {modal && (
        <Modal
          title={
            modal === 'auth'
              ? authMode === 'signup'
                ? 'Make this semester yours.'
                : 'Welcome back.'
              : modal === 'planner'
                ? 'Build your timetable'
                : modal === 'notifications'
                  ? 'Notifications'
                  : modal === 'help'
                    ? 'Registration details'
                    : 'Remove this course?'
          }
          onClose={() => {
            if (!busy) {
              setModal(null);
              setError('');
            }
          }}
        >
          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
          {modal === 'auth' && (
            <>
              <div className="segmented auth-tabs">
                <button
                  className={authMode === 'signup' ? 'selected' : ''}
                  onClick={() => {
                    setAuthMode('signup');
                    setError('');
                  }}
                >
                  Create account
                </button>
                <button
                  className={authMode === 'login' ? 'selected' : ''}
                  onClick={() => {
                    setAuthMode('login');
                    setError('');
                  }}
                >
                  Sign in
                </button>
              </div>
              <form onSubmit={authenticate}>
                {authMode === 'signup' && (
                  <label className="form-field">
                    Full name
                    <input name="name" autoComplete="name" minLength={2} maxLength={80} required />
                  </label>
                )}
                <label className="form-field">
                  Email address
                  <input name="email" type="email" autoComplete="email" required maxLength={254} />
                </label>
                <label className="form-field">
                  Password
                  <input
                    name="password"
                    type="password"
                    autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                    minLength={12}
                    maxLength={128}
                    required
                  />
                  {authMode === 'signup' && <small>At least 12 characters.</small>}
                </label>
                <button className="button primary wide" disabled={busy}>
                  {authMode === 'signup' ? 'Create account' : 'Sign in'}
                </button>
              </form>
            </>
          )}
          {modal?.type === 'drop' && (
            <>
              <p className="modal-copy">
                {modal.section.course_id} · {modal.section.title}, section {modal.section.label}
              </p>
              <p className="modal-copy">
                {modal.section.status === 'enrolled'
                  ? 'Your seat will be released to the next eligible student on the waitlist. You may not be able to get it back.'
                  : 'You will lose your current position in this waitlist.'}
              </p>
              <div className="modal-actions">
                <button className="button" disabled={busy} onClick={() => setModal(null)}>
                  Keep course
                </button>
                <button
                  className="button danger"
                  disabled={busy}
                  onClick={() =>
                    action(async () => {
                      await api(`/registrations/${modal.section.section_id}`, { method: 'DELETE' });
                      await refresh();
                      setModal(null);
                      setToast('Course removed. Your timetable is up to date.');
                    })
                  }
                >
                  Remove course
                </button>
              </div>
            </>
          )}
          {modal === 'planner' && (
            <>
              {!plan ? (
                <>
                  <p className="modal-copy">
                    Choose your courses for Fall 2026. Current enrollments stay in your schedule.
                  </p>
                  <div className="planner-options">
                    {courses
                      .filter((c) => !registrations.some((r) => r.course_id === c.course_id))
                      .map((c) => (
                        <label key={c.course_id}>
                          <input
                            type="checkbox"
                            checked={selected.includes(c.course_id)}
                            onChange={(e) =>
                              setSelected(
                                e.target.checked
                                  ? [...selected, c.course_id]
                                  : selected.filter((id) => id !== c.course_id),
                              )
                            }
                          />
                          <span>
                            <strong>{c.title}</strong>
                            <small>
                              {c.course_id} · {c.credits} credits
                            </small>
                          </span>
                        </label>
                      ))}
                  </div>
                  <label className="check-label include-full">
                    <input
                      type="checkbox"
                      checked={includeFull}
                      onChange={(e) => setIncludeFull(e.target.checked)}
                    />
                    Include full sections with waitlists
                  </label>
                  <button
                    className="button primary wide"
                    disabled={busy || !selected.length}
                    onClick={() =>
                      action(async () => {
                        const result = await api('/planner', {
                          method: 'POST',
                          body: { courseIds: selected, includeFull },
                        });
                        setPlan(result.sectionIds);
                      })
                    }
                  >
                    Find a clash-free timetable
                  </button>
                </>
              ) : (
                <>
                  <div className="success-note">A clash-free combination is ready.</div>
                  {plan.map((id) => {
                    const s = sections.find((s) => s.id === id);
                    return (
                      <div className="plan-row" key={id}>
                        <strong>
                          {s.course_id} · {s.title}
                        </strong>
                        <span>
                          Section {s.label} · {meetingText(s)}
                        </span>
                        <small>
                          {s.enrolled >= s.capacity || s.waiting
                            ? 'Will join waitlist'
                            : `${s.capacity - s.enrolled} seats available`}
                        </small>
                      </div>
                    );
                  })}
                  <p className="modal-copy">
                    Seats are checked again when you confirm. Full sections will be waitlisted.
                  </p>
                  <div className="modal-actions">
                    <button className="button" disabled={busy} onClick={() => setPlan(null)}>
                      Back
                    </button>
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() =>
                        action(async () => {
                          await api('/planner/confirm', {
                            method: 'POST',
                            body: { sectionIds: plan },
                          });
                          await refresh();
                          setModal(null);
                          setToast(
                            'Your timetable is saved. Check My waitlists for any full sections.',
                          );
                        })
                      }
                    >
                      Confirm registration
                    </button>
                  </div>
                </>
              )}
            </>
          )}
          {modal === 'notifications' && (
            <>
              {session.notifications.length ? (
                <>
                  <div className="notification-list">
                    {session.notifications.map((n) => (
                      <div key={n.id} className={n.read ? '' : 'unread'}>
                        <p>
                          {n.message}
                          <small>{new Date(n.created_at + 'Z').toLocaleString()}</small>
                        </p>
                      </div>
                    ))}
                  </div>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      action(async () => {
                        await api('/notifications/read', { method: 'POST' });
                        await refresh();
                      })
                    }
                  >
                    Mark all as read
                  </button>
                </>
              ) : (
                <div className="empty-state">
                  <h3>Nothing new just yet.</h3>
                  <p>Seat promotions will appear here.</p>
                </div>
              )}
            </>
          )}
          {modal === 'help' && (
            <div className="help-content">
              <p>
                <strong>Fall 2026</strong>
                <br />
                September 7 to December 18. All class times use campus local time.
              </p>
              <p>
                <strong>Course load</strong>
                <br />
                Register for up to 18 credits. Overlapping classes and duplicate course
                registrations are blocked.
              </p>
              <p>
                <strong>Waitlists</strong>
                <br />
                Full sections have a first-in, first-eligible queue. When a seat opens, the next
                student whose schedule and credit limit allow it is enrolled automatically.
                Waitlisted classes do not reserve a time slot.
              </p>
              <p>
                <strong>Sample catalog</strong>
                <br />
                This installation includes a sample catalog for evaluation. An account here does not
                register you at a university.
              </p>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
