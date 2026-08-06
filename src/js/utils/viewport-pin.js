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
 * Topbar di-pin ke tepi ATAS visual viewport. Block-selection-bar (bottom
 * bar yang muncul saat ada seleksi teks / mode Select Block) di-pin ke
 * tepi BAWAH visual viewport — supaya naik di atas keyboard mobile saat
 * keyboard terbuka, bukan tetap tertanam di bottom:0 layout viewport
 * (yang sering ketutup keyboard di Android/Capacitor edge-to-edge).
 *
 * Kalau browser tidak dukung visualViewport (sangat jarang), modul ini
 * langsung berhenti dan CSS fallback (posisi fixed statis) yang dipakai.
 */

import { closeTransientPickers } from "./dom.js";

const KEYBOARD_THRESHOLD_PX = 120; // di bawah ini dianggap bukan keyboard (mis. cuma toolbar Safari)
// Topbar sekarang NEMPEL ke tepi (bukan mengambang dengan jarak lagi),
// jadi tidak ada gap dari tepi area yang terlihat.
const EDGE_GAP_PX = 0;
const CONTENT_GAP_PX = 16;         // jarak ekstra antara topbar & konten catatan
const KEYBOARD_CONTENT_GAP_PX = 50; // ekstra ruang di atas keyboard supaya baris terakhir tidak mepet
// BUGFIX: sebelum ini footer cuma dapat `insets.bottom + CONTENT_GAP_PX`
// (16px + safe-area) begitu viewport-pin.js mulai jalan — jauh lebih
// SEMPIT dari fallback CSS awal (`--space-5xl` = 80px, lihat
// `padding-bottom` fallback di layout.css `.note-scroll-area`), jadi
// begitu JS ini nyala, jarak baris paling bawah ke tepi layar/bottom bar
// HP malah MENGECIL drastis dibanding sekilas sebelum JS jalan — beda
// jauh dari header yang memang selalu lega (topbarHeight + 16px, gampang
// >80px). Konstanta baru ini dipakai KHUSUS untuk footer (bukan
// CONTENT_GAP_PX yang tetap dipakai apa adanya untuk header) supaya baris
// terakhir catatan punya jarak "napas" yang sepadan dengan judul di atas,
// tidak mepet ke tepi/bottom bar walau tidak ada toolbar mengambang di
// bawah lagi.
const FOOTER_CONTENT_GAP_PX = 56;

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

/**
 * BUGFIX: `.note-page` (layout.css) dikunci `height: 100dvh` supaya
 * `.note-scroll-area` di dalamnya beneran overflow & scroll secara
 * internal (lihat BUGFIX di layout.css soal auto-scroll Select Block).
 * Masalahnya, unit CSS `dvh` di beberapa browser mobile (terutama
 * Chrome Android) TIDAK selalu ter-update instan selagi address bar
 * kolaps/muncul akibat momentum scroll — ada jeda sampai browser
 * benar-benar selesai animasi & fire ulang layout. Selama jeda itu,
 * box `.note-page` bisa "ngotot" pakai tinggi dvh yang SUDAH BASI
 * (lebih pendek dari layar yang sungguhan sudah kelihatan penuh),
 * dan karena `.note-page` juga `overflow: hidden`, sisa area di bawah
 * box yang kepotong itu cuma nampilin background kosong (kelihatan
 * seperti editor "kecrop" di bagian bawah) — sampai ada trigger resize
 * lain (mis. scroll balik ke atas) yang memaksa dvh dihitung ulang.
 *
 * Fix-nya: JANGAN cuma andalkan CSS `dvh`, ukur ULANG tinggi viewport
 * sungguhan lewat JS (`window.innerHeight`, di-refresh tiap event
 * `resize` window MAUPUN tiap kali `computeAndApply()` di bawah jalan
 * — yang jauh lebih sering fire selagi scroll, termasuk pas address
 * bar sedang animasi kolaps/muncul) lalu tulis ke custom property
 * `--app-height`, yang di CSS jadi override PALING AKHIR (paling
 * diutamakan) dari `height: 100dvh` — lihat `.note-page` di
 * layout.css. Nilai dari JS ini selalu sinkron ke apa yang BENERAN
 * kelihatan di layar, tidak pernah basi seperti `dvh` murni.
 */
function setAppHeightVar() {
  document.documentElement.style.setProperty("--app-height", `${window.innerHeight}px`);
}

