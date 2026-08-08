/**
 * notes-repository.js
 * Repository layer — CRUD note & asset gambar.
 *
 * Backend: Capacitor Filesystem → Directory.Data (private app folder).
 * Project ini khusus native; tidak memakai IndexedDB.
 *
 * Arsitektur:
 *   Editor -> Document Service -> Repository (file ini) -> Filesystem
 *
 * Modul lain DILARANG mengimpor file ini secara langsung —
 * semua akses lewat document-service.js.
 */

import * as fs from "./fs-backend.js";

/* ------------------------------------------------------------------ */
/* Notes                                                               */
/* ------------------------------------------------------------------ */

/** Simpan (buat baru atau timpa) satu dokumen note. */
export async function putNote(note) {
  return fs.fsPutNote(note);
}

/** Ambil satu dokumen note berdasarkan id. `undefined` bila tidak ada. */
export async function getNoteById(id) {
  return fs.fsGetNoteById(id);
}

/** Ambil seluruh dokumen note. */
export async function getAllNotes() {
  return fs.fsGetAllNotes();
}

/** Hapus satu note secara permanen (hard delete). */
export async function deleteNote(id) {
  return fs.fsDeleteNote(id);
}

/* ------------------------------------------------------------------ */
/* Assets (gambar / audio)                                             */
/* ------------------------------------------------------------------ */

/** Simpan (buat baru atau timpa) satu asset. */
export async function putAsset(asset) {
  return fs.fsPutAsset(asset);
}

/** Ambil satu asset berdasarkan id. `undefined` bila tidak ada. */
export async function getAssetById(id) {
  return fs.fsGetAssetById(id);
}

/** Ambil semua asset milik satu note. */
export async function getAssetsByNoteId(noteId) {
  return fs.fsGetAssetsByNoteId(noteId);
}

/** Hapus satu asset. */
export async function deleteAsset(id) {
  return fs.fsDeleteAsset(id);
}

/** Hapus semua asset milik satu note. */
export async function deleteAssetsByNoteId(noteId) {
  return fs.fsDeleteAssetsByNoteId(noteId);
}
