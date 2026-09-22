export function isOrderFullyCompleted(order) {
  if (!order) return false;

  // Core explicit final flag check
  if (order.status?.toLowerCase() === 'completed' || order.stocking_status?.toLowerCase() === 'completed') {
    return true;
  }

  // Fallback: Check path-specific data persistence for legacy or edge cases
  const hasPacking = !!order.packing_data?.packingCompleted;
  const hasVanPlan = !!order.van_plan;
  const hasStocking = !!order.stocking_status_data;
  const hasSupervisor = !!order.stocking_status_data?.supervisorSignature;
  const hasOutsideWorkers = !!order.outside_workers_data;

  const isMixed = order.current_stage === 'mixed-allocation' || (hasPacking && hasVanPlan);

  if (isMixed) {
    return hasPacking && hasVanPlan && hasStocking && hasSupervisor && hasOutsideWorkers;
  }

  if (hasPacking) {
    return hasOutsideWorkers;
  }

  if (hasVanPlan) {
    return hasStocking && hasSupervisor && hasOutsideWorkers;
  }

  // If no path is started or recognized, it's definitely not complete
  return false;
}

export function getResumeStep(order) {
  if (!order) return 'pay';

  // If fully complete, it belongs in history
  if (isOrderFullyCompleted(order)) return 'history';

  const stage = order.current_stage || 'pay';

  // 1. Handle Mixed explicitly if the stage is mixed-allocation
  if (stage === 'mixed-allocation') {
    const isPackingDone = !!order.packing_data?.packingCompleted;
    const isVanPlanDone = !!order.stocking_status_data?.seedVanCompleted;

    if (!isPackingDone && !isVanPlanDone) return 'mixed-allocation'; // neither finished yet
    if (!isPackingDone) return 'packing';
    if (!isVanPlanDone) {
      if (!order.van_plan) return 'van-plan';
      if (!order.stocking_status_data?.seedVanCompleted) return 'stocking-status';
    }

    // Both done, check outside workers
    if (!order.outside_workers_data) return 'outside-workers';

    return 'mixed-allocation'; // fallback
  }

  // 2. Early stages: if there's no path data and stage is early, trust the stage
  const hasPacking = !!order.packing_data?.packingCompleted;
  const hasVanPlan = !!order.van_plan;

  if (!hasPacking && !hasVanPlan && ['pay', 'vehicle', 'vehicle-payments', 'pending'].includes(stage)) {
    return stage;
  }

  // 3. Derive from persisted data for specific paths
  if (stage === 'packing' || stage === 'outside-workers-packing' || (hasPacking && !hasVanPlan)) {
    if (!order.packing_data?.packingCompleted) return 'packing';
    if (!order.outside_workers_data) return 'outside-workers-packing';
  }

  if (stage === 'van-plan' || stage === 'stocking-status' || stage === 'outside-workers' || (hasVanPlan && !hasPacking)) {
    if (!order.van_plan) return 'van-plan';
    // seedVanCompleted flag means Stocking + Supervisor is done
    if (!order.stocking_status_data?.seedVanCompleted) return 'stocking-status';
    if (!order.outside_workers_data) return 'outside-workers';
  }

  return stage;
}