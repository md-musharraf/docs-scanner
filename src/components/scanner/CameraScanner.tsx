import React, { useRef, useState, useEffect } from 'react';
import {
  Camera,
  RefreshCw,
  Zap,
  ZapOff,
  Trash2,
  Plus,
  FileCheck,
  Crop,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import type { ScannerFilter } from '../../lib/imageFilters';
import { imagesToPDF } from '../../lib/pdfEngine';
import { saveDocumentLocally } from '../../lib/storage';
import { PdfViewerModal } from '../common/PdfViewerModal';
import { CropModal } from './CropModal';

export interface ScannedPageItem {
  id: string;
  originalDataUrl: string;
  processedDataUrl: string;
  filter: ScannerFilter;
}

interface CameraScannerProps {
  onDocumentSaved?: () => void;
}

export const CameraScanner: React.FC<CameraScannerProps> = ({ onDocumentSaved }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torchOn, setTorchOn] = useState(false);
  const [pages, setPages] = useState<ScannedPageItem[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [docName, setDocName] = useState(`Scan_${new Date().toISOString().slice(0, 10)}`);

  // Crop & Light Adjustment Modal State
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [currentRawCapture, setCurrentRawCapture] = useState<string | null>(null);
  const [editingPageIndex, setEditingPageIndex] = useState<number | null>(null);

  // PDF Preview State
  const [generatedPdf, setGeneratedPdf] = useState<Uint8Array | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [facingMode]);

  const startCamera = async () => {
    stopCamera();
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 3840, min: 1280 },
          height: { ideal: 2160, min: 720 },
        },
        audio: false,
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(newStream);
      setHasCameraPermission(true);

      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        await videoRef.current.play();
      }
    } catch (err) {
      console.warn('Camera stream error / no permission:', err);
      setHasCameraPermission(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  const toggleCameraFacing = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const toggleTorch = async () => {
    if (!stream) return;
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
          console.error('Torch error:', e);
        }
      }
    }
  };

  // Capture High-Res Snapshot and open Crop & Auto-Light modal
  const handleCapture = async () => {
    if (!videoRef.current) return;
    setIsCapturing(true);
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1920;
      canvas.height = video.videoHeight || 1080;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const rawUrl = canvas.toDataURL('image/jpeg', 0.98);

        setEditingPageIndex(null);
        setCurrentRawCapture(rawUrl);
        setCropModalOpen(true);
      }
    } catch (err) {
      console.error('Capture error:', err);
    } finally {
      setIsCapturing(false);
    }
  };

  // Upload photo from gallery
  const handleGalleryUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const rawUrl = event.target?.result as string;
        setEditingPageIndex(null);
        setCurrentRawCapture(rawUrl);
        setCropModalOpen(true);
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    }
  };

  // Applied Crop & Filter callback from CropModal
  const handleApplyCropResult = (
    processedDataUrl: string,
    originalDataUrl: string,
    filter: ScannerFilter
  ) => {
    if (editingPageIndex !== null && pages[editingPageIndex]) {
      // Update existing page
      setPages((prev) =>
        prev.map((p, idx) =>
          idx === editingPageIndex
            ? { ...p, processedDataUrl, originalDataUrl, filter }
            : p
        )
      );
    } else {
      // Add new page to batch
      const newPage: ScannedPageItem = {
        id: `page_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        originalDataUrl,
        processedDataUrl,
        filter,
      };
      setPages((prev) => [...prev, newPage]);
    }
  };

  // Re-edit a scanned page
  const handleEditPage = (idx: number) => {
    const target = pages[idx];
    if (target) {
      setEditingPageIndex(idx);
      setCurrentRawCapture(target.originalDataUrl);
      setCropModalOpen(true);
    }
  };

  // Delete page
  const handleDeletePage = (idx: number) => {
    setPages((prev) => prev.filter((_, i) => i !== idx));
  };

  // Generate & Save PDF
  const handleExportPDF = async () => {
    if (pages.length === 0) return;
    setExportingPdf(true);
    try {
      const pdfBytes = await imagesToPDF(
        pages.map((p) => ({ dataUrl: p.processedDataUrl })),
        { pageSize: 'a4', orientation: 'portrait', margin: 15 }
      );

      const finalName = docName.endsWith('.pdf') ? docName : `${docName}.pdf`;

      // Save to offline storage
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

      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.7 },
      });
    } catch (err) {
      console.error('Error generating PDF:', err);
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto space-y-4 pb-20 md:pb-6">
      {/* Top Controls & Document Name Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/80 p-3 rounded-2xl border border-slate-800 backdrop-blur-md">
        <div className="flex items-center space-x-2 flex-1 min-w-[200px]">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Doc:</span>
          <input
            type="text"
            value={docName}
            onChange={(e) => setDocName(e.target.value)}
            placeholder="Document Name"
            className="bg-slate-950/80 border border-slate-800 text-slate-100 px-3 py-1.5 rounded-xl text-sm focus:outline-none focus:border-blue-500 flex-1"
          />
        </div>

        {pages.length > 0 && (
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold px-2.5 py-1 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg">
              {pages.length} {pages.length === 1 ? 'page' : 'pages'}
            </span>
            <button
              onClick={handleExportPDF}
              disabled={exportingPdf}
              className="flex items-center space-x-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-blue-600/30 transition-all active:scale-95 cursor-pointer"
            >
              {exportingPdf ? (
                <span>Generating...</span>
              ) : (
                <>
                  <FileCheck className="w-4 h-4" />
                  <span>Done & Save PDF</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Main Viewfinder / Camera Container */}
      <div className="relative w-full aspect-[3/4] sm:aspect-[4/3] max-h-[55vh] bg-slate-950 rounded-3xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center">
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
          <div className="px-3 py-1 bg-black/60 backdrop-blur-md rounded-full border border-white/10 text-xs font-semibold text-white/90 flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            <span>Auto-Cut & Light AI</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={toggleTorch}
              className="p-2.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white hover:bg-black/80 transition-colors cursor-pointer"
              title="Flash / Torch"
            >
              {torchOn ? <Zap className="w-4 h-4 text-yellow-400" /> : <ZapOff className="w-4 h-4 text-white/70" />}
            </button>
            <button
              onClick={toggleCameraFacing}
              className="p-2.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white hover:bg-black/80 transition-colors cursor-pointer"
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
              <h4 className="text-base font-semibold text-white">Camera Access Offline</h4>
              <p className="text-xs text-slate-400">
                You can capture or upload photos from device gallery.
              </p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-lg shadow-blue-600/30 cursor-pointer"
            >
              Upload Photo from Gallery
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
          className="hidden"
          onChange={handleGalleryUpload}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center p-3 rounded-2xl bg-slate-900/80 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition-all active:scale-95 cursor-pointer"
          title="Import from Gallery"
        >
          <Plus className="w-5 h-5 text-blue-400" />
          <span className="text-[10px] font-semibold mt-1">Gallery</span>
        </button>

        {/* Big Shutter Button */}
        <button
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
            onClick={() => {
              if (confirm('Clear all scanned pages?')) {
                setPages([]);
              }
            }}
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-slate-900/80 border border-slate-800 hover:bg-red-500/20 hover:border-red-500/30 text-slate-300 hover:text-red-400 transition-all active:scale-95 cursor-pointer"
            title="Clear all pages"
          >
            <Trash2 className="w-5 h-5 text-red-400" />
            <span className="text-[10px] font-semibold mt-1">Clear</span>
          </button>
        )}
      </div>

      {/* Scanned Pages Batch Thumbnail Strip */}
      {pages.length > 0 && (
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-3 backdrop-blur-md space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-slate-300">
              Scanned Pages ({pages.length})
            </span>
            <span className="text-[11px] text-slate-500">Tap page to re-crop or adjust light</span>
          </div>

          <div className="flex items-center space-x-3 overflow-x-auto py-1 pb-2">
            {pages.map((page, idx) => (
              <div
                key={page.id}
                onClick={() => handleEditPage(idx)}
                className="relative flex-shrink-0 w-24 h-32 rounded-xl overflow-hidden border-2 border-slate-800 hover:border-blue-500 transition-all cursor-pointer group bg-slate-950"
              >
                <img
                  src={page.processedDataUrl}
                  alt={`Page ${idx + 1}`}
                  className="w-full h-full object-cover"
                />

                {/* Page Number Badge */}
                <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/70 text-[10px] font-bold text-white backdrop-blur-sm">
                  {idx + 1}
                </div>

                {/* Edit / Crop Indicator */}
                <div className="absolute bottom-1.5 left-1.5 p-1 rounded bg-blue-600/80 text-white text-[9px] font-semibold flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Crop className="w-3 h-3" />
                  <span>Crop</span>
                </div>

                {/* Delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeletePage(idx);
                  }}
                  className="absolute top-1.5 right-1.5 p-1 rounded bg-red-600/80 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  title="Remove page"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
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
        filename={docName.endsWith('.pdf') ? docName : `${docName}.pdf`}
      />
    </div>
  );
};
