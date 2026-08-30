import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { triggerHaptic } from '../../utils/formatters';

interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'indigo' | 'emerald' | 'amber' | 'purple' | 'cyan' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  loadingText?: string;
  icon?: LucideIcon;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  haptic?: boolean;
}

const variantClasses = {
  primary:
    'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-600/30 border border-blue-400/20 active:scale-[0.98]',
  indigo:
    'bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white shadow-lg shadow-indigo-600/30 border border-indigo-400/20 active:scale-[0.98]',
  emerald:
    'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-600/30 border border-emerald-400/20 active:scale-[0.98]',
  amber:
    'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-lg shadow-amber-600/30 border border-amber-400/20 active:scale-[0.98]',
  purple:
    'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-600/30 border border-purple-400/20 active:scale-[0.98]',
  cyan:
    'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-600/30 border border-cyan-400/20 active:scale-[0.98]',
  secondary:
    'bg-slate-800/90 hover:bg-slate-750 text-slate-200 hover:text-white border border-slate-700/80 shadow-md active:scale-[0.98]',
  danger:
    'bg-red-500/15 hover:bg-red-500/25 text-red-400 hover:text-red-300 border border-red-500/30 active:scale-[0.98]',
  ghost:
    'bg-transparent hover:bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-transparent active:scale-[0.98]',
};

const sizeClasses = {
  sm: 'px-3 py-2 text-xs rounded-xl min-h-[38px]',
  md: 'px-4 py-2.5 text-xs sm:text-sm rounded-xl min-h-[44px]',
  lg: 'px-5 py-3.5 text-sm sm:text-base font-bold rounded-2xl min-h-[48px]',
};

export const ActionButton: React.FC<ActionButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  loadingText,
  icon: Icon,
  iconPosition = 'left',
  fullWidth = false,
  haptic = true,
  disabled,
  onClick,
  className = '',
  ...props
}) => {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || isLoading) return;
    if (haptic) triggerHaptic();
    if (onClick) onClick(e);
  };

  return (
    <button
      {...props}
      disabled={disabled || isLoading}
      onClick={handleClick}
      className={`inline-flex items-center justify-center font-semibold select-none cursor-pointer transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none ${
        variantClasses[variant]
      } ${sizeClasses[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
    >
      {isLoading ? (
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          <span>{loadingText || 'Processing...'}</span>
        </div>
      ) : (
        <div className="flex items-center space-x-2">
          {Icon && iconPosition === 'left' && <Icon className="w-4 h-4 flex-shrink-0" />}
          <span>{children}</span>
          {Icon && iconPosition === 'right' && <Icon className="w-4 h-4 flex-shrink-0" />}
        </div>
      )}
    </button>
  );
};
