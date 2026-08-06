/**
 * native-bridge.js
 * Titik integrasi SATU-SATUNYA antara kode web meimo yang sudah ada dengan
 * shell native Capacitor (Android). Diimpor sebagai <script type="module">
 * biasa persis di sebelah sw-register.js di SEMUA halaman, supaya perilaku
 * native (tombol back Android, status bar, splash screen) aktif di mana pun
 * tanpa harus menyentuh logic tiap halaman satu-satu.
 *
 * PENTING: file ini SENGAJA tidak meng-import package npm apa pun
 * (mis. "@capacitor/app") lewat bare specifier, karena project ini TIDAK
 * pakai bundler (semua modul dimuat browser apa adanya). Saat app berjalan
 * di dalam shell native Capacitor, runtime Capacitor sendiri yang otomatis
 * menyuntikkan `window.Capacitor` (termasuk `Capacitor.Plugins.*`) ke setiap
 * halaman SEBELUM script halaman ini jalan — jadi cukup pakai global itu.
 * Di browser biasa / mode PWA, `window.Capacitor` tidak ada sama sekali,
 * jadi semua fungsi di sini otomatis no-op / fallback ke perilaku web lama.
 */

function isNative() {
  return !!window.Capacitor?.isNativePlatform?.();
}

function plugin(name) {
  return window.Capacitor?.Plugins?.[name] || null;
}

// ---------------------------------------------------------------------
// Tombol back hardware Android: default WebView akan menutup app begitu
// saja kalau tidak ditangani. Di sini: mundur riwayat browser (SPA-style
// antar halaman meimo) dulu selama masih bisa, baru keluar app kalau sudah
// di halaman paling awal — supaya perilakunya senatural mungkin.
// ---------------------------------------------------------------------
function setupBackButton() {
  const App = plugin("App");
  if (!App?.addListener) return;
  App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack || window.history.length > 1) {
      window.history.back();
    } else {
      App.exitApp();
    }
  });
}

function setupStatusBarAndSplash() {
  const StatusBar = plugin("StatusBar");
  if (StatusBar) {
    // Warna sama dengan theme_color/background_color di manifest.json,
    // biar status bar menyatu dengan app (app ini gelap by default).
    StatusBar.setBackgroundColor?.({ color: "#1E1E1E" }).catch(() => {});
    StatusBar.setStyle?.({ style: "DARK" }).catch(() => {});
  }
  const SplashScreen = plugin("SplashScreen");
  // Kasih sedikit jeda supaya first paint sempat render dulu sebelum splash
  // hilang (splash native dikonfigurasi "launchAutoHide: false" di
  // capacitor.config.json, lihat file itu untuk alasannya).
  window.addEventListener("load", () => {
    setTimeout(() => SplashScreen?.hide?.().catch(() => {}), 150);
  });
}

/**
 * Konversi Blob -> base64 murni (tanpa prefix "data:...;base64,") karena
 * itu format yang diminta plugin Filesystem Capacitor.
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || "");
      const commaIdx = result.indexOf(",");
      resolve(commaIdx === -1 ? result : result.slice(commaIdx + 1));
    };
    reader.onerror = () => reject(reader.error || new Error("Gagal membaca file."));
    reader.readAsDataURL(blob);
  });
}

function classicAnchorDownload(blob, fileName) {
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
 *
 *  - Web/PWA (window.Capacitor tidak ada): perilaku LAMA persis — bikin
 *    <a download> lewat blob: URL, browser yang urus unduhannya sendiri.
 *  - Native (Android via Capacitor): <a download> ke blob: URL TIDAK
 *    berfungsi di WebView (tidak ada UI unduhan bawaan), jadi di sini file
 *    ditulis dulu ke cache app lewat plugin Filesystem, lalu dibuka lewat
 *    lembar "Bagikan" native (plugin Share) supaya user bisa pilih simpan
 *    ke Download/Drive/app lain — ini sengaja TIDAK minta izin storage
 *    (nulis ke direktori Cache milik app sendiri, bukan storage publik).
 *
 * Dipakai backup-service.js & meimo-export.js menggantikan
 * triggerBlobDownload() versi lama masing-masing, supaya kedua jalur
 * ekspor (per-note & cadangkan-semua) tetap berfungsi utuh di app native.
 */
export async function saveOrShareBlob(blob, fileName) {
  if (!isNative()) {
    classicAnchorDownload(blob, fileName);
    return;
  }

  const Filesystem = plugin("Filesystem");
  const Share = plugin("Share");
  if (!Filesystem) {
    // Fallback paling aman kalau plugin belum ke-install: tetap coba cara
    // lama, siapa tahu WebView tertentu mendukungnya sebagian.
    classicAnchorDownload(blob, fileName);
    return;
  }

  const base64Data = await blobToBase64(blob);
  const written = await Filesystem.writeFile({
    path: fileName,
    data: base64Data,
    directory: "CACHE",
    recursive: true,
  });

  if (Share?.share) {
    await Share.share({ title: fileName, url: written.uri });
  }
}

export function initNativeBridge() {
  if (!isNative()) return;
  setupBackButton();
  setupStatusBarAndSplash();
}

initNativeBridge();
