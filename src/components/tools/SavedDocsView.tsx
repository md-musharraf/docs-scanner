import React, { useState } from 'react';
import {
  FolderArchive,
  Trash2,
  Download,
  Eye,
  FileText,
  Search,
  Share2,
  Calendar,
  HardDrive,
  Archive,
  ArrowUpDown,
  Edit2,
  Check,
  X,
  CheckSquare,
  Square,
  Merge,
} from 'lucide-react';
import JSZip from 'jszip';
import { ToolHeader } from '../common/ToolHeader';
import { deleteDocument, downloadFile, shareDocument, getDocumentData, renameDocument, saveDocumentLocally } from '../../lib/storage';
import { mergePDFs } from '../../lib/pdfEngine';
import type { SavedDocumentMetadata, DocumentCategory } from '../../core/types';
import { PdfViewerModal } from '../common/PdfViewerModal';
import { formatFileSize, formatDate, triggerHaptic, sanitizeFilename, triggerCelebration, ensurePdfExtension } from '../../utils/formatters';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../core/logger';

interface SavedDocsViewProps {
  documents: SavedDocumentMetadata[];
  onRefresh: () => void;
}

type SortOption = 'newest' | 'oldest' | 'name' | 'size';

export const SavedDocsView: React.FC<SavedDocsViewProps> = ({ documents, onRefresh }) => {
  const { showToast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [activePreviewData, setActivePreviewData] = useState<Uint8Array | null>(null);
  const [activePreviewName, setActivePreviewName] = useState('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null);
  const [isZippingAll, setIsZippingAll] = useState(false);
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');

  // Multi-select batch mode
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  // Filter & Sort
  const filtered = documents
    .filter((doc) => {
      const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory =
        selectedCategory === 'all' ||
        doc.category === selectedCategory ||
        (selectedCategory === 'scan' && !doc.category);
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      if (sortBy === 'newest') return b.createdAt - a.createdAt;
      if (sortBy === 'oldest') return a.createdAt - b.createdAt;
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'size') return b.sizeBytes - a.sizeBytes;
      return 0;
    });

  const toggleSelectDoc = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    triggerHaptic(20);
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    triggerHaptic(20);
    if (selectedDocIds.size === filtered.length) {
      setSelectedDocIds(new Set());
    } else {
      setSelectedDocIds(new Set(filtered.map((d) => d.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedDocIds.size === 0) return;
    triggerHaptic(30);
    if (window.confirm(`Delete ${selectedDocIds.size} selected documents from offline storage?`)) {
      setIsBatchProcessing(true);
      try {
        for (const id of selectedDocIds) {
          await deleteDocument(id);
        }
        showToast(`Deleted ${selectedDocIds.size} documents`, 'info');
        setSelectedDocIds(new Set());
        onRefresh();
      } catch (err) {
        logger.error('SavedDocsView', 'Batch delete error', err);
        showToast('Error deleting selected documents', 'error');
      } finally {
        setIsBatchProcessing(false);
      }
    }
  };

  const handleZipSelected = async () => {
    if (selectedDocIds.size === 0) return;
    setIsBatchProcessing(true);
    triggerHaptic(25);
    try {
      const zip = new JSZip();
      for (const id of selectedDocIds) {
        const doc = documents.find((d) => d.id === id);
        if (doc) {
          const data = await getDocumentData(id);
          if (data) zip.file(doc.name, data);
        }
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      await downloadFile(blob, `DocuCraft_Selected_${new Date().toISOString().slice(0, 10)}.zip`, 'application/zip');
      showToast('Selected ZIP downloaded!', 'success');
      triggerCelebration();
    } catch (err) {
      logger.error('SavedDocsView', 'Zip selected error', err);
      showToast('Error creating ZIP archive', 'error');
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const handleMergeSelected = async () => {
    if (selectedDocIds.size < 2) {
      showToast('Select at least 2 documents to merge', 'info');
      return;
    }
    setIsBatchProcessing(true);
    triggerHaptic(25);
    try {
      const buffers: ArrayBuffer[] = [];
      const selectedDocs = documents.filter((d) => selectedDocIds.has(d.id));
      for (const doc of selectedDocs) {
        const data = await getDocumentData(doc.id);
        if (data) {
          const copy = new Uint8Array(data.byteLength);
          copy.set(data);
          buffers.push(copy.buffer as ArrayBuffer);
        }
      }

      const mergedBytes = await mergePDFs(buffers);
      const outName = ensurePdfExtension(`Merged_Batch_${new Date().toISOString().slice(0, 10)}`);

      await saveDocumentLocally({
        name: outName,
        sizeBytes: mergedBytes.byteLength,
        pageCount: selectedDocs.reduce((acc, d) => acc + (d.pageCount || 1), 0),
        thumbnailUrl: selectedDocs[0]?.thumbnailUrl || '',
        category: 'merge',
        data: mergedBytes,
      });

      showToast(`Merged ${selectedDocs.length} PDFs into "${outName}"!`, 'success');
      triggerCelebration();
      setSelectedDocIds(new Set());
      onRefresh();
    } catch (err) {
      logger.error('SavedDocsView', 'Merge selected error', err);
      showToast('Failed to merge selected PDFs', 'error');
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    triggerHaptic(30);
    if (window.confirm(`Delete "${name}" from offline storage?`)) {
      try {
        await deleteDocument(id);
        showToast(`Deleted ${name}`, 'info');
        onRefresh();
      } catch (err) {
        logger.error('SavedDocsView', 'Error deleting document', err);
        showToast('Error deleting document', 'error');
      }
    }
  };

  const handleClearAll = async () => {
    triggerHaptic(30);
    if (documents.length === 0) return;
    if (window.confirm(`Are you sure you want to delete ALL ${documents.length} documents? This cannot be undone.`)) {
      try {
        for (const doc of documents) {
          await deleteDocument(doc.id);
        }
        showToast('All documents deleted', 'info');
        onRefresh();
      } catch (err) {
        logger.error('SavedDocsView', 'Error clearing library', err);
        showToast('Error clearing documents', 'error');
      }
    }
  };

  const handleStartRename = (doc: SavedDocumentMetadata, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic(20);
    setRenamingDocId(doc.id);
    setRenameInput(doc.name.replace(/\.pdf$/i, ''));
  };

  const handleSaveRename = async (doc: SavedDocumentMetadata) => {
    if (!renameInput.trim()) {
      setRenamingDocId(null);
      return;
    }
    triggerHaptic(20);
    const cleanName = sanitizeFilename(renameInput.trim());
    const finalName = cleanName.toLowerCase().endsWith('.pdf') ? cleanName : `${cleanName}.pdf`;

    try {
      await renameDocument(doc.id, finalName);
      showToast(`Renamed to ${finalName}`, 'success');
      onRefresh();
    } catch (err) {
      logger.error('SavedDocsView', 'Rename error', err);
      showToast('Failed to rename document', 'error');
    } finally {
      setRenamingDocId(null);
    }
  };

  const handleDownloadAllZip = async () => {
    if (documents.length === 0) return;
    setIsZippingAll(true);
    triggerHaptic(25);
    showToast('Preparing ZIP backup of your library...', 'info');

    try {
      const zip = new JSZip();
      for (const doc of documents) {
        const data = await getDocumentData(doc.id);
        if (data) {
          zip.file(doc.name, data);
        }
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      await downloadFile(blob, `DocuCraft_Library_Backup_${new Date().toISOString().slice(0, 10)}.zip`, 'application/zip');
      showToast('Library ZIP backup downloaded!', 'success');
    } catch (err) {
      logger.error('SavedDocsView', 'Backup error', err);
      showToast('Error generating library backup', 'error');
    } finally {
      setIsZippingAll(false);
    }
  };

  const handleOpenPreview = async (doc: SavedDocumentMetadata) => {
    triggerHaptic(20);
    setLoadingDocId(doc.id);
    try {
      const data = await getDocumentData(doc.id);
      if (data) {
        setActivePreviewData(data);
        setActivePreviewName(doc.name);
        setIsPreviewOpen(true);
      } else {
        showToast('Could not load document binary data', 'error');
      }
    } catch (err) {
      logger.error('SavedDocsView', 'Error opening preview', err);
      showToast('Error loading document', 'error');
    } finally {
      setLoadingDocId(null);
    }
  };

  const handleDownload = async (doc: SavedDocumentMetadata) => {
    triggerHaptic(25);
    try {
      const data = await getDocumentData(doc.id);
      if (data) {
        await downloadFile(data, doc.name);
        showToast(`Saved ${doc.name}`, 'success');
      } else {
        showToast('Document not found in storage', 'error');
      }
    } catch (err) {
      logger.error('SavedDocsView', 'Error downloading document', err);
      showToast('Failed to save document', 'error');
    }
  };

  const handleShare = async (doc: SavedDocumentMetadata) => {
    triggerHaptic(25);
    try {
      const data = await getDocumentData(doc.id);
      if (data) {
        const shared = await shareDocument(data, doc.name);
        if (shared) {
          showToast('Shared document', 'success');
        }
      }
    } catch (err) {
      logger.error('SavedDocsView', 'Error sharing document', err);
    }
  };

  const totalStorageBytes = documents.reduce((acc, d) => acc + d.sizeBytes, 0);

  const getCategoryBadge = (cat?: DocumentCategory) => {
    switch (cat) {
      case 'scan':
        return <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 font-semibold">Scan</span>;
      case 'compress':
        return <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold">Compressed</span>;
      case 'merge':
        return <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold">Merged</span>;
      case 'tools':
        return <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30 font-semibold">Tool</span>;
      default:
        return <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-semibold">PDF</span>;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-28 md:pb-8 animate-in fade-in duration-300">
      {/* Reusable Tool Header */}
      <ToolHeader
        icon={FolderArchive}
        title="Offline Library"
        subtitle={`${documents.length} documents saved • ${formatFileSize(totalStorageBytes)} on-device`}
        badge="IndexedDB"
        badgeVariant="blue"
        actionSlot={
          documents.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleDownloadAllZip}
                disabled={isZippingAll}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 text-xs font-semibold cursor-pointer transition-colors min-h-[36px]"
                title="Download all saved documents in a ZIP file"
              >
                <Archive className="w-3.5 h-3.5" />
                <span>{isZippingAll ? 'Zipping...' : 'Backup All ZIP'}</span>
              </button>

              <button
                type="button"
                onClick={handleClearAll}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold cursor-pointer transition-colors min-h-[36px]"
                title="Delete all saved documents"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear All</span>
              </button>
            </div>
          ) : undefined
        }
      />

      {/* Category Pills & Filter Bar */}
      {documents.length > 0 && (
        <div className="space-y-3">
          {/* Category Tabs */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
            {[
              { id: 'all' as const, label: 'All Docs', count: documents.length },
              { id: 'scan' as const, label: 'Scans', count: documents.filter((d) => d.category === 'scan' || !d.category).length },
              { id: 'compress' as const, label: 'Compressed', count: documents.filter((d) => d.category === 'compress').length },
              { id: 'merge' as const, label: 'Merged', count: documents.filter((d) => d.category === 'merge').length },
              { id: 'tools' as const, label: 'Modified', count: documents.filter((d) => d.category === 'tools').length },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  triggerHaptic(20);
                  setSelectedCategory(cat.id);
                }}
                className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap border transition-all cursor-pointer min-h-[34px] flex items-center space-x-1.5 ${
                  selectedCategory === cat.id
                    ? 'bg-blue-600 border-blue-500 text-white shadow-sm'
                    : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <span>{cat.label}</span>
                <span className="text-[10px] opacity-75 px-1 py-0.2 rounded-md bg-black/30">
                  {cat.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search, Sort, and Batch Selection Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/80 p-3 sm:p-4 rounded-2xl border border-slate-800 backdrop-blur-md shadow-md">
            {/* Search Input */}
            <div className="flex items-center space-x-2 bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-1.5 flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-500 flex-shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search saved files by name..."
                className="bg-transparent text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none w-full"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-slate-500 hover:text-slate-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Selection & Sort Controls */}
            <div className="flex items-center space-x-2 flex-shrink-0">
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                className="flex items-center space-x-1 text-xs text-slate-300 hover:text-white bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl cursor-pointer min-h-[36px]"
              >
                {selectedDocIds.size === filtered.length && filtered.length > 0 ? (
                  <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-slate-500" />
                )}
                <span>Select All</span>
              </button>

              <div className="flex items-center space-x-1.5 text-xs text-slate-400">
                <ArrowUpDown className="w-3.5 h-3.5 text-blue-400" />
                <span>Sort:</span>
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="bg-slate-950 border border-slate-800 text-slate-200 text-xs px-3 py-1.5 rounded-xl cursor-pointer min-h-[36px] focus:outline-none focus:border-blue-500 font-medium"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="name">Name (A-Z)</option>
                <option value="size">Size (Largest)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Batch Actions Bar (Visible when documents are selected) */}
      {selectedDocIds.size > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-blue-950/60 border border-blue-500/40 p-3.5 rounded-2xl animate-in slide-in-from-top-2 duration-200 shadow-xl">
          <span className="text-xs font-bold text-blue-200">
            {selectedDocIds.size} document{selectedDocIds.size > 1 ? 's' : ''} selected
          </span>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleMergeSelected}
              disabled={isBatchProcessing || selectedDocIds.size < 2}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold cursor-pointer transition-colors min-h-[34px]"
            >
              <Merge className="w-3.5 h-3.5" />
              <span>Merge Selected</span>
            </button>

            <button
              type="button"
              onClick={handleZipSelected}
              disabled={isBatchProcessing}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer transition-colors min-h-[34px]"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Zip</span>
            </button>

            <button
              type="button"
              onClick={handleDeleteSelected}
              disabled={isBatchProcessing}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 text-xs font-semibold cursor-pointer transition-colors min-h-[34px]"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {documents.length === 0 && (
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-12 text-center space-y-4 shadow-xl">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 text-slate-500 flex items-center justify-center mx-auto">
            <HardDrive className="w-8 h-8" />
          </div>
          <div className="max-w-xs mx-auto space-y-1">
            <h3 className="text-base font-bold text-slate-200">No Documents Saved Yet</h3>
            <p className="text-xs text-slate-400">
              Scanned pages, merged PDFs, and created files will automatically be accessible here offline.
            </p>
          </div>
        </div>
      )}

      {/* Empty Search Results State */}
      {documents.length > 0 && filtered.length === 0 && (
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-8 text-center space-y-3 shadow-xl">
          <p className="text-sm font-semibold text-slate-300">
            No files found matching your filters
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('all');
            }}
            className="text-xs text-blue-400 hover:text-blue-300 font-bold underline cursor-pointer"
          >
            Clear all filters
          </button>
        </div>
      )}

      {/* Documents List */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map((doc) => {
            const isSelected = selectedDocIds.has(doc.id);

            return (
              <div
                key={doc.id}
                className={`bg-slate-900/80 border rounded-3xl p-4 sm:p-5 flex flex-col justify-between transition-all shadow-md group space-y-3 ${
                  isSelected
                    ? 'border-blue-500 bg-blue-950/20'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start space-x-3.5">
                  {/* Checkbox */}
                  <button
                    type="button"
                    onClick={(e) => toggleSelectDoc(doc.id, e)}
                    className="p-1 text-slate-500 hover:text-blue-400 cursor-pointer flex-shrink-0"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-blue-400" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-600" />
                    )}
                  </button>

                  {/* Thumbnail or File Icon */}
                  <div
                    onClick={() => handleOpenPreview(doc)}
                    className="w-14 h-18 rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex-shrink-0 flex items-center justify-center cursor-pointer relative group-hover:border-blue-500/50 transition-colors"
                  >
                    {doc.thumbnailUrl ? (
                      <img src={doc.thumbnailUrl} alt="thumbnail" className="w-full h-full object-cover" />
                    ) : (
                      <FileText className="w-7 h-7 text-blue-400" />
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                      {loadingDocId === doc.id ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </div>
                  </div>

                  {/* Doc Details */}
                  <div className="flex-1 min-w-0">
                    {renamingDocId === doc.id ? (
                      <div className="flex items-center space-x-1">
                        <input
                          type="text"
                          value={renameInput}
                          onChange={(e) => setRenameInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(doc);
                            if (e.key === 'Escape') setRenamingDocId(null);
                          }}
                          autoFocus
                          className="bg-slate-950 border border-blue-500 rounded px-2 py-0.5 text-xs text-white w-full focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveRename(doc)}
                          className="p-1 rounded bg-blue-600 text-white cursor-pointer"
                          title="Save name"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenamingDocId(null)}
                          className="p-1 rounded bg-slate-800 text-slate-300 cursor-pointer"
                          title="Cancel"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-1">
                        <h4
                          onClick={() => handleOpenPreview(doc)}
                          className="text-sm font-bold text-white truncate hover:text-blue-400 transition-colors cursor-pointer"
                          title={doc.name}
                        >
                          {doc.name}
                        </h4>
                        <button
                          type="button"
                          onClick={(e) => handleStartRename(doc, e)}
                          className="p-1 rounded text-slate-500 hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          title="Rename document"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] text-slate-400">
                      {getCategoryBadge(doc.category)}
                      <span className="flex items-center space-x-1">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        <span>{formatDate(doc.createdAt)}</span>
                      </span>
                      <span>•</span>
                      <span>{formatFileSize(doc.sizeBytes)}</span>
                      {doc.pageCount > 0 && (
                        <>
                          <span>•</span>
                          <span>{doc.pageCount} {doc.pageCount === 1 ? 'page' : 'pages'}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => handleOpenPreview(doc)}
                    disabled={loadingDocId === doc.id}
                    className="flex items-center space-x-1.5 text-xs text-blue-400 hover:text-blue-300 font-semibold cursor-pointer disabled:opacity-50 min-h-[36px]"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{loadingDocId === doc.id ? 'Loading...' : 'Preview'}</span>
                  </button>

                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => handleShare(doc)}
                      className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
                      title="Share"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDownload(doc)}
                      className="p-2 rounded-xl text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition-colors cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
                      title="Download"
                    >
                      <Download className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(doc.id, doc.name)}
                      className="p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview Modal */}
      {activePreviewData && (
        <PdfViewerModal
          isOpen={isPreviewOpen}
          onClose={() => {
            setIsPreviewOpen(false);
            setActivePreviewData(null);
            setActivePreviewName('');
          }}
          pdfData={activePreviewData}
          filename={activePreviewName}
        />
      )}
    </div>
  );
};


