import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  X,
  Download,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Share2,
  Printer,
  Maximize,
  Minimize,
  RotateCw,
} from 'lucide-react';
import { renderPdfPage, getPdfPageCount } from '../../lib/pdfRenderer';
import { downloadFile, shareDocument } from '../../lib/storage';
import { triggerHaptic } from '../../utils/formatters';
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
  const modalRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [scale, setScale] = useState(1.4);
  const [pageImage, setPageImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [rotationAngle, setRotationAngle] = useState(0);

  const renderPage = useCallback(
    async (data: Uint8Array, page: number, currentScale: number) => {
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
    },
    [showToast]
  );

  const goToPage = useCallback(
    (page: number) => {
      if (!pdfData) return;
      const targetPage = Math.max(1, Math.min(totalPages, page));
      triggerHaptic(20);
      setCurrentPage(targetPage);
      setPageInput(targetPage.toString());
      renderPage(pdfData, targetPage, scale);
    },
    [pdfData, totalPages, scale, renderPage]
  );

  const handlePrevPage = useCallback(() => {
    if (currentPage > 1) {
      goToPage(currentPage - 1);
    }
  }, [currentPage, goToPage]);

  const handleNextPage = useCallback(() => {
    if (currentPage < totalPages) {
      goToPage(currentPage + 1);
    }
  }, [currentPage, totalPages, goToPage]);

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(pageInput, 10);
    if (!isNaN(parsed)) {
      goToPage(parsed);
    } else {
      setPageInput(currentPage.toString());
    }
  };

  const handleZoomIn = useCallback(() => {
    if (pdfData) {
      triggerHaptic(20);
      const newScale = Math.min(Number((scale + 0.25).toFixed(2)), 3.0);
      setScale(newScale);
      renderPage(pdfData, currentPage, newScale);
    }
  }, [pdfData, scale, currentPage, renderPage]);

  const handleZoomOut = useCallback(() => {
    if (pdfData) {
      triggerHaptic(20);
      const newScale = Math.max(Number((scale - 0.25).toFixed(2)), 0.6);
      setScale(newScale);
      renderPage(pdfData, currentPage, newScale);
    }
  }, [pdfData, scale, currentPage, renderPage]);

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
        setPageInput('1');
        setScale(1.4);
        setRotationAngle(0);
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

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') handlePrevPage();
      if (e.key === 'ArrowRight') handleNextPage();
      if (e.key === '=' || e.key === '+') handleZoomIn();
      if (e.key === '-' || e.key === '_') handleZoomOut();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, handlePrevPage, handleNextPage, handleZoomIn, handleZoomOut]);

  const handleSetExactScale = (newScale: number) => {
    if (pdfData) {
      triggerHaptic(20);
      setScale(newScale);
      renderPage(pdfData, currentPage, newScale);
    }
  };

  const handleDownload = async () => {
    if (pdfData) {
      triggerHaptic(25);
      await downloadFile(pdfData, filename);
      showToast(`Saved ${filename}`, 'success');
    }
  };

  const handleShare = async () => {
    if (!pdfData) return;
    triggerHaptic(25);
    const shared = await shareDocument(pdfData, filename);
    if (shared) {
      showToast('Document shared', 'success');
    }
  };

  const handlePrint = () => {
    if (!pdfData) return;
    triggerHaptic(20);
    try {
      const blob = new Blob([pdfData as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      // Try opening in a new window for more reliable printing
      const printWindow = window.open(url, '_blank');
      if (printWindow) {
        printWindow.addEventListener('afterprint', () => {
          printWindow.close();
          URL.revokeObjectURL(url);
        });
        // Fallback cleanup if user closes the window without printing
        setTimeout(() => URL.revokeObjectURL(url), 120000);
      } else {
        // Fallback: use iframe approach
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '1px';
        iframe.style.height = '1px';
        iframe.style.border = '0';
        iframe.style.opacity = '0.01';
        iframe.src = url;
        document.body.appendChild(iframe);

        // Guaranteed cleanup even if onload doesn't fire
        const cleanupTimer = setTimeout(() => {
          if (document.body.contains(iframe)) document.body.removeChild(iframe);
          URL.revokeObjectURL(url);
        }, 15000);

        iframe.onload = () => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          clearTimeout(cleanupTimer);
          setTimeout(() => {
            if (document.body.contains(iframe)) document.body.removeChild(iframe);
            URL.revokeObjectURL(url);
          }, 60000);
        };
      }
    } catch (err) {
      logger.error('PdfViewer', 'Print error', err);
      showToast('Printing not supported on this device', 'info');
    }
  };

  const toggleFullscreen = () => {
    triggerHaptic(20);
    if (!document.fullscreenElement) {
      modalRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  // Sync fullscreen state with browser's fullscreen API
  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const handleRotateView = () => {
    triggerHaptic(20);
    setRotationAngle((prev) => (prev + 90) % 360);
  };

  if (!isOpen || !pdfData) return null;

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/98 backdrop-blur-2xl animate-in fade-in duration-200 h-[100dvh] overflow-hidden"
    >
      {/* Top Action Bar */}
      <div className="flex items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3 border-b border-slate-800 bg-slate-900/90 pt-[max(env(safe-area-inset-top),10px)] flex-shrink-0">
        <div className="flex items-center space-x-2.5 min-w-0">
          <button
            type="button"
            onClick={() => {
              triggerHaptic(20);
              onClose();
            }}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center flex-shrink-0"
            title="Close Preview (Esc)"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="min-w-0">
            <h3
              className="text-xs sm:text-sm font-bold text-white truncate max-w-[160px] xs:max-w-[220px] sm:max-w-md"
              title={filename}
            >
              {filename}
            </h3>
            <div className="flex items-center space-x-2 text-[11px] text-slate-400">
              <span>{totalPages} {totalPages === 1 ? 'page' : 'pages'}</span>
              <span>•</span>
              <span className="text-blue-400 font-mono font-semibold">{Math.round(scale * 100)}%</span>
            </div>
          </div>
        </div>

        {/* Top Controls Toolbar */}
        <div className="flex items-center space-x-1 sm:space-x-1.5 flex-shrink-0">
          {/* Zoom controls */}
          <div className="hidden sm:flex items-center space-x-0.5 bg-slate-950/80 rounded-xl p-1 border border-slate-800">
            <button
              type="button"
              onClick={handleZoomOut}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-850 cursor-pointer min-w-[28px] min-h-[28px] flex items-center justify-center"
              title="Zoom Out (-)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleSetExactScale(1.0)}
              className="text-[11px] px-2 py-0.5 text-slate-300 font-mono hover:text-white rounded hover:bg-slate-800 cursor-pointer"
              title="Reset 100%"
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              type="button"
              onClick={handleZoomIn}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-850 cursor-pointer min-w-[28px] min-h-[28px] flex items-center justify-center"
              title="Zoom In (+)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Rotate view */}
          <button
            type="button"
            onClick={handleRotateView}
            className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
            title="Rotate View 90°"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          {/* Print button on desktop */}
          <button
            type="button"
            onClick={handlePrint}
            className="hidden xs:flex p-2 rounded-xl bg-slate-950/80 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer min-w-[36px] min-h-[36px] items-center justify-center"
            title="Print PDF"
          >
            <Printer className="w-4 h-4" />
          </button>

          {/* Fullscreen toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="hidden sm:flex p-2 rounded-xl bg-slate-950/80 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer min-w-[36px] min-h-[36px] items-center justify-center"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>

          {/* Share */}
          <button
            type="button"
            onClick={handleShare}
            className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
            title="Share Document"
          >
            <Share2 className="w-4 h-4" />
          </button>

          {/* Download button */}
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-blue-600/30 active:scale-95 transition-all cursor-pointer min-h-[36px]"
          >
            <Download className="w-4 h-4" />
            <span className="hidden xs:inline">Save PDF</span>
          </button>
        </div>
      </div>

      {/* Main Canvas Viewer */}
      <div className="flex-1 overflow-auto p-2 sm:p-4 flex items-center justify-center relative select-none touch-pan-x touch-pan-y">
        {isLoading ? (
          <div className="flex flex-col items-center space-y-3">
            <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
            <p className="text-xs sm:text-sm text-slate-400 font-medium">
              Rendering page {currentPage} of {totalPages}...
            </p>
          </div>
        ) : pageImage ? (
          <div
            className="relative shadow-2xl rounded-xl overflow-hidden border border-slate-800 bg-white transition-transform duration-200 inline-block"
            style={{ transform: `rotate(${rotationAngle}deg)` }}
          >
            <img
              src={pageImage}
              alt={`Page ${currentPage}`}
              className={`object-contain select-none block ${
                scale <= 1.4
                  ? 'max-w-full max-h-[72vh]'
                  : ''
              }`}
              style={scale > 1.4 ? { width: 'auto', height: 'auto' } : undefined}
            />
          </div>
        ) : null}
      </div>

      {/* Bottom Paging Toolbar */}
      <div className="p-2.5 sm:p-3 border-t border-slate-800 bg-slate-900/95 backdrop-blur-md flex items-center justify-between sm:justify-center sm:space-x-6 pb-[max(env(safe-area-inset-bottom),10px)] flex-shrink-0">
        <button
          type="button"
          onClick={handlePrevPage}
          disabled={currentPage <= 1}
          className="flex items-center space-x-1 px-3.5 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer min-h-[36px]"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Prev</span>
        </button>

        {/* Direct Page Jump Form */}
        <form onSubmit={handlePageInputSubmit} className="flex items-center space-x-1.5">
          <span className="text-xs text-slate-400">Page</span>
          <input
            type="number"
            min="1"
            max={totalPages}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onBlur={handlePageInputSubmit}
            className="w-14 bg-slate-950 border border-slate-800 text-center text-xs sm:text-sm font-bold text-white py-1 rounded-lg focus:outline-none focus:border-blue-500 font-mono min-h-[32px]"
          />
          <span className="text-xs text-slate-400 font-semibold">of {totalPages}</span>
        </form>

        <button
          type="button"
          onClick={handleNextPage}
          disabled={currentPage >= totalPages}
          className="flex items-center space-x-1 px-3.5 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer min-h-[36px]"
        >
          <span>Next</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

