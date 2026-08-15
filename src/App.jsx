import { useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { SiteProvider } from './hooks/useSite';
import { ToastProvider } from './hooks/useToast';
import AppRoutes from './routes/AppRoutes';

/**
 * App root.
 * Wires providers (Auth, Site, Toast) + Router and hands off to <AppRoutes />.
 * The splash screen runs once on boot before the route tree mounts.
 */
export default function App() {
  // Splash runs once on boot, then fades into the route tree.
  const [booted, setBooted] = useState(false);

  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <SiteProvider>
            <AppRoutes booted={booted} onSplashDone={() => setBooted(true)} />
          </SiteProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
