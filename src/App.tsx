import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Splash from './screens/Splash';
import Onboarding from './screens/Onboarding';
import Home from './screens/Home';
import Assistant from './screens/Assistant';
import Emergency from './screens/Emergency';
import Profile from './screens/Profile';
import PregnancyCare from './screens/PregnancyCare';
import NewbornCare from './screens/NewbornCare';
import Under5Care from './screens/Under5Care';
import Vaccination from './screens/Vaccination';
import Reminders from './screens/Reminders';
import { useAppStore } from './stores/useAppStore';
import { AppResilienceOverlay } from './components/AppResilienceOverlay';
import { reminderScheduler } from './services/reminders/reminderScheduler';

function App() {
  const initialize = useAppStore((state) => state.initialize);
  const isHydrated = useAppStore((state) => state.isHydrated);
  const theme = useAppStore((state) => state.preferences?.theme || 'light');

  useEffect(() => {
    initialize();
    const cleanup = reminderScheduler.setupLifecycleListeners(() => useAppStore.getState().activeMemberId);
    return cleanup;
  }, [initialize]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  if (!isHydrated) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-50">
        <div className="w-10 h-10 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-600 font-medium text-sm">Initializing NurtureAI Local Store...</p>
      </div>
    );
  }

  return (
    <>
      <AppResilienceOverlay />
      <BrowserRouter>
        <Routes>
        <Route path="/" element={<Splash />} />
        <Route path="/onboarding" element={<Onboarding />} />
        
        {/* Main App Shell */}
        <Route element={<Layout />}>
          <Route path="/home" element={<Home />} />
          <Route path="/ai-assistant" element={<Assistant />} />
          <Route path="/emergency" element={<Emergency />} />
          <Route path="/profile" element={<Profile />} />
        </Route>

        {/* Feature Screens */}
        <Route path="/pregnancy-care" element={<PregnancyCare />} />
        <Route path="/newborn-care" element={<NewbornCare />} />
        <Route path="/under-5-care" element={<Under5Care />} />
        <Route path="/vaccination" element={<Vaccination />} />
        <Route path="/reminders" element={<Reminders />} />
        
        {/* Fallback */}
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </BrowserRouter>
    </>
  );
}

export default App;
