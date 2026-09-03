import React, { useState } from 'react';
import {
  SlidersHorizontal,
  Stamp,
  RotateCw,
  Trash2,
  Sparkles,
  Hash,
  LayoutGrid,
  FileCode,
  ArrowLeft,
  ArrowRight,
  Copy,
  RefreshCw,
} from 'lucide-react';
import { FileDropzone } from '../common/FileDropzone';
import { ToolHeader } from '../common/ToolHeader';
import { ActionButton } from '../common/ActionButton';
import {
  addWatermarkToPDF,
  removePagesFromPDF,
  addPageNumbersToPDF,
  getPDFMetadata,
  updatePDFMetadata,
  reorganizePDFPages,
} from '../../lib/pdfEngine';
import { getPdfPageCount, renderAllPdfPages } from '../../lib/pdfRenderer';
import type { RenderedPage, PageNumberPosition } from '../../core/types';
import { saveDocumentLocally } from '../../lib/storage';
import { PdfViewerModal } from '../common/PdfViewerModal';
import { ensurePdfExtension, triggerCelebration, triggerHaptic, moveArrayItem } from '../../utils/formatters';
import { generateDocumentThumbnail } from '../../utils/fileUtils';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../core/logger';

type SubTool = 'watermark' | 'numbering' | 'organize' | 'metadata' | 'remove';

interface OrganizePageItem {
  originalIndex: number; // 0-indexed
  dataUrl: string;
  rotation: number; // 0, 90, 180, 270
}

interface PdfToolsProps {
  onDocumentSaved?: () => void;
}

