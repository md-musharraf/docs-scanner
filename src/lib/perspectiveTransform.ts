import type { Point, CornerQuad } from '../core/types';
import {
  euclideanDistance,
  calculateDefaultCorners,
  isValidQuad,
  solvePerspectiveTransform,
} from '../utils/geometry';
import { APP_CONFIG } from '../core/constants';
import { logger } from '../core/logger';

export type { Point, CornerQuad };
export { calculateDefaultCorners };
export const getDefaultCorners = calculateDefaultCorners;
export const dist = euclideanDistance;

/**
 * Intelligent Document Edge & 4-Corner Detection
 * Uses Otsu adaptive thresholding and coordinate projection to find document boundaries.
 */
export function autoDetectDocumentCorners(
  canvas: HTMLCanvasElement,
  fallbackMargin: number = 0.03
): CornerQuad {
  logger.time('AutoDetectCorners');
  const width = canvas.width;
  const height = canvas.height;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return calculateDefaultCorners(width, height, fallbackMargin);
  }

  // Downsample to fast resolution for edge detection
  const maxDim = 320;
  const scale = Math.min(maxDim / width, maxDim / height);
  const procW = Math.round(width * scale);
  const procH = Math.round(height * scale);

  const procCanvas = document.createElement('canvas');
  procCanvas.width = procW;
  procCanvas.height = procH;
  const pCtx = procCanvas.getContext('2d', { willReadFrequently: true });
  if (!pCtx) {
    return calculateDefaultCorners(width, height, fallbackMargin);
  }

  pCtx.drawImage(canvas, 0, 0, procW, procH);
  const imgData = pCtx.getImageData(0, 0, procW, procH);
  const data = imgData.data;

  // 1. Fast Grayscale
  const total = procW * procH;
  const gray = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    gray[i] = (data[idx] * 2 + data[idx + 1] * 5 + data[idx + 2]) >> 3;
  }

  // 2. Otsu Histogram & Threshold
  const hist = new Int32Array(256);
  for (let i = 0; i < total; i++) {
    hist[gray[i]]++;
  }

  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * hist[t];

  let sumBackground = 0;
  let weightBackground = 0;
  let maxVariance = 0;
  let otsuThreshold = 120;

  for (let t = 0; t < 256; t++) {
    weightBackground += hist[t];
    if (weightBackground === 0) continue;
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;

    sumBackground += t * hist[t];
    const meanBg = sumBackground / weightBackground;
    const meanFg = (sumAll - sumBackground) / weightForeground;

    const variance = weightBackground * weightForeground * (meanBg - meanFg) * (meanBg - meanFg);
    if (variance > maxVariance) {
      maxVariance = variance;
      otsuThreshold = t;
    }
  }

  const threshold = Math.max(65, Math.min(200, otsuThreshold - 10));

  // 3. Find extreme 4 corners using coordinate projection sums
  let minSum = Infinity;
  let maxSum = -Infinity;
  let minDiff = Infinity;
  let maxDiff = -Infinity;

  let tl: Point = { x: 0, y: 0 };
  let tr: Point = { x: procW, y: 0 };
  let br: Point = { x: procW, y: procH };
  let bl: Point = { x: 0, y: procH };

  let paperPixelCount = 0;

  for (let y = 0; y < procH; y++) {
    const yOffset = y * procW;
    for (let x = 0; x < procW; x++) {
      if (gray[yOffset + x] >= threshold) {
        paperPixelCount++;
        const sum = x + y;
        const diff = x - y;

        if (sum < minSum) {
          minSum = sum;
          tl = { x, y };
        }
        if (sum > maxSum) {
          maxSum = sum;
          br = { x, y };
        }
        if (diff > maxDiff) {
          maxDiff = diff;
          tr = { x, y };
        }
        if (diff < minDiff) {
          minDiff = diff;
          bl = { x, y };
        }
      }
    }
  }

  // Cleanup proc canvas
  procCanvas.width = 0;
  procCanvas.height = 0;

  // Fallback if not enough contrast / paper not found
  if (paperPixelCount < total * 0.08) {
    logger.timeEnd('Perspective', 'AutoDetectCorners');
    return calculateDefaultCorners(width, height, fallbackMargin);
  }

  // 4. Scale back to original dimensions
  const invScale = 1 / scale;
  const finalQuad: CornerQuad = {
    topLeft: {
      x: Math.max(0, Math.min(width, tl.x * invScale)),
      y: Math.max(0, Math.min(height, tl.y * invScale)),
    },
    topRight: {
      x: Math.max(0, Math.min(width, tr.x * invScale)),
      y: Math.max(0, Math.min(height, tr.y * invScale)),
    },
    bottomRight: {
      x: Math.max(0, Math.min(width, br.x * invScale)),
      y: Math.max(0, Math.min(height, br.y * invScale)),
    },
    bottomLeft: {
      x: Math.max(0, Math.min(width, bl.x * invScale)),
      y: Math.max(0, Math.min(height, bl.y * invScale)),
    },
  };

  logger.timeEnd('Perspective', 'AutoDetectCorners');

  if (!isValidQuad(finalQuad, width, height, 0.2)) {
    return calculateDefaultCorners(width, height, 0.04);
  }

  return finalQuad;
}

