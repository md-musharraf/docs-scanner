import type { Point, CornerQuad } from '../core/types';
import {
  euclideanDistance,
  calculateDefaultCorners,
  isValidQuad,
  solvePerspectiveTransform,
  clampPoint,
  polygonArea,
  estimatePerspectiveDimensions,
  disposeCanvas,
} from '../utils/geometry';
import { APP_CONFIG } from '../core/constants';
import { logger } from '../core/logger';

export type { Point, CornerQuad };
export { calculateDefaultCorners };
export const getDefaultCorners = calculateDefaultCorners;
export const dist = euclideanDistance;

/**
 * High-Accuracy Intelligent Document Edge & 4-Corner Detection
 * Combines Gaussian smoothing, Sobel edge gradients, radial boundary projection,
 * and corner peak refinement to detect paper borders accurately on any surface.
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

  // Downsample to fast resolution for computer vision processing
  const maxDim = 360;
  const scale = Math.min(maxDim / width, maxDim / height);
  const procW = Math.max(64, Math.round(width * scale));
  const procH = Math.max(64, Math.round(height * scale));

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
  const total = procW * procH;

  // 1. Grayscale conversion with perceptual luminance
  const gray = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    // Standard Rec. 601 luma: (R*299 + G*587 + B*114) / 1000
    gray[i] = (data[idx] * 77 + data[idx + 1] * 150 + data[idx + 2] * 29) >> 8;
  }

  // 2. 3x3 Gaussian Blur to remove noise & high-frequency text inside page
  const blurred = new Uint8Array(total);
  for (let y = 1; y < procH - 1; y++) {
    const prevY = (y - 1) * procW;
    const currY = y * procW;
    const nextY = (y + 1) * procW;
    for (let x = 1; x < procW - 1; x++) {
      const val =
        gray[prevY + x - 1] + 2 * gray[prevY + x] + gray[prevY + x + 1] +
        2 * gray[currY + x - 1] + 4 * gray[currY + x] + 2 * gray[currY + x + 1] +
        gray[nextY + x - 1] + 2 * gray[nextY + x] + gray[nextY + x + 1];
      blurred[currY + x] = val >> 4;
    }
  }

  // 3. 3x3 Sobel Gradient Magnitude to emphasize document borders
  const gradient = new Uint8Array(total);
  let maxGrad = 0;
  for (let y = 1; y < procH - 1; y++) {
    const prevY = (y - 1) * procW;
    const currY = y * procW;
    const nextY = (y + 1) * procW;
    for (let x = 1; x < procW - 1; x++) {
      // Horizontal gradient
      const gx =
        -blurred[prevY + x - 1] + blurred[prevY + x + 1] +
        -2 * blurred[currY + x - 1] + 2 * blurred[currY + x + 1] +
        -blurred[nextY + x - 1] + blurred[nextY + x + 1];

      // Vertical gradient
      const gy =
        -blurred[prevY + x - 1] - 2 * blurred[prevY + x] - blurred[prevY + x + 1] +
        blurred[nextY + x - 1] + 2 * blurred[nextY + x] + blurred[nextY + x + 1];

      const mag = Math.min(255, (Math.abs(gx) + Math.abs(gy)) >> 1);
      gradient[currY + x] = mag;
      if (mag > maxGrad) maxGrad = mag;
    }
  }

  // 4. Multi-ray radial boundary scanning from center
  const centerX = procW / 2;
  const centerY = procH / 2;
  const gradThreshold = Math.max(25, Math.round(maxGrad * 0.28));
  const numRays = 48;
  const boundaryPoints: Point[] = [];

  for (let r = 0; r < numRays; r++) {
    const angle = (r * 2 * Math.PI) / numRays;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const maxDist = Math.hypot(procW, procH) / 2;

    let foundEdge: Point | null = null;

    // Scan inward from outer perimeter to latch onto document edge, then outward fallback
    for (let step = maxDist - 4; step >= 15; step -= 1.5) {
      const px = Math.round(centerX + cosA * step);
      const py = Math.round(centerY + sinA * step);

      if (px <= 2 || px >= procW - 3 || py <= 2 || py >= procH - 3) {
        continue;
      }

      const gVal = gradient[py * procW + px];
      if (gVal > gradThreshold) {
        foundEdge = { x: px, y: py };
        break;
      }
    }

    if (!foundEdge) {
      let maxLocalGrad = 0;
      for (let step = 15; step < maxDist; step += 1.5) {
        const px = Math.round(centerX + cosA * step);
        const py = Math.round(centerY + sinA * step);

        if (px <= 2 || px >= procW - 3 || py <= 2 || py >= procH - 3) {
          break;
        }

        const gVal = gradient[py * procW + px];
        if (gVal > gradThreshold && gVal > maxLocalGrad) {
          maxLocalGrad = gVal;
          foundEdge = { x: px, y: py };
        }
      }
    }

    if (foundEdge) {
      boundaryPoints.push(foundEdge);
    }
  }

  // Release processing canvas safely
  disposeCanvas(procCanvas);

  // 5. If radial boundary produced enough points, partition into 4 quadrants
  let detectedQuad: CornerQuad | null = null;

  if (boundaryPoints.length >= 16) {
    // Quadrant candidates:
    // Top-Left: x < centerX && y < centerY (minimize x + y)
    // Top-Right: x >= centerX && y < centerY (maximize x - y)
    // Bottom-Right: x >= centerX && y >= centerY (maximize x + y)
    // Bottom-Left: x < centerX && y >= centerY (minimize x - y)

    let tlCandidate: Point | null = null;
    let trCandidate: Point | null = null;
    let brCandidate: Point | null = null;
    let blCandidate: Point | null = null;

    let minSum = Infinity;
    let maxDiff = -Infinity;
    let maxSum = -Infinity;
    let minDiff = Infinity;

    for (const pt of boundaryPoints) {
      const sum = pt.x + pt.y;
      const diff = pt.x - pt.y;

      if (pt.x <= centerX && pt.y <= centerY) {
        if (sum < minSum) {
          minSum = sum;
          tlCandidate = pt;
        }
      }
      if (pt.x >= centerX && pt.y <= centerY) {
        if (diff > maxDiff) {
          maxDiff = diff;
          trCandidate = pt;
        }
      }
      if (pt.x >= centerX && pt.y >= centerY) {
        if (sum > maxSum) {
          maxSum = sum;
          brCandidate = pt;
        }
      }
      if (pt.x <= centerX && pt.y >= centerY) {
        if (diff < minDiff) {
          minDiff = diff;
          blCandidate = pt;
        }
      }
    }

    if (tlCandidate && trCandidate && brCandidate && blCandidate) {
      const invScale = 1 / scale;
      const scaledQuad: CornerQuad = {
        topLeft: clampPoint({ x: tlCandidate.x * invScale, y: tlCandidate.y * invScale }, width, height),
        topRight: clampPoint({ x: trCandidate.x * invScale, y: trCandidate.y * invScale }, width, height),
        bottomRight: clampPoint({ x: brCandidate.x * invScale, y: brCandidate.y * invScale }, width, height),
        bottomLeft: clampPoint({ x: blCandidate.x * invScale, y: blCandidate.y * invScale }, width, height),
      };

      const qArea = polygonArea([
        scaledQuad.topLeft,
        scaledQuad.topRight,
        scaledQuad.bottomRight,
        scaledQuad.bottomLeft,
      ]);

      const totalArea = width * height;

      if (isValidQuad(scaledQuad, width, height, 0.15) && qArea > totalArea * 0.15) {
        detectedQuad = scaledQuad;
      }
    }
  }

  // 6. Secondary fallback: Otsu luminance distribution
  if (!detectedQuad) {
    const hist = new Int32Array(256);
    for (let i = 0; i < total; i++) hist[gray[i]]++;

    let sumAll = 0;
    for (let t = 0; t < 256; t++) sumAll += t * hist[t];

    let sumBg = 0;
    let weightBg = 0;
    let maxVariance = 0;
    let otsuT = 120;

    for (let t = 0; t < 256; t++) {
      weightBg += hist[t];
      if (weightBg === 0) continue;
      const weightFg = total - weightBg;
      if (weightFg === 0) break;

      sumBg += t * hist[t];
      const meanBg = sumBg / weightBg;
      const meanFg = (sumAll - sumBg) / weightFg;
      const variance = weightBg * weightFg * (meanBg - meanFg) * (meanBg - meanFg);
      if (variance > maxVariance) {
        maxVariance = variance;
        otsuT = t;
      }
    }

    const threshold = Math.max(55, Math.min(210, otsuT - 8));
    let minSum = Infinity;
    let maxSum = -Infinity;
    let minDiff = Infinity;
    let maxDiff = -Infinity;

    let tl: Point = { x: 0, y: 0 };
    let tr: Point = { x: procW, y: 0 };
    let br: Point = { x: procW, y: procH };
    let bl: Point = { x: 0, y: procH };
    let paperCount = 0;

    for (let y = 0; y < procH; y++) {
      const yOff = y * procW;
      for (let x = 0; x < procW; x++) {
        if (gray[yOff + x] >= threshold) {
          paperCount++;
          const sum = x + y;
          const diff = x - y;
          if (sum < minSum) { minSum = sum; tl = { x, y }; }
          if (sum > maxSum) { maxSum = sum; br = { x, y }; }
          if (diff > maxDiff) { maxDiff = diff; tr = { x, y }; }
          if (diff < minDiff) { minDiff = diff; bl = { x, y }; }
        }
      }
    }

    if (paperCount >= total * 0.1) {
      const invScale = 1 / scale;
      const otsuQuad: CornerQuad = {
        topLeft: clampPoint({ x: tl.x * invScale, y: tl.y * invScale }, width, height),
        topRight: clampPoint({ x: tr.x * invScale, y: tr.y * invScale }, width, height),
        bottomRight: clampPoint({ x: br.x * invScale, y: br.y * invScale }, width, height),
        bottomLeft: clampPoint({ x: bl.x * invScale, y: bl.y * invScale }, width, height),
      };

      if (isValidQuad(otsuQuad, width, height, 0.18)) {
        detectedQuad = otsuQuad;
      }
    }
  }

  logger.timeEnd('Perspective', 'AutoDetectCorners');

  return detectedQuad || calculateDefaultCorners(width, height, fallbackMargin);
}

/**
 * Warp perspective of the quad in sourceCanvas into a rectangular flattened canvas with bounded resolution
 * and high-fidelity bilinear interpolation.
 */
