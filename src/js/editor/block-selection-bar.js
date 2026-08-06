/**
 * block-selection-bar.js
 * Bottom bar yang muncul saat user melakukan long-press lalu SELECT TEKS di
 * area isi catatan (bukan cuma kursor collapsed) — isinya 3 aksi:
 * Select Block, Copy Block, Paste Block (rata kiri), + satu tombol batal
 * ikon "X" (rata kanan sendiri). Styling murni ada di
 * src/css/block-selection-bar.css, file ini cuma bikin DOM & wiring
 * (pola yang sama dengan outline.js/image-sheet.js).
 *
 * "Select Block" mengaktifkan mode seleksi custom per-block (lihat
 * block-select-mode.js untuk detail probe vertikal & logic snapping-nya).
 * "Copy Block"/"Paste Block" tersambung ke
 * services/block-clipboard-service.js (sessionStorage + resolusi
 * assetId/sceneId lewat Document Service) & editor/commands.js
 * pasteBlockClipboard() (mutasi model murni sinkron) — lihat komentar
 * masing-masing file itu untuk detail alurnya.
 *
 * Trigger bar (kapan MUNCUL) dipantau lewat "selectionchange" dokumen (sama
 * seperti pola toolbar-state-sync.js / scene-sheet.js) — ini yang menangkap
 * seleksi dari long-press/drag-select di manapun, tanpa perlu membedakan
 * asal-usulnya (touch vs mouse). Bar juga tetap terbuka SELAGI mode Select
 * Block aktif, terlepas dari status seleksi teks saat itu (lihat update()).
 *
 * ---- Bar tetap terbuka lintas note selagi ada clipboard block ----
 * Begitu Copy Block ditekan, bar TIDAK BOLEH tertutup lagi hanya karena
 * seleksi teks hilang/berpindah note (app ini multi-page — pindah note =
 * reload halaman penuh, lihat app.js) — harus tetap terbuka SAMPAI user
 * benar-benar Paste (di note manapun, termasuk note yang sama) ATAU
 * menutupnya manual lewat tombol "X". `clipboardActive` di bawah adalah
 * SATU-SATUNYA sumber kebenaran untuk itu, diinisialisasi dari
 * hasClipboard() (baca sessionStorage) begitu modul ini dimuat — makanya
 * begitu note LAIN dibuka (reload halaman baru) sementara clipboard masih
 * terisi dari note sebelumnya, bar ini langsung terbuka lagi tanpa perlu
 * ada seleksi teks apa pun.
 */

import { createEl } from "../utils/dom.js";
import { showToast } from "../../components/toast.js";
import { getModelSelection } from "./selection.js";
import { createBlockSelectMode } from "./block-select-mode.js";
import { blockTextLength, resolveBlockRange } from "./block-model.js";
import { pasteBlockClipboard } from "./commands.js";
import {
  hasClipboard,
  readClipboard,
  clearClipboard,
  writeClipboardFromRange,
  resolvePasteInsertion,
} from "../services/block-clipboard-service.js";

// Ikon monoline (stroke, bukan fill) — senada dengan gaya ikon lain di
// aplikasi ini (mis. outline-fab, outline-sidebar__close).
const ICON_SELECT =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="4 3"/></svg>';
const ICON_COPY =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>';
const ICON_PASTE =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="12" height="16" rx="2"/><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="15" y2="15"/></svg>';
const ICON_CLOSE =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>';

/** true kalau seleksi window saat ini adalah SELEKSI TEKS non-collapsed
 * yang benar-benar ada di dalam bodyEl (bukan di judul/tempat lain). */
function hasActiveTextSelection(bodyEl) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
  const anchor = sel.anchorNode;
  const focus = sel.focusNode;
  if (!anchor || !focus) return false;
  return bodyEl.contains(anchor) && bodyEl.contains(focus);
}

/**
 * Posisi kursor "efektif" untuk Paste: sama seperti getModelSelection()
 * biasa, tapi kalau tidak ada seleksi DOM sama sekali (mis. bar ini
 * terbuka murni karena clipboardActive dari note sebelumnya, user belum
 * sempat tap ke isi catatan sama sekali) jatuh ke akhir dokumen — sejalur
 * dengan ensureSelectionInBody() di editor.js, sengaja diduplikasi kecil
 * di sini (bukan diekspor dari editor.js) karena skopnya beda: dipakai
 * SEBELUM runCommand (untuk menentukan target Scene/root duluan sebelum
 * kerja async), bukan di dalam commandFn seperti command lain.
 */
function getEffectiveCursorSelection(bodyEl, state) {
  const sel = getModelSelection(bodyEl);
  if (sel) return sel;
  const blocks = state.getDocument().blocks;
  const lastIndex = blocks.length - 1;
  const lastOffset = blockTextLength(blocks[lastIndex]);
  return {
    startBlockIndex: lastIndex,
    startOffset: lastOffset,
    endBlockIndex: lastIndex,
    endOffset: lastOffset,
    collapsed: true,
  };
}

