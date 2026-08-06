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
 *      interaksinya SEKARANG disamakan PERSIS dengan bottom sheet gambar
 *      (image-sheet.js): overlay + panel yang naik dari bawah, judul di
 *      atas, tiap pengaturan sebagai section berlabel, dan di bagian
 *      bawah cuma ada dua tombol "Batal"/"Terapkan" (lihat
 *      image-sheet__actions di image-sheet.css, dipakai bareng di sini).
 *
 * SAMA PERSIS pola image-sheet.js: kontrol di sheet ini (warna latar,
 * padding, bentuk tepi) HANYA memanipulasi elemen DOM Scene secara
 * LANGSUNG untuk pratinjau (lihat applyScenePreview() di bawah) selama
 * sheet masih terbuka — model dokumen baru benar-benar dimutasi (lewat
 * editor.updateScene(), SATU kali, jadi satu langkah undo) begitu tombol
 * "Terapkan" ditekan.
 *   - Tombol "Batal" membuang pratinjau: di mode "insert" (baru saja
 *     disisipkan lewat tombol toolbar), Scene-nya dihapus total dari
 *     model (commands.js deleteScene) — jadi Scene tidak jadi disisipkan
 *     sama sekali; di mode "edit" (dibuka lewat chip "Scene" pada Scene
 *     yang sudah ada), editor cukup di-render ulang dari model yang
 *     tidak berubah (editor.renderAll()) untuk membuang pratinjau di DOM.
 *
 * Tombol "Duplicate Scene"/"Delete Scene" HANYA muncul di mode "edit"
 * (dibuka lewat chip pada Scene yang sudah ada) — di mode "insert" (baru
 * saja disisipkan, belum tentu jadi dipakai user) sheet sengaja dibikin
 * ramping cuma Background/Padding/Edge Style + Batal/Terapkan, konsisten
 * dengan bottom sheet gambar mode "insert" di image-sheet.js.
 */

