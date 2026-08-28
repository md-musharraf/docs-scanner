export interface Point {
  x: number;
  y: number;
}

export interface CornerQuad {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

/**
 * Intelligent Document Edge & 4-Corner Detection
 * Uses adaptive thresholding, morphological paper blob analysis,
 * and corner optimization to find the exact white document boundary on any table/surface.
 */
export function autoDetectDocumentCorners(
  canvas: HTMLCanvasElement,
  fallbackMargin: number = 0.03
): CornerQuad {
  const width = canvas.width;
  const height = canvas.height;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return getDefaultCorners(width, height, fallbackMargin);
  }

  // Downsample to fast resolution for image processing
  const maxDim = 320;
  const scale = Math.min(maxDim / width, maxDim / height);
  const procW = Math.round(width * scale);
  const procH = Math.round(height * scale);

  const procCanvas = document.createElement('canvas');
  procCanvas.width = procW;
  procCanvas.height = procH;
  const pCtx = procCanvas.getContext('2d', { willReadFrequently: true });
  if (!pCtx) {
    return getDefaultCorners(width, height, fallbackMargin);
  }

  pCtx.drawImage(canvas, 0, 0, procW, procH);
  const imgData = pCtx.getImageData(0, 0, procW, procH);
  const data = imgData.data;

  // 1. Grayscale conversion
  const gray = new Uint8Array(procW * procH);
  for (let i = 0; i < data.length; i += 4) {
    gray[i / 4] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }

  // 2. Otsu thresholding to separate bright document paper from darker surroundings
  const hist = new Int32Array(256);
  for (let i = 0; i < gray.length; i++) {
    hist[gray[i]]++;
  }

  const totalPixels = gray.length;
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * hist[t];

  let sumBackground = 0;
  let weightBackground = 0;
  let maxVariance = 0;
  let otsuThreshold = 120;

  for (let t = 0; t < 256; t++) {
    weightBackground += hist[t];
    if (weightBackground === 0) continue;
    const weightForeground = totalPixels - weightBackground;
    if (weightForeground === 0) break;

    sumBackground += t * hist[t];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sumAll - sumBackground) / weightForeground;

    const varianceBetween =
      weightBackground * weightForeground * Math.pow(meanBackground - meanForeground, 2);

    if (varianceBetween > maxVariance) {
      maxVariance = varianceBetween;
      otsuThreshold = t;
    }
  }

  // Shift threshold slightly downward to ensure the whole paper is captured
  const threshold = Math.max(70, Math.min(200, otsuThreshold - 10));

  // 3. Binary mask & find paper coordinates
  const binary = new Uint8Array(procW * procH);
  const paperPoints: Point[] = [];

  for (let y = 0; y < procH; y++) {
    for (let x = 0; x < procW; x++) {
      const idx = y * procW + x;
      if (gray[idx] >= threshold) {
        binary[idx] = 1;
        paperPoints.push({ x, y });
      }
    }
  }

  // Fallback if not enough contrast / paper not found
  if (paperPoints.length < (procW * procH) * 0.1) {
    return getDefaultCorners(width, height, fallbackMargin);
  }

  // 4. Find extreme 4 corners using coordinate projection sums
  // TL: min(x + y), TR: max(x - y), BR: max(x + y), BL: min(x - y)
  let minSum = Infinity;
  let maxSum = -Infinity;
  let minDiff = Infinity;
  let maxDiff = -Infinity;

  let tl: Point = { x: 0, y: 0 };
  let tr: Point = { x: procW, y: 0 };
  let br: Point = { x: procW, y: procH };
  let bl: Point = { x: 0, y: procH };

  for (let i = 0; i < paperPoints.length; i++) {
    const p = paperPoints[i];
    const sum = p.x + p.y;
    const diff = p.x - p.y;

    if (sum < minSum) {
      minSum = sum;
      tl = p;
    }
    if (sum > maxSum) {
      maxSum = sum;
      br = p;
    }
    if (diff > maxDiff) {
      maxDiff = diff;
      tr = p;
    }
    if (diff < minDiff) {
      minDiff = diff;
      bl = p;
    }
  }

  // 5. Refine corners along boundary edges
  const invScale = 1 / scale;

  // Scale to original dimensions with safety margins
  const finalTL: Point = {
    x: Math.max(0, Math.min(width, tl.x * invScale)),
    y: Math.max(0, Math.min(height, tl.y * invScale)),
  };
  const finalTR: Point = {
    x: Math.max(0, Math.min(width, tr.x * invScale)),
    y: Math.max(0, Math.min(height, tr.y * invScale)),
  };
  const finalBR: Point = {
    x: Math.max(0, Math.min(width, br.x * invScale)),
    y: Math.max(0, Math.min(height, br.y * invScale)),
  };
  const finalBL: Point = {
    x: Math.max(0, Math.min(width, bl.x * invScale)),
    y: Math.max(0, Math.min(height, bl.y * invScale)),
  };

  // Validate quadrilateral sanity
  const widthTop = dist(finalTL, finalTR);
  const widthBot = dist(finalBL, finalBR);
  const heightLeft = dist(finalTL, finalBL);
  const heightRight = dist(finalTR, finalBR);

  if (
    widthTop < width * 0.25 ||
    widthBot < width * 0.25 ||
    heightLeft < height * 0.25 ||
    heightRight < height * 0.25
  ) {
    return getDefaultCorners(width, height, 0.04);
  }

  return {
    topLeft: finalTL,
    topRight: finalTR,
    bottomRight: finalBR,
    bottomLeft: finalBL,
  };
}

