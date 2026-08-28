import React, { useState } from 'react';
import { Scissors, Check } from 'lucide-react';
import confetti from 'canvas-confetti';
import { FileDropzone } from '../common/FileDropzone';
import { renderAllPdfPages } from '../../lib/pdfRenderer';
import type { RenderedPage } from '../../core/types';
import { splitPDF } from '../../lib/pdfEngine';
import { saveDocumentLocally } from '../../lib/storage';
import { PdfViewerModal } from '../common/PdfViewerModal';
import { ensurePdfExtension } from '../../utils/formatters';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../core/logger';

interface SplitPdfToolProps {
  onDocumentSaved?: () => void;
}

export const SplitPdfTool: React.FC<SplitPdfToolProps> = ({ onDocumentSaved }) => {
  const { showToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [renderedPages, setRenderedPages] = useState<RenderedPage[]>([]);
  const [selectedPages, setSelectedPages] = useState<number[]>([]); // 1-indexed page numbers
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [rangeInput, setRangeInput] = useState('');
  const [isSplitting, setIsSplitting] = useState(false);
  const [splitPdfData, setSplitPdfData] = useState<Uint8Array | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const handleFileSelected = async (files: File[]) => {
    if (files.length === 0) return;
    const selectedFile = files[0];
    setFile(selectedFile);
    setIsLoadingPages(true);
    setSelectedPages([]);

    try {
      const buffer = await selectedFile.arrayBuffer();
      setFileBuffer(buffer);

      // Fast thumbnail scale for splitting page grid
      const pages = await renderAllPdfPages(buffer, 0.6, (current, total) => {
        setProgress({ current, total });
      });

      setRenderedPages(pages);
      // Default: select all
      setSelectedPages(pages.map((p) => p.pageNumber));
      showToast(`Loaded ${pages.length} pages`, 'success');
    } catch (err) {
      logger.error('SplitPdfTool', 'Error rendering PDF for splitting', err);
      showToast('Could not render PDF. Ensure it is valid & unencrypted.', 'error');
    } finally {
      setIsLoadingPages(false);
    }
  };

  const togglePageSelection = (pageNum: number) => {
    setSelectedPages((prev) =>
      prev.includes(pageNum) ? prev.filter((p) => p !== pageNum) : [...prev, pageNum].sort((a, b) => a - b)
    );
  };

  const selectAll = () => {
    setSelectedPages(renderedPages.map((p) => p.pageNumber));
  };

  const deselectAll = () => {
    setSelectedPages([]);
  };

  const applyRangeInput = () => {
    if (!rangeInput.trim()) return;
    const parts = rangeInput.split(',');
    const selected = new Set<number>();

    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.includes('-')) {
        const [startStr, endStr] = trimmed.split('-');
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
            if (i >= 1 && i <= renderedPages.length) selected.add(i);
          }
        }
      } else {
        const num = parseInt(trimmed, 10);
        if (!isNaN(num) && num >= 1 && num <= renderedPages.length) {
          selected.add(num);
        }
      }
    }

    const result = Array.from(selected).sort((a, b) => a - b);
    setSelectedPages(result);
    showToast(`Selected ${result.length} pages from range`, 'info');
  };

  const handleExtract = async () => {
    if (!fileBuffer || selectedPages.length === 0) return;
    setIsSplitting(true);
    try {
      // 0-indexed indices for pdf-lib
      const indices = selectedPages.map((p) => p - 1);
      const extractedBytes = await splitPDF(fileBuffer, indices);

      const baseName = file?.name.replace(/\.pdf$/i, '') || 'Document';
      const outputName = ensurePdfExtension(`${baseName}_extracted_${selectedPages.length}pages`);

      // Save to offline indexedDB
      await saveDocumentLocally({
        name: outputName,
        sizeBytes: extractedBytes.byteLength,
        pageCount: selectedPages.length,
        thumbnailUrl: renderedPages.find((p) => p.pageNumber === selectedPages[0])?.dataUrl || '',
        data: extractedBytes,
      });

      if (onDocumentSaved) onDocumentSaved();

      setSplitPdfData(extractedBytes);
      setIsPreviewOpen(true);
      showToast('Extracted pages saved to new PDF!', 'success');

      confetti({
        particleCount: 70,
        spread: 50,
      });
    } catch (err) {
      logger.error('SplitPdfTool', 'Extract error', err);
      showToast('Error extracting pages', 'error');
    } finally {
      setIsSplitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 md:pb-8 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 backdrop-blur-md">
        <div className="flex items-center space-x-3 mb-2">
          <div className="p-2.5 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
            <Scissors className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Split & Extract PDF Pages</h2>
            <p className="text-xs text-slate-400">Select specific pages or a range to create a new PDF offline</p>
          </div>
        </div>
      </div>

      {!file && (
        <FileDropzone
          onFilesSelected={handleFileSelected}
          accept="application/pdf"
          multiple={false}
          title="Select PDF to Split"
          subtitle="Upload any multi-page PDF document to view and extract pages"
          icon="pdf"
        />
      )}

      {/* Loading Progress Indicator */}
      {isLoadingPages && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-8 text-center space-y-4">
          <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mx-auto"></div>
          <div>
            <h3 className="text-base font-semibold text-white">Rendering Pages...</h3>
            <p className="text-xs text-slate-400">
              Processing page {progress.current} of {progress.total}
            </p>
          </div>
        </div>
      )}

      {/* Page Selection Grid & Controls */}
      {renderedPages.length > 0 && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 backdrop-blur-md space-y-5 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-sm font-semibold text-white truncate max-w-sm">
                {file?.name}
              </h3>
              <p className="text-xs text-slate-400">
                {selectedPages.length} of {renderedPages.length} pages selected for new PDF
              </p>
            </div>

            {/* Quick Select Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={selectAll}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
              >
                Select All
              </button>
              <button
                onClick={deselectAll}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
              >
                Deselect All
              </button>
              <button
                onClick={() => {
                  setFile(null);
                  setRenderedPages([]);
                  setSelectedPages([]);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-xs font-semibold text-red-400 cursor-pointer"
              >
                Change PDF
              </button>
            </div>
          </div>

          {/* Page Range Input */}
          <div className="flex items-center space-x-2 bg-slate-950/70 p-2.5 rounded-2xl border border-slate-800/80">
            <span className="text-xs font-semibold text-slate-400 flex-shrink-0">Page Range:</span>
            <input
              type="text"
              value={rangeInput}
              onChange={(e) => setRangeInput(e.target.value)}
              placeholder="e.g. 1-3, 5, 8"
              className="bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none flex-1 font-mono"
            />
            <button
              onClick={applyRangeInput}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl cursor-pointer"
            >
              Apply
            </button>
          </div>

          {/* Thumbnails Grid */}
          <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 max-h-[50vh] overflow-y-auto p-1">
            {renderedPages.map((page) => {
              const isSelected = selectedPages.includes(page.pageNumber);
              return (
                <div
                  key={page.pageNumber}
                  onClick={() => togglePageSelection(page.pageNumber)}
                  className={`relative rounded-2xl overflow-hidden border-2 transition-all cursor-pointer group bg-slate-950 flex flex-col ${
                    isSelected
                      ? 'border-blue-500 ring-2 ring-blue-500/40'
                      : 'border-slate-800/80 opacity-60 hover:opacity-100 hover:border-slate-700'
                  }`}
                >
                  <div className="aspect-[3/4] w-full overflow-hidden bg-white">
                    <img
                      src={page.dataUrl}
                      alt={`Page ${page.pageNumber}`}
                      className="w-full h-full object-contain"
                    />
                  </div>

                  {/* Selection Checkbox & Page Badge */}
                  <div className="p-2 bg-slate-900 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300">
                      Page {page.pageNumber}
                    </span>
                    <div
                      className={`w-5 h-5 rounded-lg flex items-center justify-center text-xs transition-colors ${
                        isSelected ? 'bg-blue-600 text-white' : 'bg-slate-800 text-transparent border border-slate-700'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Extract CTA */}
          <button
            onClick={handleExtract}
            disabled={selectedPages.length === 0 || isSplitting}
            className="w-full flex items-center justify-center space-x-2 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold text-sm shadow-xl shadow-indigo-600/30 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99] transition-all cursor-pointer"
          >
            {isSplitting ? (
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                <span>Extracting Pages...</span>
              </div>
            ) : (
              <>
                <Scissors className="w-4 h-4" />
                <span>Extract {selectedPages.length} Selected Pages to New PDF</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* PDF Preview Modal */}
      <PdfViewerModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        pdfData={splitPdfData}
        filename={`${file?.name.replace(/\.pdf$/i, '') || 'Document'}_extracted.pdf`}
      />
    </div>
  );
};
