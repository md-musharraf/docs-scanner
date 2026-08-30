import React from 'react';
import { FileText, X } from 'lucide-react';
import { sanitizeFilename } from '../../utils/formatters';

interface DocNameInputProps {
  value: string;
  onChange: (val: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
}

export const DocNameInput: React.FC<DocNameInputProps> = ({
  value,
  onChange,
  label = 'Doc Name',
  placeholder = 'Document Name',
  className = '',
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(sanitizeFilename(e.target.value));
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  return (
    <div
      className={`flex items-center space-x-2 bg-slate-950/80 border border-slate-800 focus-within:border-blue-500/80 rounded-2xl px-3 py-1.5 transition-all shadow-inner ${className}`}
    >
      <div className="flex items-center space-x-1.5 text-slate-400 flex-shrink-0">
        <FileText className="w-4 h-4 text-blue-400" />
        {label && (
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 hidden xs:inline">
            {label}:
          </span>
        )}
      </div>

      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        maxLength={70}
        className="bg-transparent text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none flex-1 min-w-[120px] font-medium"
      />

      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="p-1 rounded-full text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer flex-shrink-0"
          title="Clear name"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}

      <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 flex-shrink-0">
        .pdf
      </span>
    </div>
  );
};