export const PdfTools: React.FC<PdfToolsProps> = ({ onDocumentSaved }) => {
  const { showToast } = useToast();
  const [activeSubTool, setActiveSubTool] = useState<SubTool>('watermark');
  const [file, setFile] = useState<File | null>(null);
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [pageCount, setPageCount] = useState<number>(1);

  // Watermark state
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.3);
  const [watermarkSize, setWatermarkSize] = useState(48);

  // Page numbering state
  const [numPosition, setNumPosition] = useState<PageNumberPosition>('bottom_center');
  const [numFormat, setNumFormat] = useState<'page_of_total' | 'page_only' | 'simple_slash'>('page_of_total');
  const [numPrefix, setNumPrefix] = useState('');
  const [numFontSize, setNumFontSize] = useState(10);

  // Metadata state
  const [metaTitle, setMetaTitle] = useState('');
  const [metaAuthor, setMetaAuthor] = useState('');
  const [metaSubject, setMetaSubject] = useState('');
  const [metaKeywords, setMetaKeywords] = useState('');

  // Page Organizer state
  const [organizePages, setOrganizePages] = useState<OrganizePageItem[]>([]);
  const [isLoadingPages, setIsLoadingPages] = useState(false);

  // Remove pages state
  const [removePagesInput, setRemovePagesInput] = useState('');

  // Processing and result
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultPdf, setResultPdf] = useState<Uint8Array | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const loadFileDetails = async (selectedFile: File) => {
    try {
      const buf = await selectedFile.arrayBuffer();
      setBuffer(buf);
      const count = await getPdfPageCount(buf);
      setPageCount(count);

      // Load metadata
      const meta = await getPDFMetadata(buf);
      setMetaTitle(meta.title || selectedFile.name.replace(/\.pdf$/i, ''));
      setMetaAuthor(meta.author || '');
      setMetaSubject(meta.subject || '');
      setMetaKeywords(meta.keywords?.join(', ') || '');

      // Pre-load thumbnails if in organize mode
      if (activeSubTool === 'organize') {
        await loadOrganizeThumbnails(buf);
      }

      showToast(`Loaded ${selectedFile.name} (${count} pages)`, 'success');
    } catch (e) {
      logger.error('PdfTools', 'Error loading PDF', e);
      showToast('Could not read PDF file', 'error');
    }
  };

  const loadOrganizeThumbnails = async (buf: ArrayBuffer) => {
    setIsLoadingPages(true);
    try {
      const pages: RenderedPage[] = await renderAllPdfPages(buf, 0.5);
      setOrganizePages(
        pages.map((p, idx) => ({
          originalIndex: idx,
          dataUrl: p.dataUrl,
          rotation: 0,
        }))
      );
    } catch (err) {
      logger.error('PdfTools', 'Error rendering organize pages', err);
      showToast('Error loading page previews', 'error');
    } finally {
      setIsLoadingPages(false);
    }
  };

  const handleFileSelected = async (files: File[]) => {
    if (files.length === 0) return;
    const selectedFile = files[0];
    setFile(selectedFile);
    await loadFileDetails(selectedFile);
  };

  const handleSubToolChange = async (tool: SubTool) => {
    triggerHaptic(20);
    setActiveSubTool(tool);
    if (tool === 'organize' && buffer && organizePages.length === 0) {
      await loadOrganizeThumbnails(buffer);
    }
  };

  // Organize Actions
  const handleMovePage = (idx: number, dir: 'left' | 'right') => {
    triggerHaptic(20);
    const target = dir === 'left' ? idx - 1 : idx + 1;
    setOrganizePages((prev) => moveArrayItem(prev, idx, target));
  };

  const handleRotateOrganizePage = (idx: number) => {
    triggerHaptic(25);
    setOrganizePages((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, rotation: (item.rotation + 90) % 360 } : item
      )
    );
  };

  const handleDuplicatePage = (idx: number) => {
    triggerHaptic(20);
    const item = organizePages[idx];
    if (item) {
      const updated = [...organizePages];
      updated.splice(idx + 1, 0, { ...item });
      setOrganizePages(updated);
      showToast('Page duplicated', 'info');
    }
  };

  const handleDeleteOrganizePage = (idx: number) => {
    triggerHaptic(25);
    if (organizePages.length <= 1) {
      showToast('Cannot delete the only remaining page', 'error');
      return;
    }
    setOrganizePages((prev) => prev.filter((_, i) => i !== idx));
    showToast('Page removed', 'info');
  };

  const handleResetOrganize = async () => {
    triggerHaptic(20);
    if (buffer) {
      await loadOrganizeThumbnails(buffer);
      showToast('Reset page sequence', 'info');
    }
  };

  const handleApplyTool = async () => {
    if (!buffer || !file) return;
    setIsProcessing(true);
    try {
      let outputBytes: Uint8Array;
      const baseName = file.name.replace(/\.pdf$/i, '');
      let outputName = `${baseName}_processed.pdf`;
      let finalPageCount = pageCount;

      if (activeSubTool === 'watermark') {
        outputBytes = await addWatermarkToPDF(buffer, {
          text: watermarkText,
          opacity: watermarkOpacity,
          fontSize: watermarkSize,
          angle: -45,
        });
        outputName = ensurePdfExtension(`${baseName}_watermarked`);
      } else if (activeSubTool === 'numbering') {
        outputBytes = await addPageNumbersToPDF(buffer, {
          position: numPosition,
          format: numFormat,
          prefix: numPrefix || undefined,
          fontSize: numFontSize,
        });
        outputName = ensurePdfExtension(`${baseName}_numbered`);
      } else if (activeSubTool === 'organize') {
        const sequence = organizePages.map((p) => p.originalIndex);
        const rotMap: Record<number, number> = {};
        organizePages.forEach((p, outIdx) => {
          if (p.rotation !== 0) rotMap[outIdx] = p.rotation;
        });
        outputBytes = await reorganizePDFPages(buffer, sequence, rotMap);
        outputName = ensurePdfExtension(`${baseName}_reorganized`);
        finalPageCount = organizePages.length;
      } else if (activeSubTool === 'metadata') {
        const kwArray = metaKeywords
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean);
        outputBytes = await updatePDFMetadata(buffer, {
          title: metaTitle,
          author: metaAuthor,
          subject: metaSubject,
          keywords: kwArray,
        });
        outputName = ensurePdfExtension(`${baseName}_metadata_updated`);
      } else {
        // Remove pages sub-tool
        const pagesToRemove: number[] = [];
        const parts = removePagesInput.split(',');
        for (const p of parts) {
          const trimmed = p.trim();
          if (trimmed.includes('-')) {
            const [startStr, endStr] = trimmed.split('-');
            const start = parseInt(startStr, 10);
            const end = parseInt(endStr, 10);
            if (!isNaN(start) && !isNaN(end)) {
              for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
                if (i >= 1 && i <= pageCount) pagesToRemove.push(i - 1);
              }
            }
          } else {
            const num = parseInt(trimmed, 10);
            if (!isNaN(num) && num >= 1 && num <= pageCount) {
              pagesToRemove.push(num - 1);
            }
          }
        }
        const uniquePages = [...new Set(pagesToRemove)];
        if (uniquePages.length === 0) {
          showToast('Please enter valid page numbers to delete', 'error');
          setIsProcessing(false);
          return;
        }
        outputBytes = await removePagesFromPDF(buffer, uniquePages);
        outputName = ensurePdfExtension(`${baseName}_trimmed`);
        finalPageCount = Math.max(1, pageCount - uniquePages.length);
      }

      const thumbnail = await generateDocumentThumbnail(outputBytes);

      await saveDocumentLocally({
        name: outputName,
        sizeBytes: outputBytes.byteLength,
        pageCount: finalPageCount,
        thumbnailUrl: thumbnail,
        category: 'tools',
        data: outputBytes,
      });

      if (onDocumentSaved) onDocumentSaved();

      setResultPdf(outputBytes);
      setIsPreviewOpen(true);
      showToast('Modified PDF saved successfully!', 'success');
      triggerCelebration();
    } catch (err) {
      logger.error('PdfTools', 'Error applying tool', err);
      showToast('Error modifying PDF. Please ensure the file is valid.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-28 md:pb-8 animate-in fade-in duration-300">
      <ToolHeader
        icon={SlidersHorizontal}
        title="PDF Power Tools"
        subtitle="Watermarks, page numbers, visual page organizer, metadata editor & page trimmer"
        badge="Multi-Tool Suite"
        badgeVariant="purple"
      />

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-slate-900/80 p-1.5 rounded-2xl border border-slate-800 shadow-md">
        <button
          type="button"
          onClick={() => handleSubToolChange('watermark')}
          className={`flex items-center justify-center space-x-1.5 py-2.5 px-2 rounded-xl text-xs sm:text-sm font-semibold border transition-all cursor-pointer min-h-[40px] ${
            activeSubTool === 'watermark'
              ? 'bg-purple-600/25 border-purple-500 text-white shadow-sm font-bold'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Stamp className="w-3.5 h-3.5 text-purple-400" />
          <span>Watermark</span>
        </button>

        <button
          type="button"
          onClick={() => handleSubToolChange('numbering')}
          className={`flex items-center justify-center space-x-1.5 py-2.5 px-2 rounded-xl text-xs sm:text-sm font-semibold border transition-all cursor-pointer min-h-[40px] ${
            activeSubTool === 'numbering'
              ? 'bg-purple-600/25 border-purple-500 text-white shadow-sm font-bold'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Hash className="w-3.5 h-3.5 text-purple-400" />
          <span>Page Numbers</span>
        </button>

        <button
          type="button"
          onClick={() => handleSubToolChange('organize')}
          className={`flex items-center justify-center space-x-1.5 py-2.5 px-2 rounded-xl text-xs sm:text-sm font-semibold border transition-all cursor-pointer min-h-[40px] ${
            activeSubTool === 'organize'
              ? 'bg-purple-600/25 border-purple-500 text-white shadow-sm font-bold'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <LayoutGrid className="w-3.5 h-3.5 text-purple-400" />
          <span>Page Organizer</span>
        </button>

        <button
          type="button"
          onClick={() => handleSubToolChange('metadata')}
          className={`flex items-center justify-center space-x-1.5 py-2.5 px-2 rounded-xl text-xs sm:text-sm font-semibold border transition-all cursor-pointer min-h-[40px] ${
            activeSubTool === 'metadata'
              ? 'bg-purple-600/25 border-purple-500 text-white shadow-sm font-bold'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <FileCode className="w-3.5 h-3.5 text-purple-400" />
          <span>Metadata</span>
        </button>

        <button
          type="button"
          onClick={() => handleSubToolChange('remove')}
          className={`flex items-center justify-center space-x-1.5 py-2.5 px-2 rounded-xl text-xs sm:text-sm font-semibold border transition-all cursor-pointer min-h-[40px] col-span-2 sm:col-span-1 ${
            activeSubTool === 'remove'
              ? 'bg-purple-600/25 border-purple-500 text-white shadow-sm font-bold'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Trash2 className="w-3.5 h-3.5 text-purple-400" />
          <span>Trim Pages</span>
        </button>
      </div>

      {!file && (
        <FileDropzone
          onFilesSelected={handleFileSelected}
          accept="application/pdf"
          multiple={false}
          title="Select PDF Document"
          subtitle="Choose the PDF you want to customize"
          icon="pdf"
        />
      )}

      {file && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-4 sm:p-6 backdrop-blur-md space-y-5 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white truncate max-w-sm">
                {file.name}
              </h3>
              <p className="text-xs text-slate-400">Total {pageCount} pages</p>
            </div>
            <button
              type="button"
              onClick={() => {
                triggerHaptic(20);
                setFile(null);
                setBuffer(null);
                setOrganizePages([]);
              }}
              className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 cursor-pointer transition-colors min-h-[36px]"
            >
              Change PDF
            </button>
          </div>

          {activeSubTool === 'watermark' && (
            <div className="space-y-4 bg-slate-950/70 p-4 rounded-2xl border border-slate-800">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400">Watermark Text</label>
                <input
                  type="text"
                  value={watermarkText}
                  onChange={(e) => setWatermarkText(e.target.value)}
                  placeholder="e.g. CONFIDENTIAL / DRAFT / APPROVED"
                  className="w-full bg-slate-900 border border-slate-800 text-slate-100 text-sm px-3.5 py-2 rounded-xl focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Opacity</span>
                    <span className="font-bold text-purple-400">{Math.round(watermarkOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="0.8"
                    step="0.05"
                    value={watermarkOpacity}
                    onChange={(e) => setWatermarkOpacity(parseFloat(e.target.value))}
                    className="w-full accent-purple-500 cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Font Size</span>
                    <span className="font-bold text-purple-400">{watermarkSize}px</span>
                  </div>
                  <input
                    type="range"
                    min="24"
                    max="90"
                    step="2"
                    value={watermarkSize}
                    onChange={(e) => setWatermarkSize(parseInt(e.target.value, 10))}
                    className="w-full accent-purple-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {activeSubTool === 'numbering' && (
            <div className="space-y-4 bg-slate-950/70 p-4 rounded-2xl border border-slate-800">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400">Position</label>
                  <select
                    value={numPosition}
                    onChange={(e) => setNumPosition(e.target.value as PageNumberPosition)}
                    className="w-full bg-slate-900 border border-slate-800 text-slate-100 text-xs p-2.5 rounded-xl focus:outline-none focus:border-purple-500 cursor-pointer"
                  >
                    <option value="bottom_center">Bottom Center (Standard)</option>
                    <option value="bottom_right">Bottom Right</option>
                    <option value="bottom_left">Bottom Left</option>
                    <option value="top_center">Top Center</option>
                    <option value="top_right">Top Right</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400">Format</label>
                  <select
                    value={numFormat}
                    onChange={(e) => setNumFormat(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-800 text-slate-100 text-xs p-2.5 rounded-xl focus:outline-none focus:border-purple-500 cursor-pointer"
                  >
                    <option value="page_of_total">Page 1 of {pageCount}</option>
                    <option value="simple_slash">1 / {pageCount}</option>
                    <option value="page_only">1 (Number only)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400">Optional Prefix</label>
                  <input
                    type="text"
                    value={numPrefix}
                    onChange={(e) => setNumPrefix(e.target.value)}
                    placeholder="e.g. Doc Page"
                    className="w-full bg-slate-900 border border-slate-800 text-slate-100 text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Font Size</span>
                    <span className="text-purple-400 font-bold">{numFontSize}pt</span>
                  </div>
                  <input
                    type="range"
                    min="8"
                    max="18"
                    value={numFontSize}
                    onChange={(e) => setNumFontSize(parseInt(e.target.value, 10))}
                    className="w-full accent-purple-500 cursor-pointer pt-2"
                  />
                </div>
              </div>
            </div>
          )}

          {activeSubTool === 'organize' && (
            <div className="space-y-4 bg-slate-950/70 p-4 rounded-2xl border border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-200">
                    Visual Page Organizer ({organizePages.length} pages in sequence)
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Use arrows to reorder, rotate individual pages, duplicate, or delete
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResetOrganize}
                  className="flex items-center space-x-1 text-xs text-slate-400 hover:text-white px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              </div>

              {isLoadingPages ? (
                <div className="py-8 text-center space-y-2">
                  <div className="w-8 h-8 border-3 border-purple-500/20 border-t-purple-500 rounded-full animate-spin mx-auto"></div>
                  <p className="text-xs text-slate-400">Loading page thumbnails...</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[50vh] overflow-y-auto p-1">
                  {organizePages.map((item, idx) => (
                    <div
                      key={`org_${idx}_${item.originalIndex}`}
                      className="group relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-900/90 p-2 space-y-2 flex flex-col justify-between hover:border-purple-500/50 transition-colors"
                    >
                      <div className="aspect-[3/4] w-full rounded-xl overflow-hidden bg-white relative">
                        <img
                          src={item.dataUrl}
                          alt={`Page ${idx + 1}`}
                          className="w-full h-full object-contain transition-transform duration-200"
                          style={{ transform: `rotate(${item.rotation}deg)` }}
                        />
                        <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md bg-black/70 text-[10px] font-bold text-white backdrop-blur-sm">
                          Page {idx + 1}
                        </div>
                        {item.rotation > 0 && (
                          <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-purple-600/90 text-[9px] font-bold text-white">
                            +{item.rotation}°
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                        <div className="flex items-center space-x-0.5">
                          <button
                            type="button"
                            onClick={() => handleMovePage(idx, 'left')}
                            disabled={idx === 0}
                            className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"
                            title="Move Left"
                          >
                            <ArrowLeft className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMovePage(idx, 'right')}
                            disabled={idx === organizePages.length - 1}
                            className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"
                            title="Move Right"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="flex items-center space-x-1">
                          <button
                            type="button"
                            onClick={() => handleRotateOrganizePage(idx)}
                            className="p-1 rounded text-slate-400 hover:text-purple-300 hover:bg-slate-800 cursor-pointer"
                            title="Rotate 90°"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDuplicatePage(idx)}
                            className="p-1 rounded text-slate-400 hover:text-blue-300 hover:bg-slate-800 cursor-pointer"
                            title="Duplicate page"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteOrganizePage(idx)}
                            className="p-1 rounded text-red-400 hover:text-red-300 hover:bg-red-500/10 cursor-pointer"
                            title="Delete page"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeSubTool === 'metadata' && (
            <div className="space-y-3 bg-slate-950/70 p-4 rounded-2xl border border-slate-800">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400">Document Title</label>
                  <input
                    type="text"
                    value={metaTitle}
                    onChange={(e) => setMetaTitle(e.target.value)}
                    placeholder="e.g. Annual Report 2026"
                    className="w-full bg-slate-900 border border-slate-800 text-slate-100 text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400">Author</label>
                  <input
                    type="text"
                    value={metaAuthor}
                    onChange={(e) => setMetaAuthor(e.target.value)}
                    placeholder="e.g. John Doe / Company Name"
                    className="w-full bg-slate-900 border border-slate-800 text-slate-100 text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400">Subject</label>
                  <input
                    type="text"
                    value={metaSubject}
                    onChange={(e) => setMetaSubject(e.target.value)}
                    placeholder="e.g. Financial Statements"
                    className="w-full bg-slate-900 border border-slate-800 text-slate-100 text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400">Keywords (Comma separated)</label>
                  <input
                    type="text"
                    value={metaKeywords}
                    onChange={(e) => setMetaKeywords(e.target.value)}
                    placeholder="e.g. finance, invoice, tax, audit"
                    className="w-full bg-slate-900 border border-slate-800 text-slate-100 text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>
            </div>
          )}

          {activeSubTool === 'remove' && (
            <div className="space-y-2 bg-slate-950/70 p-4 rounded-2xl border border-slate-800">
              <label className="text-xs font-semibold text-slate-400">
                Pages to Delete (Comma separated or range)
              </label>
              <input
                type="text"
                value={removePagesInput}
                onChange={(e) => setRemovePagesInput(e.target.value)}
                placeholder="e.g. 2, 4, 7-9 (will delete pages 2, 4, 7, 8, 9)"
                className="w-full bg-slate-900 border border-slate-800 text-slate-100 text-sm px-3.5 py-2 rounded-xl focus:outline-none focus:border-purple-500 font-mono"
              />
              <p className="text-[11px] text-slate-500">
                Total available pages in this document: 1 to {pageCount}
              </p>
            </div>
          )}

          <ActionButton
            onClick={handleApplyTool}
            isLoading={isProcessing}
            loadingText="Applying Changes..."
            icon={Sparkles}
            variant="purple"
            size="lg"
            fullWidth
          >
            {activeSubTool === 'watermark'
              ? 'Save Watermarked PDF'
              : activeSubTool === 'numbering'
              ? 'Stamp Page Numbers & Save'
              : activeSubTool === 'organize'
              ? `Export Reorganized PDF (${organizePages.length} Pages)`
              : activeSubTool === 'metadata'
              ? 'Update Metadata & Save'
              : 'Delete Pages & Save PDF'}
          </ActionButton>
        </div>
      )}

      <PdfViewerModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        pdfData={resultPdf}
        filename={`${file?.name.replace(/\.pdf$/i, '') || 'document'}_modified.pdf`}
      />
    </div>
  );
};
