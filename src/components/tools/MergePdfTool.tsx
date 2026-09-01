import React, { useState } from 'react';
import { Layers, ArrowUp, ArrowDown, Trash2, ArrowUpDown } from 'lucide-react';
import { FileDropzone } from '../common/FileDropzone';
import { ToolHeader } from '../common/ToolHeader';
import { ActionButton } from '../common/ActionButton';
import { DocNameInput } from '../common/DocNameInput';
import { mergePDFs } from '../../lib/pdfEngine';
import { getPdfPageCount } from '../../lib/pdfRenderer';
import { saveDocumentLocally } from '../../lib/storage';
import { PdfViewerModal } from '../common/PdfViewerModal';
import {
  formatFileSize,
  generateDefaultDocName,
  ensurePdfExtension,
  moveArrayItem,
  triggerCelebration,
  triggerHaptic,
} from '../../utils/formatters';
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

  const handleMove = (index: number, direction: 'up' | 'down') => {
    triggerHaptic(20);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    setFiles((prev) => moveArrayItem(prev, index, targetIndex));
  };

  const handleReverseOrder = () => {
    triggerHaptic(20);
    setFiles((prev) => [...prev].reverse());
    showToast('Reversed file order', 'info');
  };

  const removeFile = (id: string) => {
    triggerHaptic(20);
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
      triggerCelebration();
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
      {/* Reusable Tool Header */}
      <ToolHeader
        icon={Layers}
        title="Merge PDF Files"
        subtitle="Combine 2 or more PDF documents into one single file offline"
        badge="Instant"
        badgeVariant="blue"
      />

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
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-4 sm:p-6 backdrop-blur-md space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white">
                Selected Documents ({files.length})
              </h3>
              <p className="text-xs text-slate-400">
                {totalPageCount} pages total • {formatFileSize(files.reduce((sum, f) => sum + f.size, 0))}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleReverseOrder}
                className="flex items-center space-x-1 text-xs text-slate-300 hover:text-white font-semibold px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 cursor-pointer transition-colors min-h-[36px]"
                title="Reverse document order"
              >
                <ArrowUpDown className="w-3.5 h-3.5 text-blue-400" />
                <span>Reverse Order</span>
              </button>

              <DocNameInput
                value={mergedFilename}
                onChange={setMergedFilename}
                placeholder="Merged Document"
              />

              <button
                type="button"
                onClick={() => {
                  triggerHaptic(20);
                  setFiles([]);
                }}
                className="text-xs text-red-400 hover:text-red-300 font-medium px-2.5 py-1.5 rounded-xl hover:bg-red-500/10 cursor-pointer transition-colors min-h-[36px]"
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
                    onClick={() => handleMove(idx, 'up')}
                    disabled={idx === 0}
                    className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
                    title="Move Up"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleMove(idx, 'down')}
                    disabled={idx === files.length - 1}
                    className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
                    title="Move Down"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => removeFile(item.id)}
                    className="p-2 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
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
            <ActionButton
              onClick={handleMerge}
              disabled={files.length < 2}
              isLoading={isMerging}
              loadingText="Merging Documents..."
              icon={Layers}
              variant="primary"
              size="lg"
              fullWidth
            >
              Merge {files.length} PDFs into One
            </ActionButton>
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

