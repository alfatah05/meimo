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

/* Peta warna tema — HARUS sinkron dengan THEMES.swatch di theme-manager.js
   & --color-bg di themes.css. Dipakai untuk status bar + navigation bar. */
const THEME_BAR_COLORS = {
  light: "#FFFFFF",
  dark: "#17181C",
  sepia: "#F4ECD8",
  paper: "#FBFAF5",
  oled: "#000000",
};

/** Tema gelap butuh ikon status bar terang (style DARK), tema terang sebaliknya. */
function isDarkTheme(themeId) {
  return themeId === "dark" || themeId === "oled";
}

function currentThemeId() {
  return document.documentElement.getAttribute("data-theme") || "light";
}

/**
 * Sinkronkan warna status bar (atas) & navigation bar (bawah) Android
 * dengan background tema yang sedang aktif. Dipanggil saat init native
 * dan setiap kali user ganti tema (lihat theme-manager.js).
 *
 * - StatusBar: plugin resmi @capacitor/status-bar
 * - NavigationBar: plugin @capgo/capacitor-navigation-bar (opsional —
 *   kalau belum terpasang, status bar tetap di-set, nav bar diabaikan)
 */
export function syncSystemBars(themeId) {
  if (!isNative()) return;
  const id = themeId || currentThemeId();
  const color = THEME_BAR_COLORS[id] || THEME_BAR_COLORS.light;
  const style = isDarkTheme(id) ? "DARK" : "LIGHT";

  const StatusBar = plugin("StatusBar");
  if (StatusBar) {
    // Overlay WebView supaya CSS env(safe-area-inset-*) bekerja & warna
    // bar bisa diganti runtime sesuai tema (bukan dipotong margin hitam).
    StatusBar.setOverlaysWebView?.({ overlay: true }).catch(() => {});
    StatusBar.setBackgroundColor?.({ color }).catch(() => {});
    StatusBar.setStyle?.({ style }).catch(() => {});
  }

  // Capgo NavigationBar (nama plugin di window.Capacitor.Plugins)
  const NavigationBar = plugin("NavigationBar");
  if (NavigationBar?.setNavigationBarColor) {
    NavigationBar.setNavigationBarColor({
      color,
      darkButtons: !isDarkTheme(id),
    }).catch(() => {});
  } else if (NavigationBar?.setColor) {
    // fallback nama API alternatif
    NavigationBar.setColor({ color }).catch(() => {});
  }
}

function setupStatusBarAndSplash() {
  // Pakai tema yang sudah diterapkan inline script di <head>, bukan hardcode.
  syncSystemBars(currentThemeId());

  const SplashScreen = plugin("SplashScreen");
  // Kasih sedikit jeda supaya first paint sempat render dulu sebelum splash
  // hilang (splash native dikonfigurasi "launchAutoHide: false" di
  // capacitor.config.json, lihat file itu untuk alasannya).
  window.addEventListener("load", () => {
    setTimeout(() => SplashScreen?.hide?.().catch(() => {}), 150);
  });
}

/**
 * Nama file aman untuk path Filesystem (tanpa slash/karakter aneh yang
 * bisa bikin writeFile gagal/crash di Android).
 */
