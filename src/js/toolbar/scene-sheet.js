/**
 * scene-sheet.js
 * Fitur "Scene" — lihat blok komentar panjang di editor/block-model.js
 * (di atas createBlock) untuk model datanya. File ini menangani semua sisi
 * UI-nya:
 *
 *   1. Menyisipkan Scene baru lewat tombol "Sisipkan Scene" di toolbar.
 *   2. Memilih Scene: begitu kursor/karet user ada DI DALAM sebuah Scene
 *      (mengetik teks di dalamnya, atau sekadar mengklik area kosongnya)
 *      satu chip kecil "Scene" mengambang muncul di pojok Scene tsb (Scene
 *      TIDAK punya handle yang selalu terlihat, chip ini cuma muncul
 *      selama fokus user ada di Scene tsb — TIDAK ada outline/border
 *      tambahan di sekeliling Scene, cukup chip-nya saja sebagai penanda).
 *      Pindah fokus ke luar Scene yang aktif (klik di luar, atau tombol
 *      Escape) membatalkan pilihan.
 *   3. Bottom sheet "Customize Scene" (dibuka lewat chip di atas, atau
 *      otomatis begitu selesai menyisipkan Scene baru) — tampilan &
 *      interaksinya sengaja disamakan dengan bottom sheet gambar
 *      (image-sheet.js): overlay + panel yang naik dari bawah, judul di
 *      atas, tiap pengaturan sebagai section berlabel.
 *
 * BEDA PENTING dari image-sheet.js: kontrol di sheet ini (warna latar,
 * padding, bentuk tepi) langsung diterapkan ke model SAAT itu juga lewat
 * editor.updateScene() (lihat editor.js) — tidak ada mode "pratinjau lalu
 * Terapkan/Batal". Scene bukan wizard sisip-sekali seperti gambar; ini
 * panel pengaturan yang wajar untuk terus dibuka-tutup kapan saja sambil
 * langsung terlihat hasilnya, dan tiap sentuhan sudah 100% aman/murah
 * (tidak ada upload file/asset seperti pada gambar yang perlu tahap
 * commit terpisah).
 */

import { createEl, qs } from "../utils/dom.js";
import { insertScene, duplicateScene, deleteScene } from "../editor/commands.js";
import { SCENE_EDGE_STYLES, SCENE_PADDING_PRESETS, DEFAULT_SCENE_META } from "../editor/block-model.js";
import { buildEdgeClipPath } from "../editor/scene-edges.js";

// Preset warna latar Scene. `value` BUKAN hex tetap, melainkan referensi ke
// custom property --scene-bg-* (lihat themes.css) yang isinya rgba tipis —
// jadi warna yang SAMA otomatis kelihatan beda sesuai tema aktif: pastel
// lembut di atas latar terang (Light/Sepia/Kertas), jadi lebih gelap &
// berkarakter di atas latar gelap (Dark/OLED), karena warnanya bercampur
// dengan --color-bg yang ada di baliknya alih-alih dicat hex solid penuh.
// Nilai `value` ini disimpan APA ADANYA ke document.scenes[id].backgroundColor
// (lihat editor.updateScene di bawah) dan dipakai langsung sebagai
// style.backgroundColor oleh renderSceneWrapper() di serializer.js — string
// `var(--scene-bg-rose)` valid dipakai di situ persis seperti string hex.
// Warna Kustom (input type=color, di bawah BG_PRESETS ini) TETAP disimpan
// sebagai hex literal seperti sebelumnya, karena itu pilihan RGB eksplisit
// pengguna sendiri yang memang tidak seharusnya ikut berubah-ubah oleh tema.
const BG_PRESETS = [
  { hex: null, label: "Tanpa warna" },
  { hex: "var(--scene-bg-rose)", label: "Rose" },
  { hex: "var(--scene-bg-peach)", label: "Peach" },
  { hex: "var(--scene-bg-amber)", label: "Amber" },
  { hex: "var(--scene-bg-lime)", label: "Lime" },
  { hex: "var(--scene-bg-mint)", label: "Mint" },
  { hex: "var(--scene-bg-aqua)", label: "Aqua" },
  { hex: "var(--scene-bg-sky)", label: "Sky" },
  { hex: "var(--scene-bg-periwinkle)", label: "Periwinkle" },
  { hex: "var(--scene-bg-lavender)", label: "Lavender" },
  { hex: "var(--scene-bg-grape)", label: "Grape" },
  { hex: "var(--scene-bg-gray)", label: "Abu-abu" },
];

