import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { RenderedPage } from '../core/types';
import { APP_CONFIG } from '../core/constants';
import { logger } from '../core/logger';

export type { RenderedPage };

// Set up offline worker
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Get total number of pages in a PDF file with resource cleanup
 */
export async function getPdfPageCount(data: ArrayBuffer | Uint8Array): Promise<number> {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(data).slice() });
  try {
    const pdf = await loadingTask.promise;
    const count = pdf.numPages;
    return count;
  } catch (err) {
    logger.error('PdfRenderer', 'Error getting PDF page count', err);
    throw err;
  } finally {
    loadingTask.destroy();
  }
}

/**
 * Render a single page of PDF to an HTML Canvas or Data URL with memory protection
 */
export async function renderPdfPage(
  data: ArrayBuffer | Uint8Array,
  pageNumber: number,
  scale: number = APP_CONFIG.defaultRenderScale,
  format: 'jpeg' | 'png' = 'jpeg'
): Promise<RenderedPage> {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(data).slice() });
  let pdf: pdfjsLib.PDFDocumentProxy | null = null;
  const canvas = document.createElement('canvas');

  try {
    pdf = await loadingTask.promise;
    const page = await pdf.getPage(pageNumber);

    const viewport = page.getViewport({ scale });
    const context = canvas.getContext('2d', { willReadFrequently: false });

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

    const dataUrl = format === 'png'
      ? canvas.toDataURL('image/png')
      : canvas.toDataURL('image/jpeg', APP_CONFIG.defaultJpegQuality);

    return {
      pageNumber,
      dataUrl,
      width: viewport.width,
      height: viewport.height,
    };
  } catch (err) {
    logger.error('PdfRenderer', `Error rendering page ${pageNumber}`, err);
    throw err;
  } finally {
    // Release canvas memory immediately
    canvas.width = 0;
    canvas.height = 0;
    loadingTask.destroy();
  }
}

/**
 * Render all pages of a PDF to images with memory-controlled batching
 */
export async function renderAllPdfPages(
  data: ArrayBuffer | Uint8Array,
  scale: number = APP_CONFIG.highResScale,
  onProgress?: (current: number, total: number) => void,
  format: 'jpeg' | 'png' = 'jpeg'
): Promise<RenderedPage[]> {
  logger.time('RenderAllPdfPages');
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(data).slice() });
  const pages: RenderedPage[] = [];

  try {
    const pdf = await loadingTask.promise;
    const total = pdf.numPages;

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

        const dataUrl = format === 'png'
          ? canvas.toDataURL('image/png')
          : canvas.toDataURL('image/jpeg', APP_CONFIG.defaultJpegQuality);

        pages.push({
          pageNumber: i,
          dataUrl,
          width: viewport.width,
          height: viewport.height,
        });

        // Release canvas memory after each page
        canvas.width = 0;
        canvas.height = 0;
      }

      if (onProgress) {
        onProgress(i, total);
      }
    }

    logger.timeEnd('PdfRenderer', 'RenderAllPdfPages');
    return pages;
  } catch (err) {
    logger.error('PdfRenderer', 'Error rendering all PDF pages', err);
    throw err;
  } finally {
    loadingTask.destroy();
  }
}

/**
 * Render thumbnail for fast preview
 */
export async function renderPdfThumbnail(
  data: ArrayBuffer | Uint8Array,
  pageNumber: number = 1
): Promise<string> {
  try {
    const res = await renderPdfPage(data, pageNumber, APP_CONFIG.thumbnailScale);
    return res.dataUrl;
  } catch (err) {
    logger.warn('PdfRenderer', 'Error rendering thumbnail', err);
    return '';
  }
}
