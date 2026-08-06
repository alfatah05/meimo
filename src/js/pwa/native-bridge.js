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

/**
 * Terapkan warna system bars berkali-kali di awal — plugin StatusBar /
 * NavigationBar kadang belum siap di frame pertama cold start, jadi bar
 * tetap warna default config sampai user refresh. Retry singkat menutup
 * race itu tanpa menunggu interaksi user.
 */
function syncSystemBarsWithRetry(themeId) {
  const id = themeId || currentThemeId();
  syncSystemBars(id);
  [50, 150, 400, 900].forEach((ms) => {
    setTimeout(() => syncSystemBars(id), ms);
  });
}

function setupStatusBarAndSplash() {
  const themeId = currentThemeId();
  // Langsung + retry — jangan tunggu event load saja.
  syncSystemBarsWithRetry(themeId);

  const SplashScreen = plugin("SplashScreen");
  const App = plugin("App");

  // Saat app kembali dari background, sinkronkan lagi (OS kadang reset bar).
  if (App?.addListener) {
    App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) syncSystemBars(currentThemeId());
    });
  }

  // Terapkan warna bar dulu, baru hilangkan splash supaya transisi mulus.
  const hideSplash = () => {
    syncSystemBars(currentThemeId());
    setTimeout(() => {
      SplashScreen?.hide?.().catch(() => {});
    }, 120);
  };

  if (document.readyState === "complete") {
    setTimeout(hideSplash, 80);
  } else {
    window.addEventListener("load", () => setTimeout(hideSplash, 80));
  }
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
 * Simpan Blob langsung ke perangkat (tanpa lembar Share).
 *
 *  - Web/PWA: <a download> seperti browser biasa.
 *  - Native Android: tulis ke folder Download publik kalau memungkinkan,
 *    fallback ke Documents app, lalu Data/Cache. Tidak membuka share sheet.
 *
 * @returns {Promise<{ location: string }>}
 *   "download" | "documents" | "cache" | "browser"
 */
export async function saveOrShareBlob(blob, fileName) {
  if (!blob) throw new Error("File kosong — tidak ada data untuk diunduh.");
  const safeName = sanitizeFsName(fileName);

  if (!isNative()) {
    classicAnchorDownload(blob, safeName);
    return { location: "browser" };
  }

  const Filesystem = plugin("Filesystem");
  if (!Filesystem?.writeFile) {
    classicAnchorDownload(blob, safeName);
    return { location: "browser" };
  }

  const base64Data = await blobToBase64(blob);

  // Minta izin storage kalau API-nya ada (Android < 10 / legacy paths).
  // Di Android 10+ scoped storage, Documents tetap jalan tanpa izin ini.
  try {
    if (Filesystem.requestPermissions) await Filesystem.requestPermissions();
  } catch (_) {
    /* ignore — tetap coba write */
  }

  // Urutan: Download publik → Documents → Data → Cache.
  // EXTERNAL_STORAGE/Download = folder Download di app Files user.
  const attempts = [
    { directory: "EXTERNAL_STORAGE", path: `Download/${safeName}`, location: "download" },
    { directory: "DOCUMENTS", path: safeName, location: "documents" },
    { directory: "DATA", path: `exports/${safeName}`, location: "documents" },
    { directory: "CACHE", path: `exports/${Date.now()}_${safeName}`, location: "cache" },
  ];

  let lastErr = null;
  for (const attempt of attempts) {
    try {
      await Filesystem.writeFile({
        path: attempt.path,
        data: base64Data,
        directory: attempt.directory,
        recursive: true,
      });
      return { location: attempt.location };
    } catch (err) {
      lastErr = err;
      console.warn(`writeFile gagal (${attempt.directory}):`, err);
    }
  }

  try {
    classicAnchorDownload(blob, safeName);
    return { location: "browser" };
  } catch (_) {
    /* ignore */
  }
  throw lastErr || new Error("Gagal menyimpan file ke perangkat.");
}

export function initNativeBridge() {
  if (!isNative()) return;
  setupBackButton();
  setupStatusBarAndSplash();
}

initNativeBridge();