const PADDING_LABELS = { none: "Tanpa", sm: "Kecil", md: "Sedang", lg: "Besar", xl: "Ekstra" };
const PADDING_ORDER = ["none", "sm", "md", "lg", "xl"];

const EDGE_LABELS = {
  straight: "Lurus",
  wave: "Ombak",
  torn: "Robekan",
  stamp: "Perangko",
  zigzag: "Zigzag",
  cloud: "Awan",
  brush: "Kuas",
};

/* -------------------------------------------------------------------- */
/* Pemilihan Scene (outline + chip "Customize")                          */
/* -------------------------------------------------------------------- */

let currentSelectedSceneId = null;
let currentSelectionUI = null; // { wrapperEl, chipEl }
let sheetOpenForSceneId = null;

function clearSceneSelection() {
  if (currentSelectionUI) {
    if (currentSelectionUI.chipEl && currentSelectionUI.chipEl.parentNode) {
      currentSelectionUI.chipEl.remove();
    }
  }
  currentSelectionUI = null;
  currentSelectedSceneId = null;
}

function buildCustomizeChip(editor, state, sceneId) {
  const chip = createEl("button", {
    className: "editor-scene__customize-chip",
    attrs: { type: "button", "aria-label": "Kustomisasi Scene" },
    html:
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg><span>Scene</span>',
  });
  // Jangan sampai mousedown pada chip membuang seleksi teks/Scene yang
  // sedang berjalan sebelum handler click sempat jalan.
  chip.addEventListener("mousedown", (e) => e.preventDefault());
  chip.addEventListener("click", (e) => {
    e.stopPropagation();
    if (editor.bodyEl.getAttribute("contenteditable") === "false") return; // mode Read Only
    openSceneSheet({ editor, state, sceneId });
  });
  return chip;
}

/** Pastikan chip terpasang pada elemen Scene yang BENAR di DOM saat ini —
 * dipanggil ulang tiap kali state berubah (state.onChange), karena
 * editor.renderAll() (dipicu banyak command, termasuk command Scene
 * sendiri) membuang & membangun ulang seluruh DOM, jadi elemen lama yang
 * tadinya diberi chip sudah tidak ada lagi. */
function ensureSelectionUI(editor, state) {
  if (!currentSelectedSceneId) return;
  const wrapperEl = qs(`.editor-scene[data-scene-id="${currentSelectedSceneId}"]`, editor.bodyEl);
  if (!wrapperEl) {
    currentSelectionUI = null;
    currentSelectedSceneId = null;
    return;
  }
  if (currentSelectionUI && currentSelectionUI.wrapperEl === wrapperEl) return; // sudah terpasang, tidak perlu apa-apa
  const chip = buildCustomizeChip(editor, state, currentSelectedSceneId);
  wrapperEl.appendChild(chip);
  currentSelectionUI = { wrapperEl, chipEl: chip };
}

function selectSceneId(editor, state, sceneId) {
  if (currentSelectedSceneId !== sceneId) {
    clearSceneSelection();
    currentSelectedSceneId = sceneId;
  }
  ensureSelectionUI(editor, state);
}

/** Cek posisi kursor/karet saat ini (window.getSelection()) — kalau ada DI
 * DALAM sebuah `.editor-scene` di dalam bodyEl, Scene tsb dipilih (chip
 * muncul); kalau tidak, pilihan Scene yang aktif (jika ada) dibatalkan. */
