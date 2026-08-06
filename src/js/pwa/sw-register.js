/**
 * sw-register.js
 * Mendaftarkan service-worker.js (app-shell caching untuk mode offline) di
 * semua halaman. Diimpor sebagai <script type="module"> biasa lewat tag
 * <script> di <head>/<body> tiap halaman — TIDAK menyentuh mesin editor,
 * hanya urusan lifecycle Service Worker.
 *
 * Juga menyiarkan event kecil `meimo:sw-update-ready` di window supaya
 * bagian lain (mis. toast) bisa memberi tahu user ada versi baru siap
 * dipakai setelah reload, tanpa modul ini perlu tahu soal UI toast.
 */

import { isNativePlatform } from "../utils/capacitor-env.js";

const SW_URL = "/service-worker.js";

async function register() {
  if (!("serviceWorker" in navigator)) return;

  // Di build APK Capacitor, tidak ada konsep "Service Worker offline app
  // shell" seperti di browser — app-nya sendiri sudah dibundle utuh ke
  // dalam APK (lihat capacitor.config.ts webDir), jadi service-worker.js
  // tidak perlu (dan sebaiknya tidak) didaftarkan sama sekali di sana.
  // Versi web/PWA tetap register seperti biasa, tidak berubah.
  if (isNativePlatform()) return;

  try {
    const registration = await navigator.serviceWorker.register(SW_URL, {
      scope: "/",
    });

    // Ada worker baru ter-install sambil tab ini masih terbuka -> beri tahu.
    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          window.dispatchEvent(new CustomEvent("meimo:sw-update-ready"));
        }
      });
    });
  } catch (err) {
    console.error("Gagal mendaftarkan service worker:", err);
  }
}

if (document.readyState === "loading") {
  // Daftarkan setelah load supaya tidak berebut bandwidth dengan render
  // pertama halaman (rekomendasi umum registrasi SW).
  window.addEventListener("load", register);
} else {
  register();
}
