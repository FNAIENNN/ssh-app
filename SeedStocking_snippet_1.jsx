/**
 * SeedStocking — orchestrates the 3-step seed stocking workflow:
 *   Step 1: Seed Van Plan
 *   Step 2: Stocking Status
 *   Step 3: Outside Workers → Next → History
 *
 * Reads and writes through SeedBillContext. Back always preserves data.
 */
import { useState, useEffect } from 'react';
import { supabase, TABLES } from '../../../../lib/supabaseClient';
import { useAuth } from '../../../../hooks/useAuth';
import { useToast } from '../../../../hooks/useToast';
import { autosaveBillStep } from '../../../../lib/bills';
import { useSeedBill } from '../SeedBillContext';
import SeedVanPlanStep1 from './SeedVanPlanStep1';
import StockingStatusStep2 from './StockingStatusStep2';
import OutsideWorkersStep3 from './OutsideWorkersStep3';
import SignaturePad from './SignaturePad';
import PackingPage from '../packing/PackingPage';
import { aggregateTankStates } from './stockingUtils';

export default function SeedStocking({ siteId, onStockingCompleted = null, onBack = null }) {
  const { user } = useAuth();
  const toast = useToast();

  const {
    activeBill, setActiveBill,
    step1Data, setStep1Data,
    step2Data, setStep2Data,
    allBills, loadBills,
    addNewlyAddedTank,
    seedMode, setSeedMode,
    emptyTanks, newlyAddedTanks,
    orderForm
  } = useSeedBill();

  const [pendingOrders, setPendingOrders] = useState([]);
  const [activeOrder, setActiveOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [step3Data, setStep3Data] = useState(null);

  // Vehicle states
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [loadingVehicles, setLoadingVehicles] = useState(false);

  const step = seedMode === 'van-plan' ? 1 : seedMode === 'stocking-status' ? 2 : seedMode === 'outside-workers' ? 3 : 1;
  const setStep = (s) => setSeedMode(s === 1 ? 'van-plan' : s === 2 ? 'stocking-status' : 'outside-workers');

  // Common Supervisor States for Step 2
  const [supervisorName, setSupervisorName] = useState('');
  const [supervisorPhone, setSupervisorPhone] = useState('');
  const [supervisorSignature, setSupervisorSignature] = useState(null);

  function getVehicleData(data, vId) {
    if (!data || !vId) return null;
    if (data[vId]) return data[vId];
    // Legacy fallback: if data has drums/rows/tankStates and this is the FIRST vehicle
    if ((data.drums || data.rows || data.tankStates) && vehicles[0]?.id === vId) {
      return data;
    }
    return null;
  }

  // Use the context's activeBill if available, otherwise load pending orders
  useEffect(() => {
    if (activeBill) {
      setActiveOrder(activeBill);
      if (activeBill.outside_workers_data) {
        setStep3Data(activeBill.outside_workers_data);
      }
      if (activeBill.stocking_status_data) {
        const vData = Object.values(activeBill.stocking_status_data)[0] || activeBill.stocking_status_data;
        setSupervisorName(activeBill.stocking_status_data.supervisorName || vData.supervisorName || '');
        setSupervisorPhone(activeBill.stocking_status_data.supervisorPhone || vData.supervisorPhone || '');
        setSupervisorSignature(activeBill.stocking_status_data.supervisorSignature || vData.supervisorSignature || null);
      }
    }
  }, [activeBill?.id]);

  useEffect(() => {
    if (activeOrder?.id) {
      setLoadingVehicles(true);
      supabase.from(TABLES.vehicleBookings).select('*').eq('bill_id', activeOrder.id)
        .then(({ data }) => {
          setVehicles(data || []);
          if (!selectedVehicleId && data && data.length > 0) {
            // Keep empty to force user selection as requested, or reset if activeOrder changed
            setSelectedVehicleId('');
          }
          setLoadingVehicles(false);
        });
    }
  }, [activeOrder?.id]);

  useEffect(() => {
    if (!siteId) return;
    loadPendingStockingOrders();
  }, [siteId]);

  async function loadPendingStockingOrders() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from(TABLES.bills)
        .select('*')
        .eq('site_id', siteId)
        .eq('type', 'seed')
        .in('status', [
          'Vehicle Payment Requested',
          'Pending Seed Stocking',
          'Seed Stocking In Progress',
          'Awaiting Remaining Tanks',
          'Payment Requested',
        ])
        .order('created_at', { ascending: false });
      const loaded = data ?? [];
      setPendingOrders(loaded);
      if (!activeOrder && !activeBill && loaded.length > 0) {
        setActiveOrder(loaded[0]);
      }
    } catch (err) {
      console.error('loadPendingStockingOrders error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleStep1Next(data) {
    if (!selectedVehicleId) return toast.error('Please select a vehicle first.');
    const newData = { ...(step1Data || {}), [selectedVehicleId]: data };
    setStep1Data(newData);
    
    if (activeOrder?.id) {
      await autosaveBillStep(
        supabase, TABLES, activeOrder.id,
        { van_plan: newData, status: 'Seed Stocking In Progress', current_stage: 'stocking-status' },
        'Seed Van Plan Saved',
        user?.email
      );
    }
    toast.success('Seed Van Plan saved for selected vehicle.');
  }

  async function handleStep2Next(data) {
    if (!selectedVehicleId) return toast.error('Please select a vehicle first.');

    // Save ONLY vehicle-specific data here
    const vehicleData = { ...data };
    const newData = { ...(step2Data || {}), [selectedVehicleId]: vehicleData };