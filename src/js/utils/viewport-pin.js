/**
 * viewport-pin.js
 * Mem-"pin" .note-topbar (back button + floating toolbar jadi satu baris)
 * ke tepi ATAS area yang BENAR-BENAR terlihat di layar HP, walau browser
 * mobile menggeser halaman saat field contenteditable difokus.
 *
 * Kenapa ini perlu:
 * `position: fixed` secara default dihitung relatif terhadap LAYOUT
 * viewport, bukan VISUAL viewport. Di banyak browser mobile (terutama
 * Safari iOS), begitu sebuah field contenteditable difokus, browser
 * men-scroll halaman supaya field itu terlihat di atas keyboard — tapi
 * layout viewport tidak selalu ikut mengecil/bergeser secara konsisten.
 * Akibatnya elemen `fixed` bisa "kabur": kegeser ke bawah, terpotong,
 * atau malah nangkring di luar area yang kelihatan.
 *
 * Solusinya: pakai window.visualViewport (didukung semua browser mobile
 * modern) untuk tahu persis area yang BENAR-BENAR terlihat, lalu set
 * posisi topbar secara manual lewat inline style setiap kali visual
 * viewport resize/scroll (mis. keyboard buka/tutup, halaman digeser
 * browser, dsb).
 *
 * Karena topbar sekarang selalu di ATAS (bukan lagi dua elemen terpisah
 * dengan toolbar mengambang dekat keyboard di bawah), modul ini jauh
 * lebih sederhana dari versi sebelumnya — tidak ada lagi logic "dock ke
 * keyboard" untuk toolbar.
 *
 * Kalau browser tidak dukung visualViewport (sangat jarang), modul ini
 * langsung berhenti dan CSS fallback (posisi fixed statis) yang dipakai.
 */

import { closeAllPanels } from "./dom.js";

const KEYBOARD_THRESHOLD_PX = 120; // di bawah ini dianggap bukan keyboard (mis. cuma toolbar Safari)
// Topbar sekarang NEMPEL ke tepi (bukan mengambang dengan jarak lagi),
// jadi tidak ada gap dari tepi area yang terlihat.
const EDGE_GAP_PX = 0;
const CONTENT_GAP_PX = 16;         // jarak ekstra antara topbar & konten catatan

// env(safe-area-inset-*) tidak bisa dibaca langsung lewat JS, jadi diukur
// sekali lewat elemen bantu yang paddingnya di-set pakai env().
function measureSafeAreaInsets() {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;top:0;left:0;height:0;width:0;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);pointer-events:none;visibility:hidden;";
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const insets = {
    top: parseFloat(cs.paddingTop) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
  };
  probe.remove();
  return insets;
}

function init() {
  const vv = window.visualViewport;
  const topbar = document.querySelector(".note-topbar");
  if (!topbar) return;

  // Tanpa visualViewport, biarkan CSS fallback (fixed statis) yang jalan.
  if (!vv) return;

  const insets = measureSafeAreaInsets();
  let wasKeyboardOpen = false;
  let rafId = null;

  // Nilai px terakhir yang benar-benar ditulis ke DOM. `visualViewport`
  // sering fire event `scroll`/`resize` berkali-kali per detik walau
  // cuma beda sub-pixel (mis. gara-gara scroll konten di dalam
  // `.note-scroll-area`, bukan cuma keyboard buka/tutup). Kalau tiap
  // event itu langsung nulis ulang inline style / custom property,
  // `transition: padding-bottom` di CSS ikut retrigger terus-menerus dan
  // keliatan geter/blink. Jadi kita bulatkan ke integer px & skip nulis
  // kalau nilainya belum berubah.
  const lastApplied = {};
  function setPxIfChanged(key, apply, value) {
    const rounded = Math.round(value);
    if (lastApplied[key] === rounded) return;
    lastApplied[key] = rounded;
    apply(`${rounded}px`);
  }

  function computeAndApply() {
    rafId = null;

    const offsetTop = vv.offsetTop;   // seberapa jauh visual viewport turun dari layout viewport
    const offsetLeft = vv.offsetLeft; // dukungan pinch-zoom horizontal

    const keyboardInset = Math.max(0, window.innerHeight - vv.height - offsetTop);
    const keyboardOpen = keyboardInset > KEYBOARD_THRESHOLD_PX;

    if (keyboardOpen !== wasKeyboardOpen) {
      // Trigger dropdown toolbar (mis. Heading/Font Size) akan berpindah
      // posisi drastis saat topbar/keyboard berubah — tutup panel yang
      // terbuka biar tidak nyangkut di posisi lama.
      closeAllPanels();
      document.body.classList.toggle("is-keyboard-open", keyboardOpen);
      if (keyboardOpen) topbar.classList.remove("is-hidden"); // butuh toolbar saat lagi ngetik
      wasKeyboardOpen = keyboardOpen;
    }

    // Topbar NEMPEL di tepi ATAS+KIRI+KANAN area yang terlihat (bukan
    // mengambang dengan jarak lagi). Safe-area (notch/status bar) ditangani
    // lewat padding-top di CSS (env(safe-area-inset-top)) — bukan lagi
    // dengan menggeser posisi `top` ke bawah — jadi di sini topbarTop
    // cukup offsetTop saja. Cuma `left` & `right` yang di-set (bukan
    // `width`), sama seperti fallback CSS-nya — jadi lebar selalu auto
    // dari jarak keduanya, tidak over-constrained.
    const topbarTop = offsetTop + EDGE_GAP_PX;
    const topbarLeft = offsetLeft + EDGE_GAP_PX;
    const topbarRight = window.innerWidth - (offsetLeft + vv.width) + EDGE_GAP_PX;

    setPxIfChanged("topbar.top", (v) => (topbar.style.top = v), topbarTop);
    setPxIfChanged("topbar.left", (v) => (topbar.style.left = v), topbarLeft);
    setPxIfChanged("topbar.right", (v) => (topbar.style.right = v), topbarRight);

    // --- Ruang konten: header di bawah topbar; footer cuma perlu ruang
    // aman untuk safe-area & keyboard (tidak ada lagi elemen mengambang
    // di bawah, jadi tidak perlu ngukur tinggi toolbar tiap frame). ---
    const topbarHeight = topbar.getBoundingClientRect().height;
    const headerSpace = topbarTop + topbarHeight + CONTENT_GAP_PX;
    const footerSpace = keyboardOpen
      ? keyboardInset + CONTENT_GAP_PX
      : insets.bottom + CONTENT_GAP_PX;

    setPxIfChanged(
      "--editor-header-space",
      (v) => document.documentElement.style.setProperty("--editor-header-space", v),
      headerSpace
    );
    setPxIfChanged(
      "--editor-footer-space",
      (v) => document.documentElement.style.setProperty("--editor-footer-space", v),
      footerSpace
    );
  }

  function scheduleUpdate() {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(computeAndApply);
  }

  vv.addEventListener("resize", scheduleUpdate);
  vv.addEventListener("scroll", scheduleUpdate);
  window.addEventListener("orientationchange", scheduleUpdate);

  // Tinggi topbar (jarang berubah, tapi bisa mis. karena wrap di layar
  // sangat sempit) ikut mempengaruhi header-space; pastikan tetap
  // ter-reposisi kalau ukurannya berubah.
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(scheduleUpdate);
    ro.observe(topbar);
  }

  computeAndApply();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
