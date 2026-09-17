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

    if (!summaryMap.has(key)) {
      summaryMap.set(key, {
        tankName: rawName,
        targetTankId: t.targetTankId || t.tankId || t.id,
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
      let rawTarget = String(tf.transferredToTank || '').trim();
      if (!rawTarget) return;
      const match = rawTarget.match(/\(([^)]+)\)/);
      const targetName = match ? match[1].trim() : rawTarget;
      if (!targetName) return;
      const key = targetName.toUpperCase();
      const amt = Number(tf.transferredAmount) || 0;

      if (!summaryMap.has(key)) {
        summaryMap.set(key, {
          tankName: targetName,
          targetTankId: tf.targetTankId,
          totalCount: amt,
          drumCount: 0,
          statuses: ['completed'],
          drumKeys: [],
        });
      } else {
        const summary = summaryMap.get(key);
        if (!summary.targetTankId && tf.targetTankId) {
          summary.targetTankId = tf.targetTankId;
        }
      }
    });
  }

  return Array.from(summaryMap.values()).map((s) => {
    let overallStatus = 'completed';

    if (s.statuses.includes('unassigned')) {
      overallStatus = 'unassigned';
    } else if (s.statuses.includes('pending')) {
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
      targetTankId: s.targetTankId,
      totalCount: s.totalCount,
      currentCount: s.totalCount, // for compatibility where currentCount is expected
      status: overallStatus,
      drumKeys: s.drumKeys,
      drumCount: s.drumCount,
    };
  });
}

/**
 * Extract vehicle IDs assigned to Seed Van Plan and Packing from activeOrder and local state.
 *
 * @param {Object} activeOrder
 * @param {Object} [step1Data]
 * @param {Object} [step2Data]
 * @param {Set} [savedVehiclesSet]
 * @param {Array} [vehicles]
 * @returns {{ vanPlanVehicleIds: Set<string>, packingVehicleIds: Set<string> }}
 */
export function getAssignedVehicleIds(activeOrder, step1Data = null, step2Data = null, savedVehiclesSet = null, vehicles = []) {
  const vanPlanVehicleIds = new Set();
  const packingVehicleIds = new Set();

  const nonVehicleKeys = new Set([
    'supervisorName', 'supervisorPhone', 'supervisorNumber', 'supervisorSignature',
    'seedVanCompleted', 'tankStates', 'transfers', 'returnBills'
  ]);

  // 1. Discover Seed Van Plan assigned vehicles from step1Data / activeOrder.van_plan
  const vanPlanObj = step1Data || activeOrder?.van_plan;
  if (vanPlanObj && typeof vanPlanObj === 'object') {
    Object.keys(vanPlanObj).forEach(key => {
      if (!nonVehicleKeys.has(key) && vanPlanObj[key]) {
        vanPlanVehicleIds.add(String(key));
      }
    });
  }

  // Also check step2Data / activeOrder.stocking_status_data
  const statusObj = step2Data || activeOrder?.stocking_status_data;
  if (statusObj && typeof statusObj === 'object') {
    Object.keys(statusObj).forEach(key => {
      if (!nonVehicleKeys.has(key) && statusObj[key]) {
        const val = statusObj[key];
        if (typeof val === 'object' && (val.tankStates || val.drums || val.rows)) {
          vanPlanVehicleIds.add(String(key));
        }
      }
    });
  }

  // 2. Discover Packing assigned vehicles
  if (savedVehiclesSet && savedVehiclesSet instanceof Set) {
    savedVehiclesSet.forEach(id => packingVehicleIds.add(String(id)));
  }

  if (Array.isArray(activeOrder?.packing_data?.savedVehicleIds)) {
    activeOrder.packing_data.savedVehicleIds.forEach(id => packingVehicleIds.add(String(id)));
  }

  if (Array.isArray(activeOrder?.packing_data?.tanks) && activeOrder.packing_data.tanks.length > 0 && Array.isArray(vehicles) && vehicles.length > 0) {
    const configuredTankIds = new Set();
    const configuredTankNames = new Set();
    activeOrder.packing_data.tanks.forEach(pt => {
      if (pt && (Number(pt.quantity) > 0 || Number(pt.numberOfPackets) > 0)) {
        if (pt.id) configuredTankIds.add(String(pt.id));
        if (pt.name) configuredTankNames.add(String(pt.name).trim().toUpperCase());
      }
    });

    vehicles.forEach(v => {
      const tids = (v.tank_ids || v.selectedTanks || []).map(String);
      const hasConfiguredTank = tids.some(tid => configuredTankIds.has(tid));
      if (hasConfiguredTank) {
        packingVehicleIds.add(String(v.id));
      }
    });
  }

  return {
    vanPlanVehicleIds,
    packingVehicleIds
  };
}