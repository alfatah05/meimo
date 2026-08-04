/**
 * document-service.js
 * Document Service — satu-satunya lapisan yang boleh dipanggil oleh Editor
 * (lewat app.js) untuk memuat/menyimpan catatan. Berisi ATURAN BISNIS di
 * atas Repository:
 *   - melengkapi dokumen dengan `schemaVersion` & `metadata` default
 *     (DOCUMENT_MODEL.md §2-3) sebelum disimpan,
 *   - menghitung ulang `wordCount` setiap kali disimpan,
 *   - operasi Pin/Archive/Trash (mengubah metadata, bukan hapus data),
 *   - mengelola asset gambar terpisah dari dokumen.
 *
 * Document Service TIDAK PERNAH memanggil IndexedDB langsung — semua akses
 * data lewat notes-repository.js.
 *
 * Arsitektur:
 *   Editor -> Document Service (file ini) -> Repository -> IndexedDB
 */

import * as notesRepository from "../db/notes-repository.js";
import { DOCUMENT_SCHEMA_VERSION, createDefaultMetadata, createAssetRecord } from "../db/schema.js";
import { createDocument as createEditorDocument } from "../editor/block-model.js";
import { uuid } from "../utils/uuid.js";

const KNOWN_TOP_LEVEL_KEYS = new Set([
  "schemaVersion",
  "id",
  "title",
  "createdAt",
  "updatedAt",
  "metadata",
  "blocks",
  "scenes",
  "music",
  "titleStyle",
]);

/** Ambil field top-level yang tidak dikenal versi app saat ini, supaya round-trip aman (DOCUMENT_MODEL.md §8.6). */
function extraTopLevelFields(note) {
  const extra = {};
  for (const key of Object.keys(note || {})) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) extra[key] = note[key];
  }
  return extra;
}

/** Ambil teks polos dari satu block, sesuai tipe blocknya (DOCUMENT_MODEL.md §6). */
function blockPlainText(block) {
  if (!block || !block.type) return "";
  switch (block.type) {
    case "code":
      return block.content || "";
    case "table":
      return (block.rows || [])
        .flatMap((row) => (row.cells || []).flatMap((cell) => (cell.runs || []).map((r) => r.text)))
        .join(" ");
    case "image":
      return (block.caption || []).map((r) => r.text).join("");
    case "divider":
      return "";
    default:
      return (block.runs || []).map((r) => r.text).join("");
  }
}

