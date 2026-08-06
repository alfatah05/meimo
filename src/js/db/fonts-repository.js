/**
 * fonts-repository.js
 * Repository layer — SATU-SATUNYA tempat operasi CRUD mentah ke IndexedDB
 * untuk font kustom yang sudah diunduh user dijalankan (lewat helper di db.js).
 *
 * Sama seperti notes-repository.js: file ini sengaja "bodoh" (tidak tahu
 * aturan bisnis seperti mengunduh berkas dari Font Library, memuat
 * @font-face, dsb) — itu tugas Font Service (src/js/services/font-service.js).
 *
 * Arsitektur:
 *   Font Family Dropdown / Font Manager -> Font Service -> Repository (file ini) -> IndexedDB (db.js)
 *
 * Modul lain DILARANG mengimpor file ini secara langsung — semua akses
 * lewat font-service.js.
 */

import { withStore, requestToPromise } from "./db.js";
import { STORES } from "./schema.js";

/** Simpan (buat baru atau timpa) satu font kustom. */
export async function putFont(font) {
  await withStore(STORES.FONTS, "readwrite", (store) => requestToPromise(store.put(font)));
  return font;
}

/** Ambil satu font berdasarkan id. `undefined` bila belum diunduh/tidak ada. */
export async function getFontById(id) {
  return withStore(STORES.FONTS, "readonly", (store) => requestToPromise(store.get(id)));
}

/** Ambil seluruh font kustom yang sudah diunduh. */
export async function getAllFonts() {
  return withStore(STORES.FONTS, "readonly", (store) => requestToPromise(store.getAll()));
}

/** Hapus satu font kustom secara permanen dari penyimpanan lokal. */
export async function deleteFont(id) {
  await withStore(STORES.FONTS, "readwrite", (store) => requestToPromise(store.delete(id)));
}
