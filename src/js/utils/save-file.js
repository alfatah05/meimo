/**
 * save-file.js
 * Titik tunggal untuk "menyerahkan" sebuah file (Blob) ke user, dipakai oleh
 * meimo-export.js (unduh satu .meimo) & backup-service.js (unduh cadangan
 * .zip) — sebelumnya masing-masing punya salinan sendiri dari trik
 * `<a download>` + blob: URL.
 *
 * KENAPA PERLU JALUR TERPISAH UNTUK CAPACITOR:
 * Trik `<a href="blob:..." download>.click()` cuma benar-benar men-download
 * file di browser biasa. Di dalam WebView Android yang dibungkus Capacitor
 * (lihat capacitor.config.json — androidScheme "https"), WebView TIDAK
 * punya download manager sendiri yang menangani klik semacam itu — hasilnya
 * klik itu tidak melakukan apa-apa yang terlihat oleh user (tidak ada error,
 * tidak ada file tersimpan). Makanya di APK, tombol "Cadangkan" / "Ekspor
 * .meimo" terasa seperti tidak berfungsi.
 *
 * Perbaikannya, saat berjalan sebagai app native (Capacitor.isNativePlatform()
 * true):
 * 1. JALUR UTAMA — tulis file langsung ke folder Documents PUBLIK lewat
 *    @capacitor/filesystem (`directory: "DOCUMENTS"`). Di Android 11+ ini
 *    otomatis lewat MediaStore TANPA butuh izin apa pun (selama file itu
 *    dibuat oleh app-nya sendiri di salah satu folder Shared — lihat
 *    dokumentasi scoped storage Android), jadi file langsung "ke-download"
 *    ke folder Documents tanpa ada sheet/dialog apapun yang muncul ke user.
 * 2. FALLBACK — kalau jalur di atas gagal (mis. Android 10 ke bawah tanpa
 *    izin WRITE_EXTERNAL_STORAGE, atau alasan lain), tulis dulu ke cache
 *    app lalu buka Android Share Sheet lewat @capacitor/share supaya user
 *    tetap bisa menyimpannya sendiri secara manual.
 * Kedua plugin dipanggil lewat jembatan generik `window.Capacitor.Plugins.*`
 * (BUKAN `import` dari npm) — konsisten dengan pola yang sudah dipakai di
 * src/js/pwa/capacitor-back.js untuk plugin App, supaya tidak perlu bundler.
 *
 * Di browser biasa (bukan native), tetap pakai trik blob+anchor lama seperti
 * sebelumnya — itu sudah bekerja dengan baik di sana.
 *
 * Hasil `saveFileForUser()` (lihat @returns) di-propagate apa adanya ke
 * pemanggil (meimo-export.js -> notes/download-note.js, backup-service.js ->
 * notes/backup-import.js) supaya toast konfirmasi bisa disesuaikan per method
 * ("Diunduh ke folder Documents" utk method "documents" vs "Dibagikan lewat
 * Share Sheet" utk fallback method "share").
 */

const BASE64_CHUNK_SIZE = 0x8000; // 32K per potongan, aman dari batas argumen String.fromCharCode

/** Konversi Uint8Array besar ke base64 tanpa meledakkan call stack
 * (String.fromCharCode(...bytes) gagal untuk array besar kalau dipanggil
 * sekaligus dalam satu spread). */
function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + BASE64_CHUNK_SIZE);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