/** Gabungkan teks polos seluruh blocks satu note jadi satu string. */
function notePlainText(blocks) {
  return (blocks || [])
    .map(blockPlainText)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Hitung jumlah kata seluruh blocks — dipakai untuk cache `metadata.wordCount`. */
function countWords(blocks) {
  const text = notePlainText(blocks);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Ambil isi note sebagai teks polos (semua block digabung, tanpa formatting).
 * Dipakai oleh search.js untuk mencari di dalam isi catatan.
 */
export function getPlainText(note) {
  return notePlainText(note && note.blocks);
}

/**
 * Ambil cuplikan (snippet) singkat isi note untuk ditampilkan di note card.
 */
export function getSnippet(note, maxLength = 160) {
  const text = notePlainText(note && note.blocks);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}

/** Lengkapi record note lama/parsial agar sesuai struktur saat ini (backward-compat). */
function normalizeNote(note) {
  const base = createEditorDocument();
  return {
    ...extraTopLevelFields(note),
    schemaVersion: note.schemaVersion || DOCUMENT_SCHEMA_VERSION,
    id: note.id,
    title: note.title || "",
    createdAt: note.createdAt || base.createdAt,
    updatedAt: note.updatedAt || base.createdAt,
    metadata: { ...createDefaultMetadata(), ...(note.metadata || {}) },
    blocks: note.blocks && note.blocks.length ? note.blocks : base.blocks,
    scenes: note.scenes || {},
    music: note.music || {},
    titleStyle: note.titleStyle || null,
  };
}

/* ------------------------------------------------------------------ */
/* Note lifecycle                                                      */
/* ------------------------------------------------------------------ */

/**
 * Siapkan note baru (kosong) di memori — BELUM ditulis ke storage.
 * Baru benar-benar dipersist saat isinya tidak kosong (lihat saveNote()),
 * supaya note kosong yang belum sempat diisi (mis. tombol "+" lalu langsung
 * back) tidak nyangkut sebagai item baru di Notes List.
 */
export async function createNote({ title = "" } = {}) {
  const base = createEditorDocument({ title });
  const note = {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    id: base.id,
    title: base.title,
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
    metadata: createDefaultMetadata(),
    blocks: base.blocks,
    scenes: base.scenes,
    music: base.music,
    titleStyle: base.titleStyle || null,
  };
  return note;
}

/** True bila note tidak punya judul, teks, MAUPUN media (gambar) sama sekali.
 * Block 'image' tanpa caption tidak menyumbang apa pun ke notePlainText()
 * (lihat blockPlainText di atas), jadi tanpa pengecekan `hasMedia` di sini
 * note yang isinya cuma gambar akan salah dianggap "kosong" dan dihapus
 * lagi begitu autosave jalan (lihat saveNote di bawah). */
function isBlankNote(document) {
  if ((document.title || "").trim()) return false;
  if (notePlainText(document.blocks)) return false;
  const hasMedia = (document.blocks || []).some((b) => b.type === "image" && b.assetId);
  if (hasMedia) return false;
  // Note yang isinya (baru) musik saja — mis. langsung tekan "Insert Music"
  // di Root Editor tanpa mengetik apa pun dulu — juga bukan note kosong.
  const hasMusic = Object.values(document.music || {}).some((m) => m && m.assetId);
  return !hasMusic;
}

/** Muat satu note untuk dibuka di editor. `null` bila tidak ditemukan. */
export async function loadNote(id) {
  if (!id) return null;
  const note = await notesRepository.getNoteById(id);
  if (!note) return null;
  return normalizeNote(note);
}

/**
 * Simpan dokumen yang sedang diedit (dipanggil oleh app.js saat autosave).
 * Menstempel ulang `updatedAt` & `metadata.wordCount`, menjaga field lain
 * (termasuk field tak dikenal) tetap ada.
 */
export async function saveNote(document) {
  if (!document || !document.id) {
    throw new Error("Dokumen tidak valid: `id` wajib ada sebelum disimpan.");
  }

  // Note kosong (tanpa judul & tanpa isi) tidak perlu disimpan — kalau
  // sebelumnya sempat kepersist (mis. draft lama), bersihkan juga supaya
  // tidak nyangkut sebagai item "Tanpa judul" kosong di Notes List.
  if (isBlankNote(document)) {
    await notesRepository.deleteNote(document.id).catch(() => {});
    return null;
  }

  const metadata = { ...createDefaultMetadata(), ...(document.metadata || {}) };
  metadata.wordCount = countWords(document.blocks);

  const persisted = {
    ...extraTopLevelFields(document),
    schemaVersion: document.schemaVersion || DOCUMENT_SCHEMA_VERSION,
    id: document.id,
    title: document.title || "",
    createdAt: document.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata,
    blocks: document.blocks,
    scenes: document.scenes || {},
    music: document.music || {},
    titleStyle: document.titleStyle || null,
  };

  await notesRepository.putNote(persisted);
  return persisted;
}

/** Daftar note untuk Notes List, dengan filter dasar. */
export async function listNotes({ includeTrashed = false, includeArchived = true } = {}) {
  const all = await notesRepository.getAllNotes();
  return all
    .map(normalizeNote)
    .filter((note) => includeTrashed || !note.metadata.trashed)
    .filter((note) => includeArchived || !note.metadata.archived);
}

/* ------------------------------------------------------------------ */
/* Pin / Archive / Trash — soft state via metadata, bukan hapus data   */
/* ------------------------------------------------------------------ */

async function patchMetadata(id, patch) {
  const note = await notesRepository.getNoteById(id);
  if (!note) return null;
  const updated = normalizeNote({ ...note, metadata: { ...note.metadata, ...patch } });
  await notesRepository.putNote(updated);
  return updated;
}

export function setPinned(id, pinned) {
  return patchMetadata(id, { pinned: !!pinned });
}

export function setArchived(id, archived) {
  return patchMetadata(id, { archived: !!archived });
}

/**
 * Simpan kustomisasi tampilan kartu (per-note) — lihat createDefaultCardStyle()
 * di db/schema.js & halaman card-style.html/card-style.js. `cardStyle` diganti
 * seutuhnya (bukan merge per-field) supaya menghapus/mengubah satu field (mis.
 * bgImageAssetId jadi null) tidak nyangkut nilai lama.
 */
export function setCardStyle(id, cardStyle) {
  return patchMetadata(id, { cardStyle });
}

/** Pindahkan note ke Trash (soft-delete) — sesuai PROJECT_RULES.md "Trash". */
export function moveToTrash(id) {
  return patchMetadata(id, { trashed: true, trashedAt: new Date().toISOString() });
}

/** Kembalikan note dari Trash. */
export function restoreFromTrash(id) {
  return patchMetadata(id, { trashed: false, trashedAt: null });
}

/** Hapus note secara permanen dari Trash, termasuk asset gambarnya. */
export async function permanentlyDeleteNote(id) {
  await notesRepository.deleteAssetsByNoteId(id);
  await notesRepository.deleteNote(id);
}

/* ------------------------------------------------------------------ */
/* Assets (gambar)                                                     */
/* ------------------------------------------------------------------ */

/**
 * Simpan `bytes` (ArrayBuffer) gambar yang sudah dibaca sebelumnya untuk
 * sebuah note, kembalikan `assetId` untuk dirujuk block `image`.
 *
 * Menerima `bytes` yang sudah jadi ArrayBuffer, BUKAN File/Blob mentah —
 * lihat catatan di image-service.js saveImage() & toolbar/image-sheet.js.
 */
export async function saveImageAsset(noteId, bytes, mimeType) {
  const asset = createAssetRecord({ id: uuid(), noteId, bytes, mimeType });
  await notesRepository.putAsset(asset);
  return asset.id;
}

/** Ambil satu asset gambar (berisi `blob`) berdasarkan `assetId`. */
export async function getImageAsset(assetId) {
  return notesRepository.getAssetById(assetId);
}

/**
 * Hapus satu asset gambar secara langsung berdasarkan `assetId` — dipakai
 * saat gambar latar kartu (card-style.js) diganti/dihapus, beda dari
 * permanentlyDeleteNote() yang menghapus SEMUA asset milik satu note.
 */
export async function deleteImageAsset(assetId) {
  if (!assetId) return;
  await notesRepository.deleteAsset(assetId);
}

/* ------------------------------------------------------------------ */
/* Assets (musik) — lihat blok komentar "Musik" di editor/block-model.js */
/* ------------------------------------------------------------------ */

/**
 * Simpan `bytes` (ArrayBuffer) berkas audio yang sudah dibaca sebelumnya
 * untuk sebuah note, kembalikan `assetId` untuk dirujuk dari
 * `document.music[key].assetId`.
 *
 * Object store `assets` di IndexedDB generik (byte + mimeType, lihat
 * db/schema.js createAssetRecord) — dipakai bersama oleh gambar & musik,
 * jadi fungsi ini murni alias saveImageAsset() dengan nama yang sesuai
 * konteks pemanggilnya (services/music-service.js), supaya sama-sama
 * ikut terhapus lewat permanentlyDeleteNote() -> deleteAssetsByNoteId()
 * tanpa perlu object store terpisah.
 */
export async function saveAudioAsset(noteId, bytes, mimeType) {
  return saveImageAsset(noteId, bytes, mimeType);
}

/** Ambil satu asset musik (berisi `bytes`/`blob`) berdasarkan `assetId`. */
export async function getAudioAsset(assetId) {
  return notesRepository.getAssetById(assetId);
}
