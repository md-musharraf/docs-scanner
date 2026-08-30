import React from 'react';

export const LoadingSkeleton: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-pulse">
      {/* Header Banner Skeleton */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6 flex items-center space-x-4">
        <div className="w-12 h-12 rounded-2xl bg-slate-800/80"></div>
        <div className="space-y-2 flex-1">
          <div className="h-5 bg-slate-800/80 rounded-lg w-48"></div>
          <div className="h-3 bg-slate-800/50 rounded-lg w-72"></div>
        </div>
      </div>

      {/* Main Container Skeleton */}
      <div className="border-2 border-dashed border-slate-800/80 rounded-3xl p-12 flex flex-col items-center justify-center space-y-4 bg-slate-900/30">
        <div className="w-16 h-16 rounded-2xl bg-slate-800/70"></div>
        <div className="h-4 bg-slate-800/70 rounded-lg w-44"></div>
        <div className="h-3 bg-slate-800/40 rounded-lg w-60"></div>
        <div className="h-9 bg-slate-800/80 rounded-xl w-32 mt-2"></div>
      </div>
    </div>
  );
};
