/**
 * image-service.js
 * Lapisan penyedia gambar untuk block 'image' di editor: menyimpan blob
 * gambar yang diunggah user ke Document Service (object store `assets` di
 * IndexedDB — lihat db/schema.js), dan menyediakan Object URL untuk
 * ditampilkan di <img> hasil render serializer.js. Data biner gambar
 * SENGAJA tidak pernah disimpan langsung di dalam block dokumen supaya
 * dokumen JSON (termasuk snapshot undo/redo di editor-state.js) tetap
 * ringan — lihat block-model.js createImageBlock().
 *
 * Juga menyediakan `convertToWebp()` — konversi gambar ke format WebP
 * murni lewat Canvas API (offline, tanpa layanan eksternal), dipanggil
 * toolbar/image-sheet.js begitu user memilih file, SEBELUM bytes-nya
 * disimpan lewat saveImage() di bawah & sebelum tampil di pratinjau.
 *
 * Cache Object URL disimpan di memori per sesi (assetId -> url) supaya satu
 * asset yang tampil berkali-kali (mis. setelah undo/redo re-render seluruh
 * dokumen) tidak perlu dibaca ulang dari IndexedDB tiap kali.
 */

import * as documentService from "./document-service.js";

const objectUrlCache = new Map(); // assetId -> object URL
const pendingReads = new Map(); // assetId -> Promise<string|null>, cegah baca dobel saat resolve paralel

/** Muat sebuah Blob jadi ImageBitmap/HTMLImageElement (dua-duanya dipakai
 * bareng lewat drawImage) — dicoba lewat createImageBitmap() dulu (lebih
 * cepat, decode di luar main thread di browser yang mendukungnya), jatuh
 * balik ke elemen <img> biasa untuk browser lama yang belum punya
 * createImageBitmap. Resolve ke `null` (bukan reject) kalau gagal, supaya
 * pemanggil bisa jatuh balik dengan aman ke file asli tanpa konversi. */
function loadImageElementFromBlob(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

function loadDrawableFromBlob(blob) {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(blob).catch(() => loadImageElementFromBlob(blob));
  }
  return loadImageElementFromBlob(blob);
}

/**
 * Konversi bytes gambar (ArrayBuffer) yang baru diunggah user ke format
 * WebP — dipakai toolbar/image-sheet.js SEBELUM gambar ditampilkan di
 * pratinjau & sebelum disimpan ke IndexedDB (lihat saveImage di bawah),
 * supaya baik pratinjau maupun file yang benar-benar tersimpan konsisten
 * sama-sama sudah WebP.
 *
 * Konversinya murni lewat Canvas API bawaan browser (decode -> gambar ke
 * <canvas> -> encode ulang lewat canvas.toBlob) — TIDAK memanggil layanan
 * eksternal apa pun, jadi tetap jalan sepenuhnya offline, konsisten dengan
 * sifat PWA offline-first aplikasi ini.
 *
 * Kasus yang SENGAJA dilewati (dikembalikan apa adanya, tanpa konversi):
 *  - `image/gif`: Canvas cuma bisa menggambar SATU frame (frame pertama),
 *    jadi GIF animasi yang dikonversi lewat sini akan kehilangan animasinya
 *    sama sekali — lebih aman disimpan apa adanya.
 *  - `image/webp`: sudah WebP, konversi ulang cuma buang-buang waktu &
 *    berpotensi menurunkan kualitas (re-encode lossy dua kali).
 *  - Gagal decode/encode apa pun (mis. format tidak dikenali browser,
 *    browser tidak mendukung encode `image/webp` lewat toBlob): fallback
 *    diam-diam ke bytes & mimeType ASLI, supaya proses unggah tetap
 *    berhasil walau tanpa konversi, daripada gagal total.
 *
 * @param {ArrayBuffer} bytes
 * @param {string} mimeType - mime type asli file (mis. dari `file.type`)
 * @param {{quality?: number}} [options] - quality WebP 0-1, default 0.85
 * @returns {Promise<{bytes: ArrayBuffer, mimeType: string}>}
 */
