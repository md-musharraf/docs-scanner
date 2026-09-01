import { get, set, del, keys } from 'idb-keyval';
import type { SavedDocumentMetadata, SavedDocument } from '../core/types';
import { APP_CONFIG } from '../core/constants';
import { logger } from '../core/logger';
import { NativeBridge } from '../services/nativeBridge';

export type { SavedDocumentMetadata, SavedDocument };

const META_PREFIX = APP_CONFIG.storagePrefix;
const DATA_PREFIX = APP_CONFIG.dataPrefix;

/**
 * Save a generated/scanned PDF document to offline local IndexedDB.
 * Splits metadata from binary payload to keep UI memory ultra-light.
 */
export async function saveDocumentLocally(
  doc: Omit<SavedDocument, 'id' | 'createdAt'>
): Promise<SavedDocumentMetadata> {
  const id = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = Date.now();

  const metadata: SavedDocumentMetadata = {
    id,
    name: doc.name,
    createdAt: now,
    sizeBytes: doc.sizeBytes,
    pageCount: doc.pageCount,
    thumbnailUrl: doc.thumbnailUrl,
  };

  try {
    // Save metadata
    await set(`${META_PREFIX}${id}`, metadata);
    // Save binary data separately
    await set(`${DATA_PREFIX}${id}`, doc.data);

    logger.info('Storage', `Saved document: ${doc.name} (${id})`);
    return metadata;
  } catch (err) {
    logger.error('Storage', `Error saving document ${doc.name}`, err);
    throw err;
  }
}

/**
 * Get all saved documents metadata sorted newest first (ultra-fast, zero RAM bloat).
 * Automatically migrates legacy combined objects if encountered.
 */
export async function getAllSavedDocuments(): Promise<SavedDocumentMetadata[]> {
  logger.time('LoadSavedDocs');
  try {
    const allKeys = await keys();
    const metaKeys = allKeys.filter((k) => typeof k === 'string' && k.startsWith(META_PREFIX));

    const docs: SavedDocumentMetadata[] = [];

    for (const key of metaKeys) {
      const item = await get<any>(key);
      if (item) {
        // Handle legacy format migration where data was stored in the same object
        if (item.data && !allKeys.includes(`${DATA_PREFIX}${item.id}`)) {
          await set(`${DATA_PREFIX}${item.id}`, item.data);
          const cleanMeta: SavedDocumentMetadata = {
            id: item.id,
            name: item.name,
            createdAt: item.createdAt || Date.now(),
            sizeBytes: item.sizeBytes || 0,
            pageCount: item.pageCount || 1,
            thumbnailUrl: item.thumbnailUrl || '',
          };
          await set(key, cleanMeta);
          docs.push(cleanMeta);
        } else {
          docs.push({
            id: item.id,
            name: item.name,
            createdAt: item.createdAt,
            sizeBytes: item.sizeBytes,
            pageCount: item.pageCount,
            thumbnailUrl: item.thumbnailUrl,
          });
        }
      }
    }

    const sorted = docs.sort((a, b) => b.createdAt - a.createdAt);
    logger.timeEnd('Storage', 'LoadSavedDocs');
    return sorted;
  } catch (err) {
    logger.error('Storage', 'Error reading saved docs', err);
    return [];
  }
}

/**
 * Get the binary PDF data for a specific document on-demand
 */
export async function getDocumentData(id: string): Promise<Uint8Array | null> {
  try {
    const data = await get<Uint8Array>(`${DATA_PREFIX}${id}`);
    if (data) return data;

    // Fallback: check legacy storage
    const legacy = await get<any>(`${META_PREFIX}${id}`);
    if (legacy && legacy.data) return legacy.data;

    return null;
  } catch (err) {
    logger.error('Storage', `Error fetching document data for ${id}`, err);
    return null;
  }
}

/**
 * Rename a saved document in-place, preserving creation timestamp and other metadata
 */
export async function renameDocument(id: string, newName: string): Promise<void> {
  try {
    const existing = await get<SavedDocumentMetadata>(`${META_PREFIX}${id}`);
    if (existing) {
      const updated: SavedDocumentMetadata = {
        ...existing,
        name: newName,
      };
      await set(`${META_PREFIX}${id}`, updated);
      logger.info('Storage', `Renamed document: ${id} to ${newName}`);
    }
  } catch (err) {
    logger.error('Storage', `Error renaming document ${id}`, err);
    throw err;
  }
}

/**
 * Delete a saved document and its binary data from IndexedDB
 */
export async function deleteDocument(id: string): Promise<void> {
  try {
    await del(`${META_PREFIX}${id}`);
    await del(`${DATA_PREFIX}${id}`);
    logger.info('Storage', `Deleted document: ${id}`);
  } catch (err) {
    logger.error('Storage', `Error deleting document ${id}`, err);
    throw err;
  }
}

/**
 * Universal helper to download/save file to device
 */
export async function downloadFile(
  data: Uint8Array | Blob,
  filename: string,
  mimeType: string = 'application/pdf'
): Promise<void> {
  await NativeBridge.saveFile(data, filename, mimeType);
}

/**
 * Universal helper to share document
 */
export async function shareDocument(
  data: Uint8Array | Blob,
  filename: string,
  title: string = 'PDF Document'
): Promise<boolean> {
  return await NativeBridge.shareFile(data, filename, title);
}