function syncSelectionFromCaret(editor, state) {
  const sel = window.getSelection();
  const anchorNode = sel && sel.anchorNode;
  if (!anchorNode || !editor.bodyEl.contains(anchorNode)) return;
  const anchorEl = anchorNode.nodeType === Node.ELEMENT_NODE ? anchorNode : anchorNode.parentElement;
  const wrapperEl = anchorEl ? anchorEl.closest(".editor-scene") : null;
  if (wrapperEl) {
    selectSceneId(editor, state, wrapperEl.dataset.sceneId);
  } else if (currentSelectedSceneId) {
    clearSceneSelection();
  }
}

/** Chip "Scene" muncul otomatis begitu fokus/karet user masuk ke dalam
 * sebuah Scene — baik lewat klik maupun berpindah pakai panah keyboard —
 * dipantau lewat "selectionchange" dokumen + mouseup/keyup pada bodyEl
 * (pola yang sama dipakai toolbar-state-sync.js untuk sinkronisasi status
 * toolbar format teks). */
function initSelectOnFocus(editor, state) {
  document.addEventListener("selectionchange", () => {
    if (
      document.activeElement === editor.bodyEl ||
      editor.bodyEl.contains(document.activeElement) ||
      editor.bodyEl.contains(window.getSelection()?.anchorNode)
    ) {
      syncSelectionFromCaret(editor, state);
    }
  });
  editor.bodyEl.addEventListener("mouseup", () => syncSelectionFromCaret(editor, state));
  editor.bodyEl.addEventListener("keyup", () => syncSelectionFromCaret(editor, state));
}

/** Klik di luar Scene yang sedang aktif (atau Escape) membatalkan pilihan
 * — kecuali klik itu ada di dalam bottom sheet kustomisasi yang lagi
 * terbuka (perlu tetap bisa menyentuh kontrolnya tanpa Scene "kebuang"
 * duluan sebelum handler tombol sempat jalan). */
function initDeselectOnOutsideClick() {
  document.addEventListener("mousedown", (e) => {
    if (!currentSelectedSceneId) return;
    if (e.target.closest(`.editor-scene[data-scene-id="${currentSelectedSceneId}"]`)) return;
    if (e.target.closest(".scene-sheet-overlay")) return;
    clearSceneSelection();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && currentSelectedSceneId) clearSceneSelection();
  });
}

/* -------------------------------------------------------------------- */
/* Preview bentuk tepi (dipakai tombol preset Edge Style di sheet)       */
/* -------------------------------------------------------------------- */

function buildEdgePreview(style) {
  const wrap = createEl("div", { className: "scene-sheet__edge-preview" });
  if (style !== "straight") {
    const top = createEl("div", { className: "scene-sheet__edge-preview-bar scene-sheet__edge-preview-bar--top" });
    top.style.clipPath = buildEdgeClipPath(style, "top", 10);
    top.style.webkitClipPath = top.style.clipPath;
    wrap.appendChild(top);
  }
  wrap.appendChild(createEl("div", { className: "scene-sheet__edge-preview-body" }));
  if (style !== "straight") {
    const bottom = createEl("div", { className: "scene-sheet__edge-preview-bar scene-sheet__edge-preview-bar--bottom" });
    bottom.style.clipPath = buildEdgeClipPath(style, "bottom", 10);
    bottom.style.webkitClipPath = bottom.style.clipPath;
    wrap.appendChild(bottom);
  }
  return wrap;
}

/* -------------------------------------------------------------------- */
/* Bottom sheet "Customize Scene"                                        */
/* -------------------------------------------------------------------- */

let closeCurrentSheet = null;
function closeAnyOpenSheet() {
  if (closeCurrentSheet) {
    closeCurrentSheet();
    closeCurrentSheet = null;
  }
}

/**
 * @param {object} opts
 * @param {object} opts.editor - instance dari createEditor() (editor.js)
 * @param {object} opts.state - editor state (editor-state.js)
 * @param {string} opts.sceneId
 */
