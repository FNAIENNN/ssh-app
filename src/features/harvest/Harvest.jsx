import { useState } from 'react';
import { useSite } from '../../hooks/useSite';
import { Empty } from '../../components/ui/State';
import HarvestDashboard from './tabs/HarvestDashboard';
import HarvestPricesTab from './tabs/HarvestPricesTab';
import MiddleHarvestModule from './components/middle/MiddleHarvestModule';
import FullHarvestModule from './components/full/FullHarvestModule';
import HarvestPaymentsTab from './tabs/HarvestPaymentsTab';
import HarvestReportsTab from './tabs/HarvestReportsTab';
import HarvestSettingsTab from './tabs/HarvestSettingsTab';
import HarvestFoodTab from './tabs/HarvestFoodTab';

/**
 * Harvest — Main Harvest Tab feature module.
 * 8 main tabs:
 *   1. Dashboard
 *   2. Prices
 *   3. Middle Harvest
 *   4. Full Harvest
 *   5. Payments
 *   6. Food (canteen request)
 *   7. Reports
 *   8. Settings
 */
export default function Harvest() {
  const { site, siteId } = useSite();
  const [activeTab, setActiveTab] = useState('dashboard');

  const activeSiteId = siteId || site?.id;

  if (!activeSiteId) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Empty
          icon="📍"
          title="No Farm Site Selected"
          hint="Please select a site from the top header to view harvest records."
        />
      </div>
    );
  }

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
    { id: 'prices', label: 'Prices', icon: '💹' },
    { id: 'middle', label: 'Middle Harvest', icon: '🐟' },
    { id: 'full', label: 'Full Harvest', icon: '🏁' },
    { id: 'payments', label: 'Payments', icon: '💰' },
    { id: 'food', label: 'Food', icon: '🍱' },
    { id: 'reports', label: 'Reports', icon: '📊' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Top Header & Sub-Tab Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🌾</span>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              Shrimp Harvest Management
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Site:{' '}
            <span className="font-extrabold text-blue-700">{site?.name || 'Selected Site'}</span> · Real-time weighing, grading & bill settlement
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          {tabs.map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 whitespace-nowrap ${
                  active
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Contents — persistent mounted containers to prevent data loss on tab switches */}
      <div className={activeTab === 'dashboard' ? 'block' : 'hidden'}>
        <HarvestDashboard
          siteId={activeSiteId}
          onStartMiddleHarvest={() => setActiveTab('middle')}
          onStartFullHarvest={() => setActiveTab('full')}
        />
      </div>

      <div className={activeTab === 'prices' ? 'block' : 'hidden'}>
        <HarvestPricesTab siteId={activeSiteId} />
      </div>

      <div className={activeTab === 'middle' ? 'block' : 'hidden'}>
        <MiddleHarvestModule
          siteId={activeSiteId}
          onFinished={() => setActiveTab('payments')}
        />
      </div>

      <div className={activeTab === 'full' ? 'block' : 'hidden'}>
        <FullHarvestModule
          siteId={activeSiteId}
          onFinished={() => setActiveTab('payments')}
        />
      </div>

      <div className={activeTab === 'payments' ? 'block' : 'hidden'}>
        <HarvestPaymentsTab siteId={activeSiteId} />
      </div>

      <div className={activeTab === 'food' ? 'block' : 'hidden'}>
        <HarvestFoodTab />
      </div>

      <div className={activeTab === 'reports' ? 'block' : 'hidden'}>
        <HarvestReportsTab siteId={activeSiteId} />
      </div>

      <div className={activeTab === 'settings' ? 'block' : 'hidden'}>
        <HarvestSettingsTab siteId={activeSiteId} />
      </div>
    </div>
  );
}
