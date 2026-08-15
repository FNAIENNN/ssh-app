/**
 * SeedBillContext — Single shared Bill state for the entire Seed workflow.
 *
 * One Bill = One Source of Truth.
 * All workflow screens (Seed Order, Payments, Vehicle Booking, Vehicle Payments,
 * Seed Van Plan, Stocking Status, Outside Workers, Past Orders, History) read and
 * update the same Bill through this context. No child component maintains a
 * parallel copy of the Bill.
 */
import { createContext, useContext, useState, useCallback } from 'react';
import { supabase, TABLES } from '../../../lib/supabaseClient';
import { autosaveBillStep } from '../../../lib/bills';

const SeedBillContext = createContext(null);

export function useSeedBill() {
  const ctx = useContext(SeedBillContext);
  if (!ctx) throw new Error('useSeedBill must be used within SeedBillProvider');
  return ctx;
}

export function SeedBillProvider({ children, siteId }) {
  // ── Active Bill (DB row) ─────────────────────────────────────────────────
  const [activeBill, setActiveBill] = useState(null);

  // ── Seed Order form state ────────────────────────────────────────────────
  // Persisted across Back navigation
  const [orderForm, setOrderForm] = useState({
    selectedSectionIds: [],
    selectedSectionTab: null, // single active section tab
    selectedTankIds: [],
    tankQtys: {}, // { tankId: qty }
    expandedTankGroup: null, // which A/B/C group is expanded in hierarchical tank selector
    seedType: '',
    plSize: '',
    hatchery: '',
    perPiecePrice: '',
    selectedHatchery: null,
    selectedBankAccount: null,
  });

  // ── Seed Order form tanks (emptyTanks for the site) ──────────────────────
  const [emptyTanks, setEmptyTanks] = useState([]);

  // ── Newly Added Tanks (vehicle booking / van plan / transfer) ────────────
  const [newlyAddedTanks, setNewlyAddedTanks] = useState([]); // [{ id, name, qty? }]

  // ── Seed Stocking step data ───────────────────────────────────────────────
  const [step1Data, setStep1Data] = useState(null); // Van Plan
  const [step2Data, setStep2Data] = useState(null); // Stocking Status

  // ── Navigation mode within Seed Stock sub-module ─────────────────────────
  // 'list' | 'form' | 'pay' | 'vehicle' | 'vehicle-payments' | 'stocking' | 'readonly'
  const [seedMode, setSeedMode] = useState('list');

  // ── All bills for this site ───────────────────────────────────────────────
  const [allBills, setAllBills] = useState([]);
  const [loadingBills, setLoadingBills] = useState(false);

  // ── Load bills from DB ────────────────────────────────────────────────────
  const loadBills = useCallback(async () => {
    if (!siteId) return;
    setLoadingBills(true);
    try {
      const { data } = await supabase
        .from(TABLES.bills)
        .select('*')
        .eq('site_id', siteId)
        .in('type', ['seed', 'return'])
        .order('created_at', { ascending: false });
      setAllBills(data ?? []);
    } finally {
      setLoadingBills(false);
    }
  }, [siteId]);

  // ── Update Bill in DB and local state ────────────────────────────────────
  const updateBill = useCallback(async (fields, timelineAction = null, userName = null) => {
    if (!activeBill?.id) return null;
    const updated = await autosaveBillStep(supabase, TABLES, activeBill.id, fields, timelineAction, userName);
    if (updated) {
      setActiveBill(updated);
      setAllBills((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    }
    return updated;
  }, [activeBill?.id]);

  // ── Add a newly discovered tank ───────────────────────────────────────────
  const addNewlyAddedTank = useCallback((tank) => {
    setNewlyAddedTanks((prev) => {
      if (prev.some((t) => t.id === tank.id)) return prev;
      return [...prev, tank];
    });
  }, []);

  // ── Delete bill from DB ────────────────────
  const deleteBill = useCallback(async (billId) => {
    try {
      const { error } = await supabase.from(TABLES.bills).delete().eq('id', billId);
      if (error) throw error;
      setAllBills((prev) => prev.filter((b) => b.id !== billId));
      return true;
    } catch (err) {
      console.error('Failed to delete bill:', err);
      return false;
    }
  }, []);

  // ── Reset workflow (start fresh) ─────────────────────────────────────────
  const resetWorkflow = useCallback(() => {
    setActiveBill(null);
    setOrderForm({
      seedType: '',
      hatchery: '',
      plSize: '',
      perPiecePrice: '',
      selectedSectionTab: null,
      expandedTankGroup: null,
      selectedTankIds: [],
      tankQtys: {},
      selectedHatchery: null,
      selectedBankAccount: null,
    });
    setEmptyTanks([]);
    setNewlyAddedTanks([]);
    setStep1Data(null);
    setStep2Data(null);
    setSeedMode('list');
  }, []);

  const value = {
    // Bill
    activeBill,
    setActiveBill,
    updateBill,
    allBills,
    setAllBills,
    loadingBills,
    loadBills,

    // Order form
    orderForm,
    setOrderForm,
    emptyTanks,
    setEmptyTanks,

    // Newly added tanks
    newlyAddedTanks,
    addNewlyAddedTank,
    setNewlyAddedTanks,

    // Stocking steps
    step1Data,
    setStep1Data,
    step2Data,
    setStep2Data,

    // Navigation
    seedMode,
    setSeedMode,

    // Past Orders delete
    deleteBill,

    // Helpers
    resetWorkflow,
    siteId,
  };

  return (
    <SeedBillContext.Provider value={value}>
      {children}
    </SeedBillContext.Provider>
  );
}
