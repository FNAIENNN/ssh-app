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

export function getTankIdentityKeys(tankOrId) {
  if (tankOrId === null || tankOrId === undefined) return [];

  if (typeof tankOrId !== 'object') {
    const value = String(tankOrId).trim();
    return value ? [value] : [];
  }

  const keys = [tankOrId.id, tankOrId.tank_id, tankOrId.tankId, tankOrId.name]
    .filter(value => value !== null && value !== undefined && String(value).trim() !== '')
    .map(value => String(value).trim());

  return [...new Set(keys)];
}

export function vehicleHasTank(vehicle, tank) {
  const tankKeys = new Set(getTankIdentityKeys(tank).map(key => key.toUpperCase()));
  return (vehicle?.tank_ids || vehicle?.selectedTanks || vehicle?.selected_tanks || []).some(ref =>
    getTankIdentityKeys(ref).some(key => tankKeys.has(key.toUpperCase()))
  );
}

export function getPackingSourceTanks(activeOrder, fallbackTanks = []) {
  const tanksByKey = new Map();

  const addTank = (tank, overwrite = false) => {
    if (!tank) return;
    const keys = getTankIdentityKeys(tank).map(key => key.toUpperCase());
    const existingKey = keys.find(key => tanksByKey.has(key));

    if (existingKey) {
      if (overwrite) {
        const existing = tanksByKey.get(existingKey);
        const merged = { ...existing, ...tank };
        tanksByKey.forEach((value, key) => {
          if (value === existing) tanksByKey.set(key, merged);
        });
        keys.forEach(key => tanksByKey.set(key, merged));
      }
      return;
    }

    keys.forEach(key => tanksByKey.set(key, tank));
  };

  (activeOrder?.selected_tanks || []).forEach(tank => addTank(tank));
  (fallbackTanks || []).forEach(tank => addTank(tank));
  (activeOrder?.packing_data?.tanks || []).forEach(tank => addTank(tank, true));

  return [...new Set(tanksByKey.values())];
}

function eventTime(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

/**
 * A tank is active for Additional Stocking only while its latest physical
 * stocking is newer than its latest completed Trail Netting report.
 */
export function isTankInActiveSeedCycle(tank, seedEntries = [], trailReports = []) {
  if (!tank?.start_date || Number(tank.quantity) <= 0) return false;

  const tankId = String(tank.id || '');
  const tankName = String(tank.name || '').trim().toLowerCase();
  const belongsToTank = (row) => (
    (row?.tank_id != null && String(row.tank_id) === tankId) ||
    (row?.tank_name && String(row.tank_name).trim().toLowerCase() === tankName)
  );

  const latestStocking = seedEntries
    .filter((entry) => belongsToTank(entry) && (!entry.source || entry.source === 'stocked'))
    .reduce((latest, entry) => Math.max(latest, eventTime(entry.created_at || entry.date)), eventTime(tank.start_date));

  const latestCompletedReport = trailReports
    .filter((report) => belongsToTank(report) && report.process_details?.status !== 'draft')
    .reduce((latest, report) => Math.max(
      latest,
      eventTime(report.updated_at || report.created_at || report.latest_date || report.process_details?.date),
    ), 0);

  return latestCompletedReport === 0 || latestStocking > latestCompletedReport;
}

export function buildTankStockingSnapshot({ matchedTank, newQuantity, hatchery, stockingDate }) {
  const incomingQuantity = Number(newQuantity) || 0;
  if (!matchedTank?.is_active_seed_cycle) {
    return {
      quantity: incomingQuantity,
      seed_type: 'Vannamei',
      hatchery: hatchery || null,
      start_date: stockingDate,
    };
  }

  const hatcheries = String(matchedTank.hatchery || '').split(' + ').map((name) => name.trim()).filter(Boolean);
  const incomingHatchery = String(hatchery || '').trim();
  if (incomingHatchery && !hatcheries.includes(incomingHatchery)) hatcheries.push(incomingHatchery);

  return {
    quantity: (Number(matchedTank.quantity) || 0) + incomingQuantity,
    seed_type: 'Vannamei',
    hatchery: hatcheries.join(' + ') || null,
    start_date: matchedTank.start_date || stockingDate,
  };
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
      const hasConfiguredTank = activeOrder.packing_data.tanks.some(pt =>
        (configuredTankIds.has(String(pt.id)) || configuredTankNames.has(String(pt.name || '').trim().toUpperCase())) &&
        vehicleHasTank(v, pt)
      );
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