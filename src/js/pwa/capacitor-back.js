/**
 * capacitor-back.js
 * Menyambungkan tombol/gesture back HARDWARE Android (cuma ada saat app
 * jalan dibungkus Capacitor — TIDAK ada di browser biasa) ke sistem back
 * navigasi yang SUDAH ADA di app ini (lihat utils/trap-back-navigation.js
 * & toolbar/active-sheet.js).
 *
 * Begini masalahnya: begitu native listener `backButton` dipasang, Capacitor
 * MEMATIKAN perilaku back bawaan WebView sepenuhnya (dokumentasi resmi:
 * "Listening for this event will disable the default back button
 * behaviour"). Jadi TANPA modul ini, tombol back HP di dalam APK tidak
 * melakukan apa-apa sama sekali.
 *
 * Perbaikannya SENGAJA sesederhana mungkin — modul ini TIDAK menduplikasi
 * logika back apa pun: begitu event native masuk, cuma manggil
 * `window.history.back()` (kalau webview native masih punya history buat
 * di-back-in, ditandai `canGoBack`) — itu memicu event `popstate` yang
 * SUDAH ditangani modul-modul di atas (nutup sheet, "mentok" di Home, dst),
 * persis seperti saat tombol back BROWSER dipencet di versi web. Kalau
 * `canGoBack` false (tidak ada history sama sekali buat di-back-in, mis.
 * app baru dibuka langsung ke Home), baru app-nya sendiri yang ditutup.
 */

const Capacitor = window.Capacitor;

if (Capacitor?.isNativePlatform?.()) {
  const { App } = Capacitor.Plugins;

  App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      App.exitApp();
    }
  });
}
