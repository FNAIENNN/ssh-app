import { useState } from 'react';
import { useSite } from '../../../hooks/useSite';
import { Empty } from '../../../components/ui/State';
import CentralPayments from './CentralPayments';
import OutsideWorkers from './outsideWorkers/OutsideWorkers';
import History from './history/History';

/**
 * Payments card: finance ledger, outside-worker payments, and bill history.
 * Seed Order / Stocking live under Seed Stock so this tab does not replace them.
 */
const TABS = [
  { id: 'ledger', label: '💳 All Payments' },
  { id: 'workers', label: '👷 Outside Workers' },
  { id: 'history', label: '🕓 History' },
];

export default function PaymentsHub() {
  const { siteId } = useSite();
  const [tab, setTab] = useState('ledger');

  if (!siteId) return <Empty icon="🗺️" title="Select a site first" />;

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
                ? { background: 'var(--color-primary)', color: '#fff', borderColor: 'var(--color-primary)' }
                : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'ledger' && <CentralPayments />}
      {tab === 'workers' && <OutsideWorkers siteId={siteId} />}
      {tab === 'history' && <History siteId={siteId} />}
    </div>
  );
}