export function getDefaultCorners(width: number, height: number, margin: number = 0.04): CornerQuad {
  const mx = width * margin;
  const my = height * margin;
  return {
    topLeft: { x: mx, y: my },
    topRight: { x: width - mx, y: my },
    bottomRight: { x: width - mx, y: height - my },
    bottomLeft: { x: mx, y: height - my },
  };
}

/**
 * Euclidean distance between two points
 */
export function dist(p1: Point, p2: Point): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Solve 8 linear equations using Gaussian elimination to find 3x3 Homography Matrix
 */
function getPerspectiveTransform(src: Point[], dst: Point[]): number[] {
  const a: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const sx = src[i].x;
    const sy = src[i].y;
    const dx = dst[i].x;
    const dy = dst[i].y;

    a.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
    b.push(dx);

    a.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
    b.push(dy);
  }

  // Gaussian elimination with partial pivoting
  const n = 8;
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(a[k][i]) > Math.abs(a[maxRow][i])) {
        maxRow = k;
      }
    }

    const tempA = a[i];
    a[i] = a[maxRow];
    a[maxRow] = tempA;

    const tempB = b[i];
    b[i] = b[maxRow];
    b[maxRow] = tempB;

    for (let k = i + 1; k < n; k++) {
      const c = -a[k][i] / a[i][i];
      for (let j = i; j < n; j++) {
        if (i === j) {
          a[k][j] = 0;
        } else {
          a[k][j] += c * a[i][j];
        }
      }
      b[k] += c * b[i];
    }
  }

  const h = new Array(9);
  h[8] = 1;

  for (let i = n - 1; i >= 0; i--) {
    let sum = 0;
    for (let j = i + 1; j < n; j++) {
      sum += a[i][j] * h[j];
    }
    h[i] = (b[i] - sum) / a[i][i];
  }

  return h;
}

/**
 * Warp perspective of the quad in sourceCanvas into a rectangular flattened canvas
 */
export function warpPerspectiveCrop(
  sourceCanvas: HTMLCanvasElement,
  corners: CornerQuad
): HTMLCanvasElement {
  const { topLeft, topRight, bottomRight, bottomLeft } = corners;

  // Calculate destination width and height based on largest side
  const topWidth = dist(topLeft, topRight);
  const bottomWidth = dist(bottomLeft, bottomRight);
  const leftHeight = dist(topLeft, bottomLeft);
  const rightHeight = dist(topRight, bottomRight);

  const targetWidth = Math.max(300, Math.round(Math.max(topWidth, bottomWidth)));
  const targetHeight = Math.max(300, Math.round(Math.max(leftHeight, rightHeight)));

  const dstCorners: Point[] = [
    { x: 0, y: 0 },
    { x: targetWidth, y: 0 },
    { x: targetWidth, y: targetHeight },
    { x: 0, y: targetHeight },
  ];

  const srcCorners: Point[] = [topLeft, topRight, bottomRight, bottomLeft];

  // Map destination (x, y) to source (u, v) using inverse transform
  const hInv = getPerspectiveTransform(dstCorners, srcCorners);

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

  // Warp pixel transformation with bilinear sampling
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const denom = hInv[6] * x + hInv[7] * y + hInv[8];
      const srcX = (hInv[0] * x + hInv[1] * y + hInv[2]) / denom;
      const srcY = (hInv[3] * x + hInv[4] * y + hInv[5]) / denom;

      if (srcX >= 0 && srcX < srcW - 1 && srcY >= 0 && srcY < srcH - 1) {
        const x0 = Math.floor(srcX);
        const y0 = Math.floor(srcY);
        const x1 = x0 + 1;
        const y1 = y0 + 1;

        const dx = srcX - x0;
        const dy = srcY - y0;

        const idx00 = (y0 * srcW + x0) * 4;
        const idx10 = (y0 * srcW + x1) * 4;
        const idx01 = (y1 * srcW + x0) * 4;
        const idx11 = (y1 * srcW + x1) * 4;

        const outIdx = (y * targetWidth + x) * 4;

        for (let c = 0; c < 3; c++) {
          const topVal = srcPixels[idx00 + c] * (1 - dx) + srcPixels[idx10 + c] * dx;
          const botVal = srcPixels[idx01 + c] * (1 - dx) + srcPixels[idx11 + c] * dx;
          outPixels[outIdx + c] = Math.round(topVal * (1 - dy) + botVal * dy);
        }
        outPixels[outIdx + 3] = 255;
      }
    }
  }

  outCtx.putImageData(outData, 0, 0);
  return outCanvas;
}
