import { useState, useEffect } from 'react';
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

  // Global fix: Prevent mouse wheel from inadvertently incrementing/decrementing numeric inputs
  useEffect(() => {
    const preventNumberWheel = (e) => {
      if (e.target && e.target.type === 'number') {
        e.target.blur();
      }
    };

    // Attach listener in the capture phase to intercept the event early
    window.addEventListener('wheel', preventNumberWheel, { capture: true });

    return () => {
      window.removeEventListener('wheel', preventNumberWheel, { capture: true });
    };
  }, []);

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
