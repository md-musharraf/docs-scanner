import type { ScannerFilter, ImageEnhanceOptions } from '../core/types';
import { APP_CONFIG } from '../core/constants';
import { logger } from '../core/logger';

export type { ScannerFilter, ImageEnhanceOptions };

/**
 * Fast Local Illumination Normalization & Shadow Removal
 * Uses an optimized Int32Array integral image to divide out uneven lighting and shadows.
 */
function normalizeIlluminationAndShadows(
  data: Uint8ClampedArray,
  width: number,
  height: number
) {
  const totalPixels = (width + 1) * (height + 1);
  const integral = new Int32Array(totalPixels);

  // Build integral image
  const wPlus1 = width + 1;
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    const yOffset = y * width;
    const intYOffset = (y + 1) * wPlus1;
    const prevIntYOffset = y * wPlus1;

    for (let x = 0; x < width; x++) {
      const idx = (yOffset + x) * 4;
      // Fast luminance approximation: (R*2 + G*5 + B) >> 3
      const g = (data[idx] * 2 + data[idx + 1] * 5 + data[idx + 2]) >> 3;
      rowSum += g;
      integral[intYOffset + (x + 1)] = integral[prevIntYOffset + (x + 1)] + rowSum;
    }
  }

  // Radius for local background estimation (adaptive to resolution)
  const radius = Math.max(16, Math.min(64, Math.round(width * 0.04)));

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);
    const y1Offset = y1 * wPlus1;
    const y0Offset = y0 * wPlus1;
    const yOffset = y * width;

    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);

      const count = (x1 - x0) * (y1 - y0);
      const sum =
        integral[y1Offset + x1] -
        integral[y0Offset + x1] -
        integral[y1Offset + x0] +
        integral[y0Offset + x0];

      const localBg = Math.max(30, (sum / count) | 0);
      const idx = (yOffset + x) * 4;
      const gain = 246 / localBg;

      data[idx] = Math.min(255, (data[idx] * gain) | 0);
      data[idx + 1] = Math.min(255, (data[idx + 1] * gain) | 0);
      data[idx + 2] = Math.min(255, (data[idx + 2] * gain) | 0);
    }
  }
}

/**
 * Adaptive Binarization with Local Contrast Recovery for Magic B&W Mode
 */
function applyAdaptiveMagicBW(
  data: Uint8ClampedArray,
  width: number,
  height: number
) {
  const wPlus1 = width + 1;
  const integral = new Int32Array(wPlus1 * (height + 1));

  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    const yOffset = y * width;
    const intYOffset = (y + 1) * wPlus1;
    const prevIntYOffset = y * wPlus1;

    for (let x = 0; x < width; x++) {
      const idx = (yOffset + x) * 4;
      const g = (data[idx] * 2 + data[idx + 1] * 5 + data[idx + 2]) >> 3;
      rowSum += g;
      integral[intYOffset + (x + 1)] = integral[prevIntYOffset + (x + 1)] + rowSum;
    }
  }

  const radius = Math.max(10, Math.min(48, Math.round(width * 0.03)));

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);
    const y1Offset = y1 * wPlus1;
    const y0Offset = y0 * wPlus1;
    const yOffset = y * width;

    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);

      const count = (x1 - x0) * (y1 - y0);
      const sum =
        integral[y1Offset + x1] -
        integral[y0Offset + x1] -
        integral[y1Offset + x0] +
        integral[y0Offset + x0];

      const localMean = (sum / count) | 0;
      const idx = (yOffset + x) * 4;
      const currentGray = (data[idx] * 2 + data[idx + 1] * 5 + data[idx + 2]) >> 3;
      const threshold = (localMean * 0.88) | 0;

      let val = 255;
      if (currentGray < threshold) {
        val = Math.max(0, Math.min(40, ((currentGray / threshold) * 35) | 0));
      }

      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
    }
  }
}

/**
 * Apply filters, shadow removal, and brightness/contrast adjustments with memory & bounds protection
 */
