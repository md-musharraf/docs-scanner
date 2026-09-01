import React, { useState, useEffect, useRef } from 'react';
import {
  Minimize2,
  Download,
  Archive,
  Eye,
  Trash2,
  Sparkles,
  Sliders,
  CheckCircle2,
  FileStack,
  Crop,
} from 'lucide-react';
import JSZip from 'jszip';
import { FileDropzone } from '../common/FileDropzone';
import { ToolHeader } from '../common/ToolHeader';
import { ActionButton } from '../common/ActionButton';
import {
  compressImageToTargetKB,
  resizeAndCompressImage,
} from '../../services/imageCompressor';
import type { CompressionResult } from '../../services/imageCompressor';
import { downloadFile, saveDocumentLocally } from '../../lib/storage';
import { imagesToPDF } from '../../lib/pdfEngine';
import { formatFileSize, ensurePdfExtension, sanitizeFilename, triggerCelebration, triggerHaptic } from '../../utils/formatters';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../core/logger';

interface ImageItem {
  id: string;
  file: File;
  name: string;
  originalSize: number;
  originalUrl: string;
  originalWidth: number;
  originalHeight: number;
  result?: CompressionResult;
  isProcessing?: boolean;
}

const TARGET_SIZE_PRESETS = [10, 20, 50, 100, 200, 500];

interface DimensionPreset {
  id: string;
  label: string;
  w: number;
  h: number;
  desc: string;
}

const DIMENSION_PRESETS: DimensionPreset[] = [
  { id: 'passport', label: 'Passport Photo', w: 350, h: 450, desc: '3.5 × 4.5 cm' },
  { id: 'signature', label: 'Signature Scan', w: 140, h: 60, desc: 'Govt Form Standard' },
  { id: 'id_card', label: 'ID / PAN Card', w: 850, h: 540, desc: '8.5 × 5.4 cm' },
  { id: 'square', label: 'Square Avatar', w: 500, h: 500, desc: '1:1 Square' },
  { id: 'hd', label: 'Full HD Photo', w: 1920, h: 1080, desc: '1080p Landscape' },
];

interface ResizeCompressToolProps {
  onDocumentSaved?: () => void;
}

