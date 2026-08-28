import React, { useRef, useState } from 'react';
import { UploadCloud, FilePlus, Image as ImageIcon } from 'lucide-react';

interface FileDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  accept: string;
  multiple?: boolean;
  title: string;
  subtitle?: string;
  icon?: 'pdf' | 'image';
}

export const FileDropzone: React.FC<FileDropzoneProps> = ({
  onFilesSelected,
  accept,
  multiple = false,
  title,
  subtitle = 'Drag & drop your files here or tap to browse',
  icon = 'pdf',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files);
      onFilesSelected(filesArray);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      onFilesSelected(filesArray);
      e.target.value = '';
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      className={`relative group cursor-pointer border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center transition-all duration-300 ${
        isDragging
          ? 'border-blue-500 bg-blue-500/10 scale-[1.01]'
          : 'border-slate-800 hover:border-slate-700 bg-slate-900/40 hover:bg-slate-900/70'
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={handleFileInputChange}
      />

      <div className="flex flex-col items-center justify-center space-y-4">
        {/* Animated Icon container */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600/20 to-indigo-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 group-hover:scale-110 group-hover:text-blue-300 transition-transform duration-300 shadow-inner">
          {icon === 'pdf' ? (
            <UploadCloud className="w-8 h-8" />
          ) : (
            <ImageIcon className="w-8 h-8" />
          )}
        </div>

        {/* Text descriptions */}
        <div className="space-y-1 max-w-sm mx-auto">
          <h3 className="text-base sm:text-lg font-semibold text-slate-100 group-hover:text-blue-400 transition-colors">
            {title}
          </h3>
          <p className="text-xs sm:text-sm text-slate-400 font-medium">
            {subtitle}
          </p>
        </div>

        {/* Action Button Badge */}
        <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-semibold shadow-lg shadow-blue-600/25 transition-all">
          <FilePlus className="w-4 h-4" />
          <span>{multiple ? 'Choose Files' : 'Select File'}</span>
        </div>
      </div>
    </div>
  );
};
