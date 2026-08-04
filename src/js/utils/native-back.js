/**
 * native-back.js
 * Menangani tombol back fisik & gesture back Android lewat plugin
 * @capacitor/app (window.CapacitorApp, dibundle oleh
 * scripts/build-www.mjs — lihat build/capacitor-entry.js).
 *
 * TANPA file ini, di Capacitor 8 tombol back Android tidak melakukan
 * apa-apa yang berguna secara default (kadang langsung menutup app,
 * kadang tidak bereaksi sama sekali) — beda dari browser biasa yang
 * otomatis memetakan tombol back sistem ke history back.
 *
 * Perilaku yang diimplementasikan di sini (sesuai rekomendasi resmi
 * Capacitor docs — https://capacitorjs.com/docs/apis/app):
 *   - Kalau WebView masih punya riwayat halaman sebelumnya (mis. dari
 *     Home -> buka Editor), tombol back mundur ke halaman itu, sama
 *     seperti tombol back browser.
 *   - Kalau sudah di halaman paling awal (tidak ada riwayat lagi, mis.
 *     baru buka app langsung di Home), tombol back menutup app —
 *     ini perilaku standar app Android, bukan bug.
 *
 * Di luar Capacitor (browser/PWA biasa), `window.CapacitorApp` tidak ada,
 * jadi file ini otomatis tidak melakukan apa-apa (tombol back browser
 * tetap jalan seperti biasa lewat mekanisme bawaan browser).
 */

const CapacitorApp = window.CapacitorApp?.App;

if (CapacitorApp) {
  CapacitorApp.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      CapacitorApp.exitApp();
    }
  });
}
