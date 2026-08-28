export const APP_CONFIG = {
  appName: 'DocuCraft PRO',
  version: '1.0.0',
  storagePrefix: 'docucraft_doc_',
  dataPrefix: 'docucraft_data_',
  maxProcessingDimension: 2048,
  thumbnailScale: 0.35,
  defaultRenderScale: 1.5,
  highResScale: 2.0,
  defaultJpegQuality: 0.92,
  cameraDefaults: {
    idealWidth: 1920,
    idealHeight: 1080,
    minWidth: 1280,
    minHeight: 720,
  },
} as const;

export const DEFAULT_MARGINS = {
  none: 0,
  small: 15,
  normal: 30,
} as const;
