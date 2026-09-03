import React, { useRef, useState, useEffect } from 'react';
import {
  Camera,
  RefreshCw,
  Zap,
  ZapOff,
  Trash2,
  Plus,
  Crop,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  Sparkles,
} from 'lucide-react';
import type { ScannerFilter, ScannedPageItem } from '../../core/types';
import { APP_CONFIG } from '../../core/constants';
import {
  generateDefaultDocName,
  ensurePdfExtension,
  moveArrayItem,
  triggerCelebration,
  triggerHaptic,
} from '../../utils/formatters';
import { rotateImageCanvas, disposeCanvas } from '../../utils/geometry';
import { fileToDataUrl } from '../../utils/fileUtils';
import { DocNameInput } from '../common/DocNameInput';
import { ActionButton } from '../common/ActionButton';
import { imagesToPDF } from '../../lib/pdfEngine';
import { saveDocumentLocally } from '../../lib/storage';
import {
  autoDetectDocumentCorners,
  warpPerspectiveCrop,
} from '../../lib/perspectiveTransform';
import { applyImageFilter, loadImageElement } from '../../lib/imageFilters';
import { PdfViewerModal } from '../common/PdfViewerModal';
import { CropModal } from './CropModal';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../core/logger';

export type { ScannedPageItem };

interface CameraScannerProps {
  onDocumentSaved?: () => void;
}

