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

export interface RenderedPage {
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
}

export interface SavedDocumentMetadata {
  id: string;
  name: string;
  createdAt: number;
  sizeBytes: number;
  pageCount: number;
  thumbnailUrl: string;
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
