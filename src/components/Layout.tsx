import React from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Home, Sparkles, ShieldAlert, User, WifiOff, Globe } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useAppStore } from '../stores/useAppStore';
import { SUPPORTED_LANGUAGES } from '../types';

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

const Layout = () => {
  const location = useLocation();
  const path = location.pathname;
  const preferences = useAppStore((state) => state.preferences);

  const currentLang = SUPPORTED_LANGUAGES.find(
    (l) => l.code === preferences?.preferredLanguage
  ) || SUPPORTED_LANGUAGES[0];

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {/* Bottom Navigation */}
      <div className="bg-white border-t border-slate-200">
        <div className="bg-teal-50 border-b border-teal-100 py-1.5 px-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <WifiOff className="w-3.5 h-3.5 text-teal-700" />
            <span className="text-xs font-semibold text-teal-900">
              Offline-First • Local Storage Active
            </span>
          </div>
          <div className="flex items-center gap-1 text-[11px] font-medium text-teal-800 bg-teal-100/70 px-2 py-0.5 rounded-full">
            <Globe className="w-3 h-3" />
            <span>{currentLang.displayName}</span>
          </div>
        </div>
        
        <nav className="flex justify-around items-center h-16 px-2 pb-safe">
          <NavItem to="/home" icon={<Home />} label="Home" isActive={path.startsWith('/home')} />
          <NavItem to="/ai-assistant" icon={<Sparkles />} label="Assistant" isActive={path.startsWith('/ai-assistant')} />
          <NavItem 
            to="/emergency" 
            icon={<ShieldAlert />} 
            label="Emergency" 
            isActive={path.startsWith('/emergency')} 
            isEmergency 
          />
          <NavItem to="/profile" icon={<User />} label="Profile" isActive={path.startsWith('/profile')} />
        </nav>
      </div>
    </div>
  );
};

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  isEmergency?: boolean;
}

const NavItem = ({ to, icon, label, isActive, isEmergency }: NavItemProps) => {
  return (
    <NavLink 
      to={to} 
      className={cn(
        "flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors",
        isActive 
          ? (isEmergency ? "text-red-600" : "text-teal-700") 
          : "text-slate-500 hover:text-slate-900"
      )}
    >
      <div className={cn(
        "flex items-center justify-center w-12 h-8 rounded-full transition-all",
        isActive && (isEmergency ? "bg-red-100" : "bg-teal-100")
      )}>
        {React.cloneElement(icon as React.ReactElement, { 
          className: "w-5 h-5",
          strokeWidth: isActive ? 2.5 : 2 
        })}
      </div>
      <span className="text-[10px] font-medium">{label}</span>
    </NavLink>
  );
};

export default Layout;
