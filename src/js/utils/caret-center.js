/**
 * caret-center.js
 * Selagi keyboard mobile TERBUKA, baris yang sedang diketik (kursor teks di
 * #editorTitle atau #editorBody) dipusatkan secara VERTIKAL di antara tepi
 * bawah topbar dan tepi atas keyboard — termasuk kalau baris itu adalah
 * baris PALING BAWAH catatan. Begitu keyboard TERTUTUP, semuanya kembali ke
 * perilaku normal (scroll biasa, tanpa pemusatan paksa).
 *
 * Kenapa perlu modul terpisah (bukan cuma scrollIntoView bawaan browser):
 * scrollIntoView cuma menjamin elemen/kursor MASUK area terlihat (nempel ke
 * tepi terdekat), bukan diposisikan ke TENGAH area itu — dan tidak bisa
 * menembus batas scrollHeight dokumen, jadi kursor di baris paling bawah
 * tidak akan pernah bisa "naik" ke tengah tanpa ruang kosong tambahan di
 * bawahnya. Modul ini menghitung sendiri titik tengah area yang terlihat
 * (viewport-pin.js sudah menghitung hal serupa untuk topbar/padding, lihat
 * import KEYBOARD_THRESHOLD_PX di bawah supaya ambang deteksi keyboard
 * SAMA PERSIS di kedua modul) dan menggeser scrollTop `.note-scroll-area`
 * secara manual, plus menambah padding sementara (`--caret-center-extra-
 * space`, lihat layout.css) di atas & bawah konten selama keyboard terbuka
 * supaya selalu ada cukup ruang scroll untuk memusatkan baris MANAPUN,
 * termasuk baris pertama/terakhir catatan.
 *
 * Kapan pemusatan dipicu:
 * - HANYA saat event `input` (user benar-benar mengetik/menghapus karakter)
 *   di #editorTitle atau #editorBody, DAN keyboard sedang terbuka. Bukan
 *   dipicu oleh scroll/selectionchange/pindah kursor lewat tap/panah —
 *   supaya user tetap bebas scroll manual kapan saja (lihat di bawah).
 * - Juga dipicu sekali saat keyboard baru saja TERBUKA (transisi tertutup
 *   -> terbuka, dideteksi lewat MutationObserver pada class
 *   `is-keyboard-open` yang di-toggle viewport-pin.js) — supaya kursor
 *   yang sudah ada di tengah field sebelum keyboard muncul (mis. tap ke
 *   tengah paragraf) langsung terpusat juga begitu keyboard naik.
 *
 * Scroll manual: karena pemusatan TIDAK terikat ke event scroll sama
 * sekali, user bisa scroll bebas ke mana pun kapan saja (termasuk selagi
 * keyboard terbuka) tanpa "dilawan". Begitu user mulai mengetik lagi,
 * event `input` berikutnya otomatis memusatkan ulang ke baris yang aktif
 * sekarang.
 */

import { KEYBOARD_THRESHOLD_PX } from "./viewport-pin.js";

function isKeyboardOpen() {
  const vv = window.visualViewport;
  if (!vv) return false;
  const inset = window.innerHeight - vv.height - vv.offsetTop;
  return inset > KEYBOARD_THRESHOLD_PX;
}

// Batas atas/bawah area yang BENAR-BENAR terlihat saat ini (viewport
// coordinates, sistem yang sama dengan getBoundingClientRect), dipakai
// baik untuk menghitung titik tengah maupun ruang ekstra yang dibutuhkan.
function getVisibleBounds(topbar) {
  const vv = window.visualViewport;
  if (!vv || !topbar) return null;
  const topEdge = topbar.getBoundingClientRect().bottom;
  const bottomEdge = vv.offsetTop + vv.height;
  if (bottomEdge <= topEdge) return null;
  return { topEdge, bottomEdge };
}

// Rect baris/kursor yang sedang aktif. Range collapsed di contenteditable
// tetap mengembalikan rect posisi kursor yang valid di browser mobile
// modern (Chrome/Safari) lewat getClientRects()/getBoundingClientRect().
function getCaretRect(editableEls) {
  const active = document.activeElement;
  if (!editableEls.includes(active)) return null;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  let rect = range.getClientRects()[0];
  if (!rect || (rect.width === 0 && rect.height === 0)) {
    rect = range.getBoundingClientRect();
  }
  if (!rect || (rect.top === 0 && rect.bottom === 0 && rect.height === 0)) return null;
  return rect;
}

function init() {
  const scrollArea = document.querySelector(".note-scroll-area");
  const topbar = document.querySelector(".note-topbar");
  const editorTitleEl = document.getElementById("editorTitle");
  const editorBodyEl = document.getElementById("editorBody");
  if (!scrollArea || !topbar || !editorTitleEl || !editorBodyEl) return;
  if (!window.visualViewport) return; // tanpa ini, tidak ada cara akurat tahu tepi keyboard

  const editableEls = [editorTitleEl, editorBodyEl];
  let rafId = null;

  // Ditulis ke custom property, dibaca layout.css sebagai tambahan
  // padding-top & padding-bottom `.note-scroll-area` (di atas
  // --editor-header-space/--editor-footer-space yang sudah ada dari
  // viewport-pin.js) — SETENGAH tinggi area yang terlihat itu cukup untuk
  // menjamin baris manapun (termasuk baris pertama/terakhir) selalu bisa
  // digeser sampai ke titik tengah persis.
  function applyExtraSpace(bounds) {
    const open = isKeyboardOpen();
    const extra = open && bounds ? Math.ceil((bounds.bottomEdge - bounds.topEdge) / 2) + 8 : 0;
    document.documentElement.style.setProperty("--caret-center-extra-space", `${extra}px`);
  }

  function centerCaret() {
    rafId = null;
    if (!isKeyboardOpen()) return;
    const bounds = getVisibleBounds(topbar);
    if (!bounds) return;
    applyExtraSpace(bounds);
    const caretRect = getCaretRect(editableEls);
    if (!caretRect) return;
    const caretY = (caretRect.top + caretRect.bottom) / 2;
    const centerY = (bounds.topEdge + bounds.bottomEdge) / 2;
    const delta = caretY - centerY;
    if (Math.abs(delta) < 1) return;
    scrollArea.scrollTop += delta;
  }

  function scheduleCenter() {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(centerCaret);
  }

  function handleInput(e) {
    if (!editableEls.includes(e.target)) return;
    scheduleCenter();
  }

  editorTitleEl.addEventListener("input", handleInput);
  editorBodyEl.addEventListener("input", handleInput);

  // Reset ruang ekstra begitu keyboard tertutup (kembali normal, tanpa
  // pemusatan), dan pusatkan sekali begitu keyboard baru terbuka (lihat
  // penjelasan di komentar atas file).
  let wasOpen = isKeyboardOpen();
  const bodyObserver = new MutationObserver(() => {
    const open = isKeyboardOpen();
    if (open === wasOpen) return;
    wasOpen = open;
    if (open) {
      scheduleCenter();
    } else {
      document.documentElement.style.setProperty("--caret-center-extra-space", "0px");
    }
  });
  bodyObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
