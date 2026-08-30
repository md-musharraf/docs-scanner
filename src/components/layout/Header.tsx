import React from 'react';
import { FileText, ShieldCheck, Smartphone } from 'lucide-react';
import { APP_CONFIG } from '../../core/constants';
import { triggerHaptic } from '../../utils/formatters';

interface HeaderProps {
  activeTab: string;
  onInstallClick?: () => void;
  canInstall?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onInstallClick, canInstall }) => {
  const handleInstall = () => {
    triggerHaptic();
    if (onInstallClick) onInstallClick();
  };

  return (
    <header className="sticky top-0 z-30 w-full bg-slate-900/90 backdrop-blur-xl border-b border-slate-800/80 px-3.5 py-2.5 sm:px-6 pt-[max(env(safe-area-inset-top),10px)] transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
        {/* Brand Logo & Name */}
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-sky-400 p-0.5 shadow-lg shadow-blue-500/20 flex items-center justify-center flex-shrink-0">
            <div className="w-full h-full bg-slate-900 rounded-[10px] flex items-center justify-center">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-1.5">
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">
                {APP_CONFIG.appName.split(' ')[0]}
              </h1>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-400 font-bold border border-blue-500/30 flex-shrink-0">
                PRO
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium truncate hidden xs:block">
              100% Offline Mobile PDF Studio
            </p>
          </div>
        </div>

        {/* Status Indicators & Actions */}
        <div className="flex items-center space-x-2 flex-shrink-0">
          {/* Offline Guaranteed Badge */}
          <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-semibold select-none">
            <span className="relative flex h-2 w-2 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="hidden sm:inline">100% On-Device</span>
            <span className="sm:hidden">Offline</span>
          </div>

          {/* Install PWA Button if supported */}
          {canInstall && onInstallClick && (
            <button
              onClick={handleInstall}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-600/30 transition-all active:scale-95 cursor-pointer flex-shrink-0 min-h-[36px]"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Install</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

