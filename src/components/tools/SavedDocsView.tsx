import React, { useState } from 'react';
import { FolderArchive, Trash2, Download, Eye, FileText, Search, Share2, Calendar, HardDrive } from 'lucide-react';
import { deleteDocument, downloadFile } from '../../lib/storage';
import type { SavedDocument } from '../../lib/storage';
import { PdfViewerModal } from '../common/PdfViewerModal';

interface SavedDocsViewProps {
  documents: SavedDocument[];
  onRefresh: () => void;
}

export const SavedDocsView: React.FC<SavedDocsViewProps> = ({ documents, onRefresh }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<SavedDocument | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const filtered = documents.filter((doc) =>
    doc.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete "${name}" from offline storage?`)) {
      await deleteDocument(id);
      onRefresh();
    }
  };

  const handleOpenPreview = (doc: SavedDocument) => {
    setSelectedDoc(doc);
    setIsPreviewOpen(true);
  };

  const handleDownload = (doc: SavedDocument) => {
    downloadFile(doc.data, doc.name);
  };

  const handleShare = async (doc: SavedDocument) => {
    if (!navigator.share) return;
    try {
      const file = new File([doc.data as any], doc.name, { type: 'application/pdf' });
      await navigator.share({
        files: [file],
        title: doc.name,
      });
    } catch (e) {
      console.log('Share canceled:', e);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const totalStorageBytes = documents.reduce((acc, d) => acc + d.sizeBytes, 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 md:pb-8 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <FolderArchive className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Offline Library</h2>
              <p className="text-xs text-slate-400">
                {documents.length} documents saved • {formatFileSize(totalStorageBytes)} on-device
              </p>
            </div>
          </div>

          {/* Search Box */}
          {documents.length > 0 && (
            <div className="flex items-center space-x-2 bg-slate-950/80 border border-slate-800 rounded-2xl px-3 py-1.5 w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search saved files..."
                className="bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none w-full"
              />
            </div>
          )}
        </div>
      </div>

      {/* Empty State */}
      {documents.length === 0 && (
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 text-slate-500 flex items-center justify-center mx-auto">
            <HardDrive className="w-8 h-8" />
          </div>
          <div className="max-w-xs mx-auto space-y-1">
            <h3 className="text-base font-semibold text-slate-200">No Documents Saved Yet</h3>
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
              className="bg-slate-900/80 border border-slate-800 rounded-3xl p-4 flex flex-col justify-between hover:border-slate-700 transition-all shadow-md group"
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
                    <Eye className="w-4 h-4" />
                  </div>
                </div>

                {/* Doc Details */}
                <div className="flex-1 min-w-0">
                  <h4
                    onClick={() => handleOpenPreview(doc)}
                    className="text-sm font-semibold text-white truncate hover:text-blue-400 transition-colors cursor-pointer"
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
                  onClick={() => handleOpenPreview(doc)}
                  className="flex items-center space-x-1.5 text-xs text-blue-400 hover:text-blue-300 font-semibold cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Preview</span>
                </button>

                <div className="flex items-center space-x-1">
                  {typeof navigator !== 'undefined' && 'share' in navigator && (
                    <button
                      onClick={() => handleShare(doc)}
                      className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                      title="Share"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    onClick={() => handleDownload(doc)}
                    className="p-2 rounded-xl text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Download"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => handleDelete(doc.id, doc.name)}
                    className="p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview Modal */}
      {selectedDoc && (
        <PdfViewerModal
          isOpen={isPreviewOpen}
          onClose={() => {
            setIsPreviewOpen(false);
            setSelectedDoc(null);
          }}
          pdfData={selectedDoc.data}
          filename={selectedDoc.name}
        />
      )}
    </div>
  );
};