function init() {
  const vv = window.visualViewport;
  const topbar = document.querySelector(".note-topbar");
  // Bottom bar seleksi teks — opsional (cuma ada di editor). Kalau tidak
  // ada, logic pin bawah di bawah cukup no-op.
  const selectionBar = document.querySelector(".block-selection-bar");

  setAppHeightVar();
  window.addEventListener("resize", setAppHeightVar);

  if (!topbar) return;

  // Tanpa visualViewport, biarkan CSS fallback (fixed statis) yang jalan
  // untuk posisi topbar — --app-height di atas tetap jalan terlepas dari
  // ini (listener window resize sudah cukup untuknya).
  if (!vv) return;

  const insets = measureSafeAreaInsets();
  let wasKeyboardOpen = false;
  let rafId = null;
  // Tinggi keyboard dari plugin native Capacitor. Di Android (terutama
  // edge-to-edge / API 35+), visualViewport SERING TIDAK mengecil saat
  // IME muncul — keyboardInset dari VV jadi ~0 dan bottom bar / FAB
  // outline tetap ketutup keyboard. Plugin Keyboard melaporkan tinggi
  // sungguhan lewat event will/did show.
  let nativeKeyboardHeight = 0;

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
    setAppHeightVar();

    const offsetTop = vv.offsetTop;   // seberapa jauh visual viewport turun dari layout viewport
    const offsetLeft = vv.offsetLeft; // dukungan pinch-zoom horizontal

    // Gabungkan deteksi: VV (iOS / browser) + native plugin height (Android Cap).
    const vvInset = Math.max(0, window.innerHeight - vv.height - offsetTop);
    const keyboardInset = Math.max(vvInset, nativeKeyboardHeight);
    const keyboardOpen = keyboardInset > KEYBOARD_THRESHOLD_PX;

    if (keyboardOpen !== wasKeyboardOpen) {
      // Tutup panel level-3 saja (dropdown Heading/Font Size, color bar,
      // font-family bar) yang posisinya bisa nyangkut saat viewport berubah.
      // JANGAN tutup child group topbar level-2 (Text/Style/List/Block/Insert):
      // user sering buka menu itu dulu baru keyboard ikut naik (fokus ke
      // contenteditable) — kalau closeAllPanels() ikut menutup child group,
      // menu lv2 langsung hilang lagi padahal user baru saja membukanya.
      closeTransientPickers();
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

    // Saat keyboard terbuka: ruang = tinggi keyboard + gap supaya baris
    // terakhir & FAB outline (.outline-fab pakai --editor-footer-space)
    // tidak ketutup IME. Tinggi block-selection-bar TIDAK ditambah di sini
    // karena FAB sudah diangkat lewat translate di outline.css saat bar
    // terbuka (hindari double-count).
    const footerSpace = keyboardOpen
      ? keyboardInset + KEYBOARD_CONTENT_GAP_PX
      : insets.bottom + FOOTER_CONTENT_GAP_PX;

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
    setPxIfChanged(
      "--keyboard-inset",
      (v) => document.documentElement.style.setProperty("--keyboard-inset", v),
      keyboardOpen ? keyboardInset : 0
    );

    // --- Block selection bar: angkat di atas keyboard.
    // Pakai bottom = keyboardInset (tinggi IME). Sumber angka: max(VV,
    // nativeKeyboardHeight) — di Android native height yang andal.
    if (selectionBar) {
      setPxIfChanged(
        "selectionBar.bottom",
        (v) => (selectionBar.style.bottom = v),
        keyboardOpen ? keyboardInset : 0
      );
    }
  }

  function scheduleUpdate() {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(computeAndApply);
  }

  vv.addEventListener("resize", scheduleUpdate);
  vv.addEventListener("scroll", scheduleUpdate);
  window.addEventListener("orientationchange", scheduleUpdate);

  // Capacitor Keyboard plugin: sumber utama tinggi keyboard di Android.
  // visualViewport di WebView Android edge-to-edge sering TIDAK berubah
  // saat IME muncul, jadi tanpa angka dari plugin, bottom bar & FAB
  // outline tetap di bottom:0 dan ketutup keyboard.
  const CapKeyboard = window.Capacitor?.Plugins?.Keyboard;
  if (CapKeyboard?.addListener) {
    const onShow = (info) => {
      const h = Number(info?.keyboardHeight) || 0;
      if (h > 0) nativeKeyboardHeight = h;
      scheduleUpdate();
    };
    const onHide = () => {
      nativeKeyboardHeight = 0;
      scheduleUpdate();
    };
    CapKeyboard.addListener("keyboardWillShow", onShow);
    CapKeyboard.addListener("keyboardDidShow", onShow);
    CapKeyboard.addListener("keyboardWillHide", onHide);
    CapKeyboard.addListener("keyboardDidHide", onHide);
  }

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
