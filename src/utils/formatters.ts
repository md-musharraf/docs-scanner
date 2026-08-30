import confetti from 'canvas-confetti';

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
 * Secure Filename Sanitizer (prevents path traversal and illegal filesystem characters)
 */
export function sanitizeFilename(filename: string, fallback: string = 'document'): string {
  if (!filename || typeof filename !== 'string') return fallback;

  // Replace invalid filesystem characters /:\*?"<>| and control characters
  let clean = filename
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\.\.+/g, '.') // Prevent directory traversal ..
    .trim();

  // Strip leading/trailing dots and spaces
  clean = clean.replace(/^[.\s]+|[.\s]+$/g, '');

  if (!clean) clean = fallback;
  return clean.slice(0, 80); // Cap length safely
}

/**
 * DRY Filename Sanitizer & Extension Enforcer
 */
export function ensurePdfExtension(filename: string, fallback: string = 'document'): string {
  const clean = sanitizeFilename(filename, fallback);
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

/**
 * DRY Array Item Reordering Utility (immutably moves an element from one index to another)
 */
export function moveArrayItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex < 0 ||
    fromIndex >= items.length ||
    toIndex < 0 ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return items;
  }

  const result = [...items];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
}

/**
 * Safe, performance-friendly Confetti Trigger
 */
export function triggerCelebration(particleCount: number = 70) {
  try {
    confetti({
      particleCount,
      spread: 60,
      origin: { y: 0.7 },
      disableForReducedMotion: true,
    });
  } catch {
    // Ignore in unsupported environments
  }
}

/**
 * Safe Device Haptic Feedback (Vibration API)
 */
export function triggerHaptic(durationMs: number = 35) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(durationMs);
    }
  } catch {
    // Vibration safely ignored on unsupported desktop/iOS
  }
}

