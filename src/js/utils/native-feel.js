/**
 * native-feel.js
 * Kumpulan penyesuaian kecil biar app terasa seperti aplikasi native, bukan
 * "halaman web" — bagian yang TIDAK bisa ditangani lewat CSS saja (base.css
 * sudah urus overscroll bounce, pinch/double-tap zoom, dan -webkit-touch-
 * callout untuk iOS lewat properti CSS biasa).
 *
 * Satu-satunya hal di sini: menutup context menu bawaan Android/Chrome
 * ("Buka di tab baru", "Salin link", "Download gambar", dst) yang muncul
 * saat tautan/gambar ditahan lama (long-press). `-webkit-touch-callout` di
 * base.css cuma dikenali WebKit/iOS Safari — Android tidak punya padanan
 * CSS-nya, satu-satunya cara adalah mencegah event `contextmenu` lewat JS.
 *
 * Cuma dicegah di perangkat yang pointer utamanya "coarse" (touch), supaya
 * klik-kanan normal di desktop (buka tab baru, inspect element, dst) tetap
 * berfungsi seperti biasa — cegatan ini murni buat pengalaman genggam di
 * HP, bukan buat desktop.
 */

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
