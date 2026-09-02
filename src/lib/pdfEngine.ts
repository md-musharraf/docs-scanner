import { PDFDocument, rgb, degrees, StandardFonts, PageSizes } from 'pdf-lib';
import type {
  ImageToPdfOptions,
  WatermarkOptions,
  PageNumberOptions,
  PdfMetadataOptions,
  PdfCompressionOptions,
} from '../core/types';
import { logger } from '../core/logger';
import { renderAllPdfPages } from './pdfRenderer';

export type { ImageToPdfOptions, WatermarkOptions, PageNumberOptions, PdfMetadataOptions, PdfCompressionOptions };

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
 * Reorganize, reorder, duplicate, and rotate pages of a PDF document
 * @param pageIndices Array of 0-indexed page numbers in desired output order
 * @param rotations Optional map of target output page index to additional degrees
 */
export async function reorganizePDFPages(
  pdfBuffer: ArrayBuffer,
  pageIndices: number[],
  rotations: Record<number, number> = {}
): Promise<Uint8Array> {
  logger.time('ReorganizePDFPages');
  try {
    const sourcePdf = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const newPdf = await PDFDocument.create();
    const totalPages = sourcePdf.getPageCount();

    const validIndices = pageIndices.filter((idx) => idx >= 0 && idx < totalPages);
    if (validIndices.length === 0) {
      throw new Error('No valid page sequence provided');
    }

    const copiedPages = await newPdf.copyPages(sourcePdf, validIndices);
    copiedPages.forEach((page, outIdx) => {
      if (rotations[outIdx]) {
        const currentRot = page.getRotation().angle;
        page.setRotation(degrees((currentRot + rotations[outIdx]) % 360));
      }
      newPdf.addPage(page);
    });

    const saved = await newPdf.save();
    logger.timeEnd('PdfEngine', 'ReorganizePDFPages');
    return saved;
  } catch (err) {
    logger.error('PdfEngine', 'Error reorganizing PDF pages', err);
    throw err;
  }
}

/**
 * Convert a non-JPEG/PNG data URL to JPEG via offscreen canvas.
 * pdf-lib only supports JPEG and PNG embedding, so WebP, GIF, BMP,
 * HEIC, etc. must be converted before passing to embedJpg/embedPng.
 */
