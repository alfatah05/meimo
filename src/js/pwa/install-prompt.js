/**
 * install-prompt.js
 * Menangani "Add to Home Screen" / instalasi PWA (event `beforeinstallprompt`
 * di Chrome/Edge/Android, plus deteksi kalau app sudah terpasang).
 *
 * Modul ini TIDAK menggambar UI-nya sendiri — dia hanya:
 *  1. Menangkap & menyimpan event install browser (`deferredPrompt`),
 *     karena event itu cuma bisa dipakai SEKALI dan browser tidak
 *     mengirimkannya lagi kalau tidak ditangkap saat pertama muncul.
 *  2. Menyiarkan ketersediaannya lewat CustomEvent di window
 *     (`meimo:install-availability`, detail: { available: boolean }),
 *     supaya index.html / floating-button.js bisa menampilkan atau
 *     menyembunyikan tombol "Instal Aplikasi" di Floating Menu.
 *  3. Menyediakan `triggerInstall()` yang dipanggil floating-button.js saat
 *     tombol itu ditekan — memicu prompt native & mengembalikan hasilnya.
 *
 * Kenapa dipisah begini (bukan langsung bikin tombol sendiri): supaya letak
 * & gaya tombol tetap 100% dikendalikan lewat markup index.html + CSS yang
 * sudah ada (fab-action), konsisten dengan aksi Floating Menu lain
 * (Cadangkan, Sampah, Ganti Tema) alih-alih ada UI instalasi terpisah.
 */

let deferredPrompt = null;

function isStandaloneDisplay() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari lama: properti non-standar di navigator.
    window.navigator.standalone === true
  );
}

function broadcastAvailability(available) {
  window.dispatchEvent(
    new CustomEvent("meimo:install-availability", { detail: { available } })
  );
}

// Chrome/Edge/Android: browser menahan mini-infobar bawaan & memberi kita
// event ini supaya kita bisa memicu prompt kapan pun lewat UI sendiri.
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event;
  if (!isStandaloneDisplay()) broadcastAvailability(true);
});

// Sudah terpasang (baik lewat tombol kita maupun mini-infobar/menu browser
// lain) -> tombol "Instal Aplikasi" tidak relevan lagi.
window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  broadcastAvailability(false);
});

/** Dipanggil sekali dari tiap halaman untuk sinkronkan state awal tombol. */
export function initInstallAvailability() {
  if (isStandaloneDisplay()) {
    broadcastAvailability(false);
    return;
  }
  // Kalau `beforeinstallprompt` belum sempat tertangkap (mis. browser yang
  // tidak mendukungnya sama sekali, misalnya Safari desktop/iOS), tombol
  // tetap disembunyikan sampai/kecuali event di atas benar-benar terjadi.
  broadcastAvailability(Boolean(deferredPrompt));
}

/**
 * Memicu native install prompt. Dipanggil dari handler klik tombol
 * "Instal Aplikasi" di Floating Menu.
 * @returns {Promise<"accepted"|"dismissed"|"unavailable">}
 */
export async function triggerInstall() {
  if (!deferredPrompt) return "unavailable";

  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;

  // Event beforeinstallprompt hanya berlaku sekali pakai.
  deferredPrompt = null;
  broadcastAvailability(false);

  return outcome; // "accepted" | "dismissed"
}

export function isInstallAvailable() {
  return Boolean(deferredPrompt);
}
