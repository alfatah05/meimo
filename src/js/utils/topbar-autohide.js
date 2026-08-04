/**
 * topbar-autohide.js
 * Menyembunyikan .note-topbar (back button + floating toolbar) begitu user
 * scroll isi catatan, lalu memunculkannya lagi setelah scroll berhenti
 * ~2 detik. Tujuannya: kasih ruang baca lebih lega selagi scroll, tanpa
 * ubah layout — topbar cuma digeser keluar viewport atas (translateY),
 * bukan dihapus dari alur.
 *
 * Sengaja TIDAK menyembunyikan topbar selagi keyboard mobile terbuka
 * (lihat body.is-keyboard-open, di-toggle oleh viewport-pin.js) — saat
 * itu user kemungkinan besar sedang aktif mengetik/format teks, jadi
 * toolbar harus tetap kelihatan. Begitu juga selagi child bar (menu
 * Text/Style/List/Block/Insert, baris kedua topbar) sedang terbuka —
 * lihat isChildGroupOpen() di dom.js. Bar nilai/swatch (baris ketiga,
 * mis. Warna Teks/Highlight/Heading/Font Size) TIDAK ikut dikecualikan:
 * baris itu selalu ditutup begitu user mulai scroll, lewat
 * closeTransientPickers().
 */

import { closeAllPanels, closeTransientPickers, isChildGroupOpen } from "./dom.js";

const SHOW_AFTER_IDLE_MS = 2000;
const SCROLL_DELTA_THRESHOLD_PX = 4; // abaikan micro-scroll/rubber-band di ujung

function init() {
  const scrollArea = document.querySelector(".note-scroll-area");
  const topbar = document.querySelector(".note-topbar");
  if (!scrollArea || !topbar) return;

  let lastScrollTop = scrollArea.scrollTop;
  let idleTimer = null;

  function show() {
    idleTimer = null;
    topbar.classList.remove("is-hidden");
  }

  function hide() {
    if (document.body.classList.contains("is-keyboard-open")) return;
    // Child bar (Text/Style/List/Block/Insert) sedang terbuka: baris ini
    // SENGAJA tidak ikut disembunyikan/ditutup saat discroll — cuma
    // tertutup kalau menu kelompoknya dipencet lagi. Jadi topbar (+ child
    // bar-nya) tetap tampil selama masih terbuka.
    if (isChildGroupOpen()) return;
    if (!topbar.classList.contains("is-hidden")) {
      // Panel dropdown (Heading, Font Size, dst.) posisinya ngikutin
      // trigger di topbar — kalau topbar disembunyikan, panel jadi
      // nyangkut di tempat kosong. Tutup dulu biar rapi.
      closeAllPanels();
      topbar.classList.add("is-hidden");
    }
  }

  scrollArea.addEventListener(
    "scroll",
    () => {
      const current = scrollArea.scrollTop;
      const delta = Math.abs(current - lastScrollTop);
      lastScrollTop = current;

      if (delta > SCROLL_DELTA_THRESHOLD_PX) {
        // Bar nilai/swatch (mis. Warna Teks, Heading, Font Size — baris
        // ketiga) SELALU ditutup saat discroll, apa pun kondisi child
        // bar/topbar di atasnya.
        closeTransientPickers();
        hide();
      }

      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(show, SHOW_AFTER_IDLE_MS);
    },
    { passive: true }
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
