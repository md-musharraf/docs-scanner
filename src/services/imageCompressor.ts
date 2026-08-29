import { logger } from '../core/logger';
import { loadImageElement } from '../lib/imageFilters';

export interface ResizeCompressOptions {
  targetKB?: number;
  quality?: number; // 0.01 to 1.0
  maxWidth?: number;
  maxHeight?: number;
  exactWidth?: number;
  exactHeight?: number;
  fitMode?: 'contain' | 'cover' | 'stretch';
  scale?: number; // 0.1 to 1.0
  format?: 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface CompressionResult {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
  originalSizeBytes: number;
  reductionPercentage: number;
  format: string;
}

/**
 * Intelligent Target Size Compressor:
 * Uses iterative binary-search on JPEG/WebP quality and proportional dimension scaling
 * to reach target file size (e.g., 10KB, 20KB, 50KB, 100KB, 200KB) with maximum visual clarity.
 */
export async function compressImageToTargetKB(
  source: string | File | HTMLImageElement,
  targetKB: number,
  format: 'image/jpeg' | 'image/webp' = 'image/jpeg'
): Promise<CompressionResult> {
  logger.time('TargetSizeCompress');

  let img: HTMLImageElement;
  let originalSizeBytes = 0;

  if (source instanceof File) {
    originalSizeBytes = source.size;
    const url = URL.createObjectURL(source);
    img = await loadImageElement(url);
    URL.revokeObjectURL(url);
  } else if (typeof source === 'string') {
    img = await loadImageElement(source);
    originalSizeBytes = Math.round((source.length * 3) / 4);
  } else {
    img = source;
    originalSizeBytes = img.naturalWidth * img.naturalHeight * 4;
  }

  const targetBytes = targetKB * 1024;
  let currentWidth = img.naturalWidth;
  let currentHeight = img.naturalHeight;

  // Initial dimension capping based on extreme size constraints
  if (targetKB <= 15) {
    const maxDim = 640;
    if (currentWidth > maxDim || currentHeight > maxDim) {
      const s = Math.min(maxDim / currentWidth, maxDim / currentHeight);
      currentWidth = Math.round(currentWidth * s);
      currentHeight = Math.round(currentHeight * s);
    }
  } else if (targetKB <= 50) {
    const maxDim = 1024;
    if (currentWidth > maxDim || currentHeight > maxDim) {
      const s = Math.min(maxDim / currentWidth, maxDim / currentHeight);
      currentWidth = Math.round(currentWidth * s);
      currentHeight = Math.round(currentHeight * s);
    }
  } else if (targetKB <= 150) {
    const maxDim = 1440;
    if (currentWidth > maxDim || currentHeight > maxDim) {
      const s = Math.min(maxDim / currentWidth, maxDim / currentHeight);
      currentWidth = Math.round(currentWidth * s);
      currentHeight = Math.round(currentHeight * s);
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = currentWidth;
  canvas.height = currentHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');

  // Fill pure white background for transparent image safety
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, currentWidth, currentHeight);
  ctx.drawImage(img, 0, 0, currentWidth, currentHeight);

  const getBlob = (q: number): Promise<Blob> =>
    new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error('Failed to create Blob'));
        },
        format,
        q
      );
    });

  // Binary Search for optimal compression quality
  let minQ = 0.02;
  let maxQ = 0.96;
  let bestBlob: Blob | null = null;
  let bestQuality = 0.5;

  for (let iter = 0; iter < 6; iter++) {
    const testQ = (minQ + maxQ) / 2;
    const blob = await getBlob(testQ);

    if (blob.size <= targetBytes) {
      bestBlob = blob;
      bestQuality = testQ;
      minQ = testQ; // Try higher quality
    } else {
      maxQ = testQ; // Reduce quality
    }
  }

  // If still exceeding targetBytes (even at lowest quality), downscale dimensions further
  if (!bestBlob || bestBlob.size > targetBytes) {
    let scaleFactor = 0.85;
    for (let iter = 0; iter < 5; iter++) {
      currentWidth = Math.max(80, Math.round(currentWidth * scaleFactor));
      currentHeight = Math.max(80, Math.round(currentHeight * scaleFactor));
      canvas.width = currentWidth;
      canvas.height = currentHeight;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, currentWidth, currentHeight);
      ctx.drawImage(img, 0, 0, currentWidth, currentHeight);

      const blob = await getBlob(Math.max(0.1, bestQuality));
      bestBlob = blob;
      if (blob.size <= targetBytes) {
        break;
      }
      scaleFactor *= 0.8;
    }
  }

  const finalBlob = bestBlob || (await getBlob(0.1));
  const dataUrl = await blobToDataUrl(finalBlob);

  canvas.width = 0;
  canvas.height = 0;

  const reductionPercentage = Math.max(
    0,
    Math.round(((originalSizeBytes - finalBlob.size) / originalSizeBytes) * 100)
  );

  logger.timeEnd('Compressor', 'TargetSizeCompress');

  return {
    blob: finalBlob,
    dataUrl,
    width: currentWidth,
    height: currentHeight,
    sizeBytes: finalBlob.size,
    originalSizeBytes,
    reductionPercentage,
    format,
  };
}

