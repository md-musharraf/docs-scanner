import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Wand2,
  Maximize,
  RotateCw,
  Sun,
  Check,
  X,
  Sparkles,
} from 'lucide-react';
import {
  autoDetectDocumentCorners,
  calculateDefaultCorners,
  warpPerspectiveCrop,
} from '../../lib/perspectiveTransform';
import type { CornerQuad, ScannerFilter, Point } from '../../core/types';
import {
  rotateQuad,
  getQuadMidpoints,
  clampPoint,
  rotateImageCanvas,
  disposeCanvas,
} from '../../utils/geometry';
import { triggerHaptic } from '../../utils/formatters';
import { applyImageFilter, loadImageElement } from '../../lib/imageFilters';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../core/logger';

interface CropModalProps {
  isOpen: boolean;
  imageSrc: string | null;
  onClose: () => void;
  onApplyCrop: (processedDataUrl: string, originalDataUrl: string, filter: ScannerFilter) => void;
}

type DragTarget =
  | { type: 'corner'; key: keyof CornerQuad }
  | { type: 'edge'; key: 'top' | 'right' | 'bottom' | 'left'; startPos: Point; startCorners: CornerQuad }
  | null;

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

  const [rotatedSrc, setRotatedSrc] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number; left: number; top: number }>({
    width: 0,
    height: 0,
    left: 0,
    top: 0,
  });

  const currentSrc = rotatedSrc || imageSrc;

  const [corners, setCorners] = useState<CornerQuad | null>(null);
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);
  const [dragClientPos, setDragClientPos] = useState<{ x: number; y: number } | null>(null);
  const [activeFilter, setActiveFilter] = useState<ScannerFilter>('bw_document');
  const [autoLight, setAutoLight] = useState(true);
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [sauvolaSensitivity, setSauvolaSensitivity] = useState(0.20);
  const [aspectRatioPreset, setAspectRatioPreset] = useState<'free' | 'a4' | 'id_card' | 'square'>('free');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showLightingControls, setShowLightingControls] = useState(false);

  const applyAspectRatio = (ratioType: 'free' | 'a4' | 'id_card' | 'square') => {
    triggerHaptic(20);
    setAspectRatioPreset(ratioType);
    if (!naturalSize.width || !naturalSize.height) return;

    if (ratioType === 'free') {
      return;
    }

    let targetRatio = 1.0;
    if (ratioType === 'a4') targetRatio = 1 / 1.4142; // W/H
    if (ratioType === 'id_card') targetRatio = 85.6 / 53.98; // W/H
    if (ratioType === 'square') targetRatio = 1.0;

    const imgW = naturalSize.width;
    const imgH = naturalSize.height;

    let boxW = imgW * 0.88;
    let boxH = boxW / targetRatio;

    if (boxH > imgH * 0.88) {
      boxH = imgH * 0.88;
      boxW = boxH * targetRatio;
    }

    const offsetX = (imgW - boxW) / 2;
    const offsetY = (imgH - boxH) / 2;

    setCorners({
      topLeft: { x: offsetX, y: offsetY },
      topRight: { x: offsetX + boxW, y: offsetY },
      bottomRight: { x: offsetX + boxW, y: offsetY + boxH },
      bottomLeft: { x: offsetX, y: offsetY + boxH },
    });

    showToast(`Applied ${ratioType.toUpperCase()} aspect boundary`, 'info');
  };

  // Load image and detect corners
  useEffect(() => {
    if (!isOpen || !imageSrc) return;
    let isMounted = true;

    loadImageElement(imageSrc)
      .then((img) => {
        if (!isMounted) return;
        setRotatedSrc(null);
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        setNaturalSize({ width: w, height: h });

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const detected = autoDetectDocumentCorners(canvas);
          if (isMounted) setCorners(detected);
        }
        disposeCanvas(canvas);
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

  // Recalculate display bounds
  const updateBounds = useCallback(() => {
    if (imageRef.current) {
      const rect = imageRef.current.getBoundingClientRect();
      setDisplaySize({
        width: rect.width,
        height: rect.height,
        left: rect.left,
        top: rect.top,
      });
    }
  }, []);

  useEffect(() => {
    updateBounds();
    window.addEventListener('resize', updateBounds);
    return () => window.removeEventListener('resize', updateBounds);
  }, [naturalSize, currentSrc, updateBounds]);

  // Update Magnifying Loupe Canvas on Drag
  useEffect(() => {
    if (!dragTarget || !corners || !imageRef.current || !loupeCanvasRef.current) return;

    const loupe = loupeCanvasRef.current;
    const lCtx = loupe.getContext('2d');
    if (!lCtx) return;

    let targetPt: Point;
    if (dragTarget.type === 'corner') {
      targetPt = corners[dragTarget.key];
    } else {
      const midpoints = getQuadMidpoints(corners);
      targetPt = midpoints[dragTarget.key];
    }

    const zoom = 2.5;
    const loupeSize = 110;
    loupe.width = loupeSize;
    loupe.height = loupeSize;

    lCtx.fillStyle = '#0f172a';
    lCtx.fillRect(0, 0, loupeSize, loupeSize);
    lCtx.imageSmoothingEnabled = true;
    lCtx.imageSmoothingQuality = 'high';

    // Draw zoomed source section
    const sourceRadius = (loupeSize / zoom) / 2;
    lCtx.drawImage(
      imageRef.current,
      targetPt.x - sourceRadius,
      targetPt.y - sourceRadius,
      sourceRadius * 2,
      sourceRadius * 2,
      0,
      0,
      loupeSize,
      loupeSize
    );

    // Crosshairs
    lCtx.strokeStyle = '#38bdf8';
    lCtx.lineWidth = 1.5;
    lCtx.beginPath();
    lCtx.moveTo(loupeSize / 2, 0);
    lCtx.lineTo(loupeSize / 2, loupeSize);
    lCtx.moveTo(0, loupeSize / 2);
    lCtx.lineTo(loupeSize, loupeSize / 2);
    lCtx.stroke();

    // Center focal point
    lCtx.fillStyle = '#ef4444';
    lCtx.beginPath();
    lCtx.arc(loupeSize / 2, loupeSize / 2, 3.5, 0, Math.PI * 2);
    lCtx.fill();
  }, [dragTarget, corners]);

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

  const handleCornerPointerDown = (cornerKey: keyof CornerQuad, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    triggerHaptic(20);
    setDragTarget({ type: 'corner', key: cornerKey });
    setDragClientPos({ x: e.clientX, y: e.clientY });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleEdgePointerDown = (key: 'top' | 'right' | 'bottom' | 'left', e: React.PointerEvent) => {
    if (!corners) return;
    e.stopPropagation();
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
    triggerHaptic(20);
    const startPos = {
      x: toNaturalX(e.clientX),
      y: toNaturalY(e.clientY),
    };

    setDragTarget({
      type: 'edge',
      key,
      startPos,
      startCorners: { ...corners },
    });
    setDragClientPos({ x: e.clientX, y: e.clientY });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragTarget || !corners || displaySize.width <= 0) return;

    const clientX = e.clientX;
    const clientY = e.clientY;
    setDragClientPos({ x: clientX, y: clientY });

    const natX = toNaturalX(clientX);
    const natY = toNaturalY(clientY);

    if (dragTarget.type === 'corner') {
      const clamped = clampPoint({ x: natX, y: natY }, naturalSize.width, naturalSize.height);
      setCorners((prev) => (prev ? { ...prev, [dragTarget.key]: clamped } : prev));
    } else {
      // Edge drag
      const dx = natX - dragTarget.startPos.x;
      const dy = natY - dragTarget.startPos.y;
      const base = dragTarget.startCorners;

      setCorners((prev) => {
        if (!prev) return prev;
        const updated = { ...prev };
        if (dragTarget.key === 'top') {
          updated.topLeft = clampPoint({ x: base.topLeft.x + dx, y: base.topLeft.y + dy }, naturalSize.width, naturalSize.height);
          updated.topRight = clampPoint({ x: base.topRight.x + dx, y: base.topRight.y + dy }, naturalSize.width, naturalSize.height);
        } else if (dragTarget.key === 'right') {
          updated.topRight = clampPoint({ x: base.topRight.x + dx, y: base.topRight.y + dy }, naturalSize.width, naturalSize.height);
          updated.bottomRight = clampPoint({ x: base.bottomRight.x + dx, y: base.bottomRight.y + dy }, naturalSize.width, naturalSize.height);
        } else if (dragTarget.key === 'bottom') {
          updated.bottomLeft = clampPoint({ x: base.bottomLeft.x + dx, y: base.bottomLeft.y + dy }, naturalSize.width, naturalSize.height);
          updated.bottomRight = clampPoint({ x: base.bottomRight.x + dx, y: base.bottomRight.y + dy }, naturalSize.width, naturalSize.height);
        } else if (dragTarget.key === 'left') {
          updated.topLeft = clampPoint({ x: base.topLeft.x + dx, y: base.topLeft.y + dy }, naturalSize.width, naturalSize.height);
          updated.bottomLeft = clampPoint({ x: base.bottomLeft.x + dx, y: base.bottomLeft.y + dy }, naturalSize.width, naturalSize.height);
        }
        return updated;
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragTarget) {
      setDragTarget(null);
      setDragClientPos(null);
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Pointer capture safeguard
      }
    }
  };

  const handleAutoDetect = async () => {
    triggerHaptic(25);
    if (!currentSrc || !naturalSize.width) return;
    try {
      const img = await loadImageElement(currentSrc);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const detected = autoDetectDocumentCorners(canvas);
        setCorners(detected);
      }
      disposeCanvas(canvas);
      showToast('Document boundary auto-detected', 'success');
    } catch (err) {
      logger.error('CropModal', 'Auto detect error', err);
    }
  };

  const handleResetFull = () => {
    triggerHaptic(20);
    if (!naturalSize.width) return;
    setCorners(calculateDefaultCorners(naturalSize.width, naturalSize.height, 0.01));
    showToast('Reset to full frame', 'info');
  };

  const handleRotate = async () => {
    triggerHaptic(25);
    if (!corners || !currentSrc || !naturalSize.width) return;

    try {
      const img = await loadImageElement(currentSrc);
      const rotatedCanvas = rotateImageCanvas(img, 90);
      const rotatedDataUrl = rotatedCanvas.toDataURL('image/jpeg', 0.94);
      disposeCanvas(rotatedCanvas);

      const nextQuad = rotateQuad(corners, 90, naturalSize.width, naturalSize.height);
      setCorners(nextQuad);
      setNaturalSize({ width: naturalSize.height, height: naturalSize.width });
      setRotatedSrc(rotatedDataUrl);
    } catch (err) {
      logger.error('CropModal', 'Error rotating image in crop modal', err);
    }
  };

  const handleConfirm = async () => {
    if (!currentSrc || !corners) return;
    setIsProcessing(true);
    triggerHaptic(30);

    try {
      const img = await loadImageElement(currentSrc);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No canvas context');

      ctx.drawImage(img, 0, 0);

      // 1. Perspective Transform Auto-Cut
      const croppedCanvas = warpPerspectiveCrop(canvas, corners);

      // 2. Apply Document Filters & Auto Light Shadow Removal
      const processedUrl = await applyImageFilter(croppedCanvas, {
        filter: activeFilter,
        autoLight,
        brightness,
        contrast,
        sauvolaSensitivity,
      });

      // Clean memory safely
      disposeCanvas(canvas);
      disposeCanvas(croppedCanvas);

      onApplyCrop(processedUrl, currentSrc, activeFilter);
      onClose();
    } catch (err) {
      logger.error('CropModal', 'Error applying crop & filter', err);
      showToast('Error applying crop and filters', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const midpoints = corners ? getQuadMidpoints(corners) : null;

  if (!isOpen || !imageSrc) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/98 backdrop-blur-2xl animate-in fade-in duration-200 h-[100dvh] overflow-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between px-3 py-2 sm:px-4 sm:py-3 border-b border-slate-800 bg-slate-900/90 pt-[max(env(safe-area-inset-top),10px)] flex-shrink-0">
        <div className="flex items-center space-x-2 min-w-0">
          <button
            type="button"
            onClick={() => {
              triggerHaptic(20);
              onClose();
            }}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer flex-shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5 truncate">
              Auto-Cut & Enhance <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold border border-blue-500/30">AI</span>
            </h3>
            <p className="text-[10px] text-slate-400 truncate">Drag corners or edge bars to adjust boundary</p>
          </div>
        </div>

        {/* Action Button */}
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isProcessing}
          className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-blue-600/30 active:scale-95 transition-all cursor-pointer disabled:opacity-50 flex-shrink-0 min-h-[38px]"
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
            src={currentSrc || undefined}
            alt="Source scan"
            onLoad={updateBounds}
            className="max-w-full max-h-[48vh] sm:max-h-[58vh] object-contain rounded-xl shadow-2xl transition-all duration-200"
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
                fill="rgba(0, 0, 0, 0.52)"
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

          {/* Draggable Edge Midpoint Bars */}
          {corners && midpoints && displaySize.width > 0 && (
            <>
              {(
                [
                  { key: 'top' as const, pt: midpoints.top, orientation: 'horizontal' },
                  { key: 'right' as const, pt: midpoints.right, orientation: 'vertical' },
                  { key: 'bottom' as const, pt: midpoints.bottom, orientation: 'horizontal' },
                  { key: 'left' as const, pt: midpoints.left, orientation: 'vertical' },
                ] as const
              ).map(({ key, pt, orientation }) => {
                const dx = toDisplayX(pt.x);
                const dy = toDisplayY(pt.y);
                const isDragging = dragTarget?.type === 'edge' && dragTarget.key === key;

                return (
                  <div
                    key={`edge_${key}`}
                    onPointerDown={(e) => handleEdgePointerDown(key, e)}
                    style={{
                      left: `${dx}px`,
                      top: `${dy}px`,
                      transform: 'translate(-50%, -50%)',
                    }}
                    className={`absolute z-20 flex items-center justify-center cursor-move touch-none ${
                      orientation === 'horizontal' ? 'w-14 h-8' : 'w-8 h-14'
                    } ${isDragging ? 'scale-125' : ''}`}
                  >
                    <div
                      className={`rounded-full bg-cyan-500/80 border border-white shadow-md transition-all ${
                        orientation === 'horizontal' ? 'w-6 h-2' : 'w-2 h-6'
                      }`}
                    ></div>
                  </div>
                );
              })}
            </>
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
                const isDragging = dragTarget?.type === 'corner' && dragTarget.key === key;

                return (
                  <div
                    key={`corner_${key}`}
                    onPointerDown={(e) => handleCornerPointerDown(key, e)}
                    style={{
                      left: `${dx}px`,
                      top: `${dy}px`,
                      transform: 'translate(-50%, -50%)',
                    }}
                    className={`absolute z-30 w-12 h-12 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none ${
                      isDragging ? 'scale-130' : ''
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
        {dragTarget && dragClientPos && (
          <div
            style={{
              left: `${dragClientPos.x}px`,
              top: `${dragClientPos.y - 85}px`,
              transform: 'translate(-50%, -50%)',
            }}
            className="fixed z-50 pointer-events-none rounded-full overflow-hidden border-3 border-blue-400 shadow-[0_0_25px_rgba(56,189,248,0.7)] bg-black"
          >
            <canvas ref={loupeCanvasRef} className="w-28 h-28 block" />
          </div>
        )}
      </div>

      {/* Bottom Controls Bar */}
      <div className="bg-slate-900/95 border-t border-slate-800 p-3 space-y-3 pb-[max(env(safe-area-inset-bottom),12px)]">
        {/* Aspect Ratio Presets Bar */}
        <div className="flex items-center justify-between gap-1.5 max-w-lg mx-auto bg-slate-950/60 p-1 rounded-xl border border-slate-800 text-[11px]">
          <span className="text-slate-500 font-semibold px-2 hidden xs:inline">Ratio:</span>
          {[
            { id: 'free' as const, label: 'Freeform' },
            { id: 'a4' as const, label: 'A4 Document' },
            { id: 'id_card' as const, label: 'ID Card' },
            { id: 'square' as const, label: 'Square' },
          ].map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => applyAspectRatio(r.id)}
              className={`flex-1 py-1 px-1.5 rounded-lg text-center font-medium transition-colors cursor-pointer ${
                aspectRatioPreset === r.id
                  ? 'bg-blue-600/30 text-blue-300 font-bold border border-blue-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Quick Toolbar */}
        <div className="flex items-center justify-between gap-2 max-w-lg mx-auto">
          <button
            type="button"
            onClick={handleAutoDetect}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 text-xs font-semibold hover:bg-blue-600/30 active:scale-95 transition-all cursor-pointer min-h-[36px]"
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span>Auto Cut</span>
          </button>

          <button
            type="button"
            onClick={handleResetFull}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 active:scale-95 transition-all cursor-pointer min-h-[36px]"
          >
            <Maximize className="w-3.5 h-3.5" />
            <span>Full Page</span>
          </button>

          <button
            type="button"
            onClick={handleRotate}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 active:scale-95 transition-all cursor-pointer min-h-[36px]"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Rotate 90°</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic(20);
              setShowLightingControls((prev) => !prev);
            }}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all active:scale-95 cursor-pointer min-h-[36px] ${
              showLightingControls || autoLight
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-slate-800 text-slate-300 border-slate-700'
            }`}
          >
            <Sun className="w-3.5 h-3.5 text-amber-400" />
            <span>Light AI</span>
          </button>
        </div>

        {/* Lighting & Sauvola Threshold Adjustments */}
        {showLightingControls && (
          <div className="bg-slate-950/90 border border-slate-800 p-3 rounded-2xl space-y-2.5 max-w-lg mx-auto animate-in fade-in duration-150 shadow-xl">
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-2 text-xs font-semibold text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoLight}
                  onChange={(e) => {
                    triggerHaptic(20);
                    setAutoLight(e.target.checked);
                  }}
                  className="rounded text-blue-500 accent-blue-600 cursor-pointer"
                />
                <span>Equalize Illumination & Whiten Paper</span>
              </label>
              <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> AI Active
              </span>
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

            {/* Sauvola Ink Sensitivity */}
            {activeFilter === 'bw_document' && (
              <div className="space-y-1 pt-1 border-t border-slate-800/80">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Ink Darkness (Sauvola Sensitivity)</span>
                  <span className="text-blue-400 font-bold">{Math.round(sauvolaSensitivity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="0.45"
                  step="0.02"
                  value={sauvolaSensitivity}
                  onChange={(e) => setSauvolaSensitivity(parseFloat(e.target.value))}
                  className="w-full accent-blue-500 cursor-pointer"
                />
              </div>
            )}
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
              type="button"
              onClick={() => {
                triggerHaptic(20);
                setActiveFilter(f.id);
              }}
              className={`py-2 px-2 rounded-xl text-center text-xs font-semibold border transition-all cursor-pointer min-h-[36px] ${
                activeFilter === f.id
                  ? 'bg-blue-600/25 border-blue-500 text-white shadow-sm font-bold'
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

