import React, { useState } from 'react';
import { SlidersHorizontal, Stamp, RotateCw, Trash2, Sparkles } from 'lucide-react';
import { FileDropzone } from '../common/FileDropzone';
import { ToolHeader } from '../common/ToolHeader';
import { ActionButton } from '../common/ActionButton';
import { addWatermarkToPDF, rotatePDFPages, removePagesFromPDF } from '../../lib/pdfEngine';
import { getPdfPageCount } from '../../lib/pdfRenderer';
import { saveDocumentLocally } from '../../lib/storage';
import { PdfViewerModal } from '../common/PdfViewerModal';
import { ensurePdfExtension, triggerCelebration, triggerHaptic } from '../../utils/formatters';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../core/logger';

type SubTool = 'watermark' | 'rotate' | 'remove';

interface PdfToolsProps {
  onDocumentSaved?: () => void;
}

export const PdfTools: React.FC<PdfToolsProps> = ({ onDocumentSaved }) => {
  const { showToast } = useToast();
  const [activeSubTool, setActiveSubTool] = useState<SubTool>('watermark');
  const [file, setFile] = useState<File | null>(null);
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [pageCount, setPageCount] = useState<number>(1);

  // Watermark state
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.3);
  const [watermarkSize, setWatermarkSize] = useState(48);

  // Rotate state
  const [rotateAngle, setRotateAngle] = useState<number>(90);

  // Remove pages state
  const [removePagesInput, setRemovePagesInput] = useState('');

  // Processing and result
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultPdf, setResultPdf] = useState<Uint8Array | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const handleFileSelected = async (files: File[]) => {
    if (files.length === 0) return;
    const selectedFile = files[0];
    setFile(selectedFile);
    try {
      const buf = await selectedFile.arrayBuffer();
      setBuffer(buf);
      const count = await getPdfPageCount(buf);
      setPageCount(count);
      showToast(`Loaded ${selectedFile.name} (${count} pages)`, 'success');
    } catch (e) {
      logger.error('PdfTools', 'Error loading PDF', e);
      showToast('Could not read PDF file', 'error');
    }
  };

  const handleApplyTool = async () => {
    if (!buffer || !file) return;
    setIsProcessing(true);
    try {
      let outputBytes: Uint8Array;
      const baseName = file.name.replace(/\.pdf$/i, '');
      let outputName = `${baseName}_processed.pdf`;

      if (activeSubTool === 'watermark') {
        outputBytes = await addWatermarkToPDF(buffer, {
          text: watermarkText,
          opacity: watermarkOpacity,
          fontSize: watermarkSize,
          angle: -45,
        });
        outputName = ensurePdfExtension(`${baseName}_watermarked`);
      } else if (activeSubTool === 'rotate') {
        const rotMap: Record<number, number> = {};
        for (let i = 0; i < pageCount; i++) {
          rotMap[i] = rotateAngle;
        }
        outputBytes = await rotatePDFPages(buffer, rotMap);
        outputName = ensurePdfExtension(`${baseName}_rotated_${rotateAngle}deg`);
      } else {
        const pagesToRemove: number[] = [];
        const parts = removePagesInput.split(',');
        for (const p of parts) {
          const trimmed = p.trim();
          if (trimmed.includes('-')) {
            const [startStr, endStr] = trimmed.split('-');
            const start = parseInt(startStr, 10);
            const end = parseInt(endStr, 10);
            if (!isNaN(start) && !isNaN(end)) {
              for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
                if (i >= 1 && i <= pageCount) pagesToRemove.push(i - 1);
              }
            }
          } else {
            const num = parseInt(trimmed, 10);
            if (!isNaN(num) && num >= 1 && num <= pageCount) {
              pagesToRemove.push(num - 1);
            }
          }
        }
        // Deduplicate
        const uniquePages = [...new Set(pagesToRemove)];
        if (uniquePages.length === 0) {
          showToast('Please enter valid page numbers to delete', 'error');
          setIsProcessing(false);
          return;
        }
        outputBytes = await removePagesFromPDF(buffer, uniquePages);
        outputName = ensurePdfExtension(`${baseName}_trimmed`);
      }

      // Calculate correct page count for the output document
      let outputPageCount = pageCount;
      if (activeSubTool === 'remove') {
        const parts2 = removePagesInput.split(',');
        const removedSet = new Set<number>();
        for (const p of parts2) {
          const trimmed = p.trim();
          if (trimmed.includes('-')) {
            const [s, e] = trimmed.split('-');
            const start = parseInt(s, 10);
            const end = parseInt(e, 10);
            if (!isNaN(start) && !isNaN(end)) {
              for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
                if (i >= 1 && i <= pageCount) removedSet.add(i);
              }
            }
          } else {
            const num = parseInt(trimmed, 10);
            if (!isNaN(num) && num >= 1 && num <= pageCount) removedSet.add(num);
          }
        }
        outputPageCount = Math.max(1, pageCount - removedSet.size);
      }

      await saveDocumentLocally({
        name: outputName,
        sizeBytes: outputBytes.byteLength,
        pageCount: outputPageCount,
        thumbnailUrl: '',
        data: outputBytes,
      });

      if (onDocumentSaved) onDocumentSaved();

      setResultPdf(outputBytes);
      setIsPreviewOpen(true);
      showToast('Modified PDF saved successfully!', 'success');
      triggerCelebration();
    } catch (err) {
      logger.error('PdfTools', 'Error applying tool', err);
      showToast('Error modifying PDF. Please ensure the file is valid.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-28 md:pb-8 animate-in fade-in duration-300">
      {/* Reusable Tool Header */}
      <ToolHeader
        icon={SlidersHorizontal}
        title="PDF Power Tools"
        subtitle="Stamp watermarks, rotate pages, and delete unwanted sheets offline"
        badge="Multi-Tool"
        badgeVariant="purple"
      />

      {/* SubTool Switcher Tabs */}
      <div className="grid grid-cols-3 gap-2 bg-slate-900/80 p-1.5 rounded-2xl border border-slate-800 shadow-md">
        <button
          type="button"
          onClick={() => {
            triggerHaptic(20);
            setActiveSubTool('watermark');
          }}
          className={`flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold border transition-all cursor-pointer min-h-[40px] ${
            activeSubTool === 'watermark'
              ? 'bg-purple-600/25 border-purple-500 text-white shadow-sm font-bold'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Stamp className="w-4 h-4 text-purple-400" />
          <span>Watermark</span>
        </button>

        <button
          type="button"
          onClick={() => {
            triggerHaptic(20);
            setActiveSubTool('rotate');
          }}
          className={`flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold border transition-all cursor-pointer min-h-[40px] ${
            activeSubTool === 'rotate'
              ? 'bg-purple-600/25 border-purple-500 text-white shadow-sm font-bold'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <RotateCw className="w-4 h-4 text-purple-400" />
          <span>Rotate</span>
        </button>

        <button
          type="button"
          onClick={() => {
            triggerHaptic(20);
            setActiveSubTool('remove');
          }}
          className={`flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold border transition-all cursor-pointer min-h-[40px] ${
            activeSubTool === 'remove'
              ? 'bg-purple-600/25 border-purple-500 text-white shadow-sm font-bold'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Trash2 className="w-4 h-4 text-purple-400" />
          <span>Delete Pages</span>
        </button>
      </div>

      {!file && (
        <FileDropzone
          onFilesSelected={handleFileSelected}
          accept="application/pdf"
          multiple={false}
          title="Select PDF Document"
          subtitle="Choose the PDF you want to customize"
          icon="pdf"
        />
      )}

      {file && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-4 sm:p-6 backdrop-blur-md space-y-5 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white truncate max-w-sm">
                {file.name}
              </h3>
              <p className="text-xs text-slate-400">Total {pageCount} pages</p>
            </div>
            <button
              type="button"
              onClick={() => {
                triggerHaptic(20);
                setFile(null);
                setBuffer(null);
              }}
              className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 cursor-pointer transition-colors min-h-[36px]"
            >
              Change PDF
            </button>
          </div>

          {/* SubTool Custom Settings */}
          {activeSubTool === 'watermark' && (
            <div className="space-y-4 bg-slate-950/70 p-4 rounded-2xl border border-slate-800">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400">Watermark Text</label>
                <input
                  type="text"
                  value={watermarkText}
                  onChange={(e) => setWatermarkText(e.target.value)}
                  placeholder="e.g. CONFIDENTIAL / DRAFT / APPROVED"
                  className="w-full bg-slate-900 border border-slate-800 text-slate-100 text-sm px-3.5 py-2 rounded-xl focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Opacity</span>
                    <span className="font-bold text-purple-400">{Math.round(watermarkOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="0.8"
                    step="0.05"
                    value={watermarkOpacity}
                    onChange={(e) => setWatermarkOpacity(parseFloat(e.target.value))}
                    className="w-full accent-purple-500 cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Font Size</span>
                    <span className="font-bold text-purple-400">{watermarkSize}px</span>
                  </div>
                  <input
                    type="range"
                    min="24"
                    max="90"
                    step="2"
                    value={watermarkSize}
                    onChange={(e) => setWatermarkSize(parseInt(e.target.value, 10))}
                    className="w-full accent-purple-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {activeSubTool === 'rotate' && (
            <div className="space-y-3 bg-slate-950/70 p-4 rounded-2xl border border-slate-800">
              <label className="text-xs font-semibold text-slate-400">Select Rotation Angle</label>
              <div className="grid grid-cols-3 gap-3">
                {[90, 180, 270].map((deg) => (
                  <button
                    key={deg}
                    type="button"
                    onClick={() => {
                      triggerHaptic(20);
                      setRotateAngle(deg);
                    }}
                    className={`py-3 rounded-xl text-sm font-semibold border transition-all cursor-pointer min-h-[44px] ${
                      rotateAngle === deg
                        ? 'bg-purple-600/25 border-purple-500 text-white font-bold shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    +{deg}° Clockwise
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeSubTool === 'remove' && (
            <div className="space-y-2 bg-slate-950/70 p-4 rounded-2xl border border-slate-800">
              <label className="text-xs font-semibold text-slate-400">
                Pages to Delete (Comma separated)
              </label>
              <input
                type="text"
                value={removePagesInput}
                onChange={(e) => setRemovePagesInput(e.target.value)}
                placeholder="e.g. 2, 4 (will delete page 2 and page 4)"
                className="w-full bg-slate-900 border border-slate-800 text-slate-100 text-sm px-3.5 py-2 rounded-xl focus:outline-none focus:border-purple-500 font-mono"
              />
              <p className="text-[11px] text-slate-500">
                Total available pages in this document: 1 to {pageCount}
              </p>
            </div>
          )}

          {/* Action Button */}
          <ActionButton
            onClick={handleApplyTool}
            isLoading={isProcessing}
            loadingText="Applying Changes..."
            icon={Sparkles}
            variant="purple"
            size="lg"
            fullWidth
          >
            Save Modified PDF
          </ActionButton>
        </div>
      )}

      {/* PDF Preview Modal */}
      <PdfViewerModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        pdfData={resultPdf}
        filename={`${file?.name.replace(/\.pdf$/i, '') || 'document'}_modified.pdf`}
      />
    </div>
  );
};

