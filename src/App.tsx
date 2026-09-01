import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Header } from './components/layout/Header';
import { Navigation } from './components/layout/Navigation';
import type { ActiveTab } from './components/layout/Navigation';
import { LoadingSkeleton } from './components/common/LoadingSkeleton';
import { getAllSavedDocuments, getDocumentData, downloadFile, shareDocument } from './lib/storage';
import type { SavedDocumentMetadata } from './core/types';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ToastProvider } from './components/common/Toast';
import { logger } from './core/logger';

// Lazy-loaded heavy tool components for fast initial load & reduced memory
const HubDashboard = lazy(() =>
  import('./components/tools/HubDashboard').then((m) => ({ default: m.HubDashboard }))
);
const CameraScanner = lazy(() =>
  import('./components/scanner/CameraScanner').then((m) => ({ default: m.CameraScanner }))
);
const MergePdfTool = lazy(() =>
  import('./components/tools/MergePdfTool').then((m) => ({ default: m.MergePdfTool }))
);
const SplitPdfTool = lazy(() =>
  import('./components/tools/SplitPdfTool').then((m) => ({ default: m.SplitPdfTool }))
);
const PdfToImageTool = lazy(() =>
  import('./components/tools/PdfToImageTool').then((m) => ({ default: m.PdfToImageTool }))
);
const ImageToPdfTool = lazy(() =>
  import('./components/tools/ImageToPdfTool').then((m) => ({ default: m.ImageToPdfTool }))
);
const PdfTools = lazy(() =>
  import('./components/tools/PdfTools').then((m) => ({ default: m.PdfTools }))
);
const ResizeCompressTool = lazy(() =>
  import('./components/tools/ResizeCompressTool').then((m) => ({ default: m.ResizeCompressTool }))
);
const SavedDocsView = lazy(() =>
  import('./components/tools/SavedDocsView').then((m) => ({ default: m.SavedDocsView }))
);
const PdfViewerModal = lazy(() =>
  import('./components/common/PdfViewerModal').then((m) => ({ default: m.PdfViewerModal }))
);

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function AppContent() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('scan');
  const [savedDocs, setSavedDocs] = useState<SavedDocumentMetadata[]>([]);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [hubPreviewDoc, setHubPreviewDoc] = useState<{ name: string; data: Uint8Array } | null>(null);

  const refreshSavedDocs = useCallback(async () => {
    try {
      const docs = await getAllSavedDocuments();
      setSavedDocs(docs);
    } catch (err) {
      logger.error('App', 'Error refreshing saved docs', err);
    }
  }, []);

  const handleOpenHubDocPreview = async (doc: SavedDocumentMetadata) => {
    try {
      const data = await getDocumentData(doc.id);
      if (data) {
        setHubPreviewDoc({ name: doc.name, data });
      }
    } catch (err) {
      logger.error('App', 'Error loading doc preview', err);
    }
  };

  const handleDownloadHubDoc = async (doc: SavedDocumentMetadata) => {
    try {
      const data = await getDocumentData(doc.id);
      if (data) {
        await downloadFile(data, doc.name);
      }
    } catch (err) {
      logger.error('App', 'Error downloading doc', err);
    }
  };

  const handleShareHubDoc = async (doc: SavedDocumentMetadata) => {
    try {
      const data = await getDocumentData(doc.id);
      if (data) {
        await shareDocument(data, doc.name);
      }
    } catch (err) {
      logger.error('App', 'Error sharing doc', err);
    }
  };

  useEffect(() => {
    let isMounted = true;

    getAllSavedDocuments()
      .then((docs) => {
        if (isMounted) setSavedDocs(docs);
      })
      .catch((err) => {
        logger.error('App', 'Error loading initial saved docs', err);
      });

    // Listen for PWA installation prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Register offline service worker if supported in production
    if ('serviceWorker' in navigator && (import.meta as any).env?.PROD) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        logger.warn('ServiceWorker', 'SW registration failed', err);
      });
    }

    return () => {
      isMounted = false;
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallApp = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const outcome = await installPrompt.userChoice;
      if (outcome.outcome === 'accepted') {
        setInstallPrompt(null);
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        onInstallClick={handleInstallApp}
        canInstall={!!installPrompt}
      />

      {/* Top Desktop Navigation Tabs */}
      <Navigation
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        savedCount={savedDocs.length}
      />

      {/* Main Content Area with Suspense Code Splitting */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 md:p-8 pb-28 md:pb-8">
        <Suspense fallback={<LoadingSkeleton />}>
          {activeTab === 'hub' && (
            <HubDashboard
              onSelectTab={setActiveTab}
              savedDocs={savedDocs}
              onOpenPreview={handleOpenHubDocPreview}
              onDownloadDoc={handleDownloadHubDoc}
              onShareDoc={handleShareHubDoc}
            />
          )}
          {activeTab === 'scan' && (
            <CameraScanner onDocumentSaved={refreshSavedDocs} />
          )}
          {activeTab === 'resize' && (
            <ResizeCompressTool onDocumentSaved={refreshSavedDocs} />
          )}
          {activeTab === 'merge' && (
            <MergePdfTool onDocumentSaved={refreshSavedDocs} />
          )}
          {activeTab === 'split' && (
            <SplitPdfTool onDocumentSaved={refreshSavedDocs} />
          )}
          {activeTab === 'pdf2img' && (
            <PdfToImageTool />
          )}
          {activeTab === 'img2pdf' && (
            <ImageToPdfTool onDocumentSaved={refreshSavedDocs} />
          )}
          {activeTab === 'tools' && (
            <PdfTools onDocumentSaved={refreshSavedDocs} />
          )}
          {activeTab === 'saved' && (
            <SavedDocsView documents={savedDocs} onRefresh={refreshSavedDocs} />
          )}
        </Suspense>
      </main>

      {/* Hub Preview Modal */}
      {hubPreviewDoc && (
        <Suspense fallback={null}>
          <PdfViewerModal
            isOpen={true}
            onClose={() => setHubPreviewDoc(null)}
            pdfData={hubPreviewDoc.data}
            filename={hubPreviewDoc.name}
          />
        </Suspense>
      )}
    </div>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;

