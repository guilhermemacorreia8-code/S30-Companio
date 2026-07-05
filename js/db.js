/**
 * DB - camada de persistência (IndexedDB)
 * Stores: objects (catálogo), sessions (sessões de captura), photos (blobs + metadata)
 */
window.DB = (function () {
  const DB_NAME = 's30-cosmic-companion';
  const DB_VERSION = 1;
  let dbInstance = null;

  function open() {
    const attempt = new Promise((resolve, reject) => {
      if (dbInstance) return resolve(dbInstance);

      if (typeof indexedDB === 'undefined') {
        reject(new Error('INDEXEDDB_UNAVAILABLE'));
        return;
      }

      let req;
      try {
        req = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (err) {
        reject(new Error('INDEXEDDB_UNAVAILABLE'));
        return;
      }

      req.onupgradeneeded = (e) => {
        const db = e.target.result;

        if (!db.objectStoreNames.contains('objects')) {
          const store = db.createObjectStore('objects', { keyPath: 'id' });
          store.createIndex('catalog', 'catalog', { unique: false });
          store.createIndex('type', 'type', { unique: false });
        }

        if (!db.objectStoreNames.contains('photos')) {
          const store = db.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
          store.createIndex('objectId', 'objectId', { unique: false });
          store.createIndex('captureDate', 'captureDate', { unique: false });
        }
      };

      req.onsuccess = (e) => {
        dbInstance = e.target.result;
        resolve(dbInstance);
      };

      req.onerror = (e) => reject(e.target.error);
    });

    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('INDEXEDDB_TIMEOUT')), 4000)
    );

    return Promise.race([attempt, timeout]);
  }

  async function tx(storeName, mode = 'readonly') {
    const db = await open();
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  // ---------- Objects (catálogo) ----------

  async function upsertObject(obj) {
    const store = await tx('objects', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(obj);
      req.onsuccess = () => resolve(obj);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function getObject(id) {
    const store = await tx('objects');
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function getAllObjects() {
    const store = await tx('objects');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  // ---------- Photos ----------

  async function addPhoto(photo) {
    const store = await tx('photos', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.add(photo);
      req.onsuccess = (e) => resolve(e.target.result); // id gerado
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function deletePhoto(id) {
    const store = await tx('photos', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function getPhotosByObject(objectId) {
    const store = await tx('photos');
    const idx = store.index('objectId');
    return new Promise((resolve, reject) => {
      const req = idx.getAll(objectId);
      req.onsuccess = () => {
        const results = (req.result || []).sort(
          (a, b) => new Date(a.captureDate) - new Date(b.captureDate)
        );
        resolve(results);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function getAllPhotos() {
    const store = await tx('photos');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  // ---------- Export / Import (backup manual) ----------

  async function exportAll() {
    const [objects, photos] = await Promise.all([getAllObjects(), getAllPhotos()]);
    // blobs precisam ser convertidos pra base64 pra entrar no JSON
    const photosSerialized = await Promise.all(
      photos.map(async (p) => ({
        ...p,
        blob: p.blob ? await blobToBase64(p.blob) : null,
      }))
    );
    return { version: DB_VERSION, exportedAt: new Date().toISOString(), objects, photos: photosSerialized };
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function base64ToBlob(base64) {
    const res = await fetch(base64);
    return res.blob();
  }

  async function importAll(data) {
    if (!data || !Array.isArray(data.objects) || !Array.isArray(data.photos)) {
      throw new Error('Formato de backup inválido.');
    }
    for (const obj of data.objects) {
      await upsertObject(obj);
    }
    for (const photo of data.photos) {
      const { id, ...rest } = photo; // id é autoIncrement, deixa o DB gerar de novo
      const blob = rest.blob ? await base64ToBlob(rest.blob) : null;
      await addPhoto({ ...rest, blob });
    }
    return { objectsCount: data.objects.length, photosCount: data.photos.length };
  }

  /**
   * Marca uma foto como capa do objeto (desmarca as demais do mesmo objeto).
   */
  async function updatePhoto(id, fields) {
    // busca o registro atual, aplica só os campos alterados (preserva blob)
    const all = await getAllPhotos();
    const current = all.find(p => p.id === id);
    if (!current) throw new Error('Foto não encontrada: ' + id);
    const store = await tx('photos', 'readwrite');
    return new Promise((resolve, reject) => {
      const updated = { ...current, ...fields, id };
      const req = store.put(updated);
      req.onsuccess = () => resolve(updated);
      req.onerror = e => reject(e.target.error);
    });
  }

  async function setCoverPhoto(objectId, photoId) {
    const photos = await getPhotosByObject(objectId);
    const store = await tx('photos', 'readwrite');
    return new Promise((resolve, reject) => {
      if (photos.length === 0) return resolve();
      let remaining = photos.length;
      photos.forEach((p) => {
        const updated = { ...p, isCover: p.id === photoId };
        const req = store.put(updated);
        req.onsuccess = () => { remaining--; if (remaining === 0) resolve(); };
        req.onerror = (e) => reject(e.target.error);
      });
    });
  }

  async function dedupePhotos() {
    const all = await getAllPhotos();
    const groups = {};
    all.forEach((p) => {
      const key = p.objectId + '|' + p.captureDate + '|' + (p.fileName || '');
      (groups[key] = groups[key] || []).push(p);
    });
    let removed = 0;
    for (const key in groups) {
      const group = groups[key];
      if (group.length <= 1) continue;
      group.sort((a, b) => (b.remoteId ? 1 : 0) - (a.remoteId ? 1 : 0) || a.id - b.id);
      for (let i = 1; i < group.length; i++) {
        await deletePhoto(group[i].id);
        removed++;
      }
    }
    return removed;
  }

  return {
    upsertObject,
    getObject,
    getAllObjects,
    addPhoto,
    updatePhoto,
    deletePhoto,
    dedupePhotos,
    getPhotosByObject,
    getAllPhotos,
    exportAll,
    importAll,
    setCoverPhoto,
    base64ToBlob,
  };
})();
