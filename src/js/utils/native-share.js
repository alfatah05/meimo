/**
 * native-share.js
 * Ganti trik lama "buat Blob -> bikin <a download> -> .click()" — trik ini
 * TIDAK berfungsi di WebView Capacitor (tidak ada folder Downloads/UI
 * unduhan browser yang bisa dipicu lewat atribut `download` di APK) —
 * dengan Filesystem + Share: tulis file ke direktori Cache lewat plugin
 * Filesystem, lalu buka sheet Share native supaya user bisa pilih simpan
 * ke Downloads / kirim ke app lain (WhatsApp, Drive, dst).
 *
 * Di browser biasa (bukan native), fallback PENUH ke cara lama (Blob +
 * <a download>) supaya behaviour versi web/PWA tidak berubah sama sekali —
 * deteksi lewat Capacitor.isNativePlatform() (lihat capacitor-env.js).
 *
 * Dipakai oleh: meimo-export.js (tombol "Download" per-note) & 
 * backup-service.js ("Cadangkan Semua Catatan"). Fitur IMPOR (baca file
 * masuk lewat <input type="file">) TIDAK disentuh modul ini — itu di luar
 * scope perubahan tahap ini.
 */

import { isNativePlatform, getNativePlugin } from "./capacitor-env.js";

/** Baca Blob jadi base64 murni (tanpa prefix "data:...;base64,") —
 * Filesystem.writeFile plugin Capacitor butuh string base64 polos. */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const commaIdx = result.indexOf(",");
      resolve(commaIdx === -1 ? result : result.slice(commaIdx + 1));
    };
    reader.onerror = () => reject(reader.error || new Error("Gagal membaca file."));
    reader.readAsDataURL(blob);
  });
}

/** Cara lama: Blob + <a download> + klik terprogram — dipertahankan apa
 * adanya sebagai fallback untuk versi web/PWA (bukan native). */
function triggerLegacyBlobDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Simpan/bagikan sebuah Blob sebagai file bernama `fileName`.
 * - Native (APK): tulis ke Filesystem (directory "CACHE"), lalu buka
 *   Share sheet native dengan path file itu.
 * - Web/PWA: fallback ke Blob + <a download> seperti sebelumnya, tanpa
 *   perubahan behaviour.
 *
 * @param {Blob} blob
 * @param {string} fileName
 * @returns {Promise<{ shared: boolean }>} `shared: true` kalau lewat
 *   jalur native Share, `false` kalau lewat unduhan browser biasa.
 */
export async function saveOrShareBlob(blob, fileName) {
  const Filesystem = getNativePlugin("Filesystem");
  const Share = getNativePlugin("Share");

  // Bukan native, atau plugin belum tersedia (mis. lupa `cap sync`) —
  // fallback aman ke cara lama daripada diam tanpa efek sama sekali.
  if (!isNativePlatform() || !Filesystem || !Share) {
    triggerLegacyBlobDownload(blob, fileName);
    return { shared: false };
  }

  const base64Data = await blobToBase64(blob);
  const written = await Filesystem.writeFile({
    path: fileName,
    data: base64Data,
    directory: "CACHE",
  });

  await Share.share({
    title: fileName,
    dialogTitle: `Simpan atau bagikan ${fileName}`,
    url: written.uri,
  });

  return { shared: true };
}
