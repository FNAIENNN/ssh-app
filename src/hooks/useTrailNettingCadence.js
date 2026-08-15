/**
 * Trail-netting cadence helpers (PRD §8.1).
 *
 * Rules:
 *  - 1st netting window: day 45–60 after stocking.
 *  - Each later netting must happen within 7 days of the previous one.
 *  - "next expected date" = last netting date + 7 days (shown with the date).
 *
 * Pure functions so they're trivially testable and reusable across
 * Trail Netting list, Reports, and notifications.
 */

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function daysBetween(a, b) {
  if (!a || !b) return 0;
  const da = a instanceof Date ? a : new Date(a);
  const db = b instanceof Date ? b : new Date(b);
  return Math.floor((db - da) / MS_PER_DAY);
}

/** Days elapsed since stocking/start date (the "Day X" counter on tank cards). */
export function daysSinceStart(startDate) {
  if (!startDate) return 0;
  return Math.max(0, daysBetween(startDate, new Date()));
}

/**
 * Given an array of netting records (newest first or oldest first — sorted here),
 * compute the cadence status for a tank.
 */
export function computeCadence({ startDate, records = [] }) {
  const sorted = [...records].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );
  const today = new Date();
  const start = startDate ? new Date(startDate) : null;
  const day = start ? daysBetween(start, today) : 0;

  const doneCount = sorted.length;
  const lastRecord = sorted[sorted.length - 1] || null;

  // Determine next expected date.
  let nextExpectedDate = null;
  let windowStart = null;
  let windowEnd = null;

  if (doneCount === 0) {
    if (start) {
      const d45 = new Date(start);
      d45.setDate(d45.getDate() + 45);
      const d60 = new Date(start);
      d60.setDate(d60.getDate() + 60);
      windowStart = d45;
      windowEnd = d60;
      nextExpectedDate = d45;
    }
  } else {
    const last = new Date(lastRecord.date);
    const next = new Date(last);
    next.setDate(next.getDate() + 7);
    windowStart = last;
    windowEnd = next;
    nextExpectedDate = next;
  }

  // Status flags used by the UI + notifications.
  let status = 'waiting'; // not yet day 45
  let canNet = false;
  let daysSinceLastNetting = lastRecord?.date ? daysBetween(lastRecord.date, today) : 0;

  if (doneCount === 0) {
    if (day >= 45 && day <= 60) {
      status = 'due';
      canNet = true;
    } else if (day > 60) {
      status = 'overdue';
      canNet = true;
    } else if (day >= 38) {
      status = 'approaching';
      canNet = false;
    } else {
      status = 'waiting';
      canNet = false;
    }
  } else {
    // Subsequent nettings only allowed every 7 days from previous trail netting date
    if (daysSinceLastNetting >= 7) {
      canNet = true;
      status = daysSinceLastNetting > 10 ? 'overdue' : 'due';
    } else {
      canNet = false;
      status = 'waiting_interval';
    }
  }

  return {
    day,
    doneCount,
    lastRecordDate: lastRecord?.date ?? null,
    nextExpectedDate,
    windowStart,
    windowEnd,
    status, // waiting | approaching | due | overdue | waiting_interval
    canNet,
    daysSinceLastNetting,
    daysUntilNext: Math.max(0, 7 - daysSinceLastNetting),
  };
}

/** Format helper for display. */
export function formatDate(d, opts = {}) {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...opts,
  });
}