export async function convertToWebp(bytes, mimeType, { quality = 0.85 } = {}) {
  const fallback = { bytes, mimeType };
  if (mimeType === "image/gif" || mimeType === "image/webp") return fallback;
  if (typeof document === "undefined" || typeof HTMLCanvasElement === "undefined") return fallback;

  try {
    const sourceBlob = new Blob([bytes], { type: mimeType || "application/octet-stream" });
    const drawable = await loadDrawableFromBlob(sourceBlob);
    if (!drawable) return fallback;

    const width = drawable.width || drawable.naturalWidth;
    const height = drawable.height || drawable.naturalHeight;
    if (!width || !height) return fallback;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(drawable, 0, 0, width, height);
    if (typeof drawable.close === "function") drawable.close(); // lepas ImageBitmap dari memori

    const webpBlob = await new Promise((resolve) => {
      canvas.toBlob(resolve, "image/webp", quality);
    });
    // canvas.toBlob() resolve `null` kalau browser tidak bisa meng-encode
    // tipe yang diminta — fallback ke file asli, jangan gagalkan unggahan.
    if (!webpBlob) return fallback;

    const webpBytes = await webpBlob.arrayBuffer();
    return { bytes: webpBytes, mimeType: "image/webp" };
  } catch (err) {
    console.error("[image-service] Gagal mengonversi gambar ke WebP, pakai file asli:", err);
    return fallback;
  }
}

/**
 * Simpan gambar yang sudah dibaca sebelumnya sebagai `bytes` (ArrayBuffer)
 * sebagai asset milik satu note.
 *
 * SENGAJA menerima `bytes` (ArrayBuffer) yang SUDAH dibaca, BUKAN
 * File/Blob mentah — lihat catatan panjang di toolbar/image-sheet.js
 * fileInput change handler untuk kenapa: membaca File terlalu telat
 * (mis. di sini, saat baru dipanggil pas tombol Terapkan ditekan) berisiko
 * kena NotReadableError di Android karena izin baca dari photo picker
 * sudah keburu dicabut. Pemanggilnya (image-sheet.js) sudah memulai
 * pembacaan sedini mungkin begitu file dipilih.
 */
export async function saveImage(noteId, bytes, mimeType) {
  const assetId = await documentService.saveImageAsset(noteId, bytes, mimeType);
  return assetId;
}

/**
 * Titipkan Object URL yang SUDAH dibuat sebelumnya (mis. pratinjau lokal
 * dari <input type="file"> lewat URL.createObjectURL) ke cache, supaya
 * hydrateImageElements() tidak perlu baca ulang blob yang sama dari
 * IndexedDB tepat setelah disimpan — mencegah kedip singkat di <img> saat
 * bottom sheet gambar menekan "Terapkan" (lihat toolbar/image-sheet.js).
 * Setelah dipanggil, URL ini "dimiliki" cache — jangan di-revoke manual.
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
    .getImageAsset(assetId)
    .then((asset) => {
      pendingReads.delete(assetId);
      if (!asset) return null;
      // FIX: asset baru disimpan sebagai `bytes` (ArrayBuffer) — lihat
      // catatan di db/schema.js createAssetRecord(). `asset.blob` cuma
      // dipakai sebagai fallback untuk data LAMA yang sempat tersimpan
      // sebelum fix ini (kalau ada), supaya gambar yang sudah kadung
      // tersimpan dulu tidak mendadak hilang.
      let blob = null;
      if (asset.bytes) {
        blob = new Blob([asset.bytes], { type: asset.mimeType || "application/octet-stream" });
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
 * Cari semua <img> hasil render block gambar yang belum diisi `src`
 * (ditandai `data-asset-id`, dirender serializer.js) di dalam `root`, lalu
 * isi Object URL-nya secara async. Dipanggil editor.js setiap kali
 * sebagian atau seluruh dokumen dirender ulang (renderAll/rerenderBlockAt)
 * supaya <img> gambar yang baru terpasang ke DOM langsung terisi.
 */
export function hydrateImageElements(root) {
  const imgs = root.querySelectorAll("img.editor-image__img[data-asset-id]");
  imgs.forEach((img) => {
    if (img.dataset.hydrated === "1") return;
    const assetId = img.dataset.assetId;
    img.dataset.hydrated = "1";
    getObjectUrl(assetId).then((url) => {
      if (url) img.src = url;
    });
  });
}
