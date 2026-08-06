/**
 * block-select-mode.js
 * Mode "Select Block" — seleksi CUSTOM per-block (bukan select teks bawaan
 * browser), diaktifkan lewat tombol "Select Block" di block-selection-bar.js.
 *
 * UI-nya DUA "probe" (handle bulat kecil) yang nempel PERSIS di pojok kanan
 * highlight seleksi: satu di pojok KANAN ATAS (menggeser batas atas
 * seleksi, expand/shrink ke atas) dan satu di pojok KANAN BAWAH (menggeser
 * batas bawah seleksi, expand/shrink ke bawah) — lihat src/css/
 * block-select-mode.css. Rentang seleksi disimpan sebagai sepasang index
 * `topIndex`/`bottomIndex` (topIndex <= bottomIndex selalu).
 *
 * Masing-masing probe bisa digeser bebas mengikuti jari SELAMA posisinya
 * masih di dalam batas block yang lagi "dipegang" -- begitu jari melewati
 * tepi block itu (naik dari tepi atas / turun dari tepi bawah, tergantung
 * probe mana yang digeser), block tetangga ikut ter-select dan probe
 * "snap" (loncat) persis ke tepi block yang baru ke-cover, bukan mengikuti
 * posisi jari mentah. Ini yang membuat rasanya "per-block" alih-alih bebas
 * piksel demi piksel. Probe atas tidak bisa melewati probe bawah & begitu
 * juga sebaliknya (index tidak akan pernah saling silang).
 *
 * Batas per-block dihitung ulang dari DOM (getBoundingClientRect) setiap
 * pointermove, BUKAN dari cache di awal drag — supaya tetap akurat walau
 * daftar block scroll (lihat auto-scroll di bawah) selagi drag berlangsung.
 *
 * Highlight seleksinya SATU overlay yang menyatu (bukan per-block lagi)
 * meng-cover dari tepi atas block paling atas sampai tepi bawah block
 * paling bawah dalam rentang — lihat updateOverlay().
 *
 * ---- Aturan khusus Scene ----
 * Scene (lihat renderSceneWrapper di serializer.js — `.editor-scene` >
 * `.editor-scene__body` > block-block anggotanya, masih punya
 * `data-block-id` seperti biasa jadi tetap ikut ke-hitung blockEls())
 * diperlakukan berbeda tergantung DI MANA seleksi dimulai (dibaca sekali
 * lewat `homeSceneRange` saat activate(), dari block di topIndex awal):
 *   1. Kalau titik awal seleksi ada DI DALAM sebuah Scene -> seleksi
 *      TERKUNCI di dalam Scene itu saja, tidak bisa expand sampai keluar
 *      batas atas/bawah Scene-nya (lihat clamp `homeSceneRange` di
 *      updateEdgeFromPointerY).
 *   2. Kalau titik awal seleksi ada di ROOT (di luar Scene mana pun) ->
 *      begitu proses expand "menyentuh" sebuah Scene, SELURUH Scene itu
 *      langsung ikut ter-select sekaligus sebagai satu kesatuan (atomik),
 *      BUKAN per-block isinya satu-satu — proses expand lompat langsung ke
 *      tepi terjauh Scene tsb, lanjut dari situ kalau jari masih terus
 *      digeser lebih jauh. Sebaliknya pas shrink (probe ditarik balik),
 *      Scene yang sudah ter-cover lepas sekaligus SATU Scene penuh juga,
 *      tidak bisa "separuh Scene" ikut terselect/lepas.
 *
 * Modul ini TIDAK mengubah model dokumen sama sekali (belum ada aksi
 * Copy/Paste Block sungguhan, lihat block-selection-bar.js) — cuma
 * menghasilkan DAN menyimpan rentang block yang sedang terpilih (index
 * awal/akhir) lewat class `.is-block-selected` di elemen block terkait
 * (dipakai sebagai penanda state, styling visualnya sendiri ada di overlay).
 */

import { getBlockElements } from "./selection.js";
import { createEl } from "../utils/dom.js";

