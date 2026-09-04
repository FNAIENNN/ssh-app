import { useMemo } from 'react';

export function useMixedAllocationState(activeOrder, vehicles) {
  return useMemo(() => {
    const isMixed = activeOrder?.current_stage === 'mixed-allocation';
    
    // Explicit completion flags
    const isPackingDone = !!activeOrder?.packing_data?.packingCompleted;
    const isVanPlanDone = !!activeOrder?.stocking_status_data?.seedVanCompleted;

    // Helper to calculate total seed van consumed per tank PER vehicle
    const seedVanConsumedByTankPerVehicle = {}; // { [vehicleId]: { [tankId]: qty } }
    
    if (activeOrder?.van_plan) {
      Object.entries(activeOrder.van_plan).forEach(([vid, vData]) => {
        if (!seedVanConsumedByTankPerVehicle[vid]) {
          seedVanConsumedByTankPerVehicle[vid] = {};
        }
        vData?.drums?.forEach(d => {
          const tank = activeOrder.selected_tanks?.find(t => t.name === d.tankName);
          if (tank) {
            const count = Number(d.count) || 0;
            seedVanConsumedByTankPerVehicle[vid][tank.id] = (seedVanConsumedByTankPerVehicle[vid][tank.id] || 0) + count;
          }
        });
      });
    }

    // Helper to calculate total packing consumed per tank (currently packing is saved globally per tank id, 
    // but users don't share tanks between vehicles, so this naturally aligns with the vehicle the tank is assigned to)
    const packingConsumedByTank = {};
    if (activeOrder?.packing_data?.tanks) {
      activeOrder.packing_data.tanks.forEach(t => {
        packingConsumedByTank[t.id] = (packingConsumedByTank[t.id] || 0) + (Number(t.quantity) || 0);
      });
    }

    const summaryData = [];
    const packingMaxEditable = {};
    const seedVanMaxEditableByVehicle = {}; // { [vehicleId]: { [tankId]: maxQty } }
    
    let totalOriginal = 0;
    let totalPacking = 0;
    let totalVan = 0;
    let totalRemaining = 0;

    if (activeOrder?.selected_tanks && vehicles) {
      vehicles.forEach(v => {
        const vTanksIds = v.tank_ids || v.selectedTanks || [];
        const vTanks = activeOrder.selected_tanks.filter(t => vTanksIds.some(id => String(id) === String(t.id)));
        
        if (vTanks.length === 0) return;

        seedVanMaxEditableByVehicle[v.id] = {};

        const vehicleSummary = {
          vehicleId: v.id,
          vehicleNo: v.vehicle_no || 'Unknown',
          tanks: [],
          totals: { original: 0, packing: 0, van: 0, remaining: 0 }
        };

        vTanks.forEach(tank => {
          const original = Number(tank.qty) || 0;
          
          // Exactly isolated per Vehicle ID + Tank ID
          const van = seedVanConsumedByTankPerVehicle[v.id]?.[tank.id] || 0;
          const packing = packingConsumedByTank[tank.id] || 0;

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

          // Packing Max Editable: Original - SeedVanUsed
          packingMaxEditable[tank.id] = Math.max(0, original - van);

          // Seed Van Max Editable: Original - PackingUsed
          seedVanMaxEditableByVehicle[v.id][tank.id] = Math.max(0, original - packing);
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