import { createEl, qs } from "../utils/dom.js";
import { insertScene, deleteScene } from "../editor/commands.js";
import { SCENE_EDGE_STYLES, SCENE_PADDING_PRESETS, DEFAULT_SCENE_META } from "../editor/block-model.js";
import { buildEdgeClipPath, SCENE_EDGE_HEIGHT } from "../editor/scene-edges.js";
import { registerActiveSheet, closeActiveSheet, clearActiveSheet } from "./active-sheet.js";

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
// Preset "Tanpa warna" (transparan) SUDAH DIHAPUS — Scene sekarang SELALU
// berwarna sejak disisipkan (lihat DEFAULT_SCENE_META di block-model.js),
// jadi tidak ada lagi opsi buat balik ke transparan dari sheet ini.
const BG_PRESETS = [
  { hex: "var(--scene-bg-rose)", label: "Rose" },
  { hex: "var(--scene-bg-cherry)", label: "Cherry" },
  { hex: "var(--scene-bg-coral)", label: "Coral" },
  { hex: "var(--scene-bg-peach)", label: "Peach" },
  { hex: "var(--scene-bg-amber)", label: "Amber" },
  { hex: "var(--scene-bg-gold)", label: "Gold" },
  { hex: "var(--scene-bg-lime)", label: "Lime" },
  { hex: "var(--scene-bg-olive)", label: "Olive" },
  { hex: "var(--scene-bg-mint)", label: "Mint" },
  { hex: "var(--scene-bg-teal)", label: "Teal" },
  { hex: "var(--scene-bg-aqua)", label: "Aqua" },
  { hex: "var(--scene-bg-sky)", label: "Sky" },
  { hex: "var(--scene-bg-indigo)", label: "Indigo" },
  { hex: "var(--scene-bg-periwinkle)", label: "Periwinkle" },
  { hex: "var(--scene-bg-lavender)", label: "Lavender" },
  { hex: "var(--scene-bg-plum)", label: "Plum" },
  { hex: "var(--scene-bg-grape)", label: "Grape" },
  { hex: "var(--scene-bg-slate)", label: "Slate" },
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
    openSceneSheet({ editor, state, sceneId, mode: "edit" });
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
/* Pratinjau Scene di DOM (tanpa menyentuh model)                        */
/* -------------------------------------------------------------------- */

/** Terapkan pengaturan pratinjau (backgroundColor/padding/edgeStyle)
 * LANGSUNG ke elemen `.editor-scene` di DOM, TANPA menyentuh model — sama
 * semangatnya dengan applyPreviewToBlockEl() di image-sheet.js. Meniru
 * ulang logika serializer.js renderSceneWrapper(), tapi mengedit elemen
 * yang sudah ada di tempat (bar tepi atas/bawah dibongkar-pasang ulang
 * sesuai kebutuhan) alih-alih membangun ulang seluruh wrapper — supaya
 * `.editor-scene__body` (yang memuat block-block isi Scene) tidak pernah
 * ikut terbuang selama pratinjau berlangsung. */
function applyScenePreview(wrapperEl, settings) {
  if (!wrapperEl) return;
  const m = { ...DEFAULT_SCENE_META, ...settings };
  wrapperEl.dataset.edgeStyle = m.edgeStyle || "straight";
  const paddingPx = SCENE_PADDING_PRESETS[m.padding] ?? SCENE_PADDING_PRESETS.md;
  wrapperEl.style.setProperty("--scene-padding", `${paddingPx}px`);

  const hasEdge = m.edgeStyle && m.edgeStyle !== "straight";
  wrapperEl.style.backgroundColor = hasEdge ? "transparent" : (m.backgroundColor || "transparent");

  // Bar tepi lama (kalau ada) dibuang dulu, dibangun ulang dari nol kalau
  // masih perlu — lebih sederhana & aman daripada mencoba menimpa
  // clip-path/posisi bar lama satu-satu.
  const oldTop = qs(".editor-scene__edge--top", wrapperEl);
  if (oldTop) oldTop.remove();
  const oldBottom = qs(".editor-scene__edge--bottom", wrapperEl);
  if (oldBottom) oldBottom.remove();

  const bodyEl = qs(".editor-scene__body", wrapperEl);
  if (bodyEl) bodyEl.style.backgroundColor = hasEdge ? (m.backgroundColor || "transparent") : "";

  if (hasEdge) {
    const topEdge = createEl("div", { className: "editor-scene__edge editor-scene__edge--top" });
    topEdge.style.backgroundColor = m.backgroundColor || "transparent";
    topEdge.style.clipPath = buildEdgeClipPath(m.edgeStyle, "top", SCENE_EDGE_HEIGHT);
    topEdge.style.webkitClipPath = topEdge.style.clipPath;
    // firstChild pada titik ini sudah pasti bodyEl (bar lama sudah dibuang
    // di atas), jadi bar baru selalu jatuh persis sebelum bodyEl.
    wrapperEl.insertBefore(topEdge, wrapperEl.firstChild);

    const bottomEdge = createEl("div", {
      className: "editor-scene__edge editor-scene__edge--bottom",
      attrs: { contenteditable: "false" },
    });
    bottomEdge.style.backgroundColor = m.backgroundColor || "transparent";
    bottomEdge.style.clipPath = buildEdgeClipPath(m.edgeStyle, "bottom", SCENE_EDGE_HEIGHT);
    bottomEdge.style.webkitClipPath = bottomEdge.style.clipPath;
    // appendChild taruh di paling akhir — aman walau chip "Scene" (kalau
    // sedang terpasang) sudah lebih dulu ada sebagai child, karena chip
    // itu position:absolute (lihat scene.css) jadi tidak ikut alur normal
    // tata letak; urutannya di DOM tidak berpengaruh ke tampilannya.
    wrapperEl.appendChild(bottomEdge);
  }
}

/* -------------------------------------------------------------------- */
/* Bottom sheet "Customize Scene"                                        */
/* -------------------------------------------------------------------- */

/**
 * @param {object} opts
 * @param {object} opts.editor - instance dari createEditor() (editor.js)
 * @param {object} opts.state - editor state (editor-state.js)
 * @param {string} opts.sceneId
 * @param {"insert"|"edit"} opts.mode - "insert": Scene baru saja
 *   disisipkan lewat tombol toolbar (Batal -> Scene dihapus total,
 *   tidak jadi disisipkan). "edit": Scene lama dibuka lewat chip
 *   "Scene" (Batal -> pratinjau dibuang, Scene lama tetap seperti semula).
 */
function openSceneSheet({ editor, state, sceneId, mode }) {
  // Batalkan & tutup sheet lain (Gambar/Scene/Musik) yang sedang aktif,
  // kalau ada — lihat active-sheet.js.
  closeActiveSheet();
  const meta = state.getScene(sceneId);
  if (!meta) return; // Scene sudah tidak ada (mis. dihapus lewat undo di tempat lain)

  const wrapperEl = qs(`.editor-scene[data-scene-id="${sceneId}"]`, editor.bodyEl);
  if (!wrapperEl) return;

  // Daftarkan `doCancel` (didefinisikan di bawah, aman dirujuk di sini
  // berkat function hoisting) sebagai sheet aktif SEKARANG (baru setelah
  // dua guard di atas lolos, supaya tidak ada `doCancel` "cacat" yang
  // sempat terdaftar untuk sheet yang ternyata gagal dibuka).
  registerActiveSheet(doCancel);

  sheetOpenForSceneId = sceneId;
  const settings = { ...DEFAULT_SCENE_META, ...meta };

  const overlay = createEl("div", { className: "scene-sheet-overlay image-sheet-overlay" });
  const sheet = createEl("div", { className: "scene-sheet image-sheet" });
  overlay.appendChild(sheet);

  // ---- Judul + tombol Hapus Scene (icon-only, pojok kanan atas) ----
  // Sebelumnya "Delete Scene" adalah tombol besar berlabel di bagian
  // bawah sheet (berdampingan dengan "Duplicate Scene", yang sekarang
  // dihapus total karena sudah tidak kepake). Delete tetap HANYA muncul
  // di mode "edit" (Scene yang sudah ada, dibuka lewat chip) — di mode
  // "insert" tombol "Batal" di bawah sudah setara dengan membatalkan/
  // menghapus Scene yang baru saja disisipkan.
  const titleRow = createEl("div", { className: "image-sheet__title scene-sheet__title-row" });
  titleRow.appendChild(createEl("span", { text: "Scene" }));
  let deleteArmTimer = null;
  if (mode === "edit") {
    let deleteArmed = false;
    const deleteIconBtn = createEl("button", {
      className: "scene-sheet__delete-icon-btn",
      attrs: { type: "button", "aria-label": "Hapus Scene" },
      html:
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    });
    deleteIconBtn.addEventListener("click", () => {
      if (!deleteArmed) {
        deleteArmed = true;
        deleteIconBtn.classList.add("is-armed");
        deleteIconBtn.setAttribute("aria-label", "Ketuk lagi untuk hapus Scene");
        deleteArmTimer = setTimeout(() => {
          deleteArmed = false;
          deleteIconBtn.classList.remove("is-armed");
          deleteIconBtn.setAttribute("aria-label", "Hapus Scene");
        }, 3000);
        return;
      }
      clearTimeout(deleteArmTimer);
      clearSceneSelection();
      editor.runCommand(deleteScene, sceneId);
      close();
    });
    titleRow.appendChild(deleteIconBtn);
  }
  sheet.appendChild(titleRow);

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
      applyScenePreview(wrapperEl, settings);
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
    applyScenePreview(wrapperEl, settings);
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
      applyScenePreview(wrapperEl, settings);
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
      applyScenePreview(wrapperEl, settings);
    });
    edgeButtons[style] = btn;
    edgeGrid.appendChild(btn);
  }
  edgeSection.appendChild(edgeGrid);
  sheet.appendChild(edgeSection);

  /* ---- Aksi: Batal / Terapkan (persis pola image-sheet.js) ---- */
  const actions = createEl("div", { className: "image-sheet__actions" });
  const cancelBtn = createEl("button", {
    className: "image-sheet__btn image-sheet__btn--ghost",
    attrs: { type: "button" },
    text: "Batal",
  });
  const applyBtn = createEl("button", {
    className: "image-sheet__btn image-sheet__btn--primary",
    attrs: { type: "button" },
    text: "Terapkan",
  });
  actions.appendChild(cancelBtn);
  actions.appendChild(applyBtn);
  sheet.appendChild(actions);

  function doCancel() {
    if (mode === "insert") {
      // Scene ini baru saja disisipkan lewat tombol toolbar — Batal berarti
      // batal sisip sama sekali, bukan cuma buang pratinjau tampilannya.
      clearSceneSelection();
      editor.runCommand(deleteScene, sceneId);
    } else {
      // Scene lama: buang pratinjau DOM, balik ke nilai model semula.
      editor.renderAll();
      // BUG FIX (sama seperti catatan doCancel() di image-sheet.js):
      // renderAll() di sini dipanggil LANGSUNG (bukan lewat runCommand),
      // jadi tidak otomatis memicu state.emitChange() — tanpa ini, chip
      // "Scene" yang tadinya nempel di elemen lama (sudah dibongkar total
      // oleh renderAll()) tidak akan pernah dipasang ulang ke elemen baru.
      if (state.emitChange) state.emitChange({ type: "scene-cancel" });
    }
    close();
  }

  function doApply() {
    editor.updateScene(sceneId, {
      backgroundColor: settings.backgroundColor,
      padding: settings.padding,
      edgeStyle: settings.edgeStyle,
    });
    close();
  }

  cancelBtn.addEventListener("click", doCancel);
  applyBtn.addEventListener("click", doApply);

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
    clearActiveSheet(doCancel);
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
      wrapperEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 200);
  });

  // registerActiveSheet(doCancel) sudah dipanggil di awal fungsi ini —
  // tidak ada lagi yang perlu didaftarkan ulang di sini.
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
      // (mis. dihapus lewat undo dari tempat lain), tutup sheet-nya juga
      // (lewat coordinator global yang sama — sheet Scene ini pasti sheet
      // yang aktif kalau sheetOpenForSceneId masih terisi, lihat
      // active-sheet.js).
      if (sheetOpenForSceneId && !state.getScene(sheetOpenForSceneId)) {
        closeActiveSheet();
      }
    });
  }

  if (!button) return;
  button.addEventListener("click", () => {
    const result = editor.runCommand(insertScene);
    if (!result || !result.sceneId) return;
    selectSceneId(editor, state, result.sceneId);
    openSceneSheet({ editor, state, sceneId: result.sceneId, mode: "insert" });
  });
}
