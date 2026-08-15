
    const stockingUpdatePayload = {
      stocking_status: 'completed',
      status: 'Completed',
      van_plan: step1Data,
      stocking_status_data: step2Data,
      outside_workers_data: step3Data,
      updated_at: new Date().toISOString(),
    };

    const { error: bErr } = await supabase
      .from(TABLES.bills)
      .update(stockingUpdatePayload)
      .eq('id', activeOrder.id);

    if (bErr) {
      toast.error(bErr.message);
      throw bErr;
    }

    // Update tanks with stocked seed counts
    if (step2Data) {
      const { data: siteTanks } = await supabase
        .from(TABLES.tanks)
        .select('id, name')
        .eq('site_id', siteId);

      let allTankStates = {};
      let allTransfers = [];

      const isLegacy = step2Data.tankStates;
      if (isLegacy) {
        allTankStates = step2Data.tankStates;
        allTransfers = step2Data.transfers || [];
      } else {
        Object.values(step2Data).forEach(vData => {
          if (vData?.tankStates) {
            allTankStates = { ...allTankStates, ...vData.tankStates };
          }
          if (vData?.transfers) {
            allTransfers = [...allTransfers, ...vData.transfers];
          }
        });
      }

      const aggregatedTanks = aggregateTankStates(allTankStates, allTransfers);

      for (const tState of aggregatedTanks) {
        if (tState.status === 'completed' && tState.totalCount > 0) {
          const matchedTank = siteTanks?.find(
            (t) => String(t.name).trim().toLowerCase() === String(tState.tankName).trim().toLowerCase()
          );
          if (matchedTank?.id) {
            await supabase.from(TABLES.tanks).update({
              quantity: tState.totalCount,
              seed_type: activeOrder.seed_type || 'Vannamei',
              hatchery: activeOrder.hatchery || null,
              start_date: new Date().toISOString().slice(0, 10),
              updated_at: new Date().toISOString(),
            }).eq('id', matchedTank.id);
          }
        }
      }
    }

    await autosaveBillStep(
      supabase, TABLES, activeOrder.id,
      { status: 'Completed', completion_timestamp: new Date().toISOString() },
      'Bill Completed',
      user?.email
    );

    await loadBills();
    toast.success(`✅ Bill ${activeOrder.bill_number} completed!`);
    onStockingCompleted?.();
  }

  const orderBill = activeOrder || activeBill;

  if (seedMode === 'packing') {
    const selectedTanks = [...(emptyTanks || []), ...(newlyAddedTanks || [])].filter((t) => orderForm?.selectedTankIds?.includes(t.id));