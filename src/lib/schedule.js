export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export const time = (minutes) =>
  `${Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`;

export const meetingText = (section) =>
  `${section.meetings.map((m) => DAYS[m.day]).join(' / ')} · ${time(section.meetings[0].start)}–${time(section.meetings[0].end)}`;

export const clash = (a, b) =>
  a.meetings.some((x) =>
    b.meetings.some((y) => x.day === y.day && x.start < y.end && y.start < x.end),
  );
