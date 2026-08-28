import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Set up offline worker
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface RenderedPage {
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Get total number of pages in a PDF file
 */
export async function getPdfPageCount(data: ArrayBuffer | Uint8Array): Promise<number> {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(data) });
  const pdf = await loadingTask.promise;
  return pdf.numPages;
}

/**
 * Render a single page of PDF to an HTML Canvas or Data URL
 */
export async function renderPdfPage(
  data: ArrayBuffer | Uint8Array,
  pageNumber: number,
  scale: number = 1.5
): Promise<RenderedPage> {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(data) });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageNumber);

  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas 2D context not available');
  }

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({
    canvasContext: context,
    viewport,
    canvas: canvas as any,
  }).promise;

  const dataUrl = canvas.toDataURL('image/png');

  return {
    pageNumber,
    dataUrl,
    width: viewport.width,
    height: viewport.height,
  };
}

/**
 * Render all pages of a PDF to high resolution images
 */
export async function renderAllPdfPages(
  data: ArrayBuffer | Uint8Array,
  scale: number = 2.0,
  onProgress?: (current: number, total: number) => void
): Promise<RenderedPage[]> {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(data) });
  const pdf = await loadingTask.promise;
  const total = pdf.numPages;
  const pages: RenderedPage[] = [];

  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (context) {
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({
        canvasContext: context,
        viewport,
        canvas: canvas as any,
      }).promise;

      pages.push({
        pageNumber: i,
        dataUrl: canvas.toDataURL('image/jpeg', 0.95),
        width: viewport.width,
        height: viewport.height,
      });
    }

    if (onProgress) {
      onProgress(i, total);
    }
  }

  return pages;
}

/**
 * Render thumbnail for fast preview
 */
export async function renderPdfThumbnail(
  data: ArrayBuffer | Uint8Array,
  pageNumber: number = 1
): Promise<string> {
  try {
    const res = await renderPdfPage(data, pageNumber, 0.4);
    return res.dataUrl;
  } catch (err) {
    console.error('Error rendering thumbnail:', err);
    return '';
  }
}