function downloadBlobInBrowser(blob, fileName) {
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
 * Tulis file langsung ke folder Documents publik (Directory.DOCUMENTS).
 * Diminta lewat requestPermissions() dulu — ini HANYA relevan di Android 10
 * ke bawah (WRITE_EXTERNAL_STORAGE); di Android 11+ panggilan ini langsung
 * resolve tanpa dialog apapun karena aksesnya sudah otomatis lewat MediaStore.
 * @returns {Promise<string>} content URI file yang berhasil ditulis.
 */
async function writeToPublicDocuments(Filesystem, fileName, base64Data) {
  try {
    await Filesystem.requestPermissions?.();
  } catch (err) {
    // Device/versi Android yang tidak butuh/tidak dukung izin ini — biarkan,
    // percobaan writeFile di bawah yang menentukan berhasil/tidaknya.
  }

  await Filesystem.writeFile({
    path: fileName,
    data: base64Data,
    directory: "DOCUMENTS",
    recursive: true,
  });
  const { uri } = await Filesystem.getUri({ path: fileName, directory: "DOCUMENTS" });
  return uri;
}

/**
 * Fallback: tulis ke cache app lalu buka Share Sheet Android supaya user
 * bisa pilih sendiri mau disimpan ke mana.
 * @returns {Promise<string>} content URI file di cache yang dibagikan.
 */
async function shareFromCache(Filesystem, Share, fileName, base64Data) {
  await Filesystem.writeFile({
    path: fileName,
    data: base64Data,
    directory: "CACHE",
    recursive: true,
  });
  const { uri } = await Filesystem.getUri({ path: fileName, directory: "CACHE" });

  await Share.share({
    title: fileName,
    url: uri,
    dialogTitle: `Simpan "${fileName}"`,
  });
  return uri;
}

/**
 * Serahkan `blob` ke user sebagai file bernama `fileName`.
 * - Di browser/PWA: memicu unduhan lewat blob+anchor (seperti biasa).
 * - Di app native (Capacitor Android): menulis langsung ke folder Documents
 *   publik (otomatis "ke-download", tanpa sheet apapun muncul); kalau itu
 *   gagal, fallback menulis ke cache lalu membuka Share Sheet Android.
 *
 * @param {Blob} blob
 * @param {string} fileName
 * @returns {Promise<{method: "documents"|"share"|"browser"|"failed", fileName: string, uri?: string}>}
 *   `method` dipakai pemanggil buat menyesuaikan teks toast konfirmasi.
 */
export async function saveFileForUser(blob, fileName) {
  const Capacitor = window.Capacitor;

  if (Capacitor?.isNativePlatform?.()) {
    const { Filesystem, Share } = Capacitor.Plugins || {};
    if (Filesystem) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const base64Data = bytesToBase64(bytes);

      try {
        const uri = await writeToPublicDocuments(Filesystem, fileName, base64Data);
        return { method: "documents", fileName, uri };
      } catch (err) {
        // Diperkirakan Android 10 ke bawah tanpa izin WRITE_EXTERNAL_STORAGE
        // (atau sebab lain) — bukan error fatal, lanjut coba fallback Share
        // Sheet di bawah.
        console.warn(
          "[save-file] gagal menulis ke folder Documents publik, fallback ke Share Sheet:",
          err
        );
      }

      if (Share) {
        try {
          const uri = await shareFromCache(Filesystem, Share, fileName, base64Data);
          return { method: "share", fileName, uri };
        } catch (err) {
          // Kalau user membatalkan share sheet, Share.share() juga bisa
          // reject (bukan cuma saat benar-benar error) — di kedua kasus itu
          // bukan hal fatal, jadi cukup dicatat, tanpa fallback lain lagi
          // (jalur blob percuma, itu memang tidak jalan di WebView native).
          console.warn("[save-file] gagal menulis/membagikan file lewat Capacitor:", err);
          return { method: "failed", fileName };
        }
      }
      return { method: "failed", fileName };
    }
    // Plugin belum ke-sync (mis. lupa `npx cap sync` setelah nambah
    // dependency) — daripada diam saja, tetap coba jalur blob di bawah;
    // kemungkinan besar juga tidak berhasil di WebView, tapi paling tidak
    // konsisten dengan perilaku sebelum perbaikan ini ada.
  }

  downloadBlobInBrowser(blob, fileName);
  return { method: "browser", fileName };
}
