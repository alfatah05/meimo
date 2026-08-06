/**
 * factory-reset.js
 * Shortcut TERSEMBUNYI di halaman Tentang (about.html): double-click logo
 * app (`.about-hero__icon`) memicu "reset PWA" penuh — unregister semua
 * Service Worker, hapus semua Cache Storage, lalu hard-navigate ke Home
 * (`/index.html`). Berguna buat debug/troubleshoot kalau app-shell yang
 * ke-cache Service Worker "nyangkut" di versi lama (mis. `CACHE_VERSION`
 * baru gagal ter-adopsi) — tanpa user perlu tahu cara clear site data
 * manual lewat DevTools/pengaturan browser.
 *
 * SENGAJA TIDAK menyentuh IndexedDB (`meimo-notes`, lihat db/db.js) —
 * ini reset cache/PWA-shell doang, BUKAN hapus catatan. Kalau nanti ada
 * kebutuhan "hapus semua data" yang sungguhan, itu harus jadi aksi TERPISAH
 * dengan konfirmasi/penamaan sendiri yang jelas beda dari reset ini, supaya
 * tidak ada resiko user salah paham & kehilangan catatan tanpa sengaja.
 *
 * Dipasang lewat double-click (bukan single click) SPESIFIK supaya tidak
 * kepencet tidak sengaja — logo di halaman Tentang bukan tombol interaktif
 * yang biasanya di-tap sekali, jadi double-click cukup aman sebagai
 * "gerakan yang jelas disengaja", ditambah dialog konfirmasi sebelum
 * benar-benar jalan (lewat `confirmDialog()`, komponen yang sama dipakai
 * aksi destruktif lain seperti hapus permanen dari Sampah).
 */

import { confirmDialog } from "../../components/modal.js";
import { showToast } from "../../components/toast.js";

async function unregisterAllServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((reg) => reg.unregister()));
}

async function deleteAllCaches() {
  if (!("caches" in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
}

async function runFactoryReset() {
  try {
    await Promise.all([unregisterAllServiceWorkers(), deleteAllCaches()]);
  } catch (err) {
    // Tetap lanjut ke reload meski salah satu langkah gagal (mis. browser
    // tidak dukung Cache Storage) — reload ke /index.html tanpa SW/cache
    // lama tetap lebih baik daripada berhenti diam di tengah jalan dengan
    // state yang sudah setengah "dibersihkan".
    console.error("Sebagian langkah factory reset gagal:", err);
  } finally {
    // Hard-navigate (bukan location.reload()) — ini SENGAJA pindah halaman
    // ke /index.html, bukan reload about.html itu sendiri, karena tujuan
    // shortcut ini memang "mulai lagi dari Home dalam keadaan bersih".
    // Query string `?reset=<timestamp>` cuma penanda unik supaya request
    // ini tidak mungkin kebetulan match entry mana pun di Cache Storage
    // lama (yang sudah kita hapus di atas juga, jadi ini lapisan jaga-jaga
    // kedua, bukan yang utama).
    window.location.href = `/index.html?reset=${Date.now()}`;
  }
}

function initFactoryResetShortcut() {
  const logo = document.querySelector(".about-hero__icon");
  if (!logo) return;

  logo.addEventListener("dblclick", async () => {
    const confirmed = await confirmDialog({
      title: "Reset aplikasi?",
      message:
        "Ini akan menghapus Service Worker & cache offline app, lalu memuat ulang dari Home. " +
        "Catatan kamu TIDAK akan hilang — ini cuma reset cache, bukan hapus data.",
      confirmLabel: "Reset",
      cancelLabel: "Batal",
      danger: true,
    });
    if (!confirmed) return;

    showToast("Mereset aplikasi…");
    await runFactoryReset();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initFactoryResetShortcut);
} else {
  initFactoryResetShortcut();
}
