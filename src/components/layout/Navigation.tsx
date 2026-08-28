import React, { useRef, useEffect } from 'react';
import {
  Camera,
  Layers,
  Scissors,
  Image as ImageIcon,
  FileStack,
  SlidersHorizontal,
  FolderArchive,
  Minimize2,
} from 'lucide-react';

export type ActiveTab =
  | 'scan'
  | 'resize'
  | 'merge'
  | 'split'
  | 'pdf2img'
  | 'img2pdf'
  | 'tools'
  | 'saved';

interface NavigationProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  savedCount: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onSelectTab,
  savedCount,
}) => {
  const mobileNavRef = useRef<HTMLDivElement>(null);

  const tabs = [
    { id: 'scan' as ActiveTab, label: 'Scanner', icon: Camera, highlight: true },
    { id: 'resize' as ActiveTab, label: 'Compress / Resize', icon: Minimize2 },
    { id: 'merge' as ActiveTab, label: 'Merge PDF', icon: Layers },
    { id: 'split' as ActiveTab, label: 'Split PDF', icon: Scissors },
    { id: 'pdf2img' as ActiveTab, label: 'PDF to Image', icon: ImageIcon },
    { id: 'img2pdf' as ActiveTab, label: 'Image to PDF', icon: FileStack },
    { id: 'tools' as ActiveTab, label: 'PDF Tools', icon: SlidersHorizontal },
    {
      id: 'saved' as ActiveTab,
      label: 'Library',
      icon: FolderArchive,
      badge: savedCount > 0 ? savedCount : undefined,
    },
  ];

  // Auto-scroll the active tab into view on mobile
  useEffect(() => {
    if (mobileNavRef.current) {
      const activeEl = mobileNavRef.current.querySelector<HTMLElement>('[data-active="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, [activeTab]);

  return (
    <>
      {/* Top Desktop Navigation Tabs */}
      <div className="hidden md:flex items-center justify-center border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-4 py-2 sticky top-[65px] z-20">
        <div className="flex items-center space-x-1 p-1 bg-slate-950/70 border border-slate-800/80 rounded-2xl">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-blue-300 font-bold ml-1">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile Bottom Navigation Dock: Horizontally Scrollable with Full Touch Targets */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-2xl border-t border-slate-800/90 pb-[max(env(safe-area-inset-bottom),10px)] pt-2.5 px-2 shadow-2xl touch-manipulation">
        <div
          ref={mobileNavRef}
          className="flex items-center space-x-2 overflow-x-auto no-scrollbar py-1 px-1 max-w-full scroll-smooth"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                data-active={isActive}
                onClick={() => onSelectTab(tab.id)}
                className={`flex-shrink-0 flex items-center space-x-2 py-2 px-3.5 rounded-2xl transition-all cursor-pointer select-none text-xs font-semibold ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/40 scale-[1.02]'
                    : tab.highlight
                    ? 'bg-blue-950/60 border border-blue-500/40 text-blue-300 hover:text-white'
                    : 'bg-slate-950/80 border border-slate-800/80 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div
                  className={`p-1 rounded-lg ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : tab.highlight
                      ? 'text-blue-400'
                      : 'text-slate-400'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <span className="whitespace-nowrap">{tab.label}</span>
                {tab.badge !== undefined && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      isActive
                        ? 'bg-white text-blue-600'
                        : 'bg-blue-600 text-white'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
};
