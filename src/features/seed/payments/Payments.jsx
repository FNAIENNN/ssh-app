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
  const { seedMode, setSeedMode, loadBills, activeBill, updateBill } = useSeedBill();
  const { user } = useAuth();

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
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => handleTabClick(t.id)}
            className="px-4 py-2 rounded-full text-sm font-semibold border transition"
            style={
              activeTab === t.id
                ? { background: 'var(--color-primary)', color: '#fff', borderColor: 'var(--color-primary)' }
                : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Seed Order Workflow (list / form / pay / vehicle / vehicle-payments / readonly) */}
      <div style={{ display: activeTab === 'seed' && seedMode !== 'vehicle-payments' ? 'block' : 'none' }}>
        <SeedOrderWorkflow siteId={siteId} />
      </div>

      {/* Vehicle Payments */}
      <div style={{ display: activeTab === 'seed' && seedMode === 'vehicle-payments' ? 'block' : 'none' }}>
        <VehiclePayments
          siteId={siteId}
          bill={activeBill}
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