export function warpPerspectiveCrop(
  sourceCanvas: HTMLCanvasElement,
  corners: CornerQuad
): HTMLCanvasElement {
  logger.time('WarpPerspective');
  const { topLeft, topRight, bottomRight, bottomLeft } = corners;

  // Calculate destination dimensions from quad edges using perspective estimation
  const { width: targetWidth, height: targetHeight } = estimatePerspectiveDimensions(
    corners,
    APP_CONFIG.maxProcessingDimension
  );

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

  // High quality bilinear interpolation warp with edge clamping and optimized row terms
  for (let y = 0; y < targetHeight; y++) {
    const yTargetOffset = y * targetWidth;
    const h0y = hInv[1] * y + hInv[2];
    const h1y = hInv[4] * y + hInv[5];
    const h2y = hInv[7] * y + hInv[8];

    for (let x = 0; x < targetWidth; x++) {
      const denom = hInv[6] * x + h2y;
      const invDenom = denom !== 0 ? 1 / denom : 1;
      const srcX = (hInv[0] * x + h0y) * invDenom;
      const srcY = (hInv[3] * x + h1y) * invDenom;

      // Clamped bilinear coordinates
      const clampedX = Math.max(0, Math.min(srcW - 1.001, srcX));
      const clampedY = Math.max(0, Math.min(srcH - 1.001, srcY));

      const x0 = clampedX | 0;
      const y0 = clampedY | 0;
      const x1 = Math.min(srcW - 1, x0 + 1);
      const y1 = Math.min(srcH - 1, y0 + 1);

      const dx = clampedX - x0;
      const dy = clampedY - y0;

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
        outPixels[outIdx + c] = Math.round(topVal * oneMinusDy + botVal * dy);
      }
      outPixels[outIdx + 3] = 255;
    }
  }

  outCtx.putImageData(outData, 0, 0);
  logger.timeEnd('Perspective', 'WarpPerspective');
  return outCanvas;
}
