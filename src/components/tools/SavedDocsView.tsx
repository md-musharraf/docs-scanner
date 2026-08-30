import React, { useState } from 'react';
import { FolderArchive, Trash2, Download, Eye, FileText, Search, Share2, Calendar, HardDrive } from 'lucide-react';
import { ToolHeader } from '../common/ToolHeader';
import { deleteDocument, downloadFile, shareDocument, getDocumentData } from '../../lib/storage';
import type { SavedDocumentMetadata } from '../../core/types';
import { PdfViewerModal } from '../common/PdfViewerModal';
import { formatFileSize, formatDate, triggerHaptic } from '../../utils/formatters';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../core/logger';

interface SavedDocsViewProps {
  documents: SavedDocumentMetadata[];
  onRefresh: () => void;
}

export const SavedDocsView: React.FC<SavedDocsViewProps> = ({ documents, onRefresh }) => {
  const { showToast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [activePreviewData, setActivePreviewData] = useState<Uint8Array | null>(null);
  const [activePreviewName, setActivePreviewName] = useState('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null);

  const filtered = documents.filter((doc) =>
    doc.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
            <div className="flex items-center space-x-2 bg-slate-950/80 border border-slate-800 rounded-2xl px-3 py-1.5 w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-500 flex-shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search saved files..."
                className="bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none w-full"
              />
            </div>
          ) : undefined
        }
      />

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

      {/* Documents List */}
      {documents.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map((doc) => (
            <div
              key={doc.id}
              className="bg-slate-900/80 border border-slate-800 rounded-3xl p-4 sm:p-5 flex flex-col justify-between hover:border-slate-700 transition-all shadow-md group"
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
                  <h4
                    onClick={() => handleOpenPreview(doc)}
                    className="text-sm font-bold text-white truncate hover:text-blue-400 transition-colors cursor-pointer"
                  >
                    {doc.name}
                  </h4>
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
              <div className="flex items-center justify-between pt-4 mt-3 border-t border-slate-800/80">
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

