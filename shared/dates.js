// Date helpers shared by the browser (loaded via <script>) and the server
// (require'd), so "which day does this trade belong to?" has ONE answer everywhere.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TrenchDates = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const formatters = new Map();

  function formatterFor(timeZone) {
    const key = timeZone || '';
    if (!formatters.has(key)) {
      formatters.set(
        key,
        new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
      );
    }
    return formatters.get(key);
  }

  // Timestamps in this app come in two shapes: SQLite's default
  // 'YYYY-MM-DD HH:MM:SS' (UTC, but with no zone marker) and full ISO strings
  // from Date#toISOString() (UTC, with a 'Z'). new Date('2026-09-19 23:30:00')
  // would wrongly read the first as LOCAL time, so it is normalised first.
  function toDate(timestamp) {
    if (timestamp instanceof Date) return timestamp;
    const s = String(timestamp).trim();
    const iso = /(Z|[+-]\d{2}:?\d{2})$/i.test(s) ? s : `${s.replace(' ', 'T')}Z`;
    return new Date(iso);
  }

  // The calendar day (YYYY-MM-DD) a stored timestamp falls on for the person
  // using the app. timeZone is an IANA name like 'Europe/Dublin'; omit it to
  // use the runtime's own timezone (what the browser wants).
  function dayOf(timestamp, timeZone) {
    const s = String(timestamp).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    const date = toDate(timestamp);
    if (Number.isNaN(date.getTime())) return s.slice(0, 10);

    const parts = {};
    for (const p of formatterFor(timeZone).formatToParts(date)) parts[p.type] = p.value;
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function todayIn(timeZone) {
    return dayOf(new Date(), timeZone);
  }

  // 'YYYY-MM-DD HH:mm' for showing a stored timestamp to a person, in their
  // timezone (the raw string is UTC, which reads as the wrong hour locally).
  function formatDateTime(timestamp, timeZone) {
    const date = toDate(timestamp);
    if (Number.isNaN(date.getTime())) return String(timestamp).slice(0, 16).replace('T', ' ');

    const key = `dt:${timeZone || ''}`;
    if (!formatters.has(key)) {
      formatters.set(
        key,
        new Intl.DateTimeFormat('en-US', {
          timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
        })
      );
    }
    const parts = {};
    for (const p of formatters.get(key).formatToParts(date)) parts[p.type] = p.value;
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
  }

  // Pure calendar arithmetic on a YYYY-MM-DD string (done in UTC so daylight
  // saving changes can never skip or repeat a day).
  function shiftDay(day, deltaDays) {
    const [y, m, d] = day.split('-').map(Number);
    const shifted = new Date(Date.UTC(y, m - 1, d + deltaDays));
    return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
  }

  function isValidTimeZone(timeZone) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone });
      return true;
    } catch {
      return false;
    }
  }

  // A client-supplied timezone name if it is a real IANA zone, otherwise
  // undefined (which means "the runtime's own timezone").
  function resolveTimeZone(value) {
    return typeof value === 'string' && value && isValidTimeZone(value) ? value : undefined;
  }

  return { dayOf, todayIn, formatDateTime, shiftDay, isValidTimeZone, resolveTimeZone };
});
