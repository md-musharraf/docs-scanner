import React, { useRef, useState, useEffect } from 'react';
import {
  Wand2,
  Maximize,
  RotateCw,
  Sun,
  Check,
  X,
} from 'lucide-react';
import {
  autoDetectDocumentCorners,
  calculateDefaultCorners,
  warpPerspectiveCrop,
} from '../../lib/perspectiveTransform';
import type { CornerQuad, ScannerFilter } from '../../core/types';
import { applyImageFilter, loadImageElement } from '../../lib/imageFilters';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../core/logger';

interface CropModalProps {
  isOpen: boolean;
  imageSrc: string | null;
  onClose: () => void;
  onApplyCrop: (processedDataUrl: string, originalDataUrl: string, filter: ScannerFilter) => void;
}

export const CropModal: React.FC<CropModalProps> = ({
  isOpen,
  imageSrc,
  onClose,
  onApplyCrop,
}) => {
  const { showToast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement>(null);

  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number; left: number; top: number }>({
    width: 0,
    height: 0,
    left: 0,
    top: 0,
  });

  const [corners, setCorners] = useState<CornerQuad | null>(null);
  const [draggingCorner, setDraggingCorner] = useState<keyof CornerQuad | null>(null);
  const [dragClientPos, setDragClientPos] = useState<{ x: number; y: number } | null>(null);
  const [activeFilter, setActiveFilter] = useState<ScannerFilter>('bw_document');
  const [autoLight, setAutoLight] = useState(true);
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [rotationAngle, setRotationAngle] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showLightingControls, setShowLightingControls] = useState(false);

  // Load and auto-detect corners on open
  useEffect(() => {
    if (!isOpen || !imageSrc) return;
    let isMounted = true;

    loadImageElement(imageSrc)
      .then((img) => {
        if (!isMounted) return;
        setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const detected = autoDetectDocumentCorners(canvas);
          if (isMounted) setCorners(detected);
        }
        canvas.width = 0;
        canvas.height = 0;
      })
      .catch((err) => {
        if (isMounted) {
          logger.error('CropModal', 'Error loading image in crop modal', err);
          showToast('Could not load image for crop', 'error');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, imageSrc, showToast]);

  // Recalculate display size on window resize
  useEffect(() => {
    const updateBounds = () => {
      if (imageRef.current) {
        const rect = imageRef.current.getBoundingClientRect();
        setDisplaySize({
          width: rect.width,
          height: rect.height,
          left: rect.left,
          top: rect.top,
        });
      }
    };

    updateBounds();
    window.addEventListener('resize', updateBounds);
    return () => window.removeEventListener('resize', updateBounds);
  }, [naturalSize, rotationAngle]);

  // Update Magnifying Loupe Canvas on Drag
  useEffect(() => {
    if (!draggingCorner || !corners || !imageRef.current || !loupeCanvasRef.current) return;

    const loupe = loupeCanvasRef.current;
    const lCtx = loupe.getContext('2d');
    if (!lCtx) return;

    const pt = corners[draggingCorner];
    const zoom = 2.5;
    const loupeSize = 100;
    loupe.width = loupeSize;
    loupe.height = loupeSize;

    lCtx.clearRect(0, 0, loupeSize, loupeSize);

    // Draw zoomed portion of source image
    const sourceRadius = (loupeSize / zoom) / 2;
    lCtx.drawImage(
      imageRef.current,
      pt.x - sourceRadius,
      pt.y - sourceRadius,
      sourceRadius * 2,
      sourceRadius * 2,
      0,
      0,
      loupeSize,
      loupeSize
    );

    // Draw Crosshair in Loupe
    lCtx.strokeStyle = '#38bdf8';
    lCtx.lineWidth = 1.5;
    lCtx.beginPath();
    lCtx.moveTo(loupeSize / 2, 0);
    lCtx.lineTo(loupeSize / 2, loupeSize);
    lCtx.moveTo(0, loupeSize / 2);
    lCtx.lineTo(loupeSize, loupeSize / 2);
    lCtx.stroke();

    // Center dot
    lCtx.fillStyle = '#ef4444';
    lCtx.beginPath();
    lCtx.arc(loupeSize / 2, loupeSize / 2, 3, 0, Math.PI * 2);
    lCtx.fill();
  }, [draggingCorner, corners]);

  const toDisplayX = (x: number) => {
    if (!naturalSize.width) return x;
    return (x / naturalSize.width) * displaySize.width;
  };

  const toDisplayY = (y: number) => {
    if (!naturalSize.height) return y;
    return (y / naturalSize.height) * displaySize.height;
  };

  const toNaturalX = (clientX: number) => {
    if (!displaySize.width) return 0;
    const relX = clientX - displaySize.left;
    const clamped = Math.max(0, Math.min(displaySize.width, relX));
    return (clamped / displaySize.width) * naturalSize.width;
  };

  const toNaturalY = (clientY: number) => {
    if (!displaySize.height) return 0;
    const relY = clientY - displaySize.top;
    const clamped = Math.max(0, Math.min(displaySize.height, relY));
    return (clamped / displaySize.height) * naturalSize.height;
  };

  const handlePointerDown = (cornerKey: keyof CornerQuad, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingCorner(cornerKey);
    setDragClientPos({ x: e.clientX, y: e.clientY });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingCorner || !corners) return;
    e.preventDefault();
    setDragClientPos({ x: e.clientX, y: e.clientY });

    const natX = toNaturalX(e.clientX);
    const natY = toNaturalY(e.clientY);

    setCorners((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [draggingCorner]: { x: natX, y: natY },
      };
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (draggingCorner) {
      setDraggingCorner(null);
      setDragClientPos(null);
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Pointer capture release safeguard
      }
    }
  };

  const handleAutoDetect = () => {
    if (!imageSrc || !naturalSize.width) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const detected = autoDetectDocumentCorners(canvas);
        setCorners(detected);
      }
      canvas.width = 0;
      canvas.height = 0;
      showToast('Document corners detected', 'info');
    };
    img.src = imageSrc;
  };

  const handleResetFull = () => {
    if (!naturalSize.width) return;
    setCorners(calculateDefaultCorners(naturalSize.width, naturalSize.height, 0.01));
    showToast('Reset to full frame', 'info');
  };

  const handleRotate = () => {
    setRotationAngle((prev) => (prev + 90) % 360);
  };

  const handleConfirm = async () => {
    if (!imageSrc || !corners) return;
    setIsProcessing(true);

    try {
      const img = await loadImageElement(imageSrc);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No canvas context');

      ctx.drawImage(img, 0, 0);

      // 1. Perspective Transform Auto-Cut
      const croppedCanvas = warpPerspectiveCrop(canvas, corners);

      // 2. Handle Rotation if applied
      let finalCanvas = croppedCanvas;
      if (rotationAngle !== 0) {
        const rotCanvas = document.createElement('canvas');
        const rotCtx = rotCanvas.getContext('2d');
        if (rotationAngle === 90 || rotationAngle === 270) {
          rotCanvas.width = croppedCanvas.height;
          rotCanvas.height = croppedCanvas.width;
        } else {
          rotCanvas.width = croppedCanvas.width;
          rotCanvas.height = croppedCanvas.height;
        }

        if (rotCtx) {
          rotCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
          rotCtx.rotate((rotationAngle * Math.PI) / 180);
          rotCtx.drawImage(croppedCanvas, -croppedCanvas.width / 2, -croppedCanvas.height / 2);
          finalCanvas = rotCanvas;
        }
      }

      // 3. Apply Document Filters & Auto Light Shadow Removal
      const processedUrl = await applyImageFilter(finalCanvas, {
        filter: activeFilter,
        autoLight,
        brightness,
        contrast,
      });

      const croppedOriginalUrl = finalCanvas.toDataURL('image/jpeg', 0.94);

      // Clean memory
      canvas.width = 0;
      canvas.height = 0;
      if (finalCanvas !== canvas) {
        finalCanvas.width = 0;
        finalCanvas.height = 0;
      }

      onApplyCrop(processedUrl, croppedOriginalUrl, activeFilter);
      onClose();
    } catch (err) {
      logger.error('CropModal', 'Error applying crop & filter', err);
      showToast('Error applying crop and filters', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen || !imageSrc) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/98 backdrop-blur-2xl animate-in fade-in duration-200 h-[100dvh] overflow-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between px-3 py-2 sm:px-4 sm:py-3 border-b border-slate-800 bg-slate-900/90 pt-[max(env(safe-area-inset-top),10px)] flex-shrink-0">
        <div className="flex items-center space-x-2 min-w-0">
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5 truncate">
              Auto-Cut & Enhance <span className="text-[9px] px-1 py-0.2 rounded bg-blue-500/20 text-blue-400 font-bold border border-blue-500/30">AI</span>
            </h3>
            <p className="text-[10px] text-slate-400 truncate">Drag corners to adjust boundary</p>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={handleConfirm}
          disabled={isProcessing}
          className="flex items-center space-x-1 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-blue-600/30 active:scale-95 transition-all cursor-pointer disabled:opacity-50 flex-shrink-0"
        >
          {isProcessing ? (
            <span>Processing...</span>
          ) : (
            <>
              <Check className="w-4 h-4" />
              <span>Apply</span>
            </>
          )}
        </button>
      </div>

      {/* Main Image Crop Canvas Area */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-hidden relative flex items-center justify-center p-2 sm:p-4 select-none touch-none"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="relative max-w-full max-h-[48vh] sm:max-h-[58vh] inline-block">
          <img
            ref={imageRef}
            src={imageSrc}
            alt="Source scan"
            onLoad={() => {
              if (imageRef.current) {
                const rect = imageRef.current.getBoundingClientRect();
                setDisplaySize({
                  width: rect.width,
                  height: rect.height,
                  left: rect.left,
                  top: rect.top,
                });
              }
            }}
            style={{ transform: `rotate(${rotationAngle}deg)` }}
            className="max-w-full max-h-[48vh] sm:max-h-[58vh] object-contain rounded-xl shadow-2xl transition-transform duration-200"
          />

          {/* Draggable 4-Corner Overlay */}
          {corners && displaySize.width > 0 && (
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox={`0 0 ${displaySize.width} ${displaySize.height}`}
            >
              {/* Outer darkened mask around cropped polygon */}
              <polygon
                points={`
                  0,0 ${displaySize.width},0 ${displaySize.width},${displaySize.height} 0,${displaySize.height} 0,0
                  ${toDisplayX(corners.topLeft.x)},${toDisplayY(corners.topLeft.y)}
                  ${toDisplayX(corners.bottomLeft.x)},${toDisplayY(corners.bottomLeft.y)}
                  ${toDisplayX(corners.bottomRight.x)},${toDisplayY(corners.bottomRight.y)}
                  ${toDisplayX(corners.topRight.x)},${toDisplayY(corners.topRight.y)}
                `}
                fill="rgba(0, 0, 0, 0.5)"
                fillRule="evenodd"
              />

              {/* Glowing Quad Boundary Lines */}
              <polygon
                points={`
                  ${toDisplayX(corners.topLeft.x)},${toDisplayY(corners.topLeft.y)}
                  ${toDisplayX(corners.topRight.x)},${toDisplayY(corners.topRight.y)}
                  ${toDisplayX(corners.bottomRight.x)},${toDisplayY(corners.bottomRight.y)}
                  ${toDisplayX(corners.bottomLeft.x)},${toDisplayY(corners.bottomLeft.y)}
                `}
                fill="rgba(59, 130, 246, 0.08)"
                stroke="#38bdf8"
                strokeWidth="2.5"
                strokeDasharray="4 2"
              />
            </svg>
          )}

          {/* Draggable Corner Handles */}
          {corners && displaySize.width > 0 && (
            <>
              {(
                [
                  { key: 'topLeft' as const, label: 'TL' },
                  { key: 'topRight' as const, label: 'TR' },
                  { key: 'bottomRight' as const, label: 'BR' },
                  { key: 'bottomLeft' as const, label: 'BL' },
                ] as const
              ).map(({ key }) => {
                const pt = corners[key];
                const dx = toDisplayX(pt.x);
                const dy = toDisplayY(pt.y);
                const isDragging = draggingCorner === key;

                return (
                  <div
                    key={key}
                    onPointerDown={(e) => handlePointerDown(key, e)}
                    style={{
                      left: `${dx}px`,
                      top: `${dy}px`,
                      transform: 'translate(-50%, -50%)',
                    }}
                    className={`absolute z-30 w-12 h-12 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none ${
                      isDragging ? 'scale-125' : ''
                    }`}
                  >
                    <div className="w-7 h-7 rounded-full bg-blue-600 border-2 border-white shadow-[0_0_15px_#38bdf8] flex items-center justify-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse"></div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Magnifying Loupe */}
        {draggingCorner && dragClientPos && (
          <div
            style={{
              left: `${dragClientPos.x}px`,
              top: `${dragClientPos.y - 75}px`,
              transform: 'translate(-50%, -50%)',
            }}
            className="fixed z-50 pointer-events-none rounded-full overflow-hidden border-3 border-blue-400 shadow-[0_0_20px_rgba(56,189,248,0.6)] bg-black"
          >
            <canvas ref={loupeCanvasRef} className="w-24 h-24 block" />
          </div>
        )}
      </div>

      {/* Quick Toolbar */}
      <div className="bg-slate-900/95 border-t border-slate-800 p-3 space-y-3 pb-[max(env(safe-area-inset-bottom),12px)]">
        <div className="flex items-center justify-between gap-2 max-w-lg mx-auto">
          <button
            onClick={handleAutoDetect}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 text-xs font-semibold hover:bg-blue-600/30 active:scale-95 transition-all cursor-pointer"
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span>Auto Cut</span>
          </button>

          <button
            onClick={handleResetFull}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 active:scale-95 transition-all cursor-pointer"
          >
            <Maximize className="w-3.5 h-3.5" />
            <span>Full Page</span>
          </button>

          <button
            onClick={handleRotate}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 active:scale-95 transition-all cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Rotate</span>
          </button>

          <button
            onClick={() => setShowLightingControls((prev) => !prev)}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all active:scale-95 cursor-pointer ${
              showLightingControls || autoLight
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-slate-800 text-slate-300 border-slate-700'
            }`}
          >
            <Sun className="w-3.5 h-3.5 text-amber-400" />
            <span>Light</span>
          </button>
        </div>

        {/* Lighting & Contrast Adjustments */}
        {showLightingControls && (
          <div className="bg-slate-950/90 border border-slate-800 p-3 rounded-2xl space-y-2.5 max-w-lg mx-auto animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-2 text-xs font-semibold text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoLight}
                  onChange={(e) => setAutoLight(e.target.checked)}
                  className="rounded text-blue-500 accent-blue-600 cursor-pointer"
                />
                <span>Equalize Illumination & Whiten Paper</span>
              </label>
              <span className="text-[10px] text-emerald-400 font-semibold">AI Enabled</span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Brightness</span>
                  <span>{brightness > 0 ? `+${brightness}` : brightness}</span>
                </div>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={brightness}
                  onChange={(e) => setBrightness(parseInt(e.target.value, 10))}
                  className="w-full accent-blue-500 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Contrast</span>
                  <span>{contrast > 0 ? `+${contrast}` : contrast}</span>
                </div>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={contrast}
                  onChange={(e) => setContrast(parseInt(e.target.value, 10))}
                  className="w-full accent-blue-500 cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}

        {/* Filter Presets */}
        <div className="grid grid-cols-4 gap-2 max-w-lg mx-auto">
          {[
            { id: 'bw_document' as ScannerFilter, label: 'Magic B&W' },
            { id: 'magic_color' as ScannerFilter, label: 'Magic Color' },
            { id: 'grayscale' as ScannerFilter, label: 'Grayscale' },
            { id: 'original' as ScannerFilter, label: 'Original' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id)}
              className={`py-1.5 px-2 rounded-xl text-center text-xs font-semibold border transition-all cursor-pointer ${
                activeFilter === f.id
                  ? 'bg-blue-600/25 border-blue-500 text-white shadow-sm'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
