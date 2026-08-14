/**
 * notes-repository.js
 * Repository layer — SATU-SATUNYA tempat operasi CRUD mentah ke IndexedDB
 * untuk data note & asset gambar dijalankan (lewat helper di db.js).
 *
 * Repository sengaja "bodoh": tidak tahu aturan bisnis (pin/archive/trash,
 * hitung wordCount, default metadata, dsb) — itu tugas Document Service.
 * Repository hanya menyimpan & mengambil apa yang diberikan padanya.
 *
 * Arsitektur:
 *   Editor -> Document Service -> Repository (file ini) -> IndexedDB (db.js)
 *
 * Modul lain (editor, toolbar, notes list, dst) DILARANG mengimpor file ini
 * secara langsung — semua akses lewat document-service.js.
 */

import { withStore, requestToPromise } from "./db.js";
import { STORES } from "./schema.js";

/* ------------------------------------------------------------------ */
/* Notes                                                               */
/* ------------------------------------------------------------------ */

/** Simpan (buat baru atau timpa) satu dokumen note. */
export async function putNote(note) {
  await withStore(STORES.NOTES, "readwrite", (store) => requestToPromise(store.put(note)));
  return note;
}

/** Ambil satu dokumen note berdasarkan id. `undefined` bila tidak ada. */
export async function getNoteById(id) {
  return withStore(STORES.NOTES, "readonly", (store) => requestToPromise(store.get(id)));
}

/** Ambil seluruh dokumen note. */
export async function getAllNotes() {
  return withStore(STORES.NOTES, "readonly", (store) => requestToPromise(store.getAll()));
}

/** Hapus satu note secara permanen (hard delete). */
export async function deleteNote(id) {
  await withStore(STORES.NOTES, "readwrite", (store) => requestToPromise(store.delete(id)));
}

/* ------------------------------------------------------------------ */
/* Assets (gambar) — lihat DOCUMENT_MODEL.md §6.3                      */
/* ------------------------------------------------------------------ */

/** Simpan (buat baru atau timpa) satu asset gambar. */
export async function putAsset(asset) {
  await withStore(STORES.ASSETS, "readwrite", (store) => requestToPromise(store.put(asset)));
  return asset;
}

/** Ambil satu asset gambar berdasarkan id. `undefined` bila tidak ada. */
export async function getAssetById(id) {
  return withStore(STORES.ASSETS, "readonly", (store) => requestToPromise(store.get(id)));
}

/** Ambil semua asset milik satu note (mis. untuk preload gambar). */
export async function getAssetsByNoteId(noteId) {
  return withStore(STORES.ASSETS, "readonly", (store) =>
    requestToPromise(store.index("noteId").getAll(noteId))
  );
}

/** Hapus satu asset gambar. */
export async function deleteAsset(id) {
  await withStore(STORES.ASSETS, "readwrite", (store) => requestToPromise(store.delete(id)));
}

/** Hapus semua asset milik satu note (dipakai saat note dihapus permanen). */
export async function deleteAssetsByNoteId(noteId) {
  await withStore(STORES.ASSETS, "readwrite", (store) => {
    return new Promise((resolve, reject) => {
      const request = store.index("noteId").openCursor(IDBKeyRange.only(noteId));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  });
}
