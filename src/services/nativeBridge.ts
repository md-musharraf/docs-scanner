import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { logger } from '../core/logger';
import { blobToBase64, uint8ArrayToBase64, bufferToBlob } from '../utils/fileUtils';

/**
 * Native Bridge Service for cross-platform file saving, sharing, and native features
 */
export class NativeBridge {
  static isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  static getPlatform(): string {
    return Capacitor.getPlatform();
  }

  /**
   * Universal save file handler - uses native filesystem on Android/iOS and standard download on Web
   */
  static async saveFile(
    data: Uint8Array | Blob,
    filename: string,
    mimeType: string = 'application/pdf'
  ): Promise<{ success: boolean; path?: string; message?: string }> {
    logger.info('NativeBridge', `Saving file: ${filename} (Platform: ${this.getPlatform()})`);

    try {
      if (this.isNative()) {
        const base64Data = data instanceof Blob ? await blobToBase64(data) : uint8ArrayToBase64(data);

        // Clean base64 prefix if present
        const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;

        const result = await Filesystem.writeFile({
          path: filename,
          data: cleanBase64,
          directory: Directory.Documents,
          recursive: true,
        });

        logger.info('NativeBridge', `File saved natively at: ${result.uri}`);
        return { success: true, path: result.uri, message: `Saved to Documents/${filename}` };
      } else {
        // Web fallback download
        const blob = data instanceof Blob ? data : bufferToBlob(data, mimeType);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        return { success: true, message: `Downloaded ${filename}` };
      }
    } catch (err) {
      logger.error('NativeBridge', 'Error saving file', err);
      // Fallback to web download if native fails
      try {
        const blob = data instanceof Blob ? data : bufferToBlob(data, mimeType);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        return { success: true, message: `Downloaded ${filename}` };
      } catch {
        return { success: false, message: 'Failed to save file' };
      }
    }
  }

  /**
   * Universal share file handler
   */
  static async shareFile(
    data: Uint8Array | Blob,
    filename: string,
    title: string = 'Document'
  ): Promise<boolean> {
    try {
      if (this.isNative()) {
        const base64Data = data instanceof Blob ? await blobToBase64(data) : uint8ArrayToBase64(data);
        const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;

        const writeResult = await Filesystem.writeFile({
          path: filename,
          data: cleanBase64,
          directory: Directory.Cache,
          recursive: true,
        });

        await Share.share({
          title,
          url: writeResult.uri,
          dialogTitle: `Share ${filename}`,
        });
        return true;
      } else if (navigator.share) {
        const blob = data instanceof Blob ? data : bufferToBlob(data, 'application/pdf');
        const file = new File([blob], filename, { type: 'application/pdf' });
        await navigator.share({
          files: [file],
          title,
        });
        return true;
      }
      return false;
    } catch (err) {
      logger.warn('NativeBridge', 'Share cancelled or not supported', err);
      return false;
    }
  }
}
