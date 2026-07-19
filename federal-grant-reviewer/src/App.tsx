import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage from './components/Auth/LoginPage';
import SafeReviewDashboard from './components/SafeReviewDashboard';
import LandingPage from './components/LandingPage';
import DemoMode from './components/DemoMode';

// ---------------------------------------------------------------------------
// Simple hash-based router — no react-router dependency needed
// ---------------------------------------------------------------------------
type Route = '/' | '/login' | '/app' | '/demo';

function getRoute(): Route {
  const hash = window.location.hash.replace(/^#/, '');
  if (hash === '/login') return '/login';
  if (hash === '/app') return '/app';
  if (hash === '/demo') return '/demo';
  return '/';
}

const AppRoutes: React.FC = () => {
  const { user, loading } = useAuth();
  const [route, setRoute] = useState<Route>(getRoute);

  useEffect(() => {
    const handler = () => setRoute(getRoute());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  // If the user is signed in and lands on /login or /, send them to /app
  useEffect(() => {
    if (!loading && user && (route === '/login' || route === '/')) {
      window.location.hash = '/app';
    }
  }, [user, loading, route]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f7fc]">
        <div className="text-slate-500 text-sm animate-pulse">Loading…</div>
      </div>
    );
  }

  // Public routes
  if (route === '/') return <LandingPage />;
  if (route === '/demo') return <DemoMode />;
  if (route === '/login') return <LoginPage />;

  // Protected route — /app
  if (route === '/app') {
    if (!user) {
      window.location.hash = '/login';
      return null;
    }
    return <SafeReviewDashboard />;
  }

  // Fallback
  return <LandingPage />;
};

const App: React.FC = () => (
  <AuthProvider>
    <AppRoutes />
  </AuthProvider>
);

export default App;
