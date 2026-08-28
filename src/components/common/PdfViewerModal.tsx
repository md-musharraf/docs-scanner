import React, { useEffect, useState } from 'react';
import { X, Download, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Share2 } from 'lucide-react';
import { renderPdfPage, getPdfPageCount } from '../../lib/pdfRenderer';
import { downloadFile, shareDocument } from '../../lib/storage';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../core/logger';

interface PdfViewerModalProps {
  pdfData: Uint8Array | null;
  filename: string;
  isOpen: boolean;
  onClose: () => void;
}

export const PdfViewerModal: React.FC<PdfViewerModalProps> = ({
  pdfData,
  filename,
  isOpen,
  onClose,
}) => {
  const { showToast } = useToast();
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [scale, setScale] = useState(1.4);
  const [pageImage, setPageImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const renderPage = async (data: Uint8Array, page: number, currentScale: number) => {
    setIsLoading(true);
    try {
      const rendered = await renderPdfPage(data, page, currentScale);
      setPageImage(rendered.dataUrl);
    } catch (err) {
      logger.error('PdfViewer', 'Error rendering page', err);
      showToast('Error rendering PDF page', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !pdfData) {
      return;
    }
    let isMounted = true;

    getPdfPageCount(pdfData)
      .then(async (count) => {
        if (!isMounted) return;
        setTotalPages(count);
        setCurrentPage(1);
        setScale(1.4);
        const rendered = await renderPdfPage(pdfData, 1, 1.4);
        if (isMounted) {
          setPageImage(rendered.dataUrl);
        }
      })
      .catch((err) => {
        if (isMounted) {
          logger.error('PdfViewer', 'Error loading PDF document', err);
          showToast('Could not load PDF document', 'error');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, pdfData, showToast]);

  const handlePrevPage = () => {
    if (currentPage > 1 && pdfData) {
      const newPage = currentPage - 1;
      setCurrentPage(newPage);
      renderPage(pdfData, newPage, scale);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages && pdfData) {
      const newPage = currentPage + 1;
      setCurrentPage(newPage);
      renderPage(pdfData, newPage, scale);
    }
  };

  const handleZoomIn = () => {
    if (pdfData) {
      const newScale = Math.min(scale + 0.3, 3.0);
      setScale(newScale);
      renderPage(pdfData, currentPage, newScale);
    }
  };

  const handleZoomOut = () => {
    if (pdfData) {
      const newScale = Math.max(scale - 0.3, 0.6);
      setScale(newScale);
      renderPage(pdfData, currentPage, newScale);
    }
  };

  const handleDownload = async () => {
    if (pdfData) {
      await downloadFile(pdfData, filename);
      showToast(`Saved ${filename}`, 'success');
    }
  };

  const handleShare = async () => {
    if (!pdfData) return;
    const shared = await shareDocument(pdfData, filename);
    if (shared) {
      showToast('Document shared', 'success');
    }
  };

  if (!isOpen || !pdfData) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 backdrop-blur-xl animate-in fade-in duration-200">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/80 pt-[max(env(safe-area-inset-top),12px)]">
        <div className="flex items-center space-x-3 truncate">
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="truncate">
            <h3 className="text-sm font-semibold text-white truncate max-w-[180px] sm:max-w-md">
              {filename}
            </h3>
            <p className="text-xs text-slate-400">
              Page {currentPage} of {totalPages}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-1 sm:space-x-2">
          {/* Zoom controls */}
          <div className="hidden sm:flex items-center space-x-1 bg-slate-800/80 rounded-xl p-1 border border-slate-700">
            <button
              onClick={handleZoomOut}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs px-1 text-slate-300 font-mono">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          {/* Share on mobile */}
          <button
            onClick={handleShare}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors cursor-pointer"
            title="Share PDF"
          >
            <Share2 className="w-4 h-4" />
          </button>

          {/* Download button */}
          <button
            onClick={handleDownload}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-semibold shadow-lg shadow-blue-600/30 transition-all active:scale-95 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span className="hidden xs:inline">Save</span>
          </button>
        </div>
      </div>

      {/* Main Canvas Viewer */}
      <div className="flex-1 overflow-auto p-4 flex items-center justify-center relative select-none">
        {isLoading ? (
          <div className="flex flex-col items-center space-y-3">
            <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
            <p className="text-sm text-slate-400">Rendering page {currentPage}...</p>
          </div>
        ) : pageImage ? (
          <div className="relative shadow-2xl rounded-lg overflow-hidden border border-slate-800 bg-white">
            <img
              src={pageImage}
              alt={`Page ${currentPage}`}
              className="max-w-full max-h-[75vh] object-contain select-none"
            />
          </div>
        ) : null}
      </div>

      {/* Bottom Paging Toolbar */}
      {totalPages > 1 && (
        <div className="p-3 border-t border-slate-800 bg-slate-900/90 flex items-center justify-center space-x-4 pb-[max(env(safe-area-inset-bottom),12px)]">
          <button
            onClick={handlePrevPage}
            disabled={currentPage <= 1}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-700 text-white text-sm font-medium transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Prev</span>
          </button>

          <span className="text-sm font-semibold text-slate-300">
            {currentPage} / {totalPages}
          </span>

          <button
            onClick={handleNextPage}
            disabled={currentPage >= totalPages}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-700 text-white text-sm font-medium transition-colors cursor-pointer"
          >
            <span>Next</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
