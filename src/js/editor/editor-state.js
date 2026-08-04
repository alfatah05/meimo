/**
 * editor-state.js
 * Pengelolaan state dokumen yang sedang diedit (di memori). Ini adalah
 * satu-satunya pemegang model dokumen — komponen lain (toolbar, editor.js)
 * hanya boleh membaca lewat getDocument()/getBlock() dan mengubah lewat
 * commands.js, tidak pernah menulis langsung ke DOM sebagai "data".
 */

import { createDocument } from "./block-model.js";

// Jeda maks (ms) antar perubahan supaya masih dianggap "ketikan yang sama"
// dan digabung jadi SATU langkah undo — persis seperti kebanyakan editor teks
// (Notion/Google Docs dsb.): mengetik satu kalimat = satu Ctrl+Z, bukan
// satu Ctrl+Z per huruf.
const HISTORY_COALESCE_MS = 700;
const HISTORY_LIMIT = 100;

export function createEditorState(initialDocument) {
  let doc = initialDocument || createDocument();
  const listeners = new Set();
  // Format yang "menunggu" untuk diterapkan ke karakter berikutnya yang
  // diketik, dipicu saat tombol toolbar diklik tanpa ada teks terseleksi
  // (kursor collapsed). null berarti tidak ada override yang aktif.
  let pendingMarks = null;

  // Toggle "Set as Current Style" (child bar Text/Style, lihat toolbar.js
  // initStyleStickyToggle()) — saat aktif, format yang lagi berlaku di
  // kursor (mark karakter + line height/letter spacing block) TIDAK ikut
  // reset saat user menekan Enter, lihat handleEnter() di editor.js.
  // Murni preferensi UI sesi berjalan (TIDAK disimpan ke document/JSON,
  // TIDAK ikut undo/redo), jadi disimpan lepas dari `doc` sama seperti
  // pendingMarks di atas.
  let keepStyleOnEnter = false;

  // --- Undo/Redo: undoStack/redoStack berisi SNAPSHOT dokumen (deep clone
  // JSON, karena `doc` semuanya data polos) dari kondisi SEBELUM sebuah
  // langkah perubahan. batchSnapshot menampung snapshot "sebelum ketikan
  // yang sedang berjalan dimulai" selama masih dalam jeda HISTORY_COALESCE_MS. ---
  let undoStack = [];
  let redoStack = [];
  let batchSnapshot = null;
  let batchTimer = null;

  function cloneDoc(d) {
    return JSON.parse(JSON.stringify(d));
  }

  function flushBatch() {
    if (batchTimer) {
      clearTimeout(batchTimer);
      batchTimer = null;
    }
    if (batchSnapshot) {
      undoStack.push(batchSnapshot);
      if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
      batchSnapshot = null;
    }
  }

  /**
   * Dipanggil SEBELUM sebuah mutasi diterapkan ke `doc`, supaya ada
   * snapshot untuk di-undo nanti. `coalesce: true` (dipakai untuk ketikan
   * biasa) menggabung mutasi-mutasi beruntun jadi satu langkah undo selama
   * jaraknya < HISTORY_COALESCE_MS; `coalesce: false` (dipakai untuk aksi
   * diskrit seperti klik tombol format, Enter, Backspace) selalu jadi
   * langkah undo sendiri.
   */
  function checkpoint({ coalesce = false } = {}) {
    redoStack = []; // cabang baru: riwayat redo lama tidak relevan lagi
    if (coalesce) {
      if (!batchSnapshot) batchSnapshot = cloneDoc(doc);
      if (batchTimer) clearTimeout(batchTimer);
      batchTimer = setTimeout(flushBatch, HISTORY_COALESCE_MS);
    } else {
      flushBatch();
      undoStack.push(cloneDoc(doc));
      if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    }
  }

  function canUndo() {
    return undoStack.length > 0 || !!batchSnapshot;
  }

  function canRedo() {
    return redoStack.length > 0;
  }

  function undo() {
    flushBatch();
    if (undoStack.length === 0) return false;
    const current = cloneDoc(doc);
    doc = { ...undoStack.pop(), updatedAt: new Date().toISOString() };
    redoStack.push(current);
    return true;
  }

  function redo() {
    if (redoStack.length === 0) return false;
    const current = cloneDoc(doc);
    doc = { ...redoStack.pop(), updatedAt: new Date().toISOString() };
    undoStack.push(current);
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    return true;
  }

  function getDocument() {
    return doc;
  }

  function getBlock(index) {
    return doc.blocks[index];
  }

  function touchUpdatedAt() {
    doc = { ...doc, updatedAt: new Date().toISOString() };
  }

  /** Ganti satu block dengan hasil transform(block) -> newBlock. */
  function updateBlock(index, nextBlock) {
    const blocks = doc.blocks.slice();
    blocks[index] = nextBlock;
    doc = { ...doc, blocks };
    touchUpdatedAt();
  }

  /** Ganti rentang block [startIndex..endIndex] dengan array block baru. */
  function replaceBlocks(startIndex, endIndex, newBlocks) {
    const blocks = doc.blocks.slice();
    blocks.splice(startIndex, endIndex - startIndex + 1, ...newBlocks);
    doc = { ...doc, blocks };
    touchUpdatedAt();
  }

  function setTitle(title) {
    doc = { ...doc, title };
    touchUpdatedAt();
  }

  /** Style level-dokumen untuk judul (font/ukuran/warna/align/letter-spacing
   * — berlaku seluruh judul sekaligus). Lihat editor/title-style.js. */
  function getTitleStyle() {
    return doc.titleStyle || null;
  }

  /** Gabungkan `patch` ke titleStyle yang sudah ada (mirip setPendingMarks). */
  function setTitleStyle(patch) {
    doc = { ...doc, titleStyle: { ...(doc.titleStyle || {}), ...patch } };
    touchUpdatedAt();
  }

  /** Ambil metadata satu Scene (backgroundColor/padding/edgeStyle), atau
   * `null` kalau sceneId tidak (lagi) ada. Lihat block-model.js. */
  function getScene(sceneId) {
    return (doc.scenes && doc.scenes[sceneId]) || null;
  }

  /** Timpa/tambah metadata Scene (dipakai insertScene & bottom sheet
   * kustomisasi Scene saat background/padding/edgeStyle diubah). */
  function setScene(sceneId, meta) {
    doc = { ...doc, scenes: { ...(doc.scenes || {}), [sceneId]: meta } };
    touchUpdatedAt();
  }

  /** Buang metadata Scene (dipakai deleteScene setelah semua block
   * anggotanya ikut dihapus dari `blocks`). */
  function deleteScene(sceneId) {
    if (!doc.scenes || !(sceneId in doc.scenes)) return;
    const scenes = { ...doc.scenes };
    delete scenes[sceneId];
    doc = { ...doc, scenes };
    touchUpdatedAt();
  }

  /** Ambil metadata musik satu section (`{ assetId, fileName, mimeType }`),
   * atau `null` kalau section itu belum punya musik. `key` lihat
   * block-model.js (musicKeyForTarget/ROOT_MUSIC_KEY/musicKeyForScene/
   * musicKeyForDivider). */
  function getMusic(key) {
    return (doc.music && doc.music[key]) || null;
  }

  /** Timpa/tambah metadata musik satu section. */
  function setMusic(key, meta) {
    doc = { ...doc, music: { ...(doc.music || {}), [key]: meta } };
    touchUpdatedAt();
  }

  /** Buang metadata musik satu section (dipakai saat musik dihapus lewat
   * bottom sheet, atau saat section-nya sendiri hilang — mis. Divider/Scene
   * dihapus). */
  function deleteMusic(key) {
    if (!doc.music || !(key in doc.music)) return;
    const music = { ...doc.music };
    delete music[key];
    doc = { ...doc, music };
    touchUpdatedAt();
  }

  function getPendingMarks() {
    return pendingMarks;
  }

  /** Gabungkan patch ke pending marks yang sudah ada (atau mulai baru). */
  function setPendingMarks(patch) {
    pendingMarks = { ...(pendingMarks || {}), ...patch };
  }

  function clearPendingMarks() {
    pendingMarks = null;
  }

  function getKeepStyleOnEnter() {
    return keepStyleOnEnter;
  }

  function setKeepStyleOnEnter(value) {
    keepStyleOnEnter = !!value;
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function emitChange(detail) {
    for (const fn of listeners) fn(detail);
  }

  return {
    getDocument,
    getBlock,
    updateBlock,
    replaceBlocks,
    setTitle,
    getTitleStyle,
    setTitleStyle,
    getScene,
    setScene,
    deleteScene,
    getMusic,
    setMusic,
    deleteMusic,
    getPendingMarks,
    setPendingMarks,
    clearPendingMarks,
    getKeepStyleOnEnter,
    setKeepStyleOnEnter,
    onChange,
    emitChange,
    checkpoint,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}
