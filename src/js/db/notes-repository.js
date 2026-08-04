/**
 * notes-repository.js
 * Repository layer — SATU-SATUNYA tempat operasi CRUD mentah ke penyimpanan
 * file (lewat helper di fs-storage.js) untuk data note & asset gambar/musik.
 *
 * Sama seperti sebelumnya (versi IndexedDB): file ini sengaja "bodoh" (tidak
 * tahu aturan bisnis seperti wordCount, Pin/Archive/Trash, dsb) — itu tugas
 * Document Service (src/js/services/document-service.js). SIGNATURE setiap
 * fungsi di sini SENGAJA dipertahankan sama persis dengan versi IndexedDB
 * lama, supaya document-service.js tidak perlu diubah sama sekali.
 *
 * Layout di disk (di dalam Directory.External — lihat fs-storage.js):
 *   meimo-data/notes/<noteId>.json      - satu file JSON per note
 *   meimo-data/assets/<assetId>.json    - metadata satu asset (noteId, mimeType, dst)
 *   meimo-data/assets/<assetId>.bin     - bytes biner asset itu
 *
 * Assets SENGAJA disimpan flat (bukan per-folder-note) karena
 * getAssetById()/deleteAsset() dipanggil hanya dengan `assetId` (tanpa
 * `noteId`) dari document-service.js — persis seperti object store `assets`
 * flat dengan index `noteId` di versi IndexedDB dulu.
 *
 * Arsitektur:
 *   Editor -> Document Service -> Repository (file ini) -> fs-storage.js
 */

import * as fs from "./fs-storage.js";

const NOTES_DIR = "meimo-data/notes";
const ASSETS_DIR = "meimo-data/assets";

function notePath(id) {
  return `${NOTES_DIR}/${id}.json`;
}
function assetMetaPath(id) {
  return `${ASSETS_DIR}/${id}.json`;
}
function assetBinPath(id) {
  return `${ASSETS_DIR}/${id}.bin`;
}

/* ------------------------------------------------------------------ */
/* Notes                                                                */
/* ------------------------------------------------------------------ */

/** Simpan (buat baru atau timpa) satu note. */
export async function putNote(note) {
  await fs.writeJSON(notePath(note.id), note);
  return note;
}

/** Ambil satu note berdasarkan id. `undefined` bila tidak ada. */
export async function getNoteById(id) {
  return fs.readJSON(notePath(id));
}

/** Ambil SEMUA note (dipakai Notes List untuk sorting/filter di JS). */
export async function getAllNotes() {
  const files = await fs.listDir(NOTES_DIR);
  const notes = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const note = await fs.readJSON(`${NOTES_DIR}/${file}`);
    if (note) notes.push(note);
  }
  return notes;
}

/** Hapus satu note (bukan asset-nya — lihat deleteAssetsByNoteId()). */
export async function deleteNote(id) {
  await fs.remove(notePath(id));
}

/* ------------------------------------------------------------------ */
/* Assets (gambar & musik)                                             */
/* ------------------------------------------------------------------ */

/** Simpan (buat baru atau timpa) satu asset. Terima `asset.bytes`
 * (ArrayBuffer) sesuai createAssetRecord() di db/schema.js. */
export async function putAsset(asset) {
  const { bytes, blob, ...meta } = asset;
  await fs.writeJSON(assetMetaPath(asset.id), meta);
  const binBytes = bytes || (blob && (await blob.arrayBuffer())) || null;
  if (binBytes) await fs.writeBinary(assetBinPath(asset.id), binBytes);
  return asset;
}

/** Ambil satu asset (berisi `bytes`) berdasarkan id. `undefined` bila
 * tidak ada. */
export async function getAssetById(id) {
  const meta = await fs.readJSON(assetMetaPath(id));
  if (!meta) return undefined;
  const bytes = await fs.readBinary(assetBinPath(id));
  return { ...meta, bytes };
}

/** Ambil semua asset milik satu note (scan linear seluruh folder assets —
 * cukup cepat untuk skala note-taking app personal). */
export async function getAssetsByNoteId(noteId) {
  const files = await fs.listDir(ASSETS_DIR);
  const result = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const meta = await fs.readJSON(`${ASSETS_DIR}/${file}`);
    if (meta && meta.noteId === noteId) {
      const bytes = await fs.readBinary(assetBinPath(meta.id));
      result.push({ ...meta, bytes });
    }
  }
  return result;
}

/** Hapus satu asset (metadata + bytes-nya) berdasarkan id. */
export async function deleteAsset(id) {
  await fs.remove(assetMetaPath(id));
  await fs.remove(assetBinPath(id));
}

/** Hapus SEMUA asset milik satu note (dipanggil sebelum deleteNote() saat
 * hapus permanen dari Trash). */
export async function deleteAssetsByNoteId(noteId) {
  const assets = await getAssetsByNoteId(noteId);
  for (const asset of assets) {
    await deleteAsset(asset.id);
  }
}
