import { useMemo } from 'react';
import { aggregateTankStates } from './stockingUtils';

export function useMixedAllocationState(activeOrder, vehicles) {
  return useMemo(() => {
    const isMixed = activeOrder?.type === 'mixed' || activeOrder?.current_stage === 'mixed-allocation' || Boolean(activeOrder?.packing_data && activeOrder?.stocking_status_data);

    // Explicit completion flags
    const isPackingDone = !!activeOrder?.packing_data?.packingCompleted;
    const isVanPlanDone = !!activeOrder?.stocking_status_data?.seedVanCompleted;

    // Helper to calculate total seed van consumed per tank PER vehicle (by ID & normalized name)
    const seedVanConsumedByTankPerVehicle = {}; // { [vehicleId]: { [tankId/normName]: qty } }

    if (activeOrder?.van_plan) {
      Object.entries(activeOrder.van_plan).forEach(([vid, vData]) => {
        if (!seedVanConsumedByTankPerVehicle[vid]) {
          seedVanConsumedByTankPerVehicle[vid] = {};
        }
        vData?.drums?.forEach(d => {
          if (!d.tankName) return;
          const count = Number(d.count) || 0;
          const normName = String(d.tankName).trim().toUpperCase();
          const tank = activeOrder.selected_tanks?.find(t => String(t.name).trim().toUpperCase() === normName);
          if (tank) {
            seedVanConsumedByTankPerVehicle[vid][tank.id] = (seedVanConsumedByTankPerVehicle[vid][tank.id] || 0) + count;
          }
          seedVanConsumedByTankPerVehicle[vid][normName] = (seedVanConsumedByTankPerVehicle[vid][normName] || 0) + count;
        });
      });
    }

    // Helper to calculate total packing consumed per tank (by ID & normalized name)
    const packingConsumedByTank = {};
    if (activeOrder?.packing_data?.tanks) {
      activeOrder.packing_data.tanks.forEach(t => {
        const qty = Number(t.quantity) || 0;
        if (t.id) packingConsumedByTank[t.id] = (packingConsumedByTank[t.id] || 0) + qty;
        if (t.name) {
          const normName = String(t.name).trim().toUpperCase();
          packingConsumedByTank[normName] = (packingConsumedByTank[normName] || 0) + qty;
        }
      });
    }

    const summaryData = [];
    const packingMaxEditable = {};
    const seedVanMaxEditableByVehicle = {}; // { [vehicleId]: { [tankId/normName]: maxQty } }

    let totalOriginal = 0;
    let totalPacking = 0;
    let totalVan = 0;
    let totalRemaining = 0;

    if (vehicles && Array.isArray(vehicles)) {
      vehicles.forEach(v => {
        const vTanksIds = (v.tank_ids || v.selectedTanks || []).map(id => String(id && typeof id === 'object' ? id.id : id));
        const originalVTanks = (activeOrder?.selected_tanks || []).filter(t => vTanksIds.includes(String(t.id)));

        // Discover transfer target tanks from stocking_status_data for this vehicle
        const discoveredTanksMap = new Map();
        originalVTanks.forEach(t => {
          const normKey = String(t.name).trim().toUpperCase();
          discoveredTanksMap.set(normKey, {
            id: t.id,
            name: t.name,
            qty: Number(t.qty || t.quantity) || 0,
            isTransferTarget: false
          });
        });

        const vStocking = activeOrder?.stocking_status_data?.[v.id];
        if (vStocking?.tankStates) {
          const aggregated = aggregateTankStates(vStocking.tankStates, vStocking.transfers);
          aggregated.forEach(agg => {
            const normKey = String(agg.tankName).trim().toUpperCase();
            if (!discoveredTanksMap.has(normKey) && agg.totalCount > 0) {
              discoveredTanksMap.set(normKey, {
                id: agg.targetTankId || agg.tankName,
                name: agg.tankName,
                qty: agg.totalCount,
                isTransferTarget: true
              });
            }
          });
        }

        // Also discover any transfer target tanks from packing_data
        if (activeOrder?.packing_data?.tanks) {
          activeOrder.packing_data.tanks.forEach(pt => {
            if (!pt.name) return;
            const normKey = String(pt.name).trim().toUpperCase();
            if (!discoveredTanksMap.has(normKey) && pt.isTransferTarget && Number(pt.quantity) > 0) {
              discoveredTanksMap.set(normKey, {
                id: pt.id || pt.name,
                name: pt.name,
                qty: Number(pt.quantity) || 0,
                isTransferTarget: true
              });
            }
          });
        }

        const vTanks = Array.from(discoveredTanksMap.values());
        if (vTanks.length === 0) return;

        seedVanMaxEditableByVehicle[v.id] = {};

        const vehicleSummary = {
          vehicleId: v.id,
          vehicleNo: v.vehicle_no || v.vehicleNo || 'Unknown',
          tanks: [],
          totals: { original: 0, packing: 0, van: 0, remaining: 0 }
        };

        vTanks.forEach(tank => {
          const normName = String(tank.name).trim().toUpperCase();
          const original = Number(tank.qty) || 0;

          const van = seedVanConsumedByTankPerVehicle[v.id]?.[tank.id] || seedVanConsumedByTankPerVehicle[v.id]?.[normName] || 0;
          const packing = packingConsumedByTank[tank.id] || packingConsumedByTank[normName] || 0;

          const remaining = Math.max(0, original - packing - van);

          let status = 'In Progress';
          if (remaining === 0 && (packing > 0 || van > 0)) {
            status = 'Completed';
          }

          vehicleSummary.tanks.push({
            id: tank.id,
            name: tank.name,
            original,
            packing,
            van,
            remaining,
            status
          });

          vehicleSummary.totals.original += original;
          vehicleSummary.totals.packing += packing;
          vehicleSummary.totals.van += van;
          vehicleSummary.totals.remaining += remaining;

          totalOriginal += original;
          totalPacking += packing;
          totalVan += van;
          totalRemaining += remaining;

          const pMax = Math.max(0, original - van);
          const vMax = Math.max(0, original - packing);

          packingMaxEditable[tank.id] = pMax;
          packingMaxEditable[normName] = pMax;

          seedVanMaxEditableByVehicle[v.id][tank.id] = vMax;
          seedVanMaxEditableByVehicle[v.id][normName] = vMax;
        });

        summaryData.push(vehicleSummary);
      });
    }

    const getSeedVanMaxEditable = (vehicleId) => {
      return seedVanMaxEditableByVehicle[vehicleId] || {};
    };

    const isMixedComplete = isPackingDone && isVanPlanDone;

    return {
      isMixed,
      isPackingDone,
      isVanPlanDone,
      isMixedComplete,
      summaryData,
      grandTotals: {
        original: totalOriginal,
        packing: totalPacking,
        van: totalVan,
        remaining: totalRemaining
      },
      packingMaxEditable,
      getSeedVanMaxEditable
    };
  }, [activeOrder, vehicles]);
}