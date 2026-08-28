import { PDFDocument, rgb, degrees, StandardFonts, PageSizes } from 'pdf-lib';
import type { ImageToPdfOptions, WatermarkOptions } from '../core/types';
import { logger } from '../core/logger';

export type { ImageToPdfOptions, WatermarkOptions };

/**
 * Merge multiple PDF byte buffers into a single PDF
 */
export async function mergePDFs(pdfBuffers: ArrayBuffer[]): Promise<Uint8Array> {
  logger.time('MergePDFs');
  try {
    const mergedPdf = await PDFDocument.create();

    for (const buffer of pdfBuffers) {
      const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    const saved = await mergedPdf.save();
    logger.timeEnd('PdfEngine', 'MergePDFs');
    return saved;
  } catch (err) {
    logger.error('PdfEngine', 'Error merging PDFs', err);
    throw err;
  }
}

/**
 * Split / Extract selected pages from a PDF
 * @param pageIndices 0-indexed array of page numbers to include
 */
export async function splitPDF(pdfBuffer: ArrayBuffer, pageIndices: number[]): Promise<Uint8Array> {
  logger.time('SplitPDF');
  try {
    const sourcePdf = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const newPdf = await PDFDocument.create();

    const totalPages = sourcePdf.getPageCount();
    const validIndices = pageIndices.filter((idx) => idx >= 0 && idx < totalPages);
    if (validIndices.length === 0) {
      throw new Error('No valid pages selected for export');
    }

    const copiedPages = await newPdf.copyPages(sourcePdf, validIndices);
    copiedPages.forEach((page) => newPdf.addPage(page));

    const saved = await newPdf.save();
    logger.timeEnd('PdfEngine', 'SplitPDF');
    return saved;
  } catch (err) {
    logger.error('PdfEngine', 'Error splitting PDF', err);
    throw err;
  }
}

/**
 * Convert an array of image data URLs to a multi-page PDF
 */
export async function imagesToPDF(
  images: { dataUrl: string; width?: number; height?: number }[],
  options: ImageToPdfOptions = { pageSize: 'a4', orientation: 'portrait', margin: 20 }
): Promise<Uint8Array> {
  logger.time('ImagesToPDF');
  try {
    const pdfDoc = await PDFDocument.create();

    for (const imgItem of images) {
      let embeddedImage;
      if (imgItem.dataUrl.startsWith('data:image/png')) {
        embeddedImage = await pdfDoc.embedPng(imgItem.dataUrl);
      } else {
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
      const margin = options.margin;

      const availableWidth = Math.max(10, pageWidth - margin * 2);
      const availableHeight = Math.max(10, pageHeight - margin * 2);

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

    const saved = await pdfDoc.save();
    logger.timeEnd('PdfEngine', 'ImagesToPDF');
    return saved;
  } catch (err) {
    logger.error('PdfEngine', 'Error converting images to PDF', err);
    throw err;
  }
}

/**
 * Rotate specific pages or all pages of a PDF
 */
export async function rotatePDFPages(
  pdfBuffer: ArrayBuffer,
  rotationMap: Record<number, number>
): Promise<Uint8Array> {
  logger.time('RotatePDF');
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();

    for (const [indexStr, angle] of Object.entries(rotationMap)) {
      const idx = parseInt(indexStr, 10);
      if (idx >= 0 && idx < pages.length) {
        const currentRotation = pages[idx].getRotation().angle;
        pages[idx].setRotation(degrees((currentRotation + angle) % 360));
      }
    }

    const saved = await pdfDoc.save();
    logger.timeEnd('PdfEngine', 'RotatePDF');
    return saved;
  } catch (err) {
    logger.error('PdfEngine', 'Error rotating PDF pages', err);
    throw err;
  }
}

/**
 * Add watermark text to all pages of a PDF
 */
export async function addWatermarkToPDF(
  pdfBuffer: ArrayBuffer,
  options: WatermarkOptions
): Promise<Uint8Array> {
  logger.time('WatermarkPDF');
  try {
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

    const saved = await pdfDoc.save();
    logger.timeEnd('PdfEngine', 'WatermarkPDF');
    return saved;
  } catch (err) {
    logger.error('PdfEngine', 'Error adding watermark to PDF', err);
    throw err;
  }
}

/**
 * Remove specific pages from a PDF
 */
export async function removePagesFromPDF(
  pdfBuffer: ArrayBuffer,
  indicesToRemove: number[]
): Promise<Uint8Array> {
  logger.time('RemovePagesPDF');
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const total = pdfDoc.getPageCount();
    const keepIndices: number[] = [];

    for (let i = 0; i < total; i++) {
      if (!indicesToRemove.includes(i)) {
        keepIndices.push(i);
      }
    }

    if (keepIndices.length === 0) {
      throw new Error('Cannot remove all pages from PDF');
    }

    const newDoc = await PDFDocument.create();
    const copied = await newDoc.copyPages(pdfDoc, keepIndices);
    copied.forEach((p) => newDoc.addPage(p));

    const saved = await newDoc.save();
    logger.timeEnd('PdfEngine', 'RemovePagesPDF');
    return saved;
  } catch (err) {
    logger.error('PdfEngine', 'Error removing pages from PDF', err);
    throw err;
  }
}
