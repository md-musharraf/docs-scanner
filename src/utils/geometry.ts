import type { Point, CornerQuad } from '../core/types';

/**
 * Euclidean distance between two 2D points
 */
export function euclideanDistance(p1: Point, p2: Point): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Get default quad corners with an optional margin percentage
 */
export function calculateDefaultCorners(width: number, height: number, marginRatio: number = 0.04): CornerQuad {
  const mx = width * marginRatio;
  const my = height * marginRatio;
  return {
    topLeft: { x: mx, y: my },
    topRight: { x: width - mx, y: my },
    bottomRight: { x: width - mx, y: height - my },
    bottomLeft: { x: mx, y: height - my },
  };
}

/**
 * Clamp point within canvas dimensions
 */
export function clampPoint(p: Point, width: number, height: number): Point {
  return {
    x: Math.max(0, Math.min(width, p.x)),
    y: Math.max(0, Math.min(height, p.y)),
  };
}

/**
 * Validates if the quadrilateral has plausible geometric dimensions for a document
 */
export function isValidQuad(quad: CornerQuad, width: number, height: number, minRatio: number = 0.2): boolean {
  const widthTop = euclideanDistance(quad.topLeft, quad.topRight);
  const widthBot = euclideanDistance(quad.bottomLeft, quad.bottomRight);
  const heightLeft = euclideanDistance(quad.topLeft, quad.bottomLeft);
  const heightRight = euclideanDistance(quad.topRight, quad.bottomRight);

  return (
    widthTop >= width * minRatio &&
    widthBot >= width * minRatio &&
    heightLeft >= height * minRatio &&
    heightRight >= height * minRatio
  );
}

/**
 * Solve 8 linear equations using Gaussian elimination to find 3x3 Homography Matrix
 */
export function solvePerspectiveTransform(src: Point[], dst: Point[]): number[] {
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