/**
 * Warp perspective of the quad in sourceCanvas into a rectangular flattened canvas with bounded resolution
 */
export function warpPerspectiveCrop(
  sourceCanvas: HTMLCanvasElement,
  corners: CornerQuad
): HTMLCanvasElement {
  logger.time('WarpPerspective');
  const { topLeft, topRight, bottomRight, bottomLeft } = corners;

  // Calculate destination dimensions
  const topWidth = euclideanDistance(topLeft, topRight);
  const bottomWidth = euclideanDistance(bottomLeft, bottomRight);
  const leftHeight = euclideanDistance(topLeft, bottomLeft);
  const rightHeight = euclideanDistance(topRight, bottomRight);

  let targetWidth = Math.max(300, Math.round(Math.max(topWidth, bottomWidth)));
  let targetHeight = Math.max(300, Math.round(Math.max(leftHeight, rightHeight)));

  // Bound max dimensions to prevent memory exhaustion on mobile
  const maxDim = APP_CONFIG.maxProcessingDimension;
  if (targetWidth > maxDim || targetHeight > maxDim) {
    const scale = Math.min(maxDim / targetWidth, maxDim / targetHeight);
    targetWidth = Math.round(targetWidth * scale);
    targetHeight = Math.round(targetHeight * scale);
  }

  const dstCorners: Point[] = [
    { x: 0, y: 0 },
    { x: targetWidth, y: 0 },
    { x: targetWidth, y: targetHeight },
    { x: 0, y: targetHeight },
  ];

  const srcCorners: Point[] = [topLeft, topRight, bottomRight, bottomLeft];
  const hInv = solvePerspectiveTransform(dstCorners, srcCorners);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = targetWidth;
  outCanvas.height = targetHeight;
  const outCtx = outCanvas.getContext('2d');
  const srcCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });

  if (!outCtx || !srcCtx) {
    return sourceCanvas;
  }

  const srcData = srcCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const srcPixels = srcData.data;
  const srcW = sourceCanvas.width;
  const srcH = sourceCanvas.height;

  const outData = outCtx.createImageData(targetWidth, targetHeight);
  const outPixels = outData.data;

  // Bilinear interpolation warp
  for (let y = 0; y < targetHeight; y++) {
    const yTargetOffset = y * targetWidth;
    for (let x = 0; x < targetWidth; x++) {
      const denom = hInv[6] * x + hInv[7] * y + hInv[8];
      const srcX = (hInv[0] * x + hInv[1] * y + hInv[2]) / denom;
      const srcY = (hInv[3] * x + hInv[4] * y + hInv[5]) / denom;

      if (srcX >= 0 && srcX < srcW - 1 && srcY >= 0 && srcY < srcH - 1) {
        const x0 = srcX | 0;
        const y0 = srcY | 0;
        const x1 = x0 + 1;
        const y1 = y0 + 1;

        const dx = srcX - x0;
        const dy = srcY - y0;

        const idx00 = (y0 * srcW + x0) * 4;
        const idx10 = (y0 * srcW + x1) * 4;
        const idx01 = (y1 * srcW + x0) * 4;
        const idx11 = (y1 * srcW + x1) * 4;

        const outIdx = (yTargetOffset + x) * 4;

        const oneMinusDx = 1 - dx;
        const oneMinusDy = 1 - dy;

        for (let c = 0; c < 3; c++) {
          const topVal = srcPixels[idx00 + c] * oneMinusDx + srcPixels[idx10 + c] * dx;
          const botVal = srcPixels[idx01 + c] * oneMinusDx + srcPixels[idx11 + c] * dx;
          outPixels[outIdx + c] = (topVal * oneMinusDy + botVal * dy) | 0;
        }
        outPixels[outIdx + 3] = 255;
      }
    }
  }

  outCtx.putImageData(outData, 0, 0);
  logger.timeEnd('Perspective', 'WarpPerspective');
  return outCanvas;
}
