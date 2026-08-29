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
export function calculateDefaultCorners(
  width: number,
  height: number,
  marginRatio: number = 0.04
): CornerQuad {
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
 * Check if a 4-point polygon is strictly convex
 */
export function isConvexPolygon(points: Point[]): boolean {
  if (points.length < 4) return false;
  let sign = 0;

  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const p3 = points[(i + 2) % points.length];

    const dx1 = p2.x - p1.x;
    const dy1 = p2.y - p1.y;
    const dx2 = p3.x - p2.x;
    const dy2 = p3.y - p2.y;

    const crossProduct = dx1 * dy2 - dy1 * dx2;
    if (crossProduct !== 0) {
      const currentSign = crossProduct > 0 ? 1 : -1;
      if (sign === 0) {
        sign = currentSign;
      } else if (sign !== currentSign) {
        return false; // Cross products have different signs -> concave or self-intersecting
      }
    }
  }

  return true;
}

/**
 * Calculate polygon area using Shoelace formula
 */
export function polygonArea(points: Point[]): number {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * Validates if the quadrilateral has plausible geometric dimensions and convexity for a document
 */
export function isValidQuad(
  quad: CornerQuad,
  width: number,
  height: number,
  minRatio: number = 0.15
): boolean {
  const widthTop = euclideanDistance(quad.topLeft, quad.topRight);
  const widthBot = euclideanDistance(quad.bottomLeft, quad.bottomRight);
  const heightLeft = euclideanDistance(quad.topLeft, quad.bottomLeft);
  const heightRight = euclideanDistance(quad.topRight, quad.bottomRight);

  const minW = width * minRatio;
  const minH = height * minRatio;

  if (widthTop < minW || widthBot < minW || heightLeft < minH || heightRight < minH) {
    return false;
  }

  const points = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  return isConvexPolygon(points);
}

/**
 * Get the midpoints of the four edges of a quadrilateral
 */
export function getQuadMidpoints(quad: CornerQuad): {
  top: Point;
  right: Point;
  bottom: Point;
  left: Point;
} {
  return {
    top: {
      x: (quad.topLeft.x + quad.topRight.x) / 2,
      y: (quad.topLeft.y + quad.topRight.y) / 2,
    },
    right: {
      x: (quad.topRight.x + quad.bottomRight.x) / 2,
      y: (quad.topRight.y + quad.bottomRight.y) / 2,
    },
    bottom: {
      x: (quad.bottomLeft.x + quad.bottomRight.x) / 2,
      y: (quad.bottomLeft.y + quad.bottomRight.y) / 2,
    },
    left: {
      x: (quad.topLeft.x + quad.bottomLeft.x) / 2,
      y: (quad.topLeft.y + quad.bottomLeft.y) / 2,
    },
  };
}

/**
 * Rotate a quad clockwise by 90, 180, or 270 degrees around image dimensions
 */
export function rotateQuad(
  quad: CornerQuad,
  angleDegrees: number,
  srcWidth: number,
  srcHeight: number
): CornerQuad {
  const normAngle = ((angleDegrees % 360) + 360) % 360;
  if (normAngle === 0) return { ...quad };

  const rotatePoint = (p: Point): Point => {
    if (normAngle === 90) {
      return { x: srcHeight - p.y, y: p.x };
    } else if (normAngle === 180) {
      return { x: srcWidth - p.x, y: srcHeight - p.y };
    } else if (normAngle === 270) {
      return { x: p.y, y: srcWidth - p.x };
    }
    return p;
  };

  if (normAngle === 90) {
    return {
      topLeft: rotatePoint(quad.bottomLeft),
      topRight: rotatePoint(quad.topLeft),
      bottomRight: rotatePoint(quad.topRight),
      bottomLeft: rotatePoint(quad.bottomRight),
    };
  } else if (normAngle === 180) {
    return {
      topLeft: rotatePoint(quad.bottomRight),
      topRight: rotatePoint(quad.bottomLeft),
      bottomRight: rotatePoint(quad.topLeft),
      bottomLeft: rotatePoint(quad.topRight),
    };
  } else if (normAngle === 270) {
    return {
      topLeft: rotatePoint(quad.topRight),
      topRight: rotatePoint(quad.bottomRight),
      bottomRight: rotatePoint(quad.bottomLeft),
      bottomLeft: rotatePoint(quad.topLeft),
    };
  }

  return { ...quad };
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