export const ResizeCompressTool: React.FC<ResizeCompressToolProps> = ({ onDocumentSaved }) => {
  const { showToast } = useToast();
  const [images, setImages] = useState<ImageItem[]>([]);
  const [mode, setMode] = useState<'target' | 'dimension' | 'manual'>('target');

  // Target KB State
  const [targetKB, setTargetKB] = useState<number>(100);
  const [customTargetInput, setCustomTargetInput] = useState<string>('100');

  // Exact Dimension State
  const [activeDimPreset, setActiveDimPreset] = useState<string>('passport');
  const [customWidth, setCustomWidth] = useState<number>(350);
  const [customHeight, setCustomHeight] = useState<number>(450);
  const [fitMode, setFitMode] = useState<'cover' | 'contain' | 'stretch'>('cover');

  // Manual State
  const [quality, setQuality] = useState<number>(80);
  const [scalePercentage, setScalePercentage] = useState<number>(75);
  const [format, setFormat] = useState<'image/jpeg' | 'image/webp' | 'image/png'>('image/jpeg');

  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [isPdfExporting, setIsPdfExporting] = useState(false);
  const [previewItem, setPreviewItem] = useState<ImageItem | null>(null);

  // Keep a ref of images for unmount cleanup
  const imagesRef = useRef<ImageItem[]>(images);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    return () => {
      imagesRef.current.forEach((img) => {
        if (img.originalUrl) {
          try {
            URL.revokeObjectURL(img.originalUrl);
          } catch {
            // ignore
          }
        }
      });
    };
  }, []);

  const handleFilesSelected = async (files: File[]) => {
    const imgFiles = files.filter((f) => f.type.startsWith('image/'));
    if (imgFiles.length === 0) {
      showToast('Please select valid image files (JPG, PNG, WebP)', 'error');
      return;
    }

    const newItems: ImageItem[] = [];

    for (const file of imgFiles) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      await new Promise((resolve) => {
        img.onload = () => resolve(true);
        img.src = url;
      });

      newItems.push({
        id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        file,
        name: file.name,
        originalSize: file.size,
        originalUrl: url,
        originalWidth: img.naturalWidth,
        originalHeight: img.naturalHeight,
      });
    }

    setImages((prev) => [...prev, ...newItems]);
    showToast(`Added ${newItems.length} photo${newItems.length > 1 ? 's' : ''}`, 'success');
  };

  const handleTargetPresetClick = (kb: number) => {
    triggerHaptic(20);
    setTargetKB(kb);
    setCustomTargetInput(kb.toString());
  };

  const handleCustomTargetChange = (val: string) => {
    setCustomTargetInput(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setTargetKB(parsed);
    }
  };

  const handleDimPresetClick = (preset: DimensionPreset) => {
    triggerHaptic(20);
    setActiveDimPreset(preset.id);
    setCustomWidth(preset.w);
    setCustomHeight(preset.h);
  };

  const compressSingleItem = async (item: ImageItem): Promise<ImageItem> => {
    try {
      let result: CompressionResult;
      if (mode === 'target') {
        const targetFormat = format === 'image/webp' ? 'image/webp' : 'image/jpeg';
        result = await compressImageToTargetKB(item.file, targetKB, targetFormat);
      } else if (mode === 'dimension') {
        result = await resizeAndCompressImage(item.file, {
          exactWidth: customWidth,
          exactHeight: customHeight,
          fitMode,
          quality: quality / 100,
          format,
        });
      } else {
        result = await resizeAndCompressImage(item.file, {
          quality: quality / 100,
          scale: scalePercentage / 100,
          format,
        });
      }
      return { ...item, result, isProcessing: false };
    } catch (err) {
      logger.error('ResizeCompressTool', `Error compressing ${item.name}`, err);
      return { ...item, isProcessing: false };
    }
  };

  const handleCompressAll = async () => {
    if (images.length === 0) return;
    setIsProcessingAll(true);

    try {
      const updated: ImageItem[] = [];
      for (const img of images) {
        const processed = await compressSingleItem(img);
        updated.push(processed);
      }
      setImages(updated);
      showToast('All images processed successfully!', 'success');
      triggerCelebration();
    } catch (err) {
      logger.error('ResizeCompressTool', 'Batch compression error', err);
      showToast('Compression failed', 'error');
    } finally {
      setIsProcessingAll(false);
    }
  };

  const handleDownloadSingle = async (item: ImageItem) => {
    if (!item.result) return;
    triggerHaptic(25);
    const rawBaseName = item.name.replace(/\.[^/.]+$/, '');
    const baseName = sanitizeFilename(rawBaseName, 'image');
    const ext = item.result.format === 'image/png' ? 'png' : item.result.format === 'image/webp' ? 'webp' : 'jpg';
    const filename = `${baseName}_resized_${Math.round(item.result.sizeBytes / 1024)}kb.${ext}`;

    try {
      await downloadFile(item.result.blob, filename, item.result.format);
      showToast(`Saved ${filename}`, 'success');
    } catch (err) {
      logger.error('ResizeCompressTool', 'Download error', err);
      showToast('Download failed', 'error');
    }
  };

  const handleDownloadZip = async () => {
    const compressed = images.filter((img) => !!img.result);
    if (compressed.length === 0) return;

    setIsZipping(true);
    try {
      const zip = new JSZip();
      for (const item of compressed) {
        if (item.result) {
          const rawBaseName = item.name.replace(/\.[^/.]+$/, '');
          const baseName = sanitizeFilename(rawBaseName, 'image');
          const ext = item.result.format === 'image/png' ? 'png' : item.result.format === 'image/webp' ? 'webp' : 'jpg';
          zip.file(`${baseName}_${Math.round(item.result.sizeBytes / 1024)}kb.${ext}`, item.result.blob);
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      await downloadFile(zipBlob, `compressed_images.zip`, 'application/zip');
      showToast('ZIP archive saved!', 'success');
      triggerCelebration();
    } catch (err) {
      logger.error('ResizeCompressTool', 'ZIP download error', err);
      showToast('Failed to create ZIP', 'error');
    } finally {
      setIsZipping(false);
    }
  };

  const handleSaveToPdf = async () => {
    const compressed = images.filter((img) => !!img.result);
    if (compressed.length === 0) return;

    setIsPdfExporting(true);
    try {
      const pdfBytes = await imagesToPDF(
        compressed.map((item) => ({ dataUrl: item.result!.dataUrl })),
        { pageSize: 'a4', orientation: 'portrait', margin: 15 }
      );

      const docName = ensurePdfExtension(`Resized_Photos`);

      await saveDocumentLocally({
        name: docName,
        sizeBytes: pdfBytes.byteLength,
        pageCount: compressed.length,
        thumbnailUrl: compressed[0].result!.dataUrl,
        data: pdfBytes,
      });

      if (onDocumentSaved) onDocumentSaved();
      showToast('Saved photos to PDF library!', 'success');
      triggerCelebration();
    } catch (err) {
      logger.error('ResizeCompressTool', 'PDF export error', err);
      showToast('Failed to create PDF', 'error');
    } finally {
      setIsPdfExporting(false);
    }
  };

  const removeImage = (id: string) => {
    triggerHaptic(20);
    setImages((prev) => {
      const target = prev.find((img) => img.id === id);
      if (target && target.originalUrl) {
        URL.revokeObjectURL(target.originalUrl);
      }
      return prev.filter((img) => img.id !== id);
    });
  };

  const clearAllImages = () => {
    triggerHaptic(20);
    images.forEach((img) => {
      if (img.originalUrl) URL.revokeObjectURL(img.originalUrl);
    });
    setImages([]);
  };

  const totalOriginalBytes = images.reduce((acc, curr) => acc + curr.originalSize, 0);
  const totalCompressedBytes = images.reduce(
    (acc, curr) => acc + (curr.result ? curr.result.sizeBytes : curr.originalSize),
    0
  );
  const hasAnyResults = images.some((img) => !!img.result);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-28 md:pb-8 animate-in fade-in duration-300">
      {/* Reusable Tool Header */}
      <ToolHeader
        icon={Minimize2}
        title="Image Resizer & Target Compressor"
        subtitle="Reduce photo file sizes (KB) or resize to exact passport, signature & ID dimensions"
        badge="Batch Engine"
        badgeVariant="amber"
      />

      {/* Mode Switcher */}
      <div className="grid grid-cols-3 gap-2 bg-slate-900/80 p-1.5 rounded-2xl border border-slate-800 shadow-md">
        <button
          type="button"
          onClick={() => {
            triggerHaptic(20);
            setMode('target');
          }}
          className={`py-2 px-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer min-h-[40px] ${
            mode === 'target'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30 font-bold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Target KB</span>
        </button>

        <button
          type="button"
          onClick={() => {
            triggerHaptic(20);
            setMode('dimension');
          }}
          className={`py-2 px-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer min-h-[40px] ${
            mode === 'dimension'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30 font-bold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Crop className="w-3.5 h-3.5" />
          <span>Passport / Exact</span>
        </button>

        <button
          type="button"
          onClick={() => {
            triggerHaptic(20);
            setMode('manual');
          }}
          className={`py-2 px-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer min-h-[40px] ${
            mode === 'manual'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30 font-bold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Manual Scale</span>
        </button>
      </div>

      {/* Dropzone */}
      <FileDropzone
        onFilesSelected={handleFilesSelected}
        accept="image/*"
        multiple={true}
        title="Add Photos to Resize / Compress"
        subtitle="Select photos (JPG, PNG, WebP) from your gallery"
        icon="image"
      />

      {images.length > 0 && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-4 sm:p-6 backdrop-blur-md space-y-5 shadow-xl">
          {/* Controls Bar */}
          <div className="space-y-4 border-b border-slate-800 pb-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-white">
                Compression Settings ({images.length} photos)
              </h3>
              <button
                type="button"
                onClick={clearAllImages}
                className="text-xs text-red-400 hover:text-red-300 font-medium px-2.5 py-1.5 rounded-xl hover:bg-red-500/10 cursor-pointer transition-colors"
              >
                Clear All
              </button>
            </div>

            {/* Target Size Controls */}
            {mode === 'target' && (
              <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">
                    Choose Target Maximum File Size
                  </label>
                  <span className="text-xs font-bold text-amber-400">
                    Target: ≤ {targetKB} KB
                  </span>
                </div>

                {/* Preset Chips */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {TARGET_SIZE_PRESETS.map((kb) => (
                    <button
                      key={kb}
                      type="button"
                      onClick={() => handleTargetPresetClick(kb)}
                      className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer min-h-[36px] ${
                        targetKB === kb
                          ? 'bg-amber-600/30 border-amber-500 text-amber-300 shadow-sm'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                      }`}
                    >
                      {kb} KB
                    </button>
                  ))}
                </div>

                {/* Custom Input */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs text-slate-400">Custom Target:</span>
                  <div className="flex items-center space-x-1.5">
                    <input
                      type="number"
                      min="5"
                      max="10000"
                      value={customTargetInput}
                      onChange={(e) => handleCustomTargetChange(e.target.value)}
                      className="w-20 bg-slate-900 border border-slate-800 text-slate-100 text-xs px-2.5 py-1.5 rounded-xl focus:outline-none focus:border-amber-500 min-h-[34px]"
                    />
                    <span className="text-xs font-bold text-slate-300">KB</span>
                  </div>
                  <span className="text-[10px] text-slate-500">
                    (e.g., 20 for govt forms, 50 for PAN/passport)
                  </span>
                </div>
              </div>
            )}

            {/* Exact Dimension Controls */}
            {mode === 'dimension' && (
              <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-2 block">
                    Choose Dimension Preset (Forms / Documents)
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                    {DIMENSION_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleDimPresetClick(p)}
                        className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer flex flex-col justify-between min-h-[72px] ${
                          activeDimPreset === p.id && customWidth === p.w && customHeight === p.h
                            ? 'bg-amber-600/25 border-amber-500 text-white shadow-sm'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <span className="text-xs font-bold truncate">{p.label}</span>
                        <span className="text-[10px] text-amber-400 mt-1">{p.w}×{p.h} px</span>
                        <span className="text-[9px] text-slate-500">{p.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div className="space-y-1">
                    <span className="text-xs text-slate-400">Width (Pixels):</span>
                    <input
                      type="number"
                      min="20"
                      max="4000"
                      value={customWidth}
                      onChange={(e) => setCustomWidth(parseInt(e.target.value, 10) || 100)}
                      className="w-full bg-slate-900 border border-slate-800 text-slate-100 text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <span className="text-xs text-slate-400">Height (Pixels):</span>
                    <input
                      type="number"
                      min="20"
                      max="4000"
                      value={customHeight}
                      onChange={(e) => setCustomHeight(parseInt(e.target.value, 10) || 100)}
                      className="w-full bg-slate-900 border border-slate-800 text-slate-100 text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <span className="text-xs text-slate-400">Fit Strategy:</span>
                    <select
                      value={fitMode}
                      onChange={(e) => setFitMode(e.target.value as any)}
                      className="w-full bg-slate-900 border border-slate-800 text-slate-100 text-xs p-2 rounded-xl focus:outline-none focus:border-amber-500 cursor-pointer"
                    >
                      <option value="cover">Crop / Fill (No Distortion)</option>
                      <option value="contain">Fit with White Margins</option>
                      <option value="stretch">Stretch to Fit Exact</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Manual Resize Controls */}
            {mode === 'manual' && (
              <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Quality</span>
                    <span className="text-amber-400 font-bold">{quality}%</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    value={quality}
                    onChange={(e) => setQuality(parseInt(e.target.value, 10))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Scale Resolution</span>
                    <span className="text-amber-400 font-bold">{scalePercentage}%</span>
                  </div>
                  <input
                    type="range"
                    min="15"
                    max="100"
                    step="5"
                    value={scalePercentage}
                    onChange={(e) => setScalePercentage(parseInt(e.target.value, 10))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400">Output Format</label>
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-800 text-slate-100 text-xs rounded-xl p-2 focus:outline-none focus:border-amber-500 cursor-pointer"
                  >
                    <option value="image/jpeg">JPG (Standard photo)</option>
                    <option value="image/webp">WebP (Modern & Smallest)</option>
                    <option value="image/png">PNG (Lossless)</option>
                  </select>
                </div>
              </div>
            )}

            {/* Action Compress Button */}
            <ActionButton
              onClick={handleCompressAll}
              isLoading={isProcessingAll}
              loadingText={`Processing ${images.length} Images...`}
              icon={Sparkles}
              variant="amber"
              size="lg"
              fullWidth
            >
              {hasAnyResults
                ? 'Re-Process All Images'
                : mode === 'target'
                ? `Compress All to ≤ ${targetKB} KB`
                : mode === 'dimension'
                ? `Resize All to ${customWidth}×${customHeight} px`
                : `Apply Custom Scale & Quality`}
            </ActionButton>
          </div>

          {/* Stats Bar */}
          {hasAnyResults && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-emerald-950/40 border border-emerald-500/30 p-4 rounded-2xl">
              <div className="flex items-center space-x-2 text-emerald-400 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span className="break-all">
                  Reduced: {formatFileSize(totalOriginalBytes)} ➔{' '}
                  {formatFileSize(totalCompressedBytes)} (
                  {totalOriginalBytes > 0
                    ? Math.round(
                        ((totalOriginalBytes - totalCompressedBytes) / totalOriginalBytes) * 100
                      )
                    : 0}
                  % Saved)
                </span>
              </div>

              {/* Batch Export Options */}
              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <ActionButton
                  onClick={handleDownloadZip}
                  isLoading={isZipping}
                  loadingText="Zipping..."
                  icon={Archive}
                  variant="secondary"
                  size="sm"
                  className="flex-1 sm:flex-initial"
                >
                  Download ZIP
                </ActionButton>

                <ActionButton
                  onClick={handleSaveToPdf}
                  isLoading={isPdfExporting}
                  loadingText="Saving..."
                  icon={FileStack}
                  variant="primary"
                  size="sm"
                  className="flex-1 sm:flex-initial"
                >
                  Save as PDF
                </ActionButton>
              </div>
            </div>
          )}

          {/* Images Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto p-1">
            {images.map((item) => (
              <div
                key={item.id}
                className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between space-y-3 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-start space-x-3">
                  {/* Thumbnail */}
                  <div
                    onClick={() => {
                      triggerHaptic(20);
                      setPreviewItem(item);
                    }}
                    className="w-16 h-20 rounded-xl overflow-hidden bg-slate-900 border border-slate-800 flex-shrink-0 cursor-pointer relative group"
                  >
                    <img
                      src={item.result ? item.result.dataUrl : item.originalUrl}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                      <Eye className="w-4 h-4" />
                    </div>
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <h4 className="text-xs font-semibold text-white truncate">
                      {item.name}
                    </h4>

                    <div className="text-[11px] text-slate-400">
                      <span>Original: {formatFileSize(item.originalSize)}</span>
                      <span className="text-slate-600"> • </span>
                      <span>
                        {item.originalWidth}×{item.originalHeight}
                      </span>
                    </div>

                    {item.result ? (
                      <div className="flex items-center space-x-2 pt-0.5">
                        <span className="text-xs font-bold text-amber-400">
                          {formatFileSize(item.result.sizeBytes)}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          -{item.result.reductionPercentage}%
                        </span>
                        <span className="text-[10px] text-slate-500">
                          ({item.result.width}×{item.result.height})
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-500 italic">Not processed yet</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between border-t border-slate-900 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(20);
                      setPreviewItem(item);
                    }}
                    className="text-[11px] text-slate-400 hover:text-white flex items-center space-x-1 cursor-pointer min-h-[32px]"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Preview</span>
                  </button>

                  <div className="flex items-center space-x-1">
                    {item.result && (
                      <button
                        type="button"
                        onClick={() => handleDownloadSingle(item)}
                        className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold transition-colors cursor-pointer min-h-[32px]"
                      >
                        <Download className="w-3 h-3" />
                        <span>Save</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => removeImage(item.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 cursor-pointer min-w-[32px] min-h-[32px] flex items-center justify-center"
                      title="Remove image"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewItem && (
        <div
          onClick={() => setPreviewItem(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-3xl w-full bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="text-sm font-bold text-white truncate">{previewItem.name}</h4>
              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                className="text-slate-400 hover:text-white text-xs px-3 py-1.5 rounded-lg bg-slate-800 cursor-pointer min-h-[32px]"
              >
                Close
              </button>
            </div>

            <div className="max-h-[60vh] overflow-auto flex items-center justify-center bg-black/40 rounded-2xl p-2">
              <img
                src={previewItem.result ? previewItem.result.dataUrl : previewItem.originalUrl}
                alt="Preview"
                className="max-w-full max-h-[55vh] object-contain rounded-lg shadow-2xl"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span>
                Original: {formatFileSize(previewItem.originalSize)} (
                {previewItem.originalWidth}×{previewItem.originalHeight})
              </span>
              {previewItem.result && (
                <span className="text-amber-400 font-bold">
                  Compressed: {formatFileSize(previewItem.result.sizeBytes)} (
                  {previewItem.result.width}×{previewItem.result.height})
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