export const CameraScanner: React.FC<CameraScannerProps> = ({ onDocumentSaved }) => {
  const { showToast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torchOn, setTorchOn] = useState(false);
  const [pages, setPages] = useState<ScannedPageItem[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [showShutterFlash, setShowShutterFlash] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [docName, setDocName] = useState(() => generateDefaultDocName('Scan'));

  // Crop & Light Adjustment Modal State
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [currentRawCapture, setCurrentRawCapture] = useState<string | null>(null);
  const [editingPageIndex, setEditingPageIndex] = useState<number | null>(null);

  // PDF Preview State
  const [generatedPdf, setGeneratedPdf] = useState<Uint8Array | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  useEffect(() => {
    let currentStream: MediaStream | null = null;
    let isActive = true;

    async function initCamera() {
      try {
        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: APP_CONFIG.cameraDefaults.idealWidth, min: APP_CONFIG.cameraDefaults.minWidth },
            height: { ideal: APP_CONFIG.cameraDefaults.idealHeight, min: APP_CONFIG.cameraDefaults.minHeight },
          },
          audio: false,
        };

        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!isActive) {
          newStream.getTracks().forEach((track) => track.stop());
          return;
        }

        currentStream = newStream;
        setStream(newStream);
        setHasCameraPermission(true);

        if (videoRef.current) {
          videoRef.current.srcObject = newStream;
          await videoRef.current.play().catch((err) => {
            logger.warn('CameraScanner', 'Auto-play prevented or interrupted', err);
          });
        }
      } catch (err) {
        if (isActive) {
          logger.warn('CameraScanner', 'Camera stream error / permission denied', err);
          setHasCameraPermission(false);
        }
      }
    }

    void initCamera();

    return () => {
      isActive = false;
      if (currentStream) {
        currentStream.getTracks().forEach((track) => track.stop());
      }
      setStream(null);
      setTorchOn(false);
    };
  }, [facingMode]);

  const toggleCameraFacing = () => {
    triggerHaptic(20);
    setTorchOn(false);
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const toggleTorch = async () => {
    if (!stream) return;
    triggerHaptic(20);
    const track = stream.getVideoTracks()[0];
    if (track) {
      const capabilities = (track.getCapabilities && track.getCapabilities()) as any;
      if (capabilities && capabilities.torch) {
        try {
          const nextState = !torchOn;
          await (track as any).applyConstraints({
            advanced: [{ torch: nextState }],
          });
          setTorchOn(nextState);
        } catch (e) {
          logger.error('CameraScanner', 'Torch control failed', e);
          showToast('Flashlight not supported on this lens', 'info');
        }
      } else {
        showToast('Flashlight not available', 'info');
      }
    }
  };

  const handleCapture = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.readyState < 2) {
      showToast('Camera feed is loading, please wait', 'info');
      return;
    }
    setIsCapturing(true);
    triggerHaptic(40);

    // Trigger visual shutter flash
    setShowShutterFlash(true);
    setTimeout(() => setShowShutterFlash(false), 120);

    try {
      const canvas = document.createElement('canvas');
      const w = video.videoWidth;
      const h = video.videoHeight;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, w, h);
        const rawUrl = canvas.toDataURL('image/jpeg', APP_CONFIG.defaultJpegQuality);

        setEditingPageIndex(null);
        setCurrentRawCapture(rawUrl);
        setCropModalOpen(true);
      }
      disposeCanvas(canvas);
    } catch (err) {
      logger.error('CameraScanner', 'Capture error', err);
      showToast('Capture failed', 'error');
    } finally {
      setIsCapturing(false);
    }
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const fileList = Array.from(e.target.files).filter((f) => f.type.startsWith('image/'));
    e.target.value = '';

    if (fileList.length === 0) {
      showToast('Please select image files', 'error');
      return;
    }

    if (fileList.length === 1) {
      // Single file -> Open interactive crop modal
      fileToDataUrl(fileList[0])
        .then((rawUrl) => {
          setEditingPageIndex(null);
          setCurrentRawCapture(rawUrl);
          setCropModalOpen(true);
        })
        .catch((err) => {
          logger.error('CameraScanner', 'Error reading image', err);
          showToast('Failed to load image', 'error');
        });
    } else {
      // Multi-file batch import -> Auto-process and add all directly
      showToast(`Importing ${fileList.length} photos...`, 'info');
      try {
        const newBatch: ScannedPageItem[] = [];

        for (const file of fileList) {
          const rawUrl = await fileToDataUrl(file);

          const img = await loadImageElement(rawUrl);
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const corners = autoDetectDocumentCorners(canvas);
            const croppedCanvas = warpPerspectiveCrop(canvas, corners);
            const processedUrl = await applyImageFilter(croppedCanvas, 'bw_document');

            newBatch.push({
              id: `page_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              originalDataUrl: rawUrl,
              processedDataUrl: processedUrl,
              filter: 'bw_document',
            });

            disposeCanvas(canvas);
            disposeCanvas(croppedCanvas);
          }
        }

        setPages((prev) => [...prev, ...newBatch]);
        showToast(`Added ${newBatch.length} scanned pages!`, 'success');
      } catch (err) {
        logger.error('CameraScanner', 'Error importing batch', err);
        showToast('Error importing photos', 'error');
      }
    }
  };

  const handleApplyCropResult = (
    processedDataUrl: string,
    originalDataUrl: string,
    filter: ScannerFilter
  ) => {
    if (editingPageIndex !== null && pages[editingPageIndex]) {
      setPages((prev) =>
        prev.map((p, idx) =>
          idx === editingPageIndex
            ? { ...p, processedDataUrl, originalDataUrl, filter }
            : p
        )
      );
      showToast('Page updated', 'success');
    } else {
      const newPage: ScannedPageItem = {
        id: `page_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        originalDataUrl,
        processedDataUrl,
        filter,
      };
      setPages((prev) => [...prev, newPage]);
      showToast(`Page ${pages.length + 1} added`, 'success');
    }
  };

  const handleEditPage = (idx: number) => {
    triggerHaptic(20);
    const target = pages[idx];
    if (target) {
      setEditingPageIndex(idx);
      setCurrentRawCapture(target.originalDataUrl);
      setCropModalOpen(true);
    }
  };

  const handleRotatePage = async (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic(25);
    const page = pages[idx];
    if (!page) return;

    try {
      const imgProc = await loadImageElement(page.processedDataUrl);
      const canvasProc = rotateImageCanvas(imgProc, 90);
      const newProcUrl = canvasProc.toDataURL('image/jpeg', 0.94);
      disposeCanvas(canvasProc);

      const imgOrig = await loadImageElement(page.originalDataUrl);
      const canvasOrig = rotateImageCanvas(imgOrig, 90);
      const newOrigUrl = canvasOrig.toDataURL('image/jpeg', 0.94);
      disposeCanvas(canvasOrig);

      setPages((prev) =>
        prev.map((p, i) =>
          i === idx ? { ...p, processedDataUrl: newProcUrl, originalDataUrl: newOrigUrl } : p
        )
      );
      showToast(`Page ${idx + 1} rotated`, 'info');
    } catch (err) {
      logger.error('CameraScanner', 'Error rotating page', err);
    }
  };

  const handleMovePage = (idx: number, direction: 'left' | 'right', e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic(20);
    const targetIndex = direction === 'left' ? idx - 1 : idx + 1;
    setPages((prev) => moveArrayItem(prev, idx, targetIndex));
  };

  const handleDeletePage = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic(30);
    setPages((prev) => prev.filter((_, i) => i !== idx));
    showToast('Page removed', 'info');
  };

  const handleExportPDF = async () => {
    if (pages.length === 0) return;
    setExportingPdf(true);
    try {
      const pdfBytes = await imagesToPDF(
        pages.map((p) => ({ dataUrl: p.processedDataUrl })),
        { pageSize: 'a4', orientation: 'portrait', margin: 15 }
      );

      const finalName = ensurePdfExtension(docName, 'Scan');

      await saveDocumentLocally({
        name: finalName,
        sizeBytes: pdfBytes.byteLength,
        pageCount: pages.length,
        thumbnailUrl: pages[0].processedDataUrl,
        data: pdfBytes,
      });

      if (onDocumentSaved) onDocumentSaved();

      setGeneratedPdf(pdfBytes);
      setIsPreviewOpen(true);
      showToast('PDF created successfully!', 'success');
      triggerCelebration();
    } catch (err) {
      logger.error('CameraScanner', 'Error generating PDF', err);
      showToast('Error generating PDF', 'error');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto space-y-4 pb-28 md:pb-6 animate-in fade-in duration-300">
      {/* Top Controls & Document Name Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/80 p-3 sm:p-4 rounded-2xl border border-slate-800 backdrop-blur-md shadow-md">
        <DocNameInput
          value={docName}
          onChange={setDocName}
          placeholder="Scanned Document"
          className="flex-1"
        />

        {pages.length > 0 && (
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold px-3 py-1.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-xl">
              {pages.length} {pages.length === 1 ? 'page' : 'pages'}
            </span>
            <ActionButton
              onClick={handleExportPDF}
              isLoading={exportingPdf}
              loadingText="Saving..."
              variant="primary"
              size="sm"
            >
              Done & Save PDF
            </ActionButton>
          </div>
        )}
      </div>

      {/* Main Viewfinder / Camera Container */}
      <div className="relative w-full aspect-[3/4] sm:aspect-[4/3] max-h-[55vh] bg-slate-950 rounded-3xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center">
        {/* Shutter flash animation */}
        {showShutterFlash && (
          <div className="absolute inset-0 bg-white z-40 pointer-events-none animate-out fade-out duration-150"></div>
        )}

        {/* Live Camera View */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`w-full h-full object-cover ${
            hasCameraPermission ? 'block' : 'hidden'
          }`}
        />

        {/* Scanner Framing Box Overlay */}
        <div className="absolute inset-6 sm:inset-10 border-2 border-blue-500/50 rounded-2xl pointer-events-none flex flex-col justify-between p-3">
          <div className="flex justify-between">
            <div className="w-6 h-6 border-t-4 border-l-4 border-blue-400 rounded-tl-lg"></div>
            <div className="w-6 h-6 border-t-4 border-r-4 border-blue-400 rounded-tr-lg"></div>
          </div>

          <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_#22d3ee] animate-scan-line"></div>

          <div className="flex justify-between">
            <div className="w-6 h-6 border-b-4 border-l-4 border-blue-400 rounded-bl-lg"></div>
            <div className="w-6 h-6 border-b-4 border-r-4 border-blue-400 rounded-br-lg"></div>
          </div>
        </div>

        {/* Floating Top In-Camera Bar */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
          <div className="px-3.5 py-1.5 bg-black/70 backdrop-blur-md rounded-full border border-white/10 text-xs font-semibold text-white/90 flex items-center space-x-1.5 shadow-lg">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Auto-Cut & Sauvola AI</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={toggleTorch}
              className="p-3 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-white hover:bg-black/90 transition-colors cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
              title="Flash / Torch"
            >
              {torchOn ? <Zap className="w-4 h-4 text-yellow-400" /> : <ZapOff className="w-4 h-4 text-white/70" />}
            </button>
            <button
              type="button"
              onClick={toggleCameraFacing}
              className="p-3 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-white hover:bg-black/90 transition-colors cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
              title="Switch Camera"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Fallback if Camera Permission Denied */}
        {hasCameraPermission === false && (
          <div className="absolute inset-0 bg-slate-900/95 flex flex-col items-center justify-center p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
              <Camera className="w-7 h-7" />
            </div>
            <div className="max-w-xs space-y-1">
              <h4 className="text-base font-bold text-white">Camera Access Offline</h4>
              <p className="text-xs text-slate-400">
                You can capture or upload multiple photos from device gallery.
              </p>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow-lg shadow-blue-600/30 cursor-pointer min-h-[40px]"
            >
              Upload Photos from Gallery
            </button>
          </div>
        )}
      </div>

      {/* Capture Shutter Bar */}
      <div className="flex items-center justify-center space-x-6 py-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple={true}
          className="hidden"
          onChange={handleGalleryUpload}
        />
        <button
          type="button"
          onClick={() => {
            triggerHaptic(20);
            fileInputRef.current?.click();
          }}
          className="flex flex-col items-center justify-center p-3 rounded-2xl bg-slate-900/80 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition-all active:scale-95 cursor-pointer min-w-[56px] min-h-[56px]"
          title="Import multiple from Gallery"
        >
          <Plus className="w-5 h-5 text-blue-400" />
          <span className="text-[10px] font-semibold mt-1">Gallery</span>
        </button>

        {/* Big Shutter Button */}
        <button
          type="button"
          onClick={handleCapture}
          disabled={isCapturing}
          className="relative group p-1 rounded-full bg-gradient-to-tr from-blue-600 via-cyan-400 to-indigo-500 shadow-xl shadow-blue-600/40 hover:scale-105 active:scale-95 transition-all cursor-pointer"
        >
          <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-slate-950 flex items-center justify-center group-hover:bg-slate-900 transition-colors border-2 border-white/20">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white group-hover:bg-blue-400 transition-all flex items-center justify-center text-slate-950">
              <Camera className="w-6 h-6" />
            </div>
          </div>
        </button>

        {/* Clear Batch */}
        {pages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic(20);
              if (window.confirm('Clear all scanned pages?')) {
                setPages([]);
                showToast('Cleared all pages', 'info');
              }
            }}
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-slate-900/80 border border-slate-800 hover:bg-red-500/20 hover:border-red-500/30 text-slate-300 hover:text-red-400 transition-all active:scale-95 cursor-pointer min-w-[56px] min-h-[56px]"
            title="Clear all pages"
          >
            <Trash2 className="w-5 h-5 text-red-400" />
            <span className="text-[10px] font-semibold mt-1">Clear</span>
          </button>
        )}
      </div>

      {/* Scanned Pages Batch Thumbnail Strip with Re-Ordering & Quick Rotate */}
      {pages.length > 0 && (
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-3xl p-4 backdrop-blur-md space-y-3 shadow-xl">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-slate-200">
              Scanned Pages ({pages.length})
            </span>
            <span className="text-[11px] text-slate-400">Tap to edit / re-crop • Use arrows to reorder</span>
          </div>

          <div className="flex items-center space-x-3 overflow-x-auto py-1 pb-2">
            {pages.map((page, idx) => (
              <div
                key={page.id}
                onClick={() => handleEditPage(idx)}
                className="relative flex-shrink-0 w-28 h-38 rounded-2xl overflow-hidden border-2 border-slate-800 hover:border-blue-500 transition-all cursor-pointer group bg-slate-950 flex flex-col justify-between"
              >
                <div className="flex-1 w-full overflow-hidden relative">
                  <img
                    src={page.processedDataUrl}
                    alt={`Page ${idx + 1}`}
                    className="w-full h-full object-contain"
                  />

                  {/* Page Number Badge */}
                  <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/70 text-[10px] font-bold text-white backdrop-blur-sm">
                    {idx + 1}
                  </div>

                  {/* Quick Rotate Button */}
                  <button
                    type="button"
                    onClick={(e) => handleRotatePage(idx, e)}
                    className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-black/70 hover:bg-blue-600 text-white transition-colors cursor-pointer"
                    title="Rotate 90°"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>

                  {/* Crop badge */}
                  <div className="absolute bottom-1.5 left-1.5 p-0.5 px-1.5 rounded-md bg-blue-600/90 text-white text-[9px] font-semibold flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Crop className="w-2.5 h-2.5" />
                    <span>Crop</span>
                  </div>
                </div>

                {/* Bottom reorder bar */}
                <div className="p-1.5 bg-slate-900 border-t border-slate-800 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={(e) => handleMovePage(idx, 'left', e)}
                    disabled={idx === 0}
                    className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer min-w-[24px] min-h-[24px] flex items-center justify-center"
                    title="Move Left"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleDeletePage(idx, e)}
                    className="p-1 rounded text-red-400 hover:text-red-300 hover:bg-red-500/10 cursor-pointer min-w-[24px] min-h-[24px] flex items-center justify-center"
                    title="Delete page"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleMovePage(idx, 'right', e)}
                    disabled={idx === pages.length - 1}
                    className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer min-w-[24px] min-h-[24px] flex items-center justify-center"
                    title="Move Right"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Auto-Cut & Light Adjust Modal */}
      <CropModal
        isOpen={cropModalOpen}
        imageSrc={currentRawCapture}
        onClose={() => setCropModalOpen(false)}
        onApplyCrop={handleApplyCropResult}
      />

      {/* PDF Full Preview Modal */}
      <PdfViewerModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        pdfData={generatedPdf}
        filename={ensurePdfExtension(docName, 'Scan')}
      />
    </div>
  );
};

