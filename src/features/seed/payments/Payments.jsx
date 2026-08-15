import { useState } from 'react';
import { useSite } from '../../../hooks/useSite';
import { Empty } from '../../../components/ui/State';
import OutsideWorkers from './outsideWorkers/OutsideWorkers';
import History from './history/History';
import SeedPayments from './seedPayments/SeedPayments';
import { SeedBillProvider } from './SeedBillContext';
import SeedOrderWorkflow from './seedPayments/SeedOrderWorkflow';

/**
 * Seed Payments workspace.
 *
 * Preserves the existing:
 *   - Outside Workers
 *   - History
 *
 * Adds Friend A's new:
 *   - Seed Order / Bill lifecycle workflow
 *
 * Backend persistence for the new workflow will be completed separately.
 */
const TABS = [
  { id: 'seed', label: '💵 Seed Payments' },
  { id: 'workers', label: '👷 Outside Workers' },
  { id: 'history', label: '🕓 History' },
];

export default function Payments() {
  const { siteId } = useSite();
  const [tab, setTab] = useState('seed');

  if (!siteId) {
    return <Empty icon="🗺️" title="Select a site first" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="px-4 py-2 rounded-full text-sm font-semibold border transition"
            style={
              tab === t.id
                ? {
                    background: 'var(--color-primary)',
                    color: '#fff',
                    borderColor: 'var(--color-primary)',
                  }
                : {
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-secondary)',
                  }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'seed' && (
        <SeedBillProvider siteId={siteId}>
          <SeedOrderWorkflow siteId={siteId} />
        </SeedBillProvider>
      )}

      {tab === 'workers' && <OutsideWorkers siteId={siteId} />}

      {tab === 'history' && <History siteId={siteId} />}
    </div>
  );
}
