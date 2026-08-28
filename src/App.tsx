import { useState, useEffect, useCallback } from 'react';
import { Header } from './components/layout/Header';
import { Navigation } from './components/layout/Navigation';
import type { ActiveTab } from './components/layout/Navigation';
import { CameraScanner } from './components/scanner/CameraScanner';
import { MergePdfTool } from './components/tools/MergePdfTool';
import { SplitPdfTool } from './components/tools/SplitPdfTool';
import { PdfToImageTool } from './components/tools/PdfToImageTool';
import { ImageToPdfTool } from './components/tools/ImageToPdfTool';
import { PdfTools } from './components/tools/PdfTools';
import { ResizeCompressTool } from './components/tools/ResizeCompressTool';
import { SavedDocsView } from './components/tools/SavedDocsView';
import { getAllSavedDocuments } from './lib/storage';
import type { SavedDocumentMetadata } from './core/types';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ToastProvider } from './components/common/Toast';
import { logger } from './core/logger';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function AppContent() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('scan');
  const [savedDocs, setSavedDocs] = useState<SavedDocumentMetadata[]>([]);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  const refreshSavedDocs = useCallback(async () => {
    try {
      const docs = await getAllSavedDocuments();
      setSavedDocs(docs);
    } catch (err) {
      logger.error('App', 'Error refreshing saved docs', err);
    }
  }, []);

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

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 md:p-8 pb-28 md:pb-8">
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
      </main>
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
