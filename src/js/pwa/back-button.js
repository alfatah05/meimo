/**
 * back-button.js
 * Tangani tombol back Android (hardware/gesture) di build APK Capacitor —
 * tanpa ini, WebView Android akan langsung KELUAR app di halaman pertama
 * yang dibuka (Capacitor mengambil alih behaviour back button begitu ada
 * listener terdaftar, jadi behaviour "kembali dulu ke halaman sebelumnya"
 * harus diimplementasikan manual di sini).
 *
 * Aturan:
 *   - Halaman ini punya history-guard PERMANEN aktif (Home/Arsip — lihat
 *     utils/trap-back-navigation.js, ditandai `meimoHomeGuard: true` di
 *     history.state) -> ini SUDAH halaman "terluar", jangan panggil
 *     history.back() sama sekali (guard itu didesain menyerap popstate-nya
 *     sendiri terus-menerus di web/PWA, di APK itu bikin back HP kerasa
 *     mati/tidak merespons) -> langsung App.minimizeApp().
 *   - Selain itu, ada history navigasi sebelumnya dalam sesi app ini
 *     (window.history.length > 1, mis. dari Home -> Editor, ATAU sheet
 *     guard sementara di active-sheet.js) -> window.history.back(), APK
 *     TIDAK keluar (kalau kebetulan ada sheet terbuka, popstate hasil
 *     panggilan ini yang dipakai active-sheet.js untuk membatalkan sheet
 *     itu duluan — persis behaviour webnya, tidak diubah).
 *   - Sudah di halaman "terluar" & tidak ada history sebelumnya sama
 *     sekali -> behaviour default Android: minimize app (App.minimizeApp()
 *     — app pindah ke background, prosesnya TIDAK dibunuh, sama seperti
 *     tombol Home).
 *
 * Diimpor sekali dari src/js/utils/native-feel.js (sudah diimpor di
 * SEMUA halaman lewat tag <script type="module">), jadi listener ini
 * otomatis aktif di halaman mana pun tanpa perlu ditambah satu-satu ke
 * tiap *.html.
 *
 * Hanya aktif kalau Capacitor.isNativePlatform() true — versi web/PWA
 * tidak terpengaruh sama sekali (browser sudah punya tombol back sendiri).
 */

import { isNativePlatform, getNativePlugin } from "../utils/capacitor-env.js";

if (isNativePlatform()) {
  const CapApp = getNativePlugin("App");

  CapApp?.addListener("backButton", () => {
    const state = window.history.state;
    if (state && state.meimoHomeGuard) {
      CapApp.minimizeApp?.();
      return;
    }
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    CapApp.minimizeApp?.();
  });
}
