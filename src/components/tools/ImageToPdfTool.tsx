import React, { useState } from 'react';
import { FileStack, ArrowUp, ArrowDown, Trash2, FileCheck } from 'lucide-react';
import confetti from 'canvas-confetti';
import { FileDropzone } from '../common/FileDropzone';
import { imagesToPDF } from '../../lib/pdfEngine';
import type { ImageToPdfOptions } from '../../core/types';
import { saveDocumentLocally } from '../../lib/storage';
import { PdfViewerModal } from '../common/PdfViewerModal';
import { generateDefaultDocName, ensurePdfExtension } from '../../utils/formatters';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../core/logger';

interface ImageFileItem {
  id: string;
  file: File;
  dataUrl: string;
  name: string;
  size: number;
}

interface ImageToPdfToolProps {
  onDocumentSaved?: () => void;
}

export const ImageToPdfTool: React.FC<ImageToPdfToolProps> = ({ onDocumentSaved }) => {
  const { showToast } = useToast();
  const [images, setImages] = useState<ImageFileItem[]>([]);
  const [docName, setDocName] = useState(() => generateDefaultDocName('Photos'));
  const [options, setOptions] = useState<ImageToPdfOptions>({
    pageSize: 'a4',
    orientation: 'portrait',
    margin: 15,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPdf, setGeneratedPdf] = useState<Uint8Array | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const handleFilesSelected = (files: File[]) => {
    const imgFiles = files.filter((f) => f.type.startsWith('image/'));

    if (imgFiles.length === 0) {
      showToast('Please select valid image files (JPG, PNG, WebP)', 'error');
      return;
    }

    imgFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setImages((prev) => [
          ...prev,
          {
            id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            file,
            dataUrl,
            name: file.name,
            size: file.size,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });

    showToast(`Added ${imgFiles.length} photo${imgFiles.length > 1 ? 's' : ''}`, 'success');
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const updated = [...images];
    const temp = updated[index];
    updated[index] = updated[index - 1];
    updated[index - 1] = temp;
    setImages(updated);
  };

  const moveDown = (index: number) => {
    if (index === images.length - 1) return;
    const updated = [...images];
    const temp = updated[index];
    updated[index] = updated[index + 1];
    updated[index + 1] = temp;
    setImages(updated);
  };

  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  const handleCreatePdf = async () => {
    if (images.length === 0) return;
    setIsGenerating(true);
    try {
      const pdfBytes = await imagesToPDF(
        images.map((img) => ({ dataUrl: img.dataUrl })),
        options
      );

      const finalName = ensurePdfExtension(docName, 'Photos');

      // Save to offline storage
      await saveDocumentLocally({
        name: finalName,
        sizeBytes: pdfBytes.byteLength,
        pageCount: images.length,
        thumbnailUrl: images[0]?.dataUrl || '',
        data: pdfBytes,
      });

      if (onDocumentSaved) onDocumentSaved();

      setGeneratedPdf(pdfBytes);
      setIsPreviewOpen(true);
      showToast('PDF created from photos successfully!', 'success');

      confetti({
        particleCount: 80,
        spread: 60,
      });
    } catch (err) {
      logger.error('ImageToPdfTool', 'Error creating PDF from images', err);
      showToast('Error creating PDF from images', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 md:pb-8 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 backdrop-blur-md">
        <div className="flex items-center space-x-3 mb-2">
          <div className="p-2.5 rounded-2xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
            <FileStack className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Images to PDF Maker</h2>
            <p className="text-xs text-slate-400">Convert JPG, PNG, and camera photos into clean formatted PDF documents</p>
          </div>
        </div>
      </div>

      {/* File Dropzone */}
      <FileDropzone
        onFilesSelected={handleFilesSelected}
        accept="image/*"
        multiple={true}
        title="Add Images or Photos"
        subtitle="Select photos from your gallery or drag & drop files"
        icon="image"
      />

      {images.length > 0 && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 backdrop-blur-md space-y-5 shadow-xl">
          {/* Options & Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">
                Selected Images ({images.length})
              </h3>
              <p className="text-xs text-slate-400">Rearrange page sequence below</p>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                placeholder="document.pdf"
                className="bg-slate-950/80 border border-slate-800 text-slate-100 text-xs px-3 py-1.5 rounded-xl focus:outline-none focus:border-blue-500 max-w-[180px]"
              />
              <button
                onClick={() => setImages([])}
                className="text-xs text-red-400 hover:text-red-300 font-medium px-2 py-1 rounded-lg hover:bg-red-500/10 cursor-pointer"
              >
                Clear All
              </button>
            </div>
          </div>

          {/* Page Formatting Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80">
            {/* Page Size */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">Page Size</label>
              <select
                value={options.pageSize}
                onChange={(e) => setOptions({ ...options, pageSize: e.target.value as any })}
                className="w-full bg-slate-900 border border-slate-800 text-slate-100 text-xs rounded-xl p-2 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="a4">A4 (Standard Document)</option>
                <option value="letter">US Letter</option>
                <option value="fit">Fit to Image Size</option>
              </select>
            </div>

            {/* Orientation */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">Orientation</label>
              <select
                value={options.orientation}
                disabled={options.pageSize === 'fit'}
                onChange={(e) => setOptions({ ...options, orientation: e.target.value as any })}
                className="w-full bg-slate-900 border border-slate-800 text-slate-100 text-xs rounded-xl p-2 focus:outline-none focus:border-blue-500 cursor-pointer disabled:opacity-40"
              >
                <option value="portrait">Portrait (Vertical)</option>
                <option value="landscape">Landscape (Horizontal)</option>
              </select>
            </div>

            {/* Margins */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">Page Margin</label>
              <select
                value={options.margin}
                onChange={(e) => setOptions({ ...options, margin: Number(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-800 text-slate-100 text-xs rounded-xl p-2 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value={0}>No Margin (Edge-to-Edge)</option>
                <option value={15}>Small Margin</option>
                <option value={30}>Normal Margin</option>
              </select>
            </div>
          </div>

          {/* Image Thumbnail Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[50vh] overflow-y-auto p-1">
            {images.map((img, idx) => (
              <div
                key={img.id}
                className="group relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 p-2 space-y-2 hover:border-slate-700 transition-colors"
              >
                <div className="aspect-[3/4] w-full rounded-xl overflow-hidden bg-slate-900 relative">
                  <img
                    src={img.dataUrl}
                    alt={img.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md bg-black/70 text-[10px] font-bold text-white backdrop-blur-sm">
                    Page {idx + 1}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-slate-400 truncate max-w-[70px]">
                    {img.name}
                  </span>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => moveUp(idx)}
                      disabled={idx === 0}
                      className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-20 cursor-pointer"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => moveDown(idx)}
                      disabled={idx === images.length - 1}
                      className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-20 cursor-pointer"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => removeImage(img.id)}
                      className="p-1 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Action CTA */}
          <button
            onClick={handleCreatePdf}
            disabled={images.length === 0 || isGenerating}
            className="w-full flex items-center justify-center space-x-2 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-xl shadow-emerald-600/30 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99] transition-all cursor-pointer"
          >
            {isGenerating ? (
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                <span>Generating PDF Document...</span>
              </div>
            ) : (
              <>
                <FileCheck className="w-4 h-4" />
                <span>Create PDF from {images.length} Images</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* PDF Preview Modal */}
      <PdfViewerModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        pdfData={generatedPdf}
        filename={ensurePdfExtension(docName, 'Photos')}
      />
    </div>
  );
};