export function initBlockSelectionBar({ bodyEl, editor, state }) {
  if (!bodyEl || !editor || !state) return;

  const barEl = createEl("div", { className: "block-selection-bar", attrs: { role: "toolbar" } });

  const actionsEl = createEl("div", { className: "block-selection-bar__actions" });
  // Icon-only (tanpa label teks) — aria-label/title tetap dipasang supaya
  // masih ada nama yang bisa dibaca screen reader / muncul di tooltip
  // desktop, walau tidak ditampilkan visual di tombolnya.
  const selectBtn = createEl("button", {
    className: "block-selection-bar__btn",
    attrs: { type: "button", "data-action": "select-block", "aria-label": "Select Block", title: "Select Block" },
    html: ICON_SELECT,
  });
  const copyBtn = createEl("button", {
    className: "block-selection-bar__btn",
    attrs: { type: "button", "data-action": "copy-block", "aria-label": "Copy Block", title: "Copy Block" },
    html: ICON_COPY,
  });
  const pasteBtn = createEl("button", {
    className: "block-selection-bar__btn",
    attrs: { type: "button", "data-action": "paste-block", "aria-label": "Paste Block", title: "Paste Block" },
    html: ICON_PASTE,
  });
  actionsEl.append(selectBtn, copyBtn, pasteBtn);

  const cancelBtn = createEl("button", {
    className: "block-selection-bar__cancel",
    attrs: { type: "button", "aria-label": "Batal" },
    html: ICON_CLOSE,
  });

  barEl.append(actionsEl, cancelBtn);
  document.body.appendChild(barEl);

  const blockSelectMode = createBlockSelectMode({
    bodyEl,
    // Dipanggil block-select-mode.js SENDIRI begitu user tap/fokus lagi ke
    // isi catatan buat ngetik (auto-exit) — deactivate() di dalamnya sudah
    // dipanggil duluan oleh modul itu, jadi di sini cuma perlu sinkronkan
    // UI bar ini. SENGAJA lewat update() (bukan closeBar() paksa) — kalau
    // ada clipboardActive dari Copy Block sebelumnya, bar harus TETAP
    // terbuka walau mode Select Block-nya sendiri auto-exit.
    onAutoExit: () => {
      selectBtn.classList.remove("is-active");
      update();
    },
  });

  // Satu-satunya sumber kebenaran "ada clipboard block yang menunggu
  // di-paste" — lihat blok komentar panjang di atas berkas ini. Dibaca
  // dari sessionStorage SEKALI di sini (bukan dicek ulang tiap update(),
  // supaya konsisten dengan clearClipboard() yang juga langsung
  // memperbarui variable ini, tidak perlu baca storage berulang-ulang).
  let clipboardActive = hasClipboard();
  let isPasting = false;

  let isOpen = false;

  /** Ukur tinggi bar sungguhan (termasuk safe-area) supaya FAB Outline naik
   * PERSIS setinggi bar, bukan angka tebakan tetap — dipanggil tiap kali
   * dibuka karena tinggi bisa beda antar device (safe-area-inset-bottom). */
  function updateFabLiftVar() {
    const height = barEl.getBoundingClientRect().height;
    if (height > 0) {
      document.documentElement.style.setProperty("--block-selection-bar-lift", `${Math.round(height)}px`);
    }
  }

  function openBar() {
    if (isOpen) return;
    isOpen = true;
    updateFabLiftVar();
    barEl.classList.add("is-open");
    document.body.classList.add("is-block-selection-bar-open");
  }

  function closeBar() {
    if (!isOpen) return;
    isOpen = false;
    barEl.classList.remove("is-open");
    document.body.classList.remove("is-block-selection-bar-open");
  }

  // Bar harus tetap terbuka selagi mode Select Block aktif ATAU selagi ada
  // clipboard block menunggu (clipboardActive), TERLEPAS dari status
  // seleksi teks bawaan browser saat itu (begitu mode Select Block
  // diaktifkan, seleksi teks bawaan justru sengaja ditutup — lihat handler
  // selectBtn di bawah), makanya dicek duluan sebelum hasActiveTextSelection.
  function update() {
    const selectionActive = blockSelectMode.isActive() || hasActiveTextSelection(bodyEl);
    if (selectionActive || clipboardActive) openBar();
    else closeBar();

    // Select/Copy butuh ADA seleksi (teks biasa atau mode Select Block)
    // untuk berarti apa-apa — begitu bar ini terbuka murni karena
    // clipboardActive (lihat blok komentar atas berkas), kedua tombol itu
    // dinonaktifkan visual, cuma Paste & tombol batal yang aktif.
    selectBtn.disabled = !selectionActive;
    copyBtn.disabled = !selectionActive;
    pasteBtn.disabled = !clipboardActive || isPasting;
  }

  document.addEventListener("selectionchange", update);

  function exitBlockSelectMode() {
    blockSelectMode.deactivate();
    selectBtn.classList.remove("is-active");
  }

  // Select Block: toggle. Menyalakannya membaca rentang block dari seleksi
  // teks yang sedang aktif (supaya block yang tadinya sudah kena select
  // teks langsung ikut terselect utuh), BARU SETELAH ITU menutup seleksi
  // teks bawaan browser — urutan ini penting supaya listener selectionchange
  // di atas tidak keburu menutup bar sebelum mode sungguhan aktif (lihat
  // update(): begitu blockSelectMode.isActive() true, bar dijamin tetap
  // terbuka apa pun status seleksi teksnya).
  selectBtn.addEventListener("click", () => {
    if (blockSelectMode.isActive()) {
      exitBlockSelectMode();
      update();
      return;
    }
    const modelSel = getModelSelection(bodyEl);
    if (!modelSel) return;
    blockSelectMode.activate(modelSel);
    selectBtn.classList.add("is-active");
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    update();
  });

  // Copy Block: MURNI sync, tidak ada spinner sama sekali (lihat
  // block-clipboard-service.js) — cukup baca rentang block yang terpilih
  // (dari mode Select Block kalau lagi aktif, atau dari resolveBlockRange()
  // atas seleksi teks biasa kalau belum sempat masuk mode Select Block sama
  // sekali) lalu serialize ke sessionStorage. Seleksi SENGAJA dibiarkan
  // terbuka setelah aksi ditekan (bar tidak otomatis tertutup) supaya user
  // masih bisa menekan aksi lain selagi teks yang sama masih terpilih.
  copyBtn.addEventListener("click", () => {
    const doc = state.getDocument();
    let range = null;

    if (blockSelectMode.isActive()) {
      const r = blockSelectMode.getRange();
      if (r) range = r;
    } else {
      const modelSel = getModelSelection(bodyEl);
      if (modelSel) range = resolveBlockRange(doc.blocks, modelSel.startBlockIndex, modelSel.endBlockIndex);
    }

    if (!range || range.start > range.end) {
      showToast("Pilih dulu bagian yang mau disalin.");
      return;
    }

    const ok = writeClipboardFromRange(doc, range.start, range.end);
    if (!ok) {
      showToast("Gagal menyalin, coba lagi.");
      return;
    }

    clipboardActive = true;
    showToast("Block disalin.");
    update();
  });

  // Paste Block: async — resolusi assetId/sceneId (baca/tulis IndexedDB)
  // dulu di block-clipboard-service.js, BARU setelah itu editor.runCommand()
  // yang murni sinkron (pola yang sama dengan toolbar/image-sheet.js).
  // Posisi kursor ("cursorSel") sengaja diambil SEBELUM kerja async dimulai
  // & dipakai APA ADANYA di commandFn (bukan dibaca ulang dari DOM di
  // dalam command) — lihat komentar pasteBlockClipboard() di commands.js.
  pasteBtn.addEventListener("click", async () => {
    if (isPasting) return;

    const payload = readClipboard();
    if (!payload) {
      // Clipboard kosong/tidak valid (mis. formatVersion tidak cocok
      // setelah app ke-update) — bersihkan status & tutup bar, tidak ada
      // lagi yang bisa ditempel.
      clipboardActive = false;
      clearClipboard();
      showToast("Tidak ada yang bisa ditempel.");
      update();
      return;
    }

    isPasting = true;
    update();

    try {
      const cursorSel = getEffectiveCursorSelection(bodyEl, state);
      const noteId = state.getDocument().id;
      const insertion = await resolvePasteInsertion(payload, {
        noteId,
        documentBlocks: state.getDocument().blocks,
        cursorBlockIndex: cursorSel.startBlockIndex,
      });

      editor.runCommand(pasteBlockClipboard, insertion, cursorSel);

      // State copy hilang setelah berhasil di-paste (lihat blok komentar
      // atas berkas ini) — berlaku di note MANAPUN paste-nya terjadi.
      clearClipboard();
      clipboardActive = false;

      if (blockSelectMode.isActive()) exitBlockSelectMode();

      if (insertion.hadFailures) {
        showToast("Ditempel — sebagian gambar/musik sumbernya sudah tidak ada.");
      }
    } catch (err) {
      console.error("Gagal menempel Block:", err);
      showToast("Gagal menempel, coba lagi.");
    } finally {
      isPasting = false;
      update();
    }
  });

  // Tombol batal (X): menutup bar SEPENUHNYA secara manual — beda dari
  // konsekuensi tidak langsung lain (mis. auto-exit Select Block), ini
  // SELALU membuang clipboard block juga kalau ada (lihat blok komentar
  // atas berkas ini: "...atau jika user tutup bottom bar manual").
  cancelBtn.addEventListener("click", () => {
    if (blockSelectMode.isActive()) exitBlockSelectMode();

    const sel = window.getSelection();
    if (sel) sel.collapseToStart();

    if (clipboardActive) {
      clearClipboard();
      clipboardActive = false;
    }

    closeBar();
  });

  // Baru dimuat (termasuk begitu note LAIN baru saja dibuka lewat reload
  // halaman penuh) — kalau ternyata masih ada clipboard block tersisa dari
  // sebelumnya, bar ini harus langsung terbuka tanpa menunggu selectionchange
  // apa pun (lihat blok komentar panjang di atas berkas ini).
  update();
}
