import { openDB } from 'idb';

const DB_NAME = 'adh-staff-camera';
const DB_VERSION = 1;
const STORE_NAME = 'pending-photos';
const LEGACY_KEY = 'staff_photo_upload_queue';

const getDb = () => openDB(DB_NAME, DB_VERSION, {
  upgrade(database) {
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('capturedAt', 'capturedAt');
    }
  }
});

export const dataUrlToBlob = (dataUrl) => {
  const [metadata, encoded] = String(dataUrl).split(',');
  const mimeType = metadata?.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
  const binary = atob(encoded || '');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
};

export const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error || new Error('Could not read pending photo.'));
  reader.readAsDataURL(blob);
});

export const migrateLegacyStaffQueue = async () => {
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return;
  try {
    const legacyItems = JSON.parse(raw);
    const database = await getDb();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    for (const item of legacyItems) {
      if (!item?.id || !item.fileData) continue;
      await transaction.store.put({
        ...item,
        blob: dataUrlToBlob(item.fileData),
        fileData: undefined,
        preview: undefined
      });
    }
    await transaction.done;
    localStorage.removeItem(LEGACY_KEY);
  } catch (error) {
    console.warn('Legacy staff queue migration skipped:', error);
  }
};

export const getPendingStaffPhotos = async () => {
  const database = await getDb();
  const items = await database.getAllFromIndex(STORE_NAME, 'capturedAt');
  return items.sort((left, right) => String(left.capturedAt).localeCompare(String(right.capturedAt)));
};

export const enqueueStaffPhoto = async (item) => {
  const database = await getDb();
  await database.put(STORE_NAME, item);
  return item;
};

export const removePendingStaffPhoto = async (id) => {
  const database = await getDb();
  await database.delete(STORE_NAME, id);
};

export const hasPendingStaffPhoto = async (id) => {
  if (!id) return false;
  const database = await getDb();
  return Boolean(await database.get(STORE_NAME, id));
};

export const countPendingStaffPhotos = async () => {
  const database = await getDb();
  return database.count(STORE_NAME);
};
