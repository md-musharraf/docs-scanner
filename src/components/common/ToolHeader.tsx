import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface ToolHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  badge?: string;
  badgeVariant?: 'blue' | 'indigo' | 'emerald' | 'amber' | 'purple' | 'cyan';
  actionSlot?: React.ReactNode;
  children?: React.ReactNode;
}

const colorMap = {
  blue: {
    iconBg: 'bg-blue-600/20 text-blue-400 border-blue-500/30',
    badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  },
  indigo: {
    iconBg: 'bg-indigo-600/20 text-indigo-400 border-indigo-500/30',
    badge: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  },
  emerald: {
    iconBg: 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30',
    badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  },
  amber: {
    iconBg: 'bg-amber-600/20 text-amber-400 border-amber-500/30',
    badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  },
  purple: {
    iconBg: 'bg-purple-600/20 text-purple-400 border-purple-500/30',
    badge: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  },
  cyan: {
    iconBg: 'bg-cyan-600/20 text-cyan-400 border-cyan-500/30',
    badge: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  },
};

export const ToolHeader: React.FC<ToolHeaderProps> = ({
  icon: Icon,
  title,
  subtitle,
  badge,
  badgeVariant = 'blue',
  actionSlot,
  children,
}) => {
  const colors = colorMap[badgeVariant] || colorMap.blue;
  const actions = actionSlot || children;

  return (
    <div className="bg-slate-900/80 border border-slate-800/90 rounded-3xl p-4 sm:p-6 backdrop-blur-md shadow-xl transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3.5 min-w-0">
          <div
            className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl border flex items-center justify-center flex-shrink-0 shadow-inner ${colors.iconBg}`}
          >
            <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-2">
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight truncate">
                {title}
              </h2>
              {badge && (
                <span
                  className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${colors.badge}`}
                >
                  {badge}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 font-medium line-clamp-1 mt-0.5">
              {subtitle}
            </p>
          </div>
        </div>

        {actions && (
          <div className="flex items-center space-x-2 flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/60">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};