function openSceneSheet({ editor, state, sceneId }) {
  closeAnyOpenSheet();
  const meta = state.getScene(sceneId);
  if (!meta) return; // Scene sudah tidak ada (mis. dihapus lewat undo di tempat lain)

  sheetOpenForSceneId = sceneId;
  const settings = { ...DEFAULT_SCENE_META, ...meta };

  const overlay = createEl("div", { className: "scene-sheet-overlay image-sheet-overlay" });
  const sheet = createEl("div", { className: "scene-sheet image-sheet" });
  overlay.appendChild(sheet);

  sheet.appendChild(createEl("div", { className: "image-sheet__title", text: "Scene" }));

  /* ---- Background Color ---- */
  const bgSection = createEl("div", { className: "image-sheet__section" });
  bgSection.appendChild(createEl("div", { className: "image-sheet__label", text: "Background Color" }));
  const bgGrid = createEl("div", { className: "scene-sheet__color-strip" });
  const bgSwatches = {};
  function markActiveSwatch(hex) {
    for (const key in bgSwatches) bgSwatches[key].classList.toggle("is-active", key === (hex || "none"));
  }
  for (const preset of BG_PRESETS) {
    const key = preset.hex || "none";
    const swatch = createEl("button", {
      className: "scene-sheet__swatch" + (preset.hex ? "" : " scene-sheet__swatch--none"),
      attrs: { type: "button", title: preset.label, "aria-label": preset.label },
    });
    if (preset.hex) swatch.style.backgroundColor = preset.hex;
    swatch.addEventListener("click", () => {
      settings.backgroundColor = preset.hex;
      markActiveSwatch(preset.hex);
      editor.updateScene(sceneId, { backgroundColor: preset.hex });
    });
    bgSwatches[key] = swatch;
    bgGrid.appendChild(swatch);
  }
  const customWrap = createEl("label", { className: "scene-sheet__custom-color" });
  // Warna kustom cuma dianggap "aktif" kalau backgroundColor tersimpan
  // BUKAN salah satu referensi var(--scene-bg-*) di atas (mis. hex literal
  // dari input warna native ini sendiri) — dipakai juga sebagai nilai awal
  // <input type="color"> (yang tidak menerima var() sebagai value).
  const isCustomActive = !!settings.backgroundColor && !/^var\(/.test(settings.backgroundColor);
  const customInput = createEl("input", {
    attrs: { type: "color", value: isCustomActive ? settings.backgroundColor : "#F0E9FB" },
  });
  customInput.addEventListener("input", () => {
    settings.backgroundColor = customInput.value;
    markActiveSwatch(customInput.value);
    editor.updateScene(sceneId, { backgroundColor: customInput.value });
  });
  customWrap.appendChild(customInput);
  customWrap.appendChild(createEl("span", { text: "Kustom" }));
  bgGrid.appendChild(customWrap);
  markActiveSwatch(settings.backgroundColor);
  bgSection.appendChild(bgGrid);
  sheet.appendChild(bgSection);

  /* ---- Padding ---- */
  const paddingSection = createEl("div", { className: "image-sheet__section" });
  paddingSection.appendChild(createEl("div", { className: "image-sheet__label", text: "Padding" }));
  const paddingGroup = createEl("div", { className: "scene-sheet__preset-group" });
  const paddingButtons = {};
  for (const key of PADDING_ORDER) {
    const btn = createEl("button", {
      className: "scene-sheet__preset-btn" + (key === settings.padding ? " is-active" : ""),
      attrs: { type: "button" },
      text: PADDING_LABELS[key],
    });
    btn.addEventListener("click", () => {
      settings.padding = key;
      for (const k in paddingButtons) paddingButtons[k].classList.toggle("is-active", k === key);
      editor.updateScene(sceneId, { padding: key });
    });
    paddingButtons[key] = btn;
    paddingGroup.appendChild(btn);
  }
  paddingSection.appendChild(paddingGroup);
  sheet.appendChild(paddingSection);

  /* ---- Edge Style ---- */
  const edgeSection = createEl("div", { className: "image-sheet__section" });
  edgeSection.appendChild(createEl("div", { className: "image-sheet__label", text: "Edge Style" }));
  const edgeGrid = createEl("div", { className: "scene-sheet__edge-grid" });
  const edgeButtons = {};
  for (const style of SCENE_EDGE_STYLES) {
    const btn = createEl("button", {
      className: "scene-sheet__edge-btn" + (style === settings.edgeStyle ? " is-active" : ""),
      attrs: { type: "button" },
    });
    btn.appendChild(buildEdgePreview(style));
    btn.appendChild(createEl("span", { text: EDGE_LABELS[style] || style }));
    btn.addEventListener("click", () => {
      settings.edgeStyle = style;
      for (const k in edgeButtons) edgeButtons[k].classList.toggle("is-active", k === style);
      editor.updateScene(sceneId, { edgeStyle: style });
    });
    edgeButtons[style] = btn;
    edgeGrid.appendChild(btn);
  }
  edgeSection.appendChild(edgeGrid);
  sheet.appendChild(edgeSection);

  /* ---- Duplicate / Delete ---- */
  const actionsSection = createEl("div", { className: "image-sheet__section scene-sheet__actions" });
  const duplicateBtn = createEl("button", {
    className: "scene-sheet__action-btn",
    attrs: { type: "button" },
    html:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Duplicate Scene</span>',
  });
  duplicateBtn.addEventListener("click", () => {
    const result = editor.runCommand(duplicateScene, sceneId);
    if (result && result.sceneId) {
      selectSceneId(editor, state, result.sceneId);
      openSceneSheet({ editor, state, sceneId: result.sceneId });
    }
  });
  actionsSection.appendChild(duplicateBtn);

  let deleteArmed = false;
  let deleteArmTimer = null;
  const deleteBtn = createEl("button", {
    className: "scene-sheet__action-btn scene-sheet__action-btn--danger",
    attrs: { type: "button" },
  });
  function renderDeleteLabel() {
    deleteBtn.innerHTML = deleteArmed
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg><span>Ketuk lagi untuk hapus</span>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg><span>Delete Scene</span>';
  }
  renderDeleteLabel();
  deleteBtn.addEventListener("click", () => {
    if (!deleteArmed) {
      deleteArmed = true;
      renderDeleteLabel();
      deleteBtn.classList.add("is-armed");
      deleteArmTimer = setTimeout(() => {
        deleteArmed = false;
        deleteBtn.classList.remove("is-armed");
        renderDeleteLabel();
      }, 3000);
      return;
    }
    clearTimeout(deleteArmTimer);
    clearSceneSelection();
    editor.runCommand(deleteScene, sceneId);
    close();
  });
  actionsSection.appendChild(deleteBtn);
  sheet.appendChild(actionsSection);

  /* ---- Tutup ---- */
  const doneBtn = createEl("button", {
    className: "image-sheet__btn image-sheet__btn--primary scene-sheet__done-btn",
    attrs: { type: "button" },
    text: "Selesai",
  });
  doneBtn.addEventListener("click", () => close());
  sheet.appendChild(doneBtn);

  // ---- Kunci area catatan supaya keyboard TIDAK bisa muncul lagi ----
  // Sama persis dengan toolbar/image-sheet.js: pointer-events: none di
  // .note-content mencegah tap di judul/isi catatan memicu fokus (=>
  // keyboard) selama sheet terbuka, TANPA mematikan scroll (yang ditangani
  // .note-scroll-area, parent-nya, bukan elemen ini).
  const noteContentEl = qs(".note-content");
  function preventEditorFocus(e) {
    if (noteContentEl && noteContentEl.contains(e.target) && e.target !== noteContentEl) {
      e.target.blur();
    }
  }
  function lockNoteContent() {
    if (noteContentEl) noteContentEl.classList.add("note-content--sheet-locked");
    document.addEventListener("focusin", preventEditorFocus);
  }
  function unlockNoteContent() {
    if (noteContentEl) noteContentEl.classList.remove("note-content--sheet-locked");
    document.removeEventListener("focusin", preventEditorFocus);
  }

  // ---- Ruang scroll cadangan setinggi sheet ----
  // Supaya block paling bawah di catatan (mis. Scene ini sendiri, kalau dia
  // berada di ujung dokumen) tidak ketutup sheet, set custom property
  // --scene-sheet-space (dibaca .note-scroll-area di layout.css) persis
  // setinggi sheet yang benar-benar ter-render — sama pola dengan
  // --image-sheet-space di image-sheet.js, cuma beda nama var supaya kedua
  // sheet tidak saling menimpa kalau (secara teori) sempat tumpang tindih.
  const root = document.documentElement;
  let sheetResizeObserver = null;
  function setReservedSpace(px) {
    root.style.setProperty("--scene-sheet-space", `${Math.max(0, Math.round(px))}px`);
  }
  function startReservingSpace() {
    setReservedSpace(sheet.getBoundingClientRect().height);
    if (window.ResizeObserver) {
      sheetResizeObserver = new ResizeObserver(() => setReservedSpace(sheet.getBoundingClientRect().height));
      sheetResizeObserver.observe(sheet);
    }
  }
  function stopReservingSpace() {
    if (sheetResizeObserver) {
      sheetResizeObserver.disconnect();
      sheetResizeObserver = null;
    }
    setReservedSpace(0);
  }

  function close() {
    clearTimeout(deleteArmTimer);
    overlay.classList.remove("is-open");
    sheetOpenForSceneId = null;
    stopReservingSpace();
    unlockNoteContent();
    setTimeout(() => overlay.remove(), 200);
  }

  if (document.activeElement && typeof document.activeElement.blur === "function") {
    document.activeElement.blur();
  }
  // Kunci area catatan SEKARANG JUGA (bukan nanti) supaya tap apa pun di
  // judul/isi catatan selama sheet terbuka tidak sempat memicu keyboard
  // muncul lagi sama sekali.
  lockNoteContent();

  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.classList.add("is-open");
    // Tunggu transisi buka selesai sebelum mengukur tinggi sheet & geser
    // Scene yang sedang dikustomisasi ke atas area sheet, supaya
    // pengukurannya memakai layout final (bukan di tengah animasi).
    setTimeout(() => {
      startReservingSpace();
      const wrapperEl = qs(`.editor-scene[data-scene-id="${sceneId}"]`, editor.bodyEl);
      if (wrapperEl) wrapperEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 200);
  });

  closeCurrentSheet = close;
}

/* -------------------------------------------------------------------- */
/* Entry point                                                           */
/* -------------------------------------------------------------------- */

/**
 * Pasang tombol "Sisipkan Scene" di floating toolbar, sekaligus seluruh
 * interaksi pemilihan/kustomisasi Scene yang sudah ada di dokumen.
 */
export function initSceneFeature(button, editor, state) {
  initSelectOnFocus(editor, state);
  initDeselectOnOutsideClick();

  if (typeof state.onChange === "function") {
    state.onChange(() => {
      ensureSelectionUI(editor, state);
      // Kalau Scene yang sheet-nya lagi terbuka ternyata baru saja hilang
      // (mis. dihapus lewat undo dari tempat lain), tutup sheet-nya juga.
      if (sheetOpenForSceneId && !state.getScene(sheetOpenForSceneId)) {
        closeAnyOpenSheet();
      }
    });
  }

  if (!button) return;
  button.addEventListener("click", () => {
    const result = editor.runCommand(insertScene);
    if (!result || !result.sceneId) return;
    selectSceneId(editor, state, result.sceneId);
    openSceneSheet({ editor, state, sceneId: result.sceneId });
  });
}