export async function applyImageFilter(
  imageSource: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
  options: ScannerFilter | ImageEnhanceOptions,
  legacyQuality: number = APP_CONFIG.defaultJpegQuality
): Promise<string> {
  const opts: ImageEnhanceOptions = typeof options === 'string'
    ? { filter: options, autoLight: true, brightness: 0, contrast: 0, quality: legacyQuality }
    : { autoLight: true, brightness: 0, contrast: 0, quality: legacyQuality, ...options };

  logger.time('ApplyImageFilter');

  let rawWidth = 0;
  let rawHeight = 0;

  if (imageSource instanceof HTMLVideoElement) {
    rawWidth = imageSource.videoWidth;
    rawHeight = imageSource.videoHeight;
  } else if (imageSource instanceof HTMLImageElement) {
    rawWidth = imageSource.naturalWidth || imageSource.width;
    rawHeight = imageSource.naturalHeight || imageSource.height;
  } else {
    rawWidth = imageSource.width;
    rawHeight = imageSource.height;
  }

  // Bound processing dimensions to prevent mobile memory freeze
  const maxDim = opts.maxDimension || APP_CONFIG.maxProcessingDimension;
  let targetWidth = rawWidth;
  let targetHeight = rawHeight;

  if (rawWidth > maxDim || rawHeight > maxDim) {
    const scale = Math.min(maxDim / rawWidth, maxDim / rawHeight);
    targetWidth = Math.round(rawWidth * scale);
    targetHeight = Math.round(rawHeight * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (!ctx) {
    throw new Error('Canvas 2D context not available');
  }

  // Draw scaled image
  ctx.drawImage(imageSource, 0, 0, targetWidth, targetHeight);

  const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  const data = imgData.data;

  // 1. Auto Light & Shadow Normalization
  if (opts.autoLight && opts.filter !== 'original') {
    normalizeIlluminationAndShadows(data, targetWidth, targetHeight);
  }

  // 2. Brightness & Contrast adjustments
  if (opts.brightness !== 0 || opts.contrast !== 0) {
    const b = (opts.brightness || 0) * 1.5;
    const c = opts.contrast || 0;
    const factor = (259 * (c + 255)) / (255 * (259 - c));

    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, Math.max(0, factor * (data[i] + b - 128) + 128));
      data[i + 1] = Math.min(255, Math.max(0, factor * (data[i + 1] + b - 128) + 128));
      data[i + 2] = Math.min(255, Math.max(0, factor * (data[i + 2] + b - 128) + 128));
    }
  }

  // 3. Document Filter Presets
  if (opts.filter === 'bw_document') {
    applyAdaptiveMagicBW(data, targetWidth, targetHeight);
  } else if (opts.filter === 'magic_color') {
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      if (lum > 175) {
        const factor = (lum - 175) / 80;
        r = Math.min(255, r + (255 - r) * factor);
        g = Math.min(255, g + (255 - g) * factor);
        b = Math.min(255, b + (255 - b) * factor);
      } else {
        r = Math.max(0, r * 0.84);
        g = Math.max(0, g * 0.84);
        b = Math.max(0, b * 0.84);
      }

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  } else if (opts.filter === 'grayscale') {
    for (let i = 0; i < data.length; i += 4) {
      const gray = (data[i] * 2 + data[i + 1] * 5 + data[i + 2]) >> 3;
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }
  } else if (opts.filter === 'sharp') {
    for (let i = 0; i < data.length; i += 4) {
      const lum = (data[i] * 2 + data[i + 1] * 5 + data[i + 2]) >> 3;
      const factor = lum < 130 ? 0.78 : 1.22;

      data[i] = Math.min(255, (data[i] * factor) | 0);
      data[i + 1] = Math.min(255, (data[i + 1] * factor) | 0);
      data[i + 2] = Math.min(255, (data[i + 2] * factor) | 0);
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const result = canvas.toDataURL('image/jpeg', opts.quality || APP_CONFIG.defaultJpegQuality);

  // Clean up canvas memory
  canvas.width = 0;
  canvas.height = 0;

  logger.timeEnd('Filters', 'ApplyImageFilter');
  return result;
}

/**
 * Load an image file or blob as an HTMLImageElement safely
 */
export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}
