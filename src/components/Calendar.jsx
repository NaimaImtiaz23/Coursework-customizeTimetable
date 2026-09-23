import React from 'react';
import { DAYS, time } from '../lib/schedule.js';

export function Calendar({ sections, compact = false, day = null }) {
  const start = 8 * 60,
    end = 17 * 60;
  const days = day === null ? [0, 1, 2, 3, 4] : [day];
  return (
    <div
      className={`calendar ${compact ? 'compact' : ''}`}
      role="region"
      aria-label="Weekly class timetable"
    >
      <div className="calendar-head" style={{ '--days': days.length }}>
        <span />
        {days.map((d) => (
          <span key={d}>
            {DAYS[d]}
            <small>{7 + d}</small>
          </span>
        ))}
      </div>
      <div className="calendar-body" style={{ '--days': days.length }}>
        <div className="time-axis">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} style={{ top: `${(i / 9) * 100}%` }}>{`${i + 8}:00`}</span>
          ))}
        </div>
        {days.map((d) => (
          <div className="calendar-day" key={d}>
            {Array.from({ length: 9 }, (_, i) => (
              <div className="hour-rule" key={i} />
            ))}
            {sections.flatMap((s) =>
              s.meetings
                .filter((m) => m.day === d)
                .map((m) => (
                  <div
                    key={`${s.id}-${d}`}
                    className={`calendar-event ${s.color}`}
                    style={{
                      top: `${((m.start - start) / (end - start)) * 100}%`,
                      height: `${((m.end - m.start) / (end - start)) * 100}%`,
                    }}
                    title={`${s.course_id}: ${s.title}, ${time(m.start)}–${time(m.end)}, ${s.room}`}
                  >
                    <strong>{s.course_id}</strong>
                    {!compact && <span>{s.title}</span>}
                    <small>{compact ? time(m.start) : `${time(m.start)}–${time(m.end)}`}</small>
                    {!compact && <small>{s.room}</small>}
                  </div>
                )),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