function sanitizeFsName(fileName) {
  const base = String(fileName || "download")
    .replace(/[\\/:*?"<>|\x00-\x1f]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  // Batasi panjang — beberapa FS Android sensitif ke path sangat panjang
  const clipped = base.length > 120 ? base.slice(0, 120) : base;
  return clipped || "download";
}

/**
 * Konversi Blob -> base64 murni (tanpa prefix "data:...;base64,").
 * Chunked btoa lebih hemat memori daripada FileReader.readAsDataURL
 * (yang bikin string data-URL sementara = prefix + base64 full).
 */
async function blobToBase64(blob) {
  const buffer = await blob.arrayBuffer();
  const u8 = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < u8.length; i += chunkSize) {
    const slice = u8.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, slice);
  }
  return btoa(binary);
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
 * Coba Web Share Level 2 (files[]) dulu — tanpa base64, lebih hemat
 * memori, dan keyboard/focus aman. Banyak WebView Android modern support.
 * AbortError = user batal di lembar share (bukan error).
 */
async function tryWebShareFiles(blob, fileName) {
  if (typeof navigator === "undefined" || !navigator.share || !navigator.canShare) {
    return false;
  }
  try {
    const type = blob.type || "application/octet-stream";
    const file = new File([blob], fileName, { type });
    if (!navigator.canShare({ files: [file] })) return false;
    await navigator.share({ files: [file], title: fileName });
    return true;
  } catch (err) {
    if (err && (err.name === "AbortError" || err.name === "NotAllowedError")) {
      // User batal / ditolak sistem — anggap selesai, jangan fallback crash
      return true;
    }
    return false;
  }
}

/**
 * Simpan/bagikan sebuah Blob sebagai file bernama `fileName`.
 *
 *  - Web/PWA (window.Capacitor tidak ada): <a download> blob URL.
 *  - Native (Android via Capacitor):
 *      1) Web Share API files[] kalau tersedia (paling aman, tanpa base64)
 *      2) Tulis ke Cache lewat Filesystem + Share plugin
 *      3) Fallback anchor (jarang berhasil di WebView, tapi lebih baik
 *         daripada silent fail)
 *
 * Dipakai backup-service.js & meimo-export.js.
 */
export async function saveOrShareBlob(blob, fileName) {
  if (!blob) throw new Error("File kosong — tidak ada data untuk diunduh.");
  const safeName = sanitizeFsName(fileName);

  if (!isNative()) {
    classicAnchorDownload(blob, safeName);
    return;
  }

  // 1) Web Share dengan File — hindari OOM base64 untuk cadangan besar
  if (await tryWebShareFiles(blob, safeName)) return;

  const Filesystem = plugin("Filesystem");
  const Share = plugin("Share");
  if (!Filesystem) {
    classicAnchorDownload(blob, safeName);
    return;
  }

  // Path di dalam Cache app — subfolder exports/ + timestamp supaya
  // tidak bentrok & karakter aneh di judul note tidak merusak path.
  const path = `exports/${Date.now()}_${safeName}`;

  try {
    const base64Data = await blobToBase64(blob);
    const written = await Filesystem.writeFile({
      path,
      data: base64Data,
      directory: "CACHE",
      recursive: true,
    });

    // Ambil URI content/file yang bisa di-share (lebih andal dari
    // written.uri di beberapa versi plugin).
    let uri = written?.uri || null;
    if (!uri && Filesystem.getUri) {
      try {
        const got = await Filesystem.getUri({ path, directory: "CACHE" });
        uri = got?.uri || null;
      } catch (_) {
        /* ignore */
      }
    }

    if (Share?.share && uri) {
      try {
        await Share.share({
          title: safeName,
          url: uri,
          dialogTitle: safeName,
        });
        return;
      } catch (shareErr) {
        // User batal share → AbortError / message "Share canceled"
        const msg = String(shareErr?.message || shareErr || "");
        if (/cancel|abort/i.test(msg) || shareErr?.name === "AbortError") return;
        console.error("Share plugin gagal:", shareErr);
        // Jangan rethrow dulu — coba fallback di bawah
      }
    }

    // Fallback terakhir
    classicAnchorDownload(blob, safeName);
  } catch (err) {
    console.error("saveOrShareBlob gagal:", err);
    // Jangan biarkan exception native menutup WebView tanpa feedback —
    // lempar ke pemanggil supaya toast error bisa ditampilkan.
    try {
      classicAnchorDownload(blob, safeName);
    } catch (_) {
      /* ignore */
    }
    throw err;
  }
}

export function initNativeBridge() {
  if (!isNative()) return;
  setupBackButton();
  setupStatusBarAndSplash();
}

initNativeBridge();
