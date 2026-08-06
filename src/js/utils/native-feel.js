/**
 * native-feel.js
 * Kumpulan penyesuaian kecil biar app terasa seperti aplikasi native, bukan
 * "halaman web" — bagian yang TIDAK bisa ditangani lewat CSS saja (base.css
 * sudah urus overscroll bounce, pinch/double-tap zoom, dan -webkit-touch-
 * callout untuk iOS lewat properti CSS biasa).
 *
 * Isi modul ini:
 *   1) Menutup context menu bawaan Android/Chrome ("Buka di tab baru",
 *      "Salin link", "Download gambar", dst) yang muncul saat tautan/gambar
 *      ditahan lama (long-press) — lihat blok isTouchPrimary di bawah.
 *   2) [Native/APK saja] Aktifkan status bar overlay edge-to-edge (Opsi B —
 *      lihat MEIMO_CAPACITOR_MIGRATION.md bagian "3. Status bar"): status
 *      bar jadi transparan & konten mengalir di baliknya, warnanya
 *      "mengikuti" background halaman lewat padding env(safe-area-inset-top)
 *      di CSS (lihat .note-topbar & .home-header di layout.css) — bukan
 *      warna solid terpisah yang perlu disinkron manual tiap ganti tema.
 *      Dipasang di sini (bukan app.js) karena file ini sudah diimpor di
 *      SEMUA halaman (index, editor, arsip, trash, cadangkan, font-manager,
 *      about, card-style), bukan cuma halaman editor.
 *   3) [Native/APK saja] Pasang listener tombol back Android — lihat
 *      src/js/pwa/back-button.js untuk detail lengkapnya.
 *
 * Cuma dicegah di perangkat yang pointer utamanya "coarse" (touch), supaya
 * klik-kanan normal di desktop (buka tab baru, inspect element, dst) tetap
 * berfungsi seperti biasa — cegatan context menu murni buat pengalaman
 * genggam di HP, bukan buat desktop.
 */

import { isNativePlatform, getNativePlugin } from "./capacitor-env.js";
import "../pwa/back-button.js";

const isTouchPrimary = window.matchMedia?.("(hover: none) and (pointer: coarse)").matches;

if (isTouchPrimary) {
  document.addEventListener(
    "contextmenu",
    (event) => {
      if (event.target.closest?.("a, img")) event.preventDefault();
    },
    { capture: true }
  );
}

if (isNativePlatform()) {
  const StatusBar = getNativePlugin("StatusBar");
  // .setOverlaysWebView({ overlay: true }) TIDAK menggambar apa-apa sendiri
  // (tidak butuh warna) — cuma bikin WebView menggambar di BALIK status
  // bar (edge-to-edge) alih-alih di bawahnya. Warna status bar ikut warna
  // background konten di baliknya secara alami.
  StatusBar?.setOverlaysWebView({ overlay: true }).catch(() => {
    // Diamkan kalau gagal (mis. device/plugin versi lama) — app tetap
    // jalan normal, cuma tidak edge-to-edge.
  });
}
