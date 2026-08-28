import React, { useState } from 'react';
import { Layers, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import { FileDropzone } from '../common/FileDropzone';
import { mergePDFs } from '../../lib/pdfEngine';
import { getPdfPageCount } from '../../lib/pdfRenderer';
import { saveDocumentLocally } from '../../lib/storage';
import { PdfViewerModal } from '../common/PdfViewerModal';
import { formatFileSize, generateDefaultDocName, ensurePdfExtension } from '../../utils/formatters';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../core/logger';

interface PdfFileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  buffer: ArrayBuffer;
  pageCount: number;
}

interface MergePdfToolProps {
  onDocumentSaved?: () => void;
}

export const MergePdfTool: React.FC<MergePdfToolProps> = ({ onDocumentSaved }) => {
  const { showToast } = useToast();
  const [files, setFiles] = useState<PdfFileItem[]>([]);
  const [mergedPdf, setMergedPdf] = useState<Uint8Array | null>(null);
  const [mergedFilename, setMergedFilename] = useState(() => generateDefaultDocName('Merged'));
  const [isMerging, setIsMerging] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const handleFilesSelected = async (selectedFiles: File[]) => {
    const pdfFiles = selectedFiles.filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );

    if (pdfFiles.length === 0) {
      showToast('Please select valid PDF documents', 'error');
      return;
    }

    const newItems: PdfFileItem[] = [];
    for (const file of pdfFiles) {
      try {
        const buffer = await file.arrayBuffer();
        let pageCount = 1;
        try {
          pageCount = await getPdfPageCount(buffer);
        } catch (e) {
          logger.warn('MergePdfTool', 'Error reading page count, defaulting to 1', e);
        }

        newItems.push({
          id: `pdf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          file,
          name: file.name,
          size: file.size,
          buffer,
          pageCount,
        });
      } catch (err) {
        logger.error('MergePdfTool', `Error loading file ${file.name}`, err);
      }
    }

    setFiles((prev) => [...prev, ...newItems]);
    showToast(`Added ${newItems.length} PDF${newItems.length > 1 ? 's' : ''}`, 'success');
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const updated = [...files];
    const temp = updated[index];
    updated[index] = updated[index - 1];
    updated[index - 1] = temp;
    setFiles(updated);
  };

  const moveDown = (index: number) => {
    if (index === files.length - 1) return;
    const updated = [...files];
    const temp = updated[index];
    updated[index] = updated[index + 1];
    updated[index + 1] = temp;
    setFiles(updated);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleMerge = async () => {
    if (files.length < 2) {
      showToast('Select at least 2 PDF files to merge', 'error');
      return;
    }
    setIsMerging(true);
    try {
      const buffers = files.map((f) => f.buffer);
      const mergedBytes = await mergePDFs(buffers);

      const totalPages = files.reduce((sum, f) => sum + f.pageCount, 0);
      const finalName = ensurePdfExtension(mergedFilename, 'Merged');

      // Save to offline storage
      await saveDocumentLocally({
        name: finalName,
        sizeBytes: mergedBytes.byteLength,
        pageCount: totalPages,
        thumbnailUrl: '',
        data: mergedBytes,
      });

      if (onDocumentSaved) onDocumentSaved();

      setMergedPdf(mergedBytes);
      setIsPreviewOpen(true);
      showToast('PDFs merged successfully!', 'success');

      confetti({
        particleCount: 70,
        spread: 50,
      });
    } catch (err) {
      logger.error('MergePdfTool', 'Merge error', err);
      showToast('Error merging PDFs. Please ensure valid files.', 'error');
    } finally {
      setIsMerging(false);
    }
  };

  const totalPageCount = files.reduce((acc, curr) => acc + curr.pageCount, 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-28 md:pb-8 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 backdrop-blur-md">
        <div className="flex items-center space-x-3 mb-2">
          <div className="p-2.5 rounded-2xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Merge PDF Files</h2>
            <p className="text-xs text-slate-400">Combine 2 or more PDF documents into one single file offline</p>
          </div>
        </div>
      </div>

      {/* File Dropzone */}
      <FileDropzone
        onFilesSelected={handleFilesSelected}
        accept="application/pdf"
        multiple={true}
        title="Add PDF Files to Merge"
        subtitle="Select multiple PDFs in the order you want them joined"
        icon="pdf"
      />

      {/* Selected PDF List & Order Controls */}
      {files.length > 0 && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 backdrop-blur-md space-y-4 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Selected Documents ({files.length})</h3>
              <p className="text-xs text-slate-400">Total {totalPageCount} pages combined</p>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={mergedFilename}
                onChange={(e) => setMergedFilename(e.target.value)}
                placeholder="Merged filename.pdf"
                className="bg-slate-950/80 border border-slate-800 text-slate-100 text-xs px-3 py-1.5 rounded-xl focus:outline-none focus:border-blue-500 max-w-[180px]"
              />
              <button
                onClick={() => setFiles([])}
                className="text-xs text-red-400 hover:text-red-300 font-medium px-2 py-1 rounded-lg hover:bg-red-500/10 cursor-pointer"
              >
                Clear All
              </button>
            </div>
          </div>

          {/* Files List */}
          <div className="space-y-2.5">
            {files.map((item, idx) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center space-x-3 truncate">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center font-bold text-xs flex-shrink-0">
                    {idx + 1}
                  </div>
                  <div className="truncate">
                    <h4 className="text-sm font-medium text-slate-200 truncate max-w-[200px] sm:max-w-md">
                      {item.name}
                    </h4>
                    <p className="text-xs text-slate-400">
                      {item.pageCount} {item.pageCount === 1 ? 'page' : 'pages'} • {formatFileSize(item.size)}
                    </p>
                  </div>
                </div>

                {/* Move & Delete Controls */}
                <div className="flex items-center space-x-1 flex-shrink-0">
                  <button
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    title="Move Up"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => moveDown(idx)}
                    disabled={idx === files.length - 1}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    title="Move Down"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => removeFile(item.id)}
                    className="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 cursor-pointer"
                    title="Remove file"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Merge Action CTA */}
          <div className="pt-2">
            <button
              onClick={handleMerge}
              disabled={files.length < 2 || isMerging}
              className="w-full flex items-center justify-center space-x-2 py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm shadow-xl shadow-blue-600/30 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99] transition-all cursor-pointer"
            >
              {isMerging ? (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  <span>Merging Documents...</span>
                </div>
              ) : (
                <>
                  <Layers className="w-4 h-4" />
                  <span>Merge {files.length} PDFs into One</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      <PdfViewerModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        pdfData={mergedPdf}
        filename={ensurePdfExtension(mergedFilename, 'Merged')}
      />
    </div>
  );
};
