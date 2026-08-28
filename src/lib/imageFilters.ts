export type ScannerFilter = 'original' | 'magic_color' | 'bw_document' | 'grayscale' | 'sharp';

export interface ImageEnhanceOptions {
  filter: ScannerFilter;
  autoLight?: boolean;
  brightness?: number; // -100 to +100
  contrast?: number;   // -100 to +100
  quality?: number;
}

/**
 * Advanced Local Illumination Normalization & Shadow Removal
 * Estimates paper background locally and divides it out,
 * eliminating uneven top/bottom room lighting and shadows.
 */
function normalizeIlluminationAndShadows(
  data: Uint8ClampedArray,
  width: number,
  height: number
) {
  // Step 1: Compute integral image for fast local box filter
  const integral = new Float64Array((width + 1) * (height + 1));
  const gray = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const g = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
      gray[y * width + x] = g;
      rowSum += g;
      integral[(y + 1) * (width + 1) + (x + 1)] = integral[y * (width + 1) + (x + 1)] + rowSum;
    }
  }

  // Radius for local background estimation (approx 4-5% of document width)
  const radius = Math.max(16, Math.round(width * 0.045));

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);

    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);

      const count = (x1 - x0) * (y1 - y0);
      const sum =
        integral[y1 * (width + 1) + x1] -
        integral[y0 * (width + 1) + x1] -
        integral[y1 * (width + 1) + x0] +
        integral[y0 * (width + 1) + x0];

      // Local background brightness (clamped to prevent division issues)
      const localBg = Math.max(30, sum / count);
      const idx = (y * width + x) * 4;

      // Illumination gain factor
      const gain = 248 / localBg;

      data[idx] = Math.min(255, Math.max(0, data[idx] * gain));
      data[idx + 1] = Math.min(255, Math.max(0, data[idx + 1] * gain));
      data[idx + 2] = Math.min(255, Math.max(0, data[idx + 2] * gain));
    }
  }
}

/**
 * Adaptive Binarization with Local Contrast Recovery for Magic B&W Mode
 * Preserves faint handwriting at the top of the page while whitening paper background.
 */
function applyAdaptiveMagicBW(
  data: Uint8ClampedArray,
  width: number,
  height: number
) {
  const integral = new Float64Array((width + 1) * (height + 1));

  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const g = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      rowSum += g;
      integral[(y + 1) * (width + 1) + (x + 1)] = integral[y * (width + 1) + (x + 1)] + rowSum;
    }
  }

  const radius = Math.max(10, Math.round(width * 0.025));

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);

    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);

      const count = (x1 - x0) * (y1 - y0);
      const sum =
        integral[y1 * (width + 1) + x1] -
        integral[y0 * (width + 1) + x1] -
        integral[y1 * (width + 1) + x0] +
        integral[y0 * (width + 1) + x0];

      const localMean = sum / count;
      const idx = (y * width + x) * 4;
      const currentGray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

      // Threshold slightly below local mean to cleanly separate ink from paper
      const threshold = localMean * 0.88;

      let val = 255; // White paper
      if (currentGray < threshold) {
        // Deep ink contrast
        val = Math.max(0, Math.round((currentGray / threshold) * 40));
      }

      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
    }
  }
}

/**
 * Apply filters, shadow removal, and brightness/contrast adjustments
 */
export async function applyImageFilter(
  imageSource: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
  options: ScannerFilter | ImageEnhanceOptions,
  legacyQuality: number = 0.94
): Promise<string> {
  const opts: ImageEnhanceOptions = typeof options === 'string'
    ? { filter: options, autoLight: true, brightness: 0, contrast: 0, quality: legacyQuality }
    : { autoLight: true, brightness: 0, contrast: 0, quality: legacyQuality, ...options };

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (!ctx) {
    throw new Error('Canvas 2D context not available');
  }

  let width = 0;
  let height = 0;

  if (imageSource instanceof HTMLVideoElement) {
    width = imageSource.videoWidth;
    height = imageSource.videoHeight;
  } else if (imageSource instanceof HTMLImageElement) {
    width = imageSource.naturalWidth || imageSource.width;
    height = imageSource.naturalHeight || imageSource.height;
  } else {
    width = imageSource.width;
    height = imageSource.height;
  }

  canvas.width = width;
  canvas.height = height;

  // Draw original image
  ctx.drawImage(imageSource, 0, 0, width, height);

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // 1. Auto Light & Shadow Normalization
  if (opts.autoLight && opts.filter !== 'original') {
    normalizeIlluminationAndShadows(data, width, height);
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
    // Ultra Clean Adaptive B&W mode (CamScanner quality)
    applyAdaptiveMagicBW(data, width, height);
  } else if (opts.filter === 'magic_color') {
    // Vivid Color Mode: whiten background, deepen colored inks/stamps
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      if (lum > 180) {
        // Whiten paper background
        const factor = (lum - 180) / 75;
        r = Math.min(255, r + (255 - r) * factor);
        g = Math.min(255, g + (255 - g) * factor);
        b = Math.min(255, b + (255 - b) * factor);
      } else {
        // Deepen text and preserve ink vibrance
        r = Math.max(0, r * 0.82);
        g = Math.max(0, g * 0.82);
        b = Math.max(0, b * 0.82);
      }

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  } else if (opts.filter === 'grayscale') {
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }
  } else if (opts.filter === 'sharp') {
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const factor = lum < 130 ? 0.75 : 1.25;

      data[i] = Math.min(255, Math.max(0, r * factor));
      data[i + 1] = Math.min(255, Math.max(0, g * factor));
      data[i + 2] = Math.min(255, Math.max(0, b * factor));
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/jpeg', opts.quality || 0.94);
}

/**
 * Load an image file or blob as an HTMLImageElement
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
