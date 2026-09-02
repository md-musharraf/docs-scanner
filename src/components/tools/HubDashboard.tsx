import React from 'react';
import {
  Camera,
  Minimize2,
  Layers,
  Scissors,
  Image as ImageIcon,
  FileStack,
  SlidersHorizontal,
  FolderArchive,
  ShieldCheck,
  Zap,
  Sparkles,
  ArrowRight,
  HardDrive,
  Eye,
  Download,
  Share2,
  Calendar,
  Lock,
} from 'lucide-react';
import type { ActiveTab } from '../layout/Navigation';
import type { SavedDocumentMetadata } from '../../core/types';
import { formatFileSize, formatDate, triggerHaptic } from '../../utils/formatters';

interface HubDashboardProps {
  onSelectTab: (tab: ActiveTab) => void;
  savedDocs: SavedDocumentMetadata[];
  onOpenPreview: (doc: SavedDocumentMetadata) => void;
  onDownloadDoc: (doc: SavedDocumentMetadata) => void;
  onShareDoc: (doc: SavedDocumentMetadata) => void;
}

interface ToolCard {
  id: ActiveTab;
  title: string;
  subtitle: string;
  tag: string;
  tagColor: string;
  icon: React.ElementType;
  gradient: string;
  borderGlow: string;
}

