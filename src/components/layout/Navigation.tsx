import React from 'react';
import { Camera, Layers, Scissors, Image as ImageIcon, FileStack, SlidersHorizontal, FolderArchive } from 'lucide-react';

export type ActiveTab = 'scan' | 'merge' | 'split' | 'pdf2img' | 'img2pdf' | 'tools' | 'saved';

interface NavigationProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  savedCount: number;
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, onSelectTab, savedCount }) => {
  const tabs = [
    { id: 'scan' as ActiveTab, label: 'Scanner', icon: Camera, highlight: true },
    { id: 'merge' as ActiveTab, label: 'Merge', icon: Layers },
    { id: 'split' as ActiveTab, label: 'Split', icon: Scissors },
    { id: 'pdf2img' as ActiveTab, label: 'PDF to Img', icon: ImageIcon },
    { id: 'img2pdf' as ActiveTab, label: 'Img to PDF', icon: FileStack },
    { id: 'tools' as ActiveTab, label: 'Tools', icon: SlidersHorizontal },
    { id: 'saved' as ActiveTab, label: 'Library', icon: FolderArchive, badge: savedCount > 0 ? savedCount : undefined },
  ];

  return (
    <>
      {/* Top Desktop Navigation Tabs */}
      <div className="hidden md:flex items-center justify-center border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-4 py-2 sticky top-[65px] z-20">
        <div className="flex items-center space-x-1 p-1 bg-slate-950/70 border border-slate-800/80 rounded-xl">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span className="text-xs px-1.5 py-0.2 rounded-full bg-slate-800 text-blue-300 font-bold ml-1">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile Bottom Dock Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800/90 pb-[max(env(safe-area-inset-bottom),10px)] pt-2 px-2 shadow-2xl touch-manipulation">
        <div className="flex items-center justify-around max-w-lg mx-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all cursor-pointer relative select-none ${
                  isActive ? 'text-blue-400 scale-105' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <div
                  className={`p-1.5 rounded-xl transition-all ${
                    isActive
                      ? 'bg-blue-600/20 text-blue-400'
                      : tab.highlight
                      ? 'text-blue-400 bg-blue-500/10'
                      : ''
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-semibold mt-0.5 tracking-tight line-clamp-1">{tab.label}</span>
                {tab.badge !== undefined && (
                  <span className="absolute top-0 right-1.5 w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-bold flex items-center justify-center">
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
