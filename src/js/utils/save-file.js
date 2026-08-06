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
 * Perbaikannya: saat berjalan sebagai app native (Capacitor.isNativePlatform()
 * true), tulis dulu file-nya ke penyimpanan cache app lewat plugin
 * @capacitor/filesystem, lalu buka Android Share Sheet lewat @capacitor/share
 * supaya user bisa pilih "Simpan ke Files/Downloads", "Drive", dsb. Ini pola
 * standar di app Capacitor karena WebView tidak expose download manager asli.
 * Kedua plugin dipanggil lewat jembatan generik `window.Capacitor.Plugins.*`
 * (BUKAN `import` dari npm) — konsisten dengan pola yang sudah dipakai di
 * src/js/pwa/capacitor-back.js untuk plugin App, supaya tidak perlu bundler.
 *
 * Di browser biasa (bukan native), tetap pakai trik blob+anchor lama seperti
 * sebelumnya — itu sudah bekerja dengan baik di sana.
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
 * Serahkan `blob` ke user sebagai file bernama `fileName`.
 * - Di browser/PWA: memicu unduhan lewat blob+anchor (seperti biasa).
 * - Di app native (Capacitor Android): menulis ke cache app lalu membuka
 *   Share Sheet Android supaya user bisa menyimpannya sendiri, karena
 *   WebView tidak punya download manager yang memproses klik unduhan.
 *
 * @param {Blob} blob
 * @param {string} fileName
 */
export async function saveFileForUser(blob, fileName) {
  const Capacitor = window.Capacitor;

  if (Capacitor?.isNativePlatform?.()) {
    const { Filesystem, Share } = Capacitor.Plugins || {};
    if (Filesystem && Share) {
      try {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const base64Data = bytesToBase64(bytes);

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
        return;
      } catch (err) {
        // Kalau user membatalkan share sheet, Share.share() juga bisa reject
        // (bukan cuma saat benar-benar error) — di kedua kasus itu bukan hal
        // fatal, jadi cukup dicatat, tanpa fallback ke trik blob (percuma,
        // itu memang tidak jalan di WebView native).
        console.warn("[save-file] gagal menulis/membagikan file lewat Capacitor:", err);
        return;
      }
    }
    // Plugin belum ke-sync (mis. lupa `npx cap sync` setelah nambah
    // dependency) — daripada diam saja, tetap coba jalur blob di bawah;
    // kemungkinan besar juga tidak berhasil di WebView, tapi paling tidak
    // konsisten dengan perilaku sebelum perbaikan ini ada.
  }

  downloadBlobInBrowser(blob, fileName);
}
