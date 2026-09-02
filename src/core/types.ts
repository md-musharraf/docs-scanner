export type ScannerFilter = 'original' | 'magic_color' | 'bw_document' | 'grayscale' | 'sharp';

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

export interface ImageEnhanceOptions {
  filter: ScannerFilter;
  autoLight?: boolean;
  brightness?: number; // -100 to +100
  contrast?: number;   // -100 to +100
  quality?: number;    // 0 to 1
  maxDimension?: number;
  sauvolaSensitivity?: number; // 0.1 to 0.4
}

export interface ImageToPdfOptions {
  pageSize: 'a4' | 'letter' | 'fit';
  orientation: 'portrait' | 'landscape';
  margin: number; // points
  quality?: number;
}

export interface WatermarkOptions {
  text: string;
  fontSize?: number;
  opacity?: number;
  color?: { r: number; g: number; b: number };
  angle?: number;
}

export type PageNumberPosition =
  | 'bottom_center'
  | 'bottom_right'
  | 'bottom_left'
  | 'top_center'
  | 'top_right';

export interface PageNumberOptions {
  position: PageNumberPosition;
  format: 'page_of_total' | 'page_only' | 'simple_slash';
  prefix?: string;
  fontSize?: number;
  opacity?: number;
  color?: { r: number; g: number; b: number };
  startPage?: number;
}

export interface PdfMetadataOptions {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  creator?: string;
}

export interface PdfCompressionOptions {
  quality?: number; // 0.1 to 0.95
  scale?: number;   // 0.5 to 1.5
  targetKB?: number;
}

export interface RenderedPage {
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
}

export type DocumentCategory = 'scan' | 'compress' | 'merge' | 'split' | 'tools' | 'convert';

export interface SavedDocumentMetadata {
  id: string;
  name: string;
  createdAt: number;
  sizeBytes: number;
  pageCount: number;
  thumbnailUrl: string;
  category?: DocumentCategory;
}

export interface SavedDocument extends SavedDocumentMetadata {
  data: Uint8Array;
}

export interface ScannedPageItem {
  id: string;
  originalDataUrl: string;
  processedDataUrl: string;
  filter: ScannerFilter;
}

