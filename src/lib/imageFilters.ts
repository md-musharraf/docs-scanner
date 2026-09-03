import type { ScannerFilter, ImageEnhanceOptions } from '../core/types';
import { APP_CONFIG } from '../core/constants';
import { logger } from '../core/logger';
import { disposeCanvas } from '../utils/geometry';

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
      const threshold = Math.max(30, Math.min(235, mean * (1 + k * (stdDev / R - 1))));

      const idx = (yOffset + x) * 4;
      const currentGray = (data[idx] * 77 + data[idx + 1] * 150 + data[idx + 2] * 29) >> 8;

      let val = 255;
      // If region has high mean and near-zero variance, it's uniform clean paper
      if (mean > 145 && stdDev < 7.5) {
        val = 255;
      } else if (currentGray < threshold) {
        // Smooth anti-aliased dark ink transition
        const diff = threshold - currentGray;
        if (diff > 18) {
          val = 0;
        } else {
          val = Math.max(0, Math.min(45, Math.round((18 - diff) * 2.5)));
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

/**
 * Fast Look-Up Table (LUT) for brightness & contrast adjustment
 */
function buildBrightnessContrastLut(brightness: number, contrast: number): Uint8Array {
  const lut = new Uint8Array(256);
  const b = brightness * 1.5;
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.min(255, Math.max(0, Math.round(factor * (i + b - 128) + 128)));
  }
  return lut;
}

/**
 * Genuine 3x3 Laplacian Unsharp Masking for crisp document text & line enhancement
 */
function applyUnsharpMask(data: Uint8ClampedArray, width: number, height: number, amount: number = 0.55) {
  const copy = new Uint8ClampedArray(data);
  const w4 = width * 4;

  for (let y = 1; y < height - 1; y++) {
    const row = y * w4;
    const prevRow = (y - 1) * w4;
    const nextRow = (y + 1) * w4;

    for (let x = 1; x < width - 1; x++) {
      const idx = row + (x * 4);
      for (let c = 0; c < 3; c++) {
        const center = copy[idx + c];
        const blur = (
          copy[prevRow + (x * 4) + c] +
          copy[nextRow + (x * 4) + c] +
          copy[row + ((x - 1) * 4) + c] +
          copy[row + ((x + 1) * 4) + c]
        ) >> 2;

        const sharp = center + (center - blur) * amount;
        data[idx + c] = Math.min(255, Math.max(0, sharp | 0));
      }
    }
  }
}

  // 2. High-speed LUT-based Brightness & Contrast adjustments
  if (opts.brightness !== 0 || opts.contrast !== 0) {
    const lut = buildBrightnessContrastLut(opts.brightness || 0, opts.contrast || 0);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = lut[data[i]];
      data[i + 1] = lut[data[i + 1]];
      data[i + 2] = lut[data[i + 2]];
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

      const lum = (r * 77 + g * 150 + b * 29) >> 8;
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const chroma = maxC - minC;

      if (lum > 155 && chroma < 25) {
        // Whitish paper background -> smoothly transition to pure clean paper white
        const factor = Math.min(1, (lum - 155) / 80);
        r = Math.min(255, r + (255 - r) * factor);
        g = Math.min(255, g + (255 - g) * factor);
        b = Math.min(255, b + (255 - b) * factor);
      } else if (chroma >= 25) {
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
    // Adaptive percentile auto-contrast monochrome
    const hist = new Int32Array(256);
    const totalPixels = targetWidth * targetHeight;
    for (let i = 0; i < data.length; i += 4) {
      const grayVal = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
      hist[grayVal]++;
    }

    const pLow = totalPixels * 0.015;
    const pHigh = totalPixels * 0.985;
    let count = 0;
    let minG = 0;
    let maxG = 255;
    for (let i = 0; i < 256; i++) {
      count += hist[i];
      if (count >= pLow && minG === 0) minG = i;
      if (count >= pHigh) {
        maxG = i;
        break;
      }
    }
    if (maxG <= minG) {
      minG = 0;
      maxG = 255;
    }
    const range = Math.max(1, maxG - minG);
    const grayLut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      grayLut[i] = Math.min(255, Math.max(0, Math.round(((i - minG) * 255) / range)));
    }

    for (let i = 0; i < data.length; i += 4) {
      const g = grayLut[(data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8];
      data[i] = g;
      data[i + 1] = g;
      data[i + 2] = g;
    }
  } else if (opts.filter === 'sharp') {
    applyUnsharpMask(data, targetWidth, targetHeight, 0.6);
  }

  ctx.putImageData(imgData, 0, 0);
  const result = canvas.toDataURL('image/jpeg', opts.quality || APP_CONFIG.defaultJpegQuality);

  // Clean up canvas memory safely
  disposeCanvas(canvas);

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
