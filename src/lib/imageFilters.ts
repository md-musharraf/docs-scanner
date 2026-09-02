import type { ScannerFilter, ImageEnhanceOptions } from '../core/types';
import { APP_CONFIG } from '../core/constants';
import { logger } from '../core/logger';

export type { ScannerFilter, ImageEnhanceOptions };

/**
 * Fast Local Illumination Normalization & Shadow Removal
 * Uses an optimized 2D integral image to divide out uneven lighting and paper shadows.
 */
function normalizeIlluminationAndShadows(
  data: Uint8ClampedArray,
  width: number,
  height: number
) {
  const wPlus1 = width + 1;
  const totalPixels = wPlus1 * (height + 1);
  const integral = new Int32Array(totalPixels);

  // 1. Build integral image of grayscale values
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    const yOffset = y * width;
    const intYOffset = (y + 1) * wPlus1;
    const prevIntYOffset = y * wPlus1;

    for (let x = 0; x < width; x++) {
      const idx = (yOffset + x) * 4;
      // Perceptual luminance: (R*77 + G*150 + B*29) >> 8
      const g = (data[idx] * 77 + data[idx + 1] * 150 + data[idx + 2] * 29) >> 8;
      rowSum += g;
      integral[intYOffset + (x + 1)] = integral[prevIntYOffset + (x + 1)] + rowSum;
    }
  }

  // Radius for local background estimation (proportional to image size)
  const radius = Math.max(16, Math.min(80, Math.round(width * 0.05)));

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

      const localBg = Math.max(25, (sum / count) | 0);
      const idx = (yOffset + x) * 4;
      const gain = 250 / localBg;

      data[idx] = Math.min(255, (data[idx] * gain) | 0);
      data[idx + 1] = Math.min(255, (data[idx + 1] * gain) | 0);
      data[idx + 2] = Math.min(255, (data[idx + 2] * gain) | 0);
    }
  }
}

/**
 * High-Accuracy Sauvola Adaptive Binarization for Magic B&W Mode
 * Computes local mean and standard deviation to generate razor-sharp text on pure white paper
 * without blotches or lost characters.
 */
function applySauvolaMagicBW(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  sensitivity: number = 0.22
) {
  const wPlus1 = width + 1;
  const total = wPlus1 * (height + 1);
  const integral = new Float64Array(total);
  const integralSq = new Float64Array(total);

  // 1. Build integral and integral-squared arrays
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    let rowSumSq = 0;
    const yOffset = y * width;
    const intY = (y + 1) * wPlus1;
    const prevIntY = y * wPlus1;

    for (let x = 0; x < width; x++) {
      const idx = (yOffset + x) * 4;
      const g = (data[idx] * 77 + data[idx + 1] * 150 + data[idx + 2] * 29) >> 8;
      rowSum += g;
      rowSumSq += g * g;

      integral[intY + (x + 1)] = integral[prevIntY + (x + 1)] + rowSum;
      integralSq[intY + (x + 1)] = integralSq[prevIntY + (x + 1)] + rowSumSq;
    }
  }

  const radius = Math.max(12, Math.min(50, Math.round(width * 0.035)));
  const k = Math.max(0.05, Math.min(0.5, sensitivity));
  const R = 128;

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);
    const y1Off = y1 * wPlus1;
    const y0Off = y0 * wPlus1;
    const yOffset = y * width;

    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);
      const count = (x1 - x0) * (y1 - y0);

      const sum = integral[y1Off + x1] - integral[y0Off + x1] - integral[y1Off + x0] + integral[y0Off + x0];
      const sumSq = integralSq[y1Off + x1] - integralSq[y0Off + x1] - integralSq[y1Off + x0] + integralSq[y0Off + x0];

      const mean = sum / count;
      const variance = Math.max(0, sumSq / count - mean * mean);
      const stdDev = Math.sqrt(variance);

      // Sauvola formula: T = mean * (1 + k * (stdDev / R - 1))
      const threshold = Math.max(35, Math.min(235, mean * (1 + k * (stdDev / R - 1))));

      const idx = (yOffset + x) * 4;
      const currentGray = (data[idx] * 77 + data[idx + 1] * 150 + data[idx + 2] * 29) >> 8;

      let val = 255;
      if (currentGray < threshold) {
        // Smooth anti-aliased dark ink transition
        const diff = threshold - currentGray;
        if (diff > 25) {
          val = 0;
        } else {
          val = Math.max(0, Math.min(45, (25 - diff) * 2));
        }
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

  // Fill solid white background first to safeguard against transparent PNG artifacts
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetWidth, targetHeight);

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
    applySauvolaMagicBW(data, targetWidth, targetHeight, opts.sauvolaSensitivity);
  } else if (opts.filter === 'magic_color') {
    // Magic Color: whiten paper while enriching color ink/stamps
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      // Color saturation measure: max - min difference
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const chroma = maxC - minC;

      if (lum > 165 && chroma < 28) {
        // Whitish paper background -> boost to pure clean paper white
        const factor = (lum - 165) / 90;
        r = Math.min(255, r + (255 - r) * factor);
        g = Math.min(255, g + (255 - g) * factor);
        b = Math.min(255, b + (255 - b) * factor);
      } else if (chroma >= 28) {
        // Colored ink / stamps (blue pen, red stamp, green signature) -> boost vibrancy
        const avg = (r + g + b) / 3;
        r = Math.min(255, Math.max(0, avg + (r - avg) * 1.35));
        g = Math.min(255, Math.max(0, avg + (g - avg) * 1.35));
        b = Math.min(255, Math.max(0, avg + (b - avg) * 1.35));
      } else {
        // Dark text -> deepen contrast
        r = Math.max(0, r * 0.82);
        g = Math.max(0, g * 0.82);
        b = Math.max(0, b * 0.82);
      }

      data[i] = r | 0;
      data[i + 1] = g | 0;
      data[i + 2] = b | 0;
    }
  } else if (opts.filter === 'grayscale') {
    for (let i = 0; i < data.length; i += 4) {
      const gray = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
      // Linear stretch
      const stretched = Math.min(255, Math.max(0, (gray - 20) * 1.18)) | 0;
      data[i] = stretched;
      data[i + 1] = stretched;
      data[i + 2] = stretched;
    }
  } else if (opts.filter === 'sharp') {
    for (let i = 0; i < data.length; i += 4) {
      const lum = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
      const factor = lum < 128 ? 0.76 : 1.24;

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
