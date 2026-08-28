import { useState, useEffect } from 'react';
import { Header } from './components/layout/Header';
import { Navigation } from './components/layout/Navigation';
import type { ActiveTab } from './components/layout/Navigation';
import { CameraScanner } from './components/scanner/CameraScanner';
import { MergePdfTool } from './components/tools/MergePdfTool';
import { SplitPdfTool } from './components/tools/SplitPdfTool';
import { PdfToImageTool } from './components/tools/PdfToImageTool';
import { ImageToPdfTool } from './components/tools/ImageToPdfTool';
import { PdfTools } from './components/tools/PdfTools';
import { SavedDocsView } from './components/tools/SavedDocsView';
import { getAllSavedDocuments } from './lib/storage';
import type { SavedDocument } from './lib/storage';

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('scan');
  const [savedDocs, setSavedDocs] = useState<SavedDocument[]>([]);
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  const refreshSavedDocs = async () => {
    try {
      const docs = await getAllSavedDocuments();
      setSavedDocs(docs);
    } catch (err) {
      console.error('Error refreshing docs:', err);
    }
  };

  useEffect(() => {
    refreshSavedDocs();

    // Listen for PWA installation prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Register offline service worker if supported
    if ('serviceWorker' in navigator && (import.meta as any).env?.PROD) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.log('SW registration error:', err);
      });
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallApp = async () => {
    if (installPrompt) {
      installPrompt.prompt();
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
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 md:p-8">
        {activeTab === 'scan' && (
          <CameraScanner onDocumentSaved={refreshSavedDocs} />
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

export default App;