/**
 * Manual Dimension Resize, Aspect Ratio Cropping, and Quality Compressor
 */
export async function resizeAndCompressImage(
  source: string | File | HTMLImageElement,
  options: ResizeCompressOptions
): Promise<CompressionResult> {
  let img: HTMLImageElement;
  let originalSizeBytes = 0;

  if (source instanceof File) {
    originalSizeBytes = source.size;
    const url = URL.createObjectURL(source);
    img = await loadImageElement(url);
    URL.revokeObjectURL(url);
  } else if (typeof source === 'string') {
    img = await loadImageElement(source);
    originalSizeBytes = Math.round((source.length * 3) / 4);
  } else {
    img = source;
    originalSizeBytes = img.naturalWidth * img.naturalHeight * 4;
  }

  let targetW = img.naturalWidth;
  let targetH = img.naturalHeight;

  let drawX = 0;
  let drawY = 0;
  let drawW = targetW;
  let drawH = targetH;

  if (options.exactWidth && options.exactHeight) {
    targetW = options.exactWidth;
    targetH = options.exactHeight;

    const fitMode = options.fitMode || 'cover';
    if (fitMode === 'cover') {
      const scale = Math.max(targetW / img.naturalWidth, targetH / img.naturalHeight);
      drawW = Math.round(img.naturalWidth * scale);
      drawH = Math.round(img.naturalHeight * scale);
      drawX = Math.round((targetW - drawW) / 2);
      drawY = Math.round((targetH - drawH) / 2);
    } else if (fitMode === 'contain') {
      const scale = Math.min(targetW / img.naturalWidth, targetH / img.naturalHeight);
      drawW = Math.round(img.naturalWidth * scale);
      drawH = Math.round(img.naturalHeight * scale);
      drawX = Math.round((targetW - drawW) / 2);
      drawY = Math.round((targetH - drawH) / 2);
    } else {
      drawW = targetW;
      drawH = targetH;
    }
  } else if (options.scale !== undefined && options.scale > 0 && options.scale <= 1) {
    targetW = Math.round(img.naturalWidth * options.scale);
    targetH = Math.round(img.naturalHeight * options.scale);
    drawW = targetW;
    drawH = targetH;
  } else if (options.maxWidth || options.maxHeight) {
    const maxW = options.maxWidth || img.naturalWidth;
    const maxH = options.maxHeight || img.naturalHeight;
    const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
    targetW = Math.round(img.naturalWidth * scale);
    targetH = Math.round(img.naturalHeight * scale);
    drawW = targetW;
    drawH = targetH;
  }

  targetW = Math.max(10, targetW);
  targetH = Math.max(10, targetH);

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');

  // Fill white canvas background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetW, targetH);

  ctx.drawImage(img, drawX, drawY, drawW, drawH);

  const format = options.format || 'image/jpeg';
  const quality = options.quality !== undefined ? options.quality : 0.85;

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Failed to create Blob'));
      },
      format,
      quality
    );
  });

  const dataUrl = await blobToDataUrl(blob);

  canvas.width = 0;
  canvas.height = 0;

  const reductionPercentage = Math.max(
    0,
    Math.round(((originalSizeBytes - blob.size) / originalSizeBytes) * 100)
  );

  return {
    blob,
    dataUrl,
    width: targetW,
    height: targetH,
    sizeBytes: blob.size,
    originalSizeBytes,
    reductionPercentage,
    format,
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
