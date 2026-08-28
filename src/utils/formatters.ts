/**
 * DRY File Size Formatter
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * DRY Date Formatter
 */
export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * DRY Filename Sanitizer & Extension Enforcer
 */
export function ensurePdfExtension(filename: string, fallback: string = 'document'): string {
  const clean = filename.trim() || fallback;
  return clean.toLowerCase().endsWith('.pdf') ? clean : `${clean}.pdf`;
}

/**
 * Generate a unique, safe timestamped filename
 */
export function generateDefaultDocName(prefix: string = 'Doc'): string {
  const dateStr = new Date().toISOString().slice(0, 10);
  const rand = Math.random().toString(36).substring(2, 6);
  return `${prefix}_${dateStr}_${rand}.pdf`;
}
