/**
 * Seed / tank metric helpers shared across the app (PRD §7.1 / §8).
 *
 * "count" everywhere in SSH = no. of seed pieces per kg, derived from a tank's
 * latest trail-netting sampling. This is the single source of truth used by the
 * Section "Overall Count" card, Reports, and Harvest — so the derivation lives
 * here once and is applied app-wide.
 */

/**
 * Pieces-per-kg from a single trail-netting record.
 * `samples` is an array of `{ no_of_kgs, count }`; we sum both across all
 * sample rows and divide, which is the true per-kg figure (not a raw count).
 *
 * Returns null when the record has no usable sampling rows.
 */
export function piecesPerKgFromRecord(record) {
  if (!record || !Array.isArray(record.samples) || record.samples.length === 0) return null;
  const kgs = record.samples.reduce((s, r) => s + (Number(r?.no_of_kgs) || 0), 0);
  const count = record.samples.reduce((s, r) => s + (Number(r?.count) || 0), 0);
  if (!kgs) return null;
  return Math.round(count / kgs);
}

/**
 * Total feed (kgs) consumed by a tank, taken from its canonical trail-netting
 * report. Falls back to the between-netting consumption when the running total
 * isn't populated yet.
 */
export function feedConsumptionFromReport(report) {
  if (!report) return null;
  const total = Number(report.feed_consp_total);
  if (total) return total;
  const between = Number(report.feed_consp_between);
  return between || null;
}

/**
 * Pick the latest record from a list ordered ascending by date.
 * Trail-netting records are stored oldest-first; the newest is the source of
 * the "current count" shown app-wide.
 */
export function latestNettingRecord(records = []) {
  if (!Array.isArray(records) || records.length === 0) return null;
  return [...records].sort((a, b) => new Date(a.date) - new Date(b.date))[records.length - 1];
}
