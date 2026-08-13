import { useState } from 'react';
import { useSite } from '../../../hooks/useSite';
import { Empty } from '../../../components/ui/State';
import SeedPayments from './seedPayments/SeedPayments';
import OutsideWorkers from './outsideWorkers/OutsideWorkers';
import History from './history/History';

/**
 * Payments Card (PRD §7.2).
 * Three sub-tabs: Seed Payments · Outside Workers · History.
 * Seed Payments + Outside Workers both drive the shared RequestPayment panel;
 * History lists bills and can redirect back to Seed Payments to clear a
 * pending amount (carrying the bill so RequestPayment is prefilled with it).
 */
const TABS = [
  { id: 'seed', label: '💵 Seed Payments' },
  { id: 'workers', label: '👷 Outside Workers' },
  { id: 'history', label: '🕓 History' },
];

export default function Payments() {
  const { siteId } = useSite();
  const [tab, setTab] = useState('seed');
  // Carries a bill from History → Seed Payments so the pending amount can be paid.
  const [resumeBill, setResumeBill] = useState(null);

  if (!siteId) return <Empty icon="🗺️" title="Select a site first" />;

  function goToSeed(bill) {
    setResumeBill(bill);
    setTab('seed');
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-4 py-2 rounded-full text-sm font-semibold border transition"
            style={
              tab === t.id
                ? { background: 'var(--color-primary)', color: '#fff', borderColor: 'var(--color-primary)' }
                : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'seed' && (
        <SeedPayments
          siteId={siteId}
          resumeBill={resumeBill}
          onResumeCleared={() => setResumeBill(null)}
        />
      )}
      {tab === 'workers' && <OutsideWorkers siteId={siteId} />}
      {tab === 'history' && <History siteId={siteId} onPayPending={goToSeed} />}
    </div>
  );
}
