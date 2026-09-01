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
} from 'lucide-react';
import JSZip from 'jszip';
import { ToolHeader } from '../common/ToolHeader';
import { deleteDocument, downloadFile, shareDocument, getDocumentData, saveDocumentLocally } from '../../lib/storage';
import type { SavedDocumentMetadata } from '../../core/types';
import { PdfViewerModal } from '../common/PdfViewerModal';
import { formatFileSize, formatDate, triggerHaptic, sanitizeFilename } from '../../utils/formatters';
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
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [activePreviewData, setActivePreviewData] = useState<Uint8Array | null>(null);
  const [activePreviewName, setActivePreviewName] = useState('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null);
  const [isZippingAll, setIsZippingAll] = useState(false);
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');

  // Filter & Sort
  const filtered = documents
    .filter((doc) => doc.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'newest') return b.createdAt - a.createdAt;
      if (sortBy === 'oldest') return a.createdAt - b.createdAt;
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'size') return b.sizeBytes - a.sizeBytes;
      return 0;
    });

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
      const data = await getDocumentData(doc.id);
      if (data) {
        await deleteDocument(doc.id);
        await saveDocumentLocally({
          name: finalName,
          sizeBytes: doc.sizeBytes,
          pageCount: doc.pageCount,
          thumbnailUrl: doc.thumbnailUrl,
          data,
        });
        showToast(`Renamed to ${finalName}`, 'success');
        onRefresh();
      }
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

      {/* Filter and Sort Bar */}
      {documents.length > 0 && (
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

          {/* Sort Selector */}
          <div className="flex items-center space-x-2 flex-shrink-0">
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
            No files found matching "{searchQuery}"
          </p>
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="text-xs text-blue-400 hover:text-blue-300 font-bold underline cursor-pointer"
          >
            Clear search filter
          </button>
        </div>
      )}

      {/* Documents List */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map((doc) => (
            <div
              key={doc.id}
              className="bg-slate-900/80 border border-slate-800 rounded-3xl p-4 sm:p-5 flex flex-col justify-between hover:border-slate-700 transition-all shadow-md group space-y-3"
            >
              <div className="flex items-start space-x-3.5">
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

                  <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-400">
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
          ))}
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

