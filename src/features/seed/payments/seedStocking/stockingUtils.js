/**
 * stockingUtils.js
 * Helper utilities for Seed Stocking aggregations.
 */

/**
 * Aggregates drum-level tankStates into single tank entries grouped by tank name.
 * 
 * Rules:
 * - Group by normalized tank name (trim & case-insensitive matching).
 * - Sum all valid current quantities for drums belonging to the same tank.
 * - Transferred drums with 0 quantity do not create separate entries.
 * - Overall status per tank is derived based on the status of active/valid drums.
 * 
 * @param {Object|Array} tankStates - Object or array of drum states from Step 2 / DB
 * @param {Array} [transfers=[]] - Optional array of transfer logs to credit target tanks
 * @returns {Array<{ tankName: string, totalCount: number, currentCount: number, status: string, drumKeys: string[], drumCount: number }>}
 */
export function aggregateTankStates(tankStates, transfers = []) {
  if (!tankStates) return [];
  const rawList = Array.isArray(tankStates) ? tankStates : Object.values(tankStates);

  const summaryMap = new Map();

  rawList.forEach((t, idx) => {
    if (!t) return;
    const rawName = String(t.tankName || t.name || `Tank ${idx + 1}`).trim();
    if (!rawName) return;
    const key = rawName.toUpperCase();

    let rawCount = t.currentCount !== undefined ? Number(t.currentCount) : Number(t.count || 0);
    if (isNaN(rawCount)) rawCount = 0;

    let effectiveCount = rawCount;
    if (t.status === 'returned' && t.returnCount !== undefined) {
      effectiveCount = Math.max(0, effectiveCount - (Number(t.returnCount) || 0));
    }

    if (!summaryMap.has(key)) {
      summaryMap.set(key, {
        tankName: rawName,
        totalCount: 0,
        drumCount: 0,
        statuses: [],
        drumKeys: [],
      });
    }

    const summary = summaryMap.get(key);
    summary.totalCount += effectiveCount;
    summary.drumCount += 1;
    summary.statuses.push(t.status || 'pending');
    if (t.drumKey) summary.drumKeys.push(t.drumKey);
  });

  if (transfers && Array.isArray(transfers)) {
    transfers.forEach(tf => {
      const targetName = String(tf.transferredToTank || '').trim();
      if (!targetName) return;
      const key = targetName.toUpperCase();
      const amt = Number(tf.transferredAmount) || 0;
      
      if (!summaryMap.has(key)) {
        summaryMap.set(key, {
          tankName: targetName,
          totalCount: 0,
          drumCount: 0,
          statuses: [],
          drumKeys: [],
        });
      }
      
      const summary = summaryMap.get(key);
      summary.totalCount += amt;
      // We do not increment drumCount because it's a direct tank transfer, not a new drum
    });
  }

  return Array.from(summaryMap.values()).map((s) => {
    let overallStatus = 'completed';

    if (s.statuses.includes('unassigned')) {
      overallStatus = 'unassigned';
    } else if (s.statuses.includes('pending') || s.statuses.includes('Partial Return') || s.statuses.includes('Partial Transfer')) {
      overallStatus = 'pending';
    } else if (s.totalCount === 0 && s.statuses.every((st) => st === 'transferred')) {
      overallStatus = 'transferred';
    } else if (s.totalCount === 0 && s.statuses.every((st) => st === 'returned')) {
      overallStatus = 'returned';
    } else {
      overallStatus = 'completed';
    }

    return {
      tankName: s.tankName,
      totalCount: s.totalCount,
      currentCount: s.totalCount, // for compatibility where currentCount is expected
      status: overallStatus,
      drumKeys: s.drumKeys,
      drumCount: s.drumCount,
    };
  });
}
