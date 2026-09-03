import { logger } from '../core/logger';
import { renderPdfThumbnail } from '../lib/pdfRenderer';

/**
 * Convert a Blob to a base64 Data URL
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert blob to data URL'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Convert a File to a base64 Data URL
 */
export function fileToDataUrl(file: File): Promise<string> {
  return blobToDataUrl(file);
}

/**
 * Convert a base64 Data URL to a Blob
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const binaryString = window.atob(parts[1]);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);

  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return new Blob([bytes], { type: mime });
}

/**
 * Convert Uint8Array to base64 string safely without call stack overflow
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return window.btoa(binary);
}

/**
 * Convert a Blob to a base64 string (without the data URL prefix)
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await blobToDataUrl(blob);
  const commaIdx = dataUrl.indexOf(',');
  return commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;
}

/**
 * Convert ArrayBuffer or Uint8Array to a Blob safely
 */
export function bufferToBlob(data: ArrayBuffer | Uint8Array, mimeType: string = 'application/pdf'): Blob {
  if (data instanceof Uint8Array) {
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return new Blob([copy.buffer as ArrayBuffer], { type: mimeType });
  }
  return new Blob([data as ArrayBuffer], { type: mimeType });
}

/**
 * Generate a thumbnail preview URL for a PDF document
 */
export async function generateDocumentThumbnail(
  pdfData: ArrayBuffer | Uint8Array,
  fallback: string = ''
): Promise<string> {
  try {
    const thumb = await renderPdfThumbnail(pdfData, 1);
    return thumb || fallback;
  } catch (err) {
    logger.warn('FileUtils', 'Failed to generate PDF thumbnail', err);
    return fallback;
  }
}
