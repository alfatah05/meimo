/**
 * music-service.js
 * Lapisan penyedia audio untuk fitur Insert Music (lihat blok komentar
 * "Musik" di editor/block-model.js): menyimpan berkas audio yang diunggah
 * user ke Document Service (object store `assets` di IndexedDB, dipakai
 * bersama dengan gambar — lihat db/schema.js), dan menyediakan Object URL
 * untuk dipakai sebagai `src` elemen <audio> (lihat
 * services/audio-player-service.js). Data biner audio SENGAJA tidak pernah
 * disimpan langsung di `document.music` supaya dokumen JSON (termasuk
 * snapshot undo/redo di editor-state.js) tetap ringan.
 *
 * Isi file ini SENGAJA sejajar 1:1 dengan image-service.js (cache Object
 * URL per sesi, promise pembacaan yang di-dedupe) — bedanya cuma nama
 * fungsi & object store Document Service yang dipanggil (saveAudioAsset/
 * getAudioAsset, bukan saveImageAsset/getImageAsset), supaya konsisten
 * dengan cara toolbar/music-sheet.js memanggilnya.
 */

import * as documentService from "./document-service.js";

const objectUrlCache = new Map(); // assetId -> object URL
const pendingReads = new Map(); // assetId -> Promise<string|null>, cegah baca dobel saat resolve paralel

/**
 * Simpan berkas audio yang sudah dibaca sebelumnya sebagai `bytes`
 * (ArrayBuffer) sebagai asset milik satu note.
 *
 * SENGAJA menerima `bytes` (ArrayBuffer) yang SUDAH dibaca, BUKAN File/Blob
 * mentah — sama seperti image-service.js saveImage(): membaca File/Blob
 * terlalu telat (mis. baru di dalam handler "Terapkan") berisiko file
 * sudah tidak valid lagi di titik itu di sejumlah browser mobile. Pemanggil
 * (toolbar/music-sheet.js) sudah memulai pembacaan sedini mungkin begitu
 * file dipilih dari "Pilih Lagu".
 */
export async function saveMusic(noteId, bytes, mimeType) {
  const assetId = await documentService.saveAudioAsset(noteId, bytes, mimeType);
  return assetId;
}

/**
 * Titipkan Object URL yang SUDAH dibuat sebelumnya (mis. pratinjau lokal
 * dari <input type="file"> lewat URL.createObjectURL) ke cache, supaya
 * hydrateMusicButtons() tidak perlu baca ulang blob yang sama dari
 * IndexedDB tepat setelah disimpan. Setelah dipanggil, URL ini "dimiliki"
 * cache — jangan di-revoke manual.
 */
export function primeObjectUrl(assetId, url) {
  if (!assetId || !url) return;
  objectUrlCache.set(assetId, url);
}

/** Ambil Object URL untuk sebuah assetId (dari cache, atau baca dari IndexedDB). */
export async function getObjectUrl(assetId) {
  if (!assetId) return null;
  if (objectUrlCache.has(assetId)) return objectUrlCache.get(assetId);
  if (pendingReads.has(assetId)) return pendingReads.get(assetId);

  const promise = documentService
    .getAudioAsset(assetId)
    .then((asset) => {
      pendingReads.delete(assetId);
      if (!asset) return null;
      let blob = null;
      if (asset.bytes) {
        blob = new Blob([asset.bytes], { type: asset.mimeType || "audio/mpeg" });
      } else if (asset.blob) {
        blob = asset.blob;
      }
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      objectUrlCache.set(assetId, url);
      return url;
    })
    .catch(() => {
      pendingReads.delete(assetId);
      return null;
    });
  pendingReads.set(assetId, promise);
  return promise;
}

/**
 * Cari semua tombol play musik (ditandai `data-music-key` + `data-asset-id`,
 * lihat toolbar/music-sheet.js) yang belum diisi Object URL-nya (ditandai
 * `data-hydrated`) di dalam `root`, lalu isi `dataset.url`-nya secara async
 * supaya sekali user tap tombolnya, audio-player-service.js bisa langsung
 * memutar tanpa jeda menunggu baca IndexedDB — pola yang sama seperti
 * hydrateImageElements() di image-service.js, dipanggil ulang setiap kali
 * toolbar/music-sheet.js menyinkronkan tombol-tombol musik ke DOM.
 */
export function hydrateMusicButtons(root) {
  const buttons = root.querySelectorAll("[data-music-key][data-asset-id]");
  buttons.forEach((btn) => {
    const assetId = btn.dataset.assetId;
    if (!assetId || btn.dataset.hydrated === assetId) return;
    btn.dataset.hydrated = assetId;
    getObjectUrl(assetId).then((url) => {
      if (url) btn.dataset.url = url;
    });
  });
}
