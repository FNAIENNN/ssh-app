import { Routes, Route, Navigate } from 'react-router-dom';
import AppHeader from '../components/layout/AppHeader';
import AppBottomNav from '../components/layout/AppBottomNav';
import ConfigBanner from '../components/layout/ConfigBanner';
import ErrorBoundary from '../components/ui/ErrorBoundary';
import SeedTab from '../features/seed/SeedTab';
import Sections from '../features/seed/sections/Sections';
import Payments from '../features/seed/payments/Payments';
import PaymentsHub from '../features/seed/payments/PaymentsHub';
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

/**
 * Authenticated shell: header + Seed / Trail Netting / Harvest tabs.
 */
export default function AppShell() {
  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex flex-col">
      <ConfigBanner />
      <AppHeader />
      <main className="flex-1 pb-24">
        <ErrorBoundary>
          <Routes>
            <Route path="seed" element={<SeedTab />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<Sections />} />
              <Route path="sections" element={<Sections />} />
              <Route path="seed-stock" element={<Payments />} />
              <Route path="payments" element={<PaymentsHub />} />
              <Route path="exchange" element={<SeedExchange />} />
              <Route path="food" element={<Food />} />
              <Route path="reports" element={<Reports />} />
              <Route path="feed-charts" element={<FeedChartsPage />} />
              <Route path="applications" element={<Applications />} />
            </Route>

            <Route path="trail-netting" element={<TankList />} />
            <Route path="trail-netting/payments" element={<TrailNettingPaymentsPage />} />
            <Route path="trail-netting/reports" element={<TrailNettingReportsPage />} />
            <Route path="trail-netting/:tankId" element={<ChecklistPage />} />
            <Route path="trail-netting/:tankId/checklist" element={<ChecklistPage />} />
            <Route path="trail-netting/:tankId/sampling" element={<SamplingPage />} />
            <Route path="trail-netting/:tankId/reports" element={<TrailNettingReportsPage />} />

            <Route path="harvest" element={<Harvest />} />

            <Route path="*" element={<Navigate to="seed" replace />} />
          </Routes>
        </ErrorBoundary>
      </main>
      <AppBottomNav />
    </div>
  );
}