export const HubDashboard: React.FC<HubDashboardProps> = ({
  onSelectTab,
  savedDocs,
  onOpenPreview,
  onDownloadDoc,
  onShareDoc,
}) => {
  const tools: ToolCard[] = [
    {
      id: 'scan',
      title: 'Camera Scanner',
      subtitle: 'Scan physical papers with auto-cut boundaries & Sauvola AI paper whitening',
      tag: 'AI Auto-Cut',
      tagColor: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      icon: Camera,
      gradient: 'from-blue-600/20 via-indigo-600/10 to-transparent',
      borderGlow: 'hover:border-blue-500/50 hover:shadow-blue-500/10',
    },
    {
      id: 'resize',
      title: 'Target KB & Compressor',
      subtitle: 'Compress photos to exact 20KB/50KB, passport/ID dimensions, or compress PDF documents',
      tag: 'Photos & PDFs',
      tagColor: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      icon: Minimize2,
      gradient: 'from-amber-600/20 via-orange-600/10 to-transparent',
      borderGlow: 'hover:border-amber-500/50 hover:shadow-amber-500/10',
    },
    {
      id: 'merge',
      title: 'Merge PDF Files',
      subtitle: 'Combine 2 or more PDF documents in any order into a single unified file',
      tag: 'Instant Merge',
      tagColor: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
      icon: Layers,
      gradient: 'from-indigo-600/20 via-purple-600/10 to-transparent',
      borderGlow: 'hover:border-indigo-500/50 hover:shadow-indigo-500/10',
    },
    {
      id: 'split',
      title: 'Split & Extract PDF',
      subtitle: 'Select specific pages, page ranges, or download each page as individual PDF',
      tag: 'Page Selector',
      tagColor: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
      icon: Scissors,
      gradient: 'from-cyan-600/20 via-teal-600/10 to-transparent',
      borderGlow: 'hover:border-cyan-500/50 hover:shadow-cyan-500/10',
    },
    {
      id: 'img2pdf',
      title: 'Images to PDF',
      subtitle: 'Convert gallery photos into clean, formatted multi-page PDF documents (A4/Letter)',
      tag: 'Multi-Photo',
      tagColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      icon: FileStack,
      gradient: 'from-emerald-600/20 via-teal-600/10 to-transparent',
      borderGlow: 'hover:border-emerald-500/50 hover:shadow-emerald-500/10',
    },
    {
      id: 'pdf2img',
      title: 'PDF to Images',
      subtitle: 'Extract every page of any PDF as crisp, high-resolution JPG or PNG pictures',
      tag: 'HD Renderer',
      tagColor: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
      icon: ImageIcon,
      gradient: 'from-sky-600/20 via-blue-600/10 to-transparent',
      borderGlow: 'hover:border-sky-500/50 hover:shadow-sky-500/10',
    },
    {
      id: 'tools',
      title: 'PDF Power Tools',
      subtitle: 'Watermarks, page numbering, visual page organizer, metadata editor & page trimmer',
      tag: '5-in-1 Suite',
      tagColor: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      icon: SlidersHorizontal,
      gradient: 'from-purple-600/20 via-pink-600/10 to-transparent',
      borderGlow: 'hover:border-purple-500/50 hover:shadow-purple-500/10',
    },
    {
      id: 'saved',
      title: 'Offline Library',
      subtitle: 'Category filters, multi-select batch actions, search, and zip backups',
      tag: `${savedDocs.length} Saved`,
      tagColor: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
      icon: FolderArchive,
      gradient: 'from-slate-700/20 via-slate-800/10 to-transparent',
      borderGlow: 'hover:border-slate-500/50 hover:shadow-slate-500/10',
    },
  ];

  const totalBytes = savedDocs.reduce((acc, d) => acc + d.sizeBytes, 0);
  const recentDocs = savedDocs.slice(0, 4);

  const handleToolClick = (tabId: ActiveTab) => {
    triggerHaptic(25);
    onSelectTab(tabId);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-28 md:pb-8 animate-in fade-in duration-300">
      {/* Welcome Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900/90 to-blue-950/40 border border-slate-800/90 p-5 sm:p-8 shadow-2xl backdrop-blur-xl">
        {/* Background glow orb */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-1/3 -mb-16 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2.5 max-w-xl">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>100% Offline Mobile PDF Studio</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Create, Scan & Edit PDFs <br className="hidden sm:block" />
              <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-cyan-400 bg-clip-text text-transparent">
                With Total Privacy & Speed
              </span>
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 font-medium leading-relaxed">
              No accounts, no cloud uploads, and zero subscription limits. All image processing,
              scanning, resizing, and PDF manipulations happen entirely on your device.
            </p>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3 flex-shrink-0">
            <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-2xl text-center space-y-1 shadow-inner">
              <div className="text-lg sm:text-xl font-extrabold text-blue-400">{savedDocs.length}</div>
              <div className="text-[10px] text-slate-400 font-medium">Saved Docs</div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-2xl text-center space-y-1 shadow-inner">
              <div className="text-lg sm:text-xl font-extrabold text-indigo-400">
                {formatFileSize(totalBytes)}
              </div>
              <div className="text-[10px] text-slate-400 font-medium">Storage</div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-2xl text-center space-y-1 shadow-inner">
              <div className="text-lg sm:text-xl font-extrabold text-emerald-400 flex items-center justify-center gap-0.5">
                <Lock className="w-4 h-4" />
                <span>100%</span>
              </div>
              <div className="text-[10px] text-slate-400 font-medium">On-Device</div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Action Tools Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center space-x-2">
            <Zap className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Choose a Tool
            </h3>
          </div>
          <span className="text-xs text-slate-400">8 High-Speed Tools</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => handleToolClick(tool.id)}
                className={`group relative text-left bg-gradient-to-b ${tool.gradient} bg-slate-900/80 border border-slate-800 rounded-3xl p-4 sm:p-5 transition-all duration-200 cursor-pointer shadow-lg hover:scale-[1.02] active:scale-[0.98] ${tool.borderGlow} flex flex-col justify-between min-h-[170px]`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-11 h-11 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-200 group-hover:text-white group-hover:border-blue-500/40 transition-colors shadow-inner">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${tool.tagColor}`}
                    >
                      {tool.tag}
                    </span>
                  </div>

                  <h4 className="text-sm sm:text-base font-bold text-white group-hover:text-blue-300 transition-colors">
                    {tool.title}
                  </h4>
                  <p className="text-xs text-slate-400 font-medium line-clamp-2 mt-1 leading-snug">
                    {tool.subtitle}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-3 mt-2 border-t border-slate-800/60 text-xs font-semibold text-blue-400 group-hover:text-blue-300">
                  <span>Open Tool</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Recent Saved Documents Section */}
      {recentDocs.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center space-x-2">
              <FolderArchive className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Recent Saved Documents
              </h3>
            </div>
            <button
              type="button"
              onClick={() => handleToolClick('saved')}
              className="text-xs font-semibold text-blue-400 hover:text-blue-300 cursor-pointer flex items-center space-x-1"
            >
              <span>View All ({savedDocs.length})</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {recentDocs.map((doc) => (
              <div
                key={doc.id}
                className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between hover:border-slate-700 transition-all shadow-md group space-y-3"
              >
                <div className="flex items-start space-x-3">
                  <div
                    onClick={() => onOpenPreview(doc)}
                    className="w-12 h-16 rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex-shrink-0 flex items-center justify-center cursor-pointer relative group-hover:border-blue-500/50 transition-colors"
                  >
                    {doc.thumbnailUrl ? (
                      <img src={doc.thumbnailUrl} alt="thumbnail" className="w-full h-full object-cover" />
                    ) : (
                      <HardDrive className="w-6 h-6 text-blue-400" />
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                      <Eye className="w-4 h-4" />
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4
                      onClick={() => onOpenPreview(doc)}
                      className="text-xs font-bold text-white truncate hover:text-blue-400 transition-colors cursor-pointer"
                      title={doc.name}
                    >
                      {doc.name}
                    </h4>
                    <div className="text-[10px] text-slate-400 space-y-0.5 mt-1">
                      <div className="flex items-center space-x-1">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        <span>{formatDate(doc.createdAt)}</span>
                      </div>
                      <div>
                        {formatFileSize(doc.sizeBytes)} • {doc.pageCount} {doc.pageCount === 1 ? 'page' : 'pages'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => onOpenPreview(doc)}
                    className="text-xs text-blue-400 hover:text-blue-300 font-semibold cursor-pointer flex items-center space-x-1"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Preview</span>
                  </button>

                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => onShareDoc(doc)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                      title="Share document"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDownloadDoc(doc)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition-colors cursor-pointer"
                      title="Download PDF"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Security & Privacy Guarantee Banner */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 sm:p-5 flex items-center space-x-4">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div className="text-xs text-slate-400 space-y-0.5">
          <span className="font-bold text-slate-200 block">
            Military-Grade Client-Side Privacy
          </span>
          <span>
            DocuCraft runs offline. Your confidential contracts, ID cards, passport photos, and financial
            documents are never uploaded to any remote server or third-party cloud.
          </span>
        </div>
      </div>
    </div>
  );
};