import React, { useState } from 'react';
import { Image as ImageIcon, Download, Archive, Eye } from 'lucide-react';
import JSZip from 'jszip';
import { FileDropzone } from '../common/FileDropzone';
import { ToolHeader } from '../common/ToolHeader';
import { ActionButton } from '../common/ActionButton';
import { renderAllPdfPages } from '../../lib/pdfRenderer';
import type { RenderedPage } from '../../core/types';
import { downloadFile } from '../../lib/storage';
import { triggerCelebration, triggerHaptic } from '../../utils/formatters';
import { dataUrlToBlob } from '../../utils/fileUtils';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../core/logger';

export const PdfToImageTool: React.FC = () => {
  const { showToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [renderedPages, setRenderedPages] = useState<RenderedPage[]>([]);
  const [format, setFormat] = useState<'jpeg' | 'png'>('jpeg');
  const [scale, setScale] = useState<number>(1.5);
  const [isRendering, setIsRendering] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [isZipping, setIsZipping] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const processPdfToImages = async (pdfFile: File, currentScale: number, imgFormat: 'jpeg' | 'png' = 'jpeg') => {
    setIsRendering(true);
    try {
      const buffer = await pdfFile.arrayBuffer();
      const pages = await renderAllPdfPages(buffer, currentScale, (current, total) => {
        setProgress({ current, total });
      }, imgFormat);
      setRenderedPages(pages);
      showToast(`Converted ${pages.length} pages to images!`, 'success');
      triggerCelebration(50);
    } catch (err) {
      logger.error('PdfToImageTool', 'Error converting PDF to images', err);
      showToast('Failed to convert PDF to images. Please check the file.', 'error');
    } finally {
      setIsRendering(false);
    }
  };

  const handleFileSelected = async (files: File[]) => {
    if (files.length === 0) return;
    const selectedFile = files[0];
    setFile(selectedFile);
    await processPdfToImages(selectedFile, scale, format);
  };

  const handleFormatChange = async (newFormat: 'jpeg' | 'png') => {
    triggerHaptic(20);
    setFormat(newFormat);
    // Re-render pages in the new format
    if (file) {
      await processPdfToImages(file, scale, newFormat);
    }
  };

  const handleScaleChange = async (newScale: number) => {
    triggerHaptic(20);
    setScale(newScale);
    if (file) {
      await processPdfToImages(file, newScale, format);
    }
  };

  const handleDownloadSingle = async (page: RenderedPage) => {
    triggerHaptic(25);
    const baseName = file?.name.replace(/\.pdf$/i, '') || 'document';
    const ext = format === 'png' ? 'png' : 'jpg';
    const filename = `${baseName}_page_${page.pageNumber}.${ext}`;

    try {
      const blob = dataUrlToBlob(page.dataUrl);
      await downloadFile(blob, filename, `image/${format}`);
      showToast(`Saved ${filename}`, 'success');
    } catch (err) {
      logger.error('PdfToImageTool', 'Error downloading image', err);
      showToast('Download failed', 'error');
    }
  };

  const handleDownloadAllZip = async () => {
    if (renderedPages.length === 0) return;
    setIsZipping(true);
    try {
      const zip = new JSZip();
      const baseName = file?.name.replace(/\.pdf$/i, '') || 'document';
      const ext = format === 'png' ? 'png' : 'jpg';

      for (const page of renderedPages) {
        const blob = dataUrlToBlob(page.dataUrl);
        zip.file(`${baseName}_page_${page.pageNumber}.${ext}`, blob);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      await downloadFile(zipBlob, `${baseName}_images.zip`, 'application/zip');
      showToast('ZIP archive saved!', 'success');
      triggerCelebration();
    } catch (err) {
      logger.error('PdfToImageTool', 'ZIP error', err);
      showToast('Error creating ZIP archive', 'error');
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-28 md:pb-8 animate-in fade-in duration-300">
      {/* Reusable Tool Header */}
      <ToolHeader
        icon={ImageIcon}
        title="PDF to Image Converter"
        subtitle="Extract every page of a PDF as crisp, high-resolution JPG or PNG offline"
        badge="HD Render"
        badgeVariant="cyan"
      />

      {!file && (
        <FileDropzone
          onFilesSelected={handleFileSelected}
          accept="application/pdf"
          multiple={false}
          title="Select PDF to Convert to Images"
          subtitle="All pages will be rendered client-side directly on your device"
          icon="pdf"
        />
      )}

      {/* Rendering State */}
      {isRendering && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-8 text-center space-y-4">
          <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin mx-auto"></div>
          <div>
            <h3 className="text-base font-semibold text-white">Rendering High-Res Images...</h3>
            <p className="text-xs text-slate-400">
              Processing page {progress.current} of {progress.total}
            </p>
          </div>
        </div>
      )}

      {/* Result Gallery & Controls */}
      {renderedPages.length > 0 && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-4 sm:p-6 backdrop-blur-md space-y-5 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-sm font-bold text-white truncate max-w-sm">
                {file?.name}
              </h3>
              <p className="text-xs text-slate-400">
                {renderedPages.length} images generated at high resolution
              </p>
            </div>

            {/* Quality & Format Switchers */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center space-x-1 bg-slate-950/70 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => handleFormatChange('jpeg')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer min-h-[32px] ${
                    format === 'jpeg' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  JPG
                </button>
                <button
                  type="button"
                  onClick={() => handleFormatChange('png')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer min-h-[32px] ${
                    format === 'png' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  PNG
                </button>
              </div>

              <select
                value={scale}
                onChange={(e) => handleScaleChange(parseFloat(e.target.value))}
                className="bg-slate-950 border border-slate-800 text-slate-200 text-xs px-3 py-1.5 rounded-xl cursor-pointer min-h-[36px]"
              >
                <option value={1.2}>1.2x Fast</option>
                <option value={1.5}>1.5x Balanced</option>
                <option value={2.0}>2.0x Crisp HD</option>
              </select>

              <ActionButton
                onClick={handleDownloadAllZip}
                isLoading={isZipping}
                loadingText="Zipping..."
                icon={Archive}
                variant="primary"
                size="sm"
              >
                Download ZIP
              </ActionButton>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic(20);
                  setFile(null);
                  setRenderedPages([]);
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer transition-colors min-h-[36px]"
              >
                New PDF
              </button>
            </div>
          </div>

          {/* Image Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-h-[60vh] overflow-y-auto p-1">
            {renderedPages.map((page) => (
              <div
                key={page.pageNumber}
                className="rounded-2xl overflow-hidden border border-slate-800 bg-slate-950/70 p-3 space-y-3 hover:border-slate-700 transition-colors"
              >
                <div
                  onClick={() => {
                    triggerHaptic(20);
                    setPreviewImage(page.dataUrl);
                  }}
                  className="aspect-[3/4] w-full rounded-xl overflow-hidden bg-white cursor-pointer group relative shadow-inner"
                >
                  <img
                    src={page.dataUrl}
                    alt={`Page ${page.pageNumber}`}
                    className="w-full h-full object-contain group-hover:scale-102 transition-transform duration-200"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                    <Eye className="w-6 h-6" />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">
                    Page {page.pageNumber}
                  </span>

                  <button
                    type="button"
                    onClick={() => handleDownloadSingle(page)}
                    className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white text-xs font-semibold transition-colors cursor-pointer min-h-[36px]"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Save Image</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Image Full Size Modal */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-auto rounded-2xl bg-white p-2">
            <img src={previewImage} alt="Preview" className="w-full h-auto max-h-[85vh] object-contain" />
          </div>
        </div>
      )}
    </div>
  );
};

