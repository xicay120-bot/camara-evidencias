// Cola local en IndexedDB. Cada registro guarda la foto (ArrayBuffer), una miniatura,
// los metadatos de captura y el estado de subida.
const DB_NAME = "camara-evidencias";
const STORE = "fotos";

let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const putPhoto = (rec) => run("readwrite", (s) => s.put(rec));
export const getPhoto = (id) => run("readonly", (s) => s.get(id));
export const deletePhoto = (id) => run("readwrite", (s) => s.delete(id));

export async function listPhotos() {
  const all = await run("readonly", (s) => s.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}
