import { PDFDocument, rgb, degrees, StandardFonts, PageSizes } from 'pdf-lib';

export interface ImageToPdfOptions {
  pageSize: 'a4' | 'letter' | 'fit';
  orientation: 'portrait' | 'landscape';
  margin: number; // in points (e.g., 20)
}

export interface WatermarkOptions {
  text: string;
  fontSize?: number;
  opacity?: number;
  color?: { r: number; g: number; b: number };
  angle?: number;
}

/**
 * Merge multiple PDF byte buffers into a single PDF
 */
export async function mergePDFs(pdfBuffers: ArrayBuffer[]): Promise<Uint8Array> {
  const mergedPdf = await PDFDocument.create();

  for (const buffer of pdfBuffers) {
    const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }

  return await mergedPdf.save();
}

/**
 * Split / Extract selected pages from a PDF
 * @param pageIndices 0-indexed array of page numbers to include
 */
export async function splitPDF(pdfBuffer: ArrayBuffer, pageIndices: number[]): Promise<Uint8Array> {
  const sourcePdf = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const newPdf = await PDFDocument.create();

  const validIndices = pageIndices.filter((idx) => idx >= 0 && idx < sourcePdf.getPageCount());
  if (validIndices.length === 0) {
    throw new Error('No valid pages selected for export');
  }

  const copiedPages = await newPdf.copyPages(sourcePdf, validIndices);
  copiedPages.forEach((page) => newPdf.addPage(page));

  return await newPdf.save();
}

/**
 * Convert an array of image data URLs to a multi-page PDF
 */
export async function imagesToPDF(
  images: { dataUrl: string; width?: number; height?: number }[],
  options: ImageToPdfOptions = { pageSize: 'a4', orientation: 'portrait', margin: 20 }
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  for (const imgItem of images) {
    let embeddedImage;
    if (imgItem.dataUrl.startsWith('data:image/png')) {
      embeddedImage = await pdfDoc.embedPng(imgItem.dataUrl);
    } else {
      // JPEG or default
      embeddedImage = await pdfDoc.embedJpg(imgItem.dataUrl);
    }

    const imgWidth = embeddedImage.width;
    const imgHeight = embeddedImage.height;

    let pageWidth = PageSizes.A4[0];
    let pageHeight = PageSizes.A4[1];

    if (options.pageSize === 'letter') {
      pageWidth = PageSizes.Letter[0];
      pageHeight = PageSizes.Letter[1];
    } else if (options.pageSize === 'fit') {
      pageWidth = imgWidth + options.margin * 2;
      pageHeight = imgHeight + options.margin * 2;
    }

    if (options.pageSize !== 'fit' && options.orientation === 'landscape') {
      const temp = pageWidth;
      pageWidth = pageHeight;
      pageHeight = temp;
    }

    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    const margin = options.pageSize === 'fit' ? options.margin : options.margin;

    const availableWidth = pageWidth - margin * 2;
    const availableHeight = pageHeight - margin * 2;

    // Calculate aspect ratio fit
    const scale = Math.min(availableWidth / imgWidth, availableHeight / imgHeight);
    const drawWidth = imgWidth * scale;
    const drawHeight = imgHeight * scale;

    const x = margin + (availableWidth - drawWidth) / 2;
    const y = margin + (availableHeight - drawHeight) / 2;

    page.drawImage(embeddedImage, {
      x,
      y,
      width: drawWidth,
      height: drawHeight,
    });
  }

  return await pdfDoc.save();
}

/**
 * Rotate specific pages or all pages of a PDF
 */
export async function rotatePDFPages(
  pdfBuffer: ArrayBuffer,
  rotationMap: Record<number, number> // pageIndex -> rotation degrees (e.g. 90, 180, 270)
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  for (const [indexStr, angle] of Object.entries(rotationMap)) {
    const idx = parseInt(indexStr, 10);
    if (idx >= 0 && idx < pages.length) {
      const currentRotation = pages[idx].getRotation().angle;
      pages[idx].setRotation(degrees((currentRotation + angle) % 360));
    }
  }

  return await pdfDoc.save();
}

/**
 * Add watermark text to all pages of a PDF
 */
export async function addWatermarkToPDF(
  pdfBuffer: ArrayBuffer,
  options: WatermarkOptions
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();

  const fontSize = options.fontSize || 42;
  const opacity = options.opacity !== undefined ? options.opacity : 0.25;
  const color = options.color
    ? rgb(options.color.r, options.color.g, options.color.b)
    : rgb(0.5, 0.5, 0.5);
  const angle = degrees(options.angle !== undefined ? options.angle : -45);

  for (const page of pages) {
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(options.text, fontSize);
    const textHeight = font.heightAtSize(fontSize);

    page.drawText(options.text, {
      x: width / 2 - textWidth / 3,
      y: height / 2 - textHeight / 3,
      size: fontSize,
      font,
      color,
      opacity,
      rotate: angle,
    });
  }

  return await pdfDoc.save();
}

/**
 * Remove specific pages from a PDF
 */
export async function removePagesFromPDF(
  pdfBuffer: ArrayBuffer,
  indicesToRemove: number[]
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const total = pdfDoc.getPageCount();
  const keepIndices = [];

  for (let i = 0; i < total; i++) {
    if (!indicesToRemove.includes(i)) {
      keepIndices.push(i);
    }
  }

  const newDoc = await PDFDocument.create();
  const copied = await newDoc.copyPages(pdfDoc, keepIndices);
  copied.forEach((p) => newDoc.addPage(p));

  return await newDoc.save();
}
