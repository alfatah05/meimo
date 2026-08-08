/**
 * fonts-repository.js
 * Repository layer — CRUD font kustom.
 *
 * Backend: Capacitor Filesystem → Directory.Data (private app folder).
 * Project ini khusus native; tidak memakai IndexedDB.
 *
 * Arsitektur:
 *   Font Service -> Repository (file ini) -> Filesystem
 *
 * Modul lain DILARANG mengimpor file ini secara langsung —
 * semua akses lewat font-service.js.
 */

import * as fs from "./fs-backend.js";

/** Simpan (buat baru atau timpa) satu font kustom. */
export async function putFont(font) {
  return fs.fsPutFont(font);
}

/** Ambil satu font berdasarkan id. `undefined` bila tidak ada. */
export async function getFontById(id) {
  return fs.fsGetFontById(id);
}

/** Ambil seluruh font kustom yang sudah diunduh. */
export async function getAllFonts() {
  return fs.fsGetAllFonts();
}

/** Hapus satu font kustom secara permanen. */
export async function deleteFont(id) {
  return fs.fsDeleteFont(id);
}
