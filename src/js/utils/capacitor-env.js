/**
 * capacitor-env.js
 * Helper kecil untuk deteksi platform Capacitor & akses plugin native,
 * TANPA bundler — project ini vanilla JS PWA, jadi tidak mengimpor paket
 * @capacitor/* langsung lewat bare specifier (tidak akan resolve di
 * browser tanpa bundler/import map). Di build APK Capacitor, runtime
 * native otomatis menyuntik objek global `window.Capacitor` (termasuk
 * `window.Capacitor.Plugins` berisi semua plugin native terdaftar)
 * SEBELUM script app manapun jalan. Di browser biasa (web/PWA),
 * `window.Capacitor` tidak ada sama sekali — jadi semua pengecekan di
 * sini aman dipakai di kedua konteks tanpa perlakuan khusus.
 */

/** true kalau app sedang berjalan sebagai APK/native Capacitor. */
export function isNativePlatform() {
  return !!(
    typeof window !== "undefined" &&
    window.Capacitor &&
    typeof window.Capacitor.isNativePlatform === "function" &&
    window.Capacitor.isNativePlatform()
  );
}

/** Ambil plugin native Capacitor lewat namanya (mis. "Filesystem",
 * "Share", "StatusBar", "App") — mengembalikan `null` kalau bukan native
 * atau plugin itu belum terdaftar, supaya pemanggil bisa fallback dengan
 * aman alih-alih melempar error. */
export function getNativePlugin(name) {
  return (isNativePlatform() && window.Capacitor.Plugins && window.Capacitor.Plugins[name]) || null;
}
