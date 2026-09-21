import { useEffect } from 'react';
import { useSite } from '../../../hooks/useSite';
import { Empty } from '../../../components/ui/State';
import ErrorBoundary from '../../../components/ui/ErrorBoundary';
import { SeedBillProvider, useSeedBill } from './SeedBillContext';
import SeedOrderWorkflow from './seedPayments/SeedOrderWorkflow';
import SeedStocking from './seedStocking/SeedStocking';
import History from './history/History';
import VehiclePayments from './vehicleBooking/VehiclePayments';
import { useAuth } from '../../../hooks/useAuth';

/**
 * Seed Stock Module — three sub-tabs:
 *   📋 Seed Order  ·  🌱 Seed Stocking  ·  🕓 History
 *
 * Wrapped in SeedBillProvider so all children share one Bill context.
 */

const TABS = [
  { id: 'seed', label: '📋 Seed Order' },
  { id: 'stocking', label: '🌱 Seed Stocking' },
  { id: 'history', label: '🕓 History' },
];

export default function Payments() {
  const { siteId } = useSite();
  if (!siteId) return <Empty icon="🗺️" title="Select a site first" />;

  return (
    <ErrorBoundary>
      <SeedBillProvider siteId={siteId}>
        <PaymentsInner siteId={siteId} />
      </SeedBillProvider>
    </ErrorBoundary>
  );
}

function PaymentsInner({ siteId }) {
  const { seedMode, setSeedMode, loadBills, activeBill, allBills, updateBill } = useSeedBill();
  const { user } = useAuth()

  // Determine which high-level tab is active based on seedMode
  const activeTab =
    seedMode === 'history'
      ? 'history'
      : seedMode === 'stocking' || seedMode === 'van-plan' || seedMode === 'stocking-status' || seedMode === 'outside-workers' || seedMode === 'packing' || seedMode === 'outside-workers-packing' || seedMode === 'mixed-allocation'
        ? 'stocking'
        : 'seed';

  // Load bills on mount
  useEffect(() => {
    loadBills();
  }, [siteId]);

  function handleTabClick(tabId) {
    if (tabId === 'seed') setSeedMode('list');
    else if (tabId === 'stocking') setSeedMode('stocking');
    else if (tabId === 'history') setSeedMode('history');
  }

  return (
    <div className="space-y-4">
      {/* Sub-tab navigation */}
      <div className="bg-white rounded-2xl p-2 border border-slate-200 shadow-sm overflow-x-auto w-full mb-4">
        <div className="flex items-center gap-2 min-w-max">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTabClick(t.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${activeTab === t.id
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
                }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Seed Order Workflow (list / form / pay / vehicle / vehicle-payments / readonly) */}
      <div style={{ display: activeTab === 'seed' && seedMode !== 'vehicle-payments' ? 'block' : 'none' }}>
        <SeedOrderWorkflow siteId={siteId} />
      </div>

      {/* Vehicle Payments */}
      <div style={{ display: activeTab === 'seed' && seedMode === 'vehicle-payments' ? 'block' : 'none' }}>
        <VehiclePayments
          siteId={siteId}
          bill={activeBill || allBills?.[0]}
          onBack={() => setSeedMode('vehicle')}
          onProceedClicked={async () => {
            await updateBill({ status: 'Pending Seed Stocking', current_stage: 'pending' }, 'Vehicle Payments Finished', user?.email);
            await loadBills();
          }}
          onProceedToSeedStocking={async () => {
            await updateBill({ status: 'Pending Seed Stocking', current_stage: 'van-plan' }, 'Proceeding to Seed Van Plan', user?.email);
            await loadBills();
            setSeedMode('van-plan');
          }}
          onProceedToPacking={async () => {
            await updateBill({ status: 'Pending Seed Stocking', current_stage: 'packing' }, 'Proceeding to Packing', user?.email);
            await loadBills();
            setSeedMode('packing');
          }}
          onProceedToMixed={async () => {
            await updateBill({ status: 'Pending Seed Stocking', current_stage: 'mixed-allocation' }, 'Proceeding to Mixed Allocation', user?.email);
            await loadBills();
            setSeedMode('mixed-allocation');
          }}
          loadBills={loadBills}
          updateBill={updateBill}
        />
      </div>

      {/* Seed Stocking (van plan / stocking status / outside workers) */}
      <div style={{ display: activeTab === 'stocking' ? 'block' : 'none' }}>
        <SeedStocking
          siteId={siteId}
          onStockingCompleted={async () => {
            await loadBills();
            setSeedMode('history');
          }}
          onBack={() => setSeedMode('list')}
        />
      </div>

      {/* History */}
      {activeTab === 'history' && (
        <History siteId={siteId} />
      )}
    </div>
  );
}