// Jarak dari tepi atas/bawah AREA SCROLL yang men-trigger auto-scroll
// selagi drag (supaya block di luar layar tetap bisa dijangkau tanpa
// melepas jari dulu) & kecepatan scrollnya per-frame.
const AUTOSCROLL_EDGE_PX = 56;
const AUTOSCROLL_SPEED_PX = 16;

// Bleed horizontal overlay highlight (px) supaya tidak mepet body teks,
// senada dengan trik box-shadow bleed versi sebelumnya.
const OVERLAY_BLEED_PX = 6;

const ICON_HANDLE =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M8 9l4-4 4 4M8 15l4 4 4-4"/></svg>';

export function createBlockSelectMode({ bodyEl, onAutoExit }) {
  const scrollAreaEl = bodyEl.closest(".note-scroll-area") || bodyEl;

  const overlayEl = createEl("div", { className: "block-select-overlay", attrs: { "aria-hidden": "true" } });
  const topHandleEl = createEl("button", {
    className: "block-select-handle block-select-handle--top",
    attrs: { type: "button", "aria-label": "Geser batas atas seleksi" },
    html: ICON_HANDLE,
  });
  const bottomHandleEl = createEl("button", {
    className: "block-select-handle block-select-handle--bottom",
    attrs: { type: "button", "aria-label": "Geser batas bawah seleksi" },
    html: ICON_HANDLE,
  });
  document.body.append(overlayEl, topHandleEl, bottomHandleEl);

  let active = false;
  let draggingEdge = null; // 'top' | 'bottom' | null
  let topIndex = -1;
  let bottomIndex = -1;
  // { start, end } index Scene tempat seleksi DIMULAI (lihat activate()),
  // atau null kalau dimulai di root (di luar Scene mana pun) — dibaca
  // SEKALI saat activate(), dipakai terus sepanjang drag lewat
  // updateEdgeFromPointerY() untuk dua aturan berbeda (lihat blok komentar
  // "Aturan khusus Scene" di atas berkas ini).
  let homeSceneRange = null;
  let lastPointerY = 0;
  let autoScrollDir = 0; // -1 = naik, 1 = turun, 0 = diam
  let autoScrollRaf = null;
  let syncRaf = null;

  function blockEls() {
    return getBlockElements(bodyEl);
  }

  /** Wrapper `.editor-scene` terdekat yang membungkus sebuah elemen block,
   * atau null kalau block itu ada di root (bukan anggota Scene mana pun). */
  function sceneWrapperOf(el) {
    return el.closest(".editor-scene");
  }

  /** Rentang index [start, end] Scene yang membungkus `els[index]`
   * (dihitung dari DOM, sejalur dengan findSceneRangeAt() di
   * block-model.js tapi versi DOM-nya), atau null kalau `els[index]`
   * bukan anggota Scene mana pun. */
  function sceneRangeAt(els, index) {
    const wrapper = els[index] && sceneWrapperOf(els[index]);
    if (!wrapper) return null;
    let start = index;
    let end = index;
    while (start - 1 >= 0 && sceneWrapperOf(els[start - 1]) === wrapper) start--;
    while (end + 1 < els.length && sceneWrapperOf(els[end + 1]) === wrapper) end++;
    return { start, end };
  }

  /**
   * Rect pembanding untuk block batas (`held`) yang lagi dipegang probe.
   * Kalau seleksi dimulai di ROOT (`!homeSceneRange`) dan `held` kebetulan
   * anggota sebuah Scene, rect yang dipakai HARUS rect seluruh wrapper
   * `.editor-scene`-nya (mencakup edge bar atas/bawah + semua block di
   * dalamnya), BUKAN rect `held` doang.
   *
   * Ini penting karena begitu proses expand melompat atomik ke tepi
   * terjauh sebuah Scene (lihat updateEdgeFromPointerY di bawah), `held`
   * pada frame BERIKUTNYA jadi block PALING UJUNG Scene itu (mis. block
   * paling bawah kalau bottomIndex baru saja lompat ke sana) — padahal
   * jari/pointer biasanya masih ada di dekat UJUNG LAIN Scene (mis. masih
   * di atas, dekat block PALING ATAS Scene), jauh dari rect block ujung
   * itu sendiri. Kalau perbandingan cuma pakai rect `held` (satu block),
   * pointer keliru dianggap sudah "geser balik" (shrink) walau sebenarnya
   * masih di dalam Scene yang sama, sehingga Scene langsung lepas lagi
   * padahal baru saja ke-select. Pakai rect wrapper penuh memastikan
   * "held" tetap dianggap mencakup seluruh Scene sampai jari BENAR-BENAR
   * keluar dari rect Scene itu.
   *
   * Tidak berlaku kalau seleksi dimulai DI DALAM Scene (`homeSceneRange`
   * truthy) — di kasus itu granularitasnya tetap per-block seperti biasa,
   * tidak pernah ada lompatan atomik seluruh Scene.
   */
  function effectiveHeldRect(el) {
    if (!homeSceneRange) {
      const wrapper = sceneWrapperOf(el);
      if (wrapper) return wrapper.getBoundingClientRect();
    }
    return el.getBoundingClientRect();
  }

  function markSelectedState() {
    blockEls().forEach((el, i) => {
      el.classList.toggle("is-block-selected", i >= topIndex && i <= bottomIndex);
    });
  }

  function clearSelectedState() {
    blockEls().forEach((el) => el.classList.remove("is-block-selected"));
  }

  /** Gambar ulang overlay highlight (menyatu, satu rect) + posisi kedua
   * probe di pojok kanan-atas/kanan-bawah overlay itu. Dipanggil tiap kali
   * rentang berubah ATAU selagi drag/auto-scroll (posisi block bergeser). */
  function updateOverlay() {
    const els = blockEls();
    const rangeEls = els.slice(topIndex, bottomIndex + 1);
    if (!rangeEls.length) return;

    const rects = rangeEls.map((el) => el.getBoundingClientRect());
    const top = rects[0].top;
    const bottom = rects[rects.length - 1].bottom;
    const left = Math.min(...rects.map((r) => r.left)) - OVERLAY_BLEED_PX;
    const right = Math.max(...rects.map((r) => r.right)) + OVERLAY_BLEED_PX;

    overlayEl.style.top = `${Math.round(top)}px`;
    overlayEl.style.left = `${Math.round(left)}px`;
    overlayEl.style.width = `${Math.round(right - left)}px`;
    overlayEl.style.height = `${Math.round(bottom - top)}px`;

    topHandleEl.style.top = `${Math.round(top)}px`;
    topHandleEl.style.left = `${Math.round(right)}px`;
    bottomHandleEl.style.top = `${Math.round(bottom)}px`;
    bottomHandleEl.style.left = `${Math.round(right)}px`;
  }

  /**
   * Inti logika snapping per-block untuk SATU probe (edge = 'top' atau
   * 'bottom'). Hitung ulang index batas terkait dari posisi Y pointer
   * terkini relatif terhadap block yang lagi dipegang probe itu, geser
   * batasnya kalau perlu, lalu update overlay — lihat catatan di atas
   * berkas ini (termasuk aturan khusus Scene lewat `homeSceneRange`).
   */
  function updateEdgeFromPointerY(edge, clientY) {
    const els = blockEls();
    if (!els.length) return;

    if (edge === "top") {
      const held = els[topIndex];
      if (!held) return;
      const heldRect = effectiveHeldRect(held);

      if (clientY < heldRect.top) {
        // Geser ke ATAS: expand, block-block sebelum topIndex yang tepi
        // BAWAHnya sudah terlewati pointer ikut masuk seleksi.
        let newTop = topIndex;
        let i = topIndex - 1;
        while (i >= 0) {
          // Kasus 1: seleksi dimulai DI DALAM Scene -> tidak boleh expand
          // sampai keluar batas atas Scene itu, mentok di situ.
          if (homeSceneRange && i < homeSceneRange.start) break;
          const r = els[i].getBoundingClientRect();
          if (clientY > r.bottom) break;
          // Kasus 2: seleksi dimulai di ROOT & block i ternyata anggota
          // Scene -> lompat sekaligus ke tepi ATAS Scene itu (seluruh
          // Scene ikut ter-select bareng), lanjut scan dari situ.
          const sr = !homeSceneRange && sceneRangeAt(els, i);
          if (sr) {
            newTop = sr.start;
            i = sr.start - 1;
            continue;
          }
          newTop = i;
          i--;
        }
        if (newTop !== topIndex) {
          topIndex = newTop;
          markSelectedState();
        }
      } else if (clientY > heldRect.bottom && topIndex < bottomIndex) {
        // Geser ke BAWAH: shrink, block-block sesudah topIndex yang tepi
        // ATASnya sudah terlewati pointer keluar dari seleksi (tidak akan
        // pernah melewati bottomIndex).
        let newTop = topIndex;
        let i = topIndex + 1;
        while (i <= bottomIndex) {
          const r = els[i].getBoundingClientRect();
          if (clientY < r.top) break;
          // Kalau seleksi dimulai di ROOT & block i anggota Scene utuh
          // yang masih tercakup rentang seleksi -> lepas SATU Scene penuh
          // sekaligus (bukan cuma sebagian isinya), lanjut scan dari tepi
          // bawah Scene itu.
          const sr = !homeSceneRange && sceneRangeAt(els, i);
          if (sr && sr.end <= bottomIndex) {
            // Lompat SAMPAI BENAR-BENAR keluar Scene (block pertama
            // SESUDAH Scene), bukan cuma mentok di block terakhir Scene
            // itu sendiri — kalau berhenti di `sr.end`, Scene-nya masih
            // dianggap ke-cover sebagian (melanggar aturan atomik: Scene
            // cuma boleh ikut ter-select utuh atau lepas utuh).
            const past = sr.end + 1;
            // Kecuali seluruh sisa rentang seleksi cuma Scene ini sendiri
            // (past akan lewat bottomIndex) -> tidak boleh di-shrink habis
            // sampai kosong, mentok di sini saja (Scene tetap ter-select).
            if (past > bottomIndex) break;
            newTop = past;
            i = past;
            continue;
          }
          newTop = i;
          i++;
        }
        if (newTop !== topIndex) {
          topIndex = newTop;
          markSelectedState();
        }
      }
    } else {
      const held = els[bottomIndex];
      if (!held) return;
      const heldRect = effectiveHeldRect(held);

      if (clientY > heldRect.bottom) {
        // Geser ke BAWAH: expand, block-block sesudah bottomIndex yang
        // tepi ATASnya sudah terlewati pointer ikut masuk seleksi.
        let newBottom = bottomIndex;
        let i = bottomIndex + 1;
        while (i < els.length) {
          // Kasus 1: seleksi dimulai DI DALAM Scene -> mentok di batas
          // bawah Scene itu, tidak bisa expand keluar.
          if (homeSceneRange && i > homeSceneRange.end) break;
          const r = els[i].getBoundingClientRect();
          if (clientY < r.top) break;
          // Kasus 2: seleksi dimulai di ROOT, block i anggota Scene ->
          // lompat ke tepi BAWAH Scene itu sekaligus, lanjut scan dari situ.
          const sr = !homeSceneRange && sceneRangeAt(els, i);
          if (sr) {
            newBottom = sr.end;
            i = sr.end + 1;
            continue;
          }
          newBottom = i;
          i++;
        }
        if (newBottom !== bottomIndex) {
          bottomIndex = newBottom;
          markSelectedState();
        }
      } else if (clientY < heldRect.top && bottomIndex > topIndex) {
        // Geser ke ATAS: shrink, block-block sebelum bottomIndex yang
        // tepi BAWAHnya sudah terlewati pointer keluar dari seleksi (tidak
        // akan pernah melewati topIndex).
        let newBottom = bottomIndex;
        let i = bottomIndex - 1;
        while (i >= topIndex) {
          const r = els[i].getBoundingClientRect();
          if (clientY > r.bottom) break;
          // Sama seperti shrink di edge "top": lepas SATU Scene penuh
          // sekaligus kalau seleksi dimulai di root, bukan sebagian.
          const sr = !homeSceneRange && sceneRangeAt(els, i);
          if (sr && sr.start >= topIndex) {
            // Sama seperti shrink di edge "top": lompat SAMPAI BENAR-BENAR
            // keluar Scene (block pertama SEBELUM Scene), bukan mentok di
            // block pertama Scene itu sendiri (yang masih anggota Scene).
            const past = sr.start - 1;
            // Kecuali seluruh sisa rentang seleksi cuma Scene ini sendiri
            // (past akan lewat topIndex) -> mentok di sini, Scene tetap
            // ter-select, tidak boleh di-shrink sampai kosong.
            if (past < topIndex) break;
            newBottom = past;
            i = past;
            continue;
          }
          newBottom = i;
          i--;
        }
        if (newBottom !== bottomIndex) {
          bottomIndex = newBottom;
          markSelectedState();
        }
      }
    }

    updateOverlay();
  }

  function stopAutoScroll() {
    autoScrollDir = 0;
    if (autoScrollRaf) {
      cancelAnimationFrame(autoScrollRaf);
      autoScrollRaf = null;
    }
  }

  function autoScrollStep() {
    if (!autoScrollDir || !draggingEdge) {
      autoScrollRaf = null;
      return;
    }
    scrollAreaEl.scrollTop += autoScrollDir * AUTOSCROLL_SPEED_PX;
    updateEdgeFromPointerY(draggingEdge, lastPointerY);
    autoScrollRaf = requestAnimationFrame(autoScrollStep);
  }

  function handlePointerMove(e) {
    if (!draggingEdge) return;
    e.preventDefault();
    lastPointerY = e.clientY;

    const scrollRect = scrollAreaEl.getBoundingClientRect();
    if (e.clientY < scrollRect.top + AUTOSCROLL_EDGE_PX) autoScrollDir = -1;
    else if (e.clientY > scrollRect.bottom - AUTOSCROLL_EDGE_PX) autoScrollDir = 1;
    else autoScrollDir = 0;

    if (autoScrollDir && !autoScrollRaf) autoScrollRaf = requestAnimationFrame(autoScrollStep);
    else if (!autoScrollDir) stopAutoScroll();

    updateEdgeFromPointerY(draggingEdge, e.clientY);
  }

  function endDrag() {
    if (!draggingEdge) return;
    draggingEdge = null;
    stopAutoScroll();
    topHandleEl.classList.remove("is-dragging");
    bottomHandleEl.classList.remove("is-dragging");
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
  }

  function startDrag(edge) {
    return (e) => {
      if (!active) return;
      e.preventDefault();
      draggingEdge = edge;
      lastPointerY = e.clientY;
      (edge === "top" ? topHandleEl : bottomHandleEl).classList.add("is-dragging");
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", endDrag);
      window.addEventListener("pointercancel", endDrag);
    };
  }

  topHandleEl.addEventListener("pointerdown", startDrag("top"));
  bottomHandleEl.addEventListener("pointerdown", startDrag("bottom"));

  // Fokus lagi ke isi catatan (buat naruh kursor & mulai ngetik) HARUS
  // otomatis menutup mode Select Block — bukan cuma dibiarkan aktif terus
  // sampai user pencet tombol batal manual. SENGAJA cuma dengar event
  // "focusin" (bukan "pointerdown"/"click") supaya tap-drag buat SCROLL
  // konten (yang juga memicu pointerdown di awal gesture-nya walau ujungnya
  // cuma scroll, bukan mau ngetik) TIDAK ikut nutup mode ini secara tidak
  // sengaja — cuma perpindahan fokus sungguhan ke bodyEl yang dianggap
  // "niat ngetik".
  function handleEditIntent() {
    if (!active) return;
    deactivate();
    if (typeof onAutoExit === "function") onAutoExit();
  }
  bodyEl.addEventListener("focusin", handleEditIntent);

  // Overlay & kedua probe di-sinkronkan ulang TIAP FRAME selagi mode aktif
  // (bukan lewat listener event "scroll" ke satu elemen tertentu) — supaya
  // posisinya selalu nempel ke block yang bersangkutan apa pun sumber
  // scroll-nya (drag konten manual, momentum/inertial scroll di HP yang
  // event "scroll"-nya sering telat/jarang nge-fire, auto-scroll selagi
  // drag probe, resize keyboard mobile, dll) tanpa perlu tahu elemen mana
  // yang sebenarnya scroll. Overhead-nya kecil (cuma beberapa
  // getBoundingClientRect per frame, hanya untuk block yang lagi terpilih).
  function syncLoop() {
    if (!active) {
      syncRaf = null;
      return;
    }
    updateOverlay();
    syncRaf = requestAnimationFrame(syncLoop);
  }

  /**
   * Aktifkan mode: `startBlockIndex`/`endBlockIndex` adalah rentang block
   * yang sudah tercakup seleksi teks saat tombol "Select Block" ditekan
   * (lihat getModelSelection di selection.js) — dipakai sebagai titik awal
   * supaya block yang tadinya sudah kena select teks langsung ikut
   * terselect sebagai block utuh, bukan mulai dari nol lagi.
   */
  function activate({ startBlockIndex, endBlockIndex }) {
    const els = blockEls();
    if (!els.length) return;
    active = true;
    const a = Math.max(0, Math.min(startBlockIndex ?? 0, els.length - 1));
    const b = Math.max(0, Math.min(endBlockIndex ?? a, els.length - 1));
    topIndex = Math.min(a, b);
    bottomIndex = Math.max(a, b);
    // Baca SEKALI di sini: Scene tempat seleksi dimulai (dari block di
    // topIndex awal) — null berarti dimulai di root. Lihat blok komentar
    // "Aturan khusus Scene" di atas berkas ini untuk perilaku masing-masing.
    homeSceneRange = sceneRangeAt(els, topIndex);
    markSelectedState();

    bodyEl.classList.add("is-block-select-mode");
    document.body.classList.add("is-block-select-mode");
    overlayEl.classList.add("is-visible");
    topHandleEl.classList.add("is-visible");
    bottomHandleEl.classList.add("is-visible");

    // bodyEl SENGAJA di-blur() di sini — begitu mode ini diaktifkan (biasa
    // dari tombol "Select Block" saat bodyEl masih fokus sisa long-press
    // sebelumnya), fokusnya dilepas dulu supaya nanti kalau user tap lagi
    // ke isi catatan buat ngetik, itu BENAR-BENAR memicu event "focusin"
    // baru (lihat listener di atas) — kalau tidak di-blur, bodyEl sudah
    // fokus dari awal, jadi tap berikutnya di elemen yang sama tidak
    // memunculkan focusin apa pun & auto-exit tidak akan pernah kepicu.
    bodyEl.blur();

    // syncLoop() sendiri sudah jalan tiap requestAnimationFrame, jadi posisi
    // awal overlay & probe otomatis ke-settle di frame berikutnya (termasuk
    // menunggu tinggi block-selection-bar yang baru saja dibuka) tanpa perlu
    // rAF terpisah lagi di sini.
    if (!syncRaf) syncRaf = requestAnimationFrame(syncLoop);
  }

  function deactivate() {
    if (!active) return;
    active = false;
    endDrag();
    if (syncRaf) {
      cancelAnimationFrame(syncRaf);
      syncRaf = null;
    }
    clearSelectedState();
    bodyEl.classList.remove("is-block-select-mode");
    document.body.classList.remove("is-block-select-mode");
    overlayEl.classList.remove("is-visible");
    topHandleEl.classList.remove("is-visible");
    bottomHandleEl.classList.remove("is-visible");
    topIndex = -1;
    bottomIndex = -1;
    homeSceneRange = null;
  }

  function isActive() {
    return active;
  }

  /** Rentang block yang sedang terpilih (index, inklusif), atau `null`
   * kalau mode ini tidak aktif — dipakai Copy Block di block-selection-bar.js
   * supaya bisa membaca hasil seleksi custom ini tanpa perlu tahu detail
   * topIndex/bottomIndex internal modul ini. */
  function getRange() {
    if (!active) return null;
    return { start: topIndex, end: bottomIndex };
  }

  return { activate, deactivate, isActive, getRange };
}
