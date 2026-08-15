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
import FeedChartsPage from '../features/seed/reports/FeedChartsPage';
import Applications from '../features/seed/applications/Applications';
import TankList from '../features/trailNetting/TankList';
import ChecklistPage from '../features/trailNetting/ChecklistPage';
import SamplingPage from '../features/trailNetting/SamplingPage';
import TrailNettingReportsPage from '../features/trailNetting/TrailNettingReportsPage';
import TrailNettingPaymentsPage from '../features/trailNetting/TrailNettingPaymentsPage';
import Harvest from '../features/harvest/Harvest';

import CentralPayments from '../features/seed/payments/CentralPayments';

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
          {/* Seed tab + cards */}
          <Route path="seed" element={<SeedTab />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<Sections />} />
            <Route path="sections" element={<Navigate to="../dashboard" replace />} />
            <Route path="seed-stock" element={<Payments />} />
            <Route path="payments" element={<CentralPayments />} />
            <Route path="exchange" element={<SeedExchange />} />
            <Route path="applications" element={<Navigate to="../seed-stock" replace />} />
            <Route path="feed-charts" element={<FeedChartsPage />} />
            <Route path="food" element={<Food />} />
            <Route path="reports" element={<Reports />} />
          </Route>

          {/* Trail Netting tab + Multi-step flow */}
          <Route path="trail-netting" element={<TankList />} />
          <Route path="trail-netting/payments" element={<TrailNettingPaymentsPage />} />
          <Route path="trail-netting/reports" element={<TrailNettingReportsPage />} />
          <Route path="trail-netting/:tankId" element={<ChecklistPage />} />
          <Route path="trail-netting/:tankId/checklist" element={<ChecklistPage />} />
          <Route path="trail-netting/:tankId/sampling" element={<SamplingPage />} />
          <Route path="trail-netting/:tankId/reports" element={<TrailNettingReportsPage />} />

          {/* Harvest tab */}
          <Route path="harvest" element={<Harvest />} />

          <Route path="*" element={<Navigate to="seed" replace />} />
        </Routes>
      </main>
      <AppBottomNav />
    </div>
  );
}