async function ensureJpegOrPngDataUrl(dataUrl: string): Promise<string> {
  if (dataUrl.startsWith('data:image/png') || dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) {
    return dataUrl;
  }
  // Convert unsupported format to JPEG via canvas
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        canvas.width = 0;
        canvas.height = 0;
        reject(new Error('Canvas context unavailable'));
        return;
      }
      // Fill white background for transparency safety
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const jpegUrl = canvas.toDataURL('image/jpeg', 0.92);
      canvas.width = 0;
      canvas.height = 0;
      resolve(jpegUrl);
    };
    img.onerror = () => reject(new Error('Failed to load image for format conversion'));
    img.src = dataUrl;
  });
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
      // Ensure we have a format pdf-lib can handle
      const safeDataUrl = await ensureJpegOrPngDataUrl(imgItem.dataUrl);

      let embeddedImage;
      if (safeDataUrl.startsWith('data:image/png')) {
        embeddedImage = await pdfDoc.embedPng(safeDataUrl);
      } else {
        embeddedImage = await pdfDoc.embedJpg(safeDataUrl);
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
      // Calculate center position accounting for rotation
      const angleRad = ((options.angle !== undefined ? options.angle : -45) * Math.PI) / 180;
      const cosA = Math.cos(angleRad);
      const sinA = Math.sin(angleRad);
      const cx = width / 2;
      const cy = height / 2;
      const x = cx - (textWidth * cosA - textHeight * sinA) / 2;
      const y = cy - (textWidth * sinA + textHeight * cosA) / 2;

      page.drawText(options.text, {
        x,
        y,
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
 * Add clean page numbers to PDF pages (Header or Footer)
 */
export async function addPageNumbersToPDF(
  pdfBuffer: ArrayBuffer,
  options: PageNumberOptions
): Promise<Uint8Array> {
  logger.time('AddPageNumbers');
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();
    const totalPages = pages.length;

    const fontSize = options.fontSize || 10;
    const opacity = options.opacity !== undefined ? options.opacity : 0.85;
    const color = options.color
      ? rgb(options.color.r, options.color.g, options.color.b)
      : rgb(0.2, 0.2, 0.2);
    const startPage = options.startPage || 1;

    for (let i = 0; i < totalPages; i++) {
      const pageNum = i + startPage;
      const page = pages[i];
      const { width, height } = page.getSize();

      let text = `${pageNum}`;
      if (options.format === 'page_of_total') {
        text = options.prefix ? `${options.prefix} ${pageNum} of ${totalPages}` : `Page ${pageNum} of ${totalPages}`;
      } else if (options.format === 'simple_slash') {
        text = `${pageNum} / ${totalPages}`;
      } else if (options.prefix) {
        text = `${options.prefix} ${pageNum}`;
      }

      const textWidth = font.widthOfTextAtSize(text, fontSize);
      const margin = 28;

      let x = (width - textWidth) / 2;
      let y = margin;

      if (options.position === 'bottom_left') {
        x = margin;
        y = margin;
      } else if (options.position === 'bottom_right') {
        x = width - textWidth - margin;
        y = margin;
      } else if (options.position === 'top_center') {
        x = (width - textWidth) / 2;
        y = height - margin - fontSize;
      } else if (options.position === 'top_right') {
        x = width - textWidth - margin;
        y = height - margin - fontSize;
      }

      page.drawText(text, {
        x,
        y,
        size: fontSize,
        font,
        color,
        opacity,
      });
    }

    const saved = await pdfDoc.save();
    logger.timeEnd('PdfEngine', 'AddPageNumbers');
    return saved;
  } catch (err) {
    logger.error('PdfEngine', 'Error adding page numbers', err);
    throw err;
  }
}

/**
 * Read metadata from a PDF document
 */
export async function getPDFMetadata(pdfBuffer: ArrayBuffer): Promise<PdfMetadataOptions> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    return {
      title: pdfDoc.getTitle() || '',
      author: pdfDoc.getAuthor() || '',
      subject: pdfDoc.getSubject() || '',
      keywords: pdfDoc.getKeywords() ? pdfDoc.getKeywords()!.split(';') : [],
      creator: pdfDoc.getCreator() || '',
    };
  } catch (err) {
    logger.error('PdfEngine', 'Error reading PDF metadata', err);
    return {};
  }
}

/**
 * Update metadata in a PDF document
 */
export async function updatePDFMetadata(
  pdfBuffer: ArrayBuffer,
  metadata: PdfMetadataOptions
): Promise<Uint8Array> {
  logger.time('UpdateMetadata');
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    if (metadata.title !== undefined) pdfDoc.setTitle(metadata.title);
    if (metadata.author !== undefined) pdfDoc.setAuthor(metadata.author);
    if (metadata.subject !== undefined) pdfDoc.setSubject(metadata.subject);
    if (metadata.keywords !== undefined) pdfDoc.setKeywords(metadata.keywords);
    if (metadata.creator !== undefined) pdfDoc.setCreator(metadata.creator);

    pdfDoc.setModificationDate(new Date());

    const saved = await pdfDoc.save();
    logger.timeEnd('PdfEngine', 'UpdateMetadata');
    return saved;
  } catch (err) {
    logger.error('PdfEngine', 'Error updating PDF metadata', err);
    throw err;
  }
}

/**
 * Compress an entire PDF document by downsampling/re-encoding pages to target resolution and quality
 */
export async function compressPDFDocument(
  pdfBuffer: ArrayBuffer,
  options: PdfCompressionOptions = { quality: 0.75, scale: 1.0 },
  onProgress?: (current: number, total: number) => void
): Promise<Uint8Array> {
  logger.time('CompressPDF');
  try {
    const scale = options.scale || 1.0;
    const pages = await renderAllPdfPages(pdfBuffer, scale, onProgress, 'jpeg');

    if (pages.length === 0) {
      throw new Error('No pages rendered for compression');
    }

    const compressedPdf = await PDFDocument.create();

    for (const page of pages) {
      const jpgImage = await compressedPdf.embedJpg(page.dataUrl);
      const pdfPage = compressedPdf.addPage([page.width, page.height]);
      pdfPage.drawImage(jpgImage, {
        x: 0,
        y: 0,
        width: page.width,
        height: page.height,
      });
    }

    const saved = await compressedPdf.save();
    logger.timeEnd('PdfEngine', 'CompressPDF');
    return saved;
  } catch (err) {
    logger.error('PdfEngine', 'Error compressing PDF', err);
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

