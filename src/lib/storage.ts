import { get, set, del, keys } from 'idb-keyval';

export interface SavedDocument {
  id: string;
  name: string;
  createdAt: number;
  sizeBytes: number;
  pageCount: number;
  thumbnailUrl: string;
  data: Uint8Array;
}

const STORAGE_PREFIX = 'docucraft_doc_';

/**
 * Save a generated/scanned PDF document to offline local IndexedDB
 */
export async function saveDocumentLocally(doc: Omit<SavedDocument, 'id' | 'createdAt'>): Promise<SavedDocument> {
  const id = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const savedDoc: SavedDocument = {
    ...doc,
    id,
    createdAt: Date.now(),
  };

  await set(`${STORAGE_PREFIX}${id}`, savedDoc);
  return savedDoc;
}

/**
 * Get all saved documents from local storage sorted by newest first
 */
export async function getAllSavedDocuments(): Promise<SavedDocument[]> {
  try {
    const allKeys = await keys();
    const docKeys = allKeys.filter((k) => typeof k === 'string' && k.startsWith(STORAGE_PREFIX));
    
    const docs: SavedDocument[] = [];
    for (const key of docKeys) {
      const doc = await get<SavedDocument>(key);
      if (doc) docs.push(doc);
    }

    return docs.sort((a, b) => b.createdAt - a.createdAt);
  } catch (err) {
    console.error('Error reading saved docs:', err);
    return [];
  }
}

/**
 * Delete a saved document by ID
 */
export async function deleteDocument(id: string): Promise<void> {
  await del(`${STORAGE_PREFIX}${id}`);
}

/**
 * Helper to download any Uint8Array / Blob as a file to device
 */
export function downloadFile(data: Uint8Array | Blob, filename: string, mimeType: string = 'application/pdf') {
  const blob = data instanceof Blob ? data : new Blob([data as any], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
