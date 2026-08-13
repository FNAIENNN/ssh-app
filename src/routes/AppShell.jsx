import { Routes, Route, Navigate } from 'react-router-dom';
import AppHeader from '../components/layout/AppHeader';
import AppBottomNav from '../components/layout/AppBottomNav';
import ConfigBanner from '../components/layout/ConfigBanner';
import SeedTab from '../features/seed/SeedTab';
import Sections from '../features/seed/sections/Sections';
import Payments from '../features/seed/payments/Payments';
import SeedExchange from '../features/seed/seedExchange/SeedExchange';
import Food from '../features/seed/food/Food';
import Reports from '../features/seed/reports/Reports';
import TankList from '../features/trailNetting/TankList';
import TrailNettingPage from '../features/trailNetting/TrailNettingPage';
import Harvest from '../features/harvest/Harvest';

/**
 * Authenticated shell: header (logo/wordmark/bell/avatar) + the 3 primary
 * tabs (Seed / Trail Netting / Harvest) using bottom navigation.
 */
export default function AppShell() {
  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex flex-col">
      <ConfigBanner />
      <AppHeader />
      <main className="flex-1 pb-24">
        <Routes>
          {/* Seed tab + 5 cards */}
          <Route path="seed" element={<SeedTab />}>
            <Route index element={<Sections />} />
            <Route path="sections" element={<Sections />} />
            <Route path="payments" element={<Payments />} />
            <Route path="exchange" element={<SeedExchange />} />
            <Route path="food" element={<Food />} />
            <Route path="reports" element={<Reports />} />
          </Route>

          {/* Trail Netting tab */}
          <Route path="trail-netting" element={<TankList />} />
          <Route path="trail-netting/:tankId" element={<TrailNettingPage />} />

          {/* Harvest tab — placeholder */}
          <Route path="harvest" element={<Harvest />} />

          <Route path="*" element={<Navigate to="seed" replace />} />
        </Routes>
      </main>
      <AppBottomNav />
    </div>
  );
}
