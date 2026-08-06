/**
 * capacitor-status-bar.js
 * Menyamakan warna status bar (notification bar) Android dengan warna
 * background tema aktif — CUMA berlaku saat app jalan dibungkus Capacitor
 * (APK), TIDAK ada efeknya di browser biasa.
 *
 * Kenapa perlu modul terpisah dari `<meta name="theme-color">`: meta tag
 * itu cuma dibaca oleh CHROME BROWSER (mengubah warna address bar saat
 * dibuka sebagai tab/PWA) — status bar Android di dalam WebView native
 * Capacitor TIDAK membaca meta tag itu sama sekali. Tanpa modul ini status
 * bar-nya diam di warna default plugin (putih dengan ikon gelap) walau
 * tema di dalam app-nya sendiri sudah gelap/OLED, jadinya nyilang/susah
 * dibaca.
 *
 * Dipanggil dari dua tempat:
 * 1. Sekali saat modul ini dimuat (tiap halaman) — pakai `data-theme` yang
 *    sudah diterapkan oleh inline script <head> sebelum modul ini sempat
 *    jalan, supaya warna status bar sudah benar sejak app pertama dibuka
 *    (cold start), bukan nunggu user pindah tema dulu.
 * 2. theme-manager.js `setTheme()` — supaya ganti tema saat runtime (lewat
 *    Floating Menu) langsung ikut mengubah status bar juga, bukan cuma
 *    warna di dalam app.
 */

const Capacitor = window.Capacitor;

// Peta warna tema — HARUS sama dengan THEMES di themes/theme-manager.js.
// Duplikat sengaja (bukan import balik dari sana) supaya modul ini juga bisa
// dipakai berdiri sendiri utk sinkronisasi cold-start di bawah, tanpa bikin
// import melingkar (theme-manager.js sendiri sudah import modul ini).
const COLD_START_THEME_COLORS = {
  light: { swatch: "#FFFFFF", dark: false },
  dark: { swatch: "#17181C", dark: true },
  sepia: { swatch: "#F4ECD8", dark: false },
  paper: { swatch: "#FBFAF5", dark: false },
  oled: { swatch: "#000000", dark: true },
};

/**
 * @param {string} hexColor warna background tema, mis. "#17181C"
 * @param {boolean} isDarkBackground true kalau background gelap (perlu ikon
 *   status bar TERANG supaya kebaca), false kalau background terang (perlu
 *   ikon status bar GELAP).
 */
export async function syncCapacitorStatusBar(hexColor, isDarkBackground) {
  if (!Capacitor?.isNativePlatform?.()) return;
  const { StatusBar, ThemeBridge } = Capacitor.Plugins || {};

  // BUGFIX: warna latar Window & WebView native (beda dari <body> di
  // halaman web) diam statis di warna splash/launch bawaan sepanjang app
  // berjalan kalau tidak ditimpa manual — inilah penyebab (1) sisa warna
  // splash "nembus" di celah inset status bar (EdgeToEdge bikin area itu
  // transparan, tapi yang ketutup di baliknya tetap warna splash lama) dan
  // (2) celah warna salah yang kelihatan pas pindah halaman (WebView yang
  // SAMA cuma ganti dokumen, ada jeda singkat sebelum <body> halaman baru
  // ter-paint). Dipisah try/catch sendiri (bukan digabung ke blok StatusBar
  // di bawah) supaya kalau plugin ini gagal/tidak ada, warna ikon status
  // bar di bawah tetap kepasang seperti biasa. Lihat ThemeBridgePlugin.java
  // untuk detail implementasi native-nya.
  if (ThemeBridge) {
    try {
      await ThemeBridge.syncBackground({ color: hexColor });
    } catch (err) {
      console.warn("[capacitor-status-bar] gagal menyinkronkan warna latar Window/WebView:", err);
    }
  }

  if (!StatusBar) return;

  // PENTING: dua panggilan di bawah SENGAJA dipisah try/catch masing-masing
  // (bukan digabung satu try). Sebelumnya digabung, dan itu penyebab bug
  // "status bar tema terang ikonnya putih (nggak kebaca)": setBackgroundColor
  // TIDAK didukung lagi di Android 15+ (plugin membuang/reject promise-nya di
  // situ), jadi begitu baris itu gagal, setStyle (yang ngatur warna ikon) ikut
  // TIDAK PERNAH kepanggil sama sekali — ikon nyangkut di warna default
  // (terang) walau temanya terang juga, jadi tembus/nggak kebaca. Warna
  // BACKGROUND status bar sendiri di Android 15+ sudah otomatis transparan
  // & ngikut warna konten di baliknya (lihat padding-top: env(safe-area-
  // inset-top) di .home-header/.note-topbar, src/css/layout.css) — jadi
  // setBackgroundColor gagal di situ bukan masalah, warnanya tetap benar.
  try {
    await StatusBar.setBackgroundColor({ color: hexColor });
  } catch (err) {
    // Diperkirakan gagal di Android 15+ (fitur ini memang sudah dihapus di
    // sana) — bukan error yang perlu ditindaklanjuti, cukup dicatat.
    console.warn("[capacitor-status-bar] setBackgroundColor tidak didukung (kemungkinan Android 15+):", err);
  }

  try {
    // Style "DARK" = ikon status bar TERANG (dipakai utk background gelap),
    // Style "LIGHT" = ikon status bar GELAP (dipakai utk background terang)
    // — jadi KEBALIKAN dari nama variabelnya, ini penamaan resmi plugin
    // StatusBar (nama style merujuk ke tema, bukan ke warna ikonnya).
    await StatusBar.setStyle({ style: isDarkBackground ? "DARK" : "LIGHT" });
  } catch (err) {
    console.warn("[capacitor-status-bar] gagal mengatur warna ikon status bar:", err);
  }
}

// Sinkronisasi cold-start: begitu modul ini dimuat di tiap halaman, terapkan
// langsung warna status bar sesuai `data-theme` yang sudah di-set oleh
// inline script <head> — supaya status bar sudah benar sejak app pertama
// dibuka, bukan nunggu user ganti tema dulu lewat Floating Menu.
const initialTheme = document.documentElement.getAttribute("data-theme") || "light";
const initialColors = COLD_START_THEME_COLORS[initialTheme] || COLD_START_THEME_COLORS.light;
syncCapacitorStatusBar(initialColors.swatch, initialColors.dark);
