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
import { t } from "../i18n/i18n.js";

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
  { hex: "var(--scene-bg-gray)", labelKey: "scene.color.gray", label: "Gray" },
];

const PADDING_KEYS = { none: "scene.pad.none", sm: "scene.pad.sm", md: "scene.pad.md", lg: "scene.pad.lg", xl: "scene.pad.xl" };
const PADDING_ORDER = ["none", "sm", "md", "lg", "xl"];

const EDGE_KEYS = {
  straight: "scene.edge.straight",
  wave: "scene.edge.wave",
  "double-wave": "scene.edge.double-wave",
  ripple: "scene.edge.ripple",
  torn: "scene.edge.torn",
  deckle: "scene.edge.deckle",
  stamp: "scene.edge.stamp",
  "stamp-fine": "scene.edge.stamp-fine",
  scallop: "scene.edge.scallop",
  cloud: "scene.edge.cloud",
  zigzag: "scene.edge.zigzag",
  pinked: "scene.edge.pinked",
  steps: "scene.edge.steps",
  brush: "scene.edge.brush",
  notch: "scene.edge.notch",
  arc: "scene.edge.arc",
  peaks: "scene.edge.peaks",
  saw: "scene.edge.saw",
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
    attrs: { type: "button", "aria-label": t("scene.customize") },
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
  // Batalkan & tutup sheet lain (Gambar/Scene/Musik) yang sedang aktif.
  closeActiveSheet();
  const meta = state.getScene(sceneId);
  if (!meta) return;

  const wrapperEl = qs(`.editor-scene[data-scene-id="${sceneId}"]`, editor.bodyEl);
  if (!wrapperEl) return;

  registerActiveSheet(doCancel);

  sheetOpenForSceneId = sceneId;
  const settings = { ...DEFAULT_SCENE_META, ...meta };

  const ICON = {
    // Samakan dengan icon back di crop sheet (image-sheet.js)
    back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
    color: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 0 18h1.5a2.5 2.5 0 0 0 1.768-4.268 1.5 1.5 0 0 1 1.06-2.56H18a3 3 0 0 0 3-3 9.02 9.02 0 0 0-9-8z"/><circle cx="7.5" cy="10.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="10.5" cy="7" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="7.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="17" cy="11.5" r="1.2" fill="currentColor" stroke="none"/></svg>',
    edge: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6c2 2 3-2 5 0s3-2 5 0 3-2 5 0 3-2 5 0v12c-2-2-3 2-5 0s-3 2-5 0-3 2-5 0-3 2-5 0V6z"/></svg>',
    delete: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    // Eyedropper / palette picker untuk custom color di rail
    eyedropper:
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l-3-3z"/></svg>',
    // Square plus: tambah warna custom ke grid
    plusSquare:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>',
    // Icon opacity / transparency
    opacity:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18" fill="currentColor" stroke="none" opacity="0.35"/></svg>',
  };

  const overlay = createEl("div", { className: "scene-sheet-overlay image-sheet-overlay" });
  const sheet = createEl("div", { className: "scene-sheet image-sheet image-sheet--compact" });
  overlay.appendChild(sheet);

  // Panels
  const panelMain = createEl("div", { className: "image-sheet__panel image-sheet__panel--main is-active scene-sheet__panel-main" });
  const panelColor = createEl("div", { className: "image-sheet__panel image-sheet__panel--sub scene-sheet__panel-color" });
  const panelEdge = createEl("div", { className: "image-sheet__panel image-sheet__panel--sub scene-sheet__panel-edge" });
  sheet.append(panelMain, panelColor, panelEdge);

  function showPanel(name) {
    panelMain.classList.toggle("is-active", name === "main");
    panelColor.classList.toggle("is-active", name === "color");
    panelEdge.classList.toggle("is-active", name === "edge");
  }

  /* ========== MAIN ========== */
  const mainCol = createEl("div", { className: "scene-sheet__main-col" });

  // 5 padding chips — visual inset + label (UX: user paham beda ukurannya)
  const padRow = createEl("div", { className: "scene-sheet__pad-row" });
  const paddingButtons = {};
  for (const key of PADDING_ORDER) {
    const btn = createEl("button", {
      className: "scene-sheet__pad-chip" + (key === settings.padding ? " is-active" : ""),
      attrs: {
        type: "button",
        "aria-label": t("scene.padding", { name: t(PADDING_KEYS[key]) }),
        title: t("scene.padding", { name: t(PADDING_KEYS[key]) }),
      },
    });
    const visual = createEl("span", {
      className: `scene-sheet__pad-visual scene-sheet__pad-visual--${key}`,
    });
    visual.appendChild(createEl("span", { className: "scene-sheet__pad-visual-inner" }));
    const label = createEl("span", {
      className: "scene-sheet__pad-label",
      text: t(PADDING_KEYS[key]),
    });
    btn.append(visual, label);
    btn.addEventListener("click", () => {
      settings.padding = key;
      for (const k in paddingButtons) paddingButtons[k].classList.toggle("is-active", k === key);
      applyScenePreview(wrapperEl, settings);
    });
    paddingButtons[key] = btn;
    padRow.appendChild(btn);
  }
  mainCol.appendChild(padRow);

  // 2 big chips: Color + Edge
  const bigRow = createEl("div", { className: "scene-sheet__big-row" });
  const colorBig = createEl("button", {
    className: "scene-sheet__big-btn",
    attrs: { type: "button" },
    html: `${ICON.color}<span>${t("scene.color")}</span>`,
  });
  colorBig.addEventListener("click", () => showPanel("color"));
  const edgeBig = createEl("button", {
    className: "scene-sheet__big-btn",
    attrs: { type: "button" },
    html: `${ICON.edge}<span>${t("scene.edge")}</span>`,
  });
  edgeBig.addEventListener("click", () => showPanel("edge"));
  bigRow.append(colorBig, edgeBig);
  mainCol.appendChild(bigRow);

  // Actions: Batal / Terapkan + delete (edit)
  const actions = createEl("div", { className: "image-sheet__actions scene-sheet__actions-row" });
  const cancelBtn = createEl("button", {
    className: "image-sheet__btn image-sheet__btn--ghost",
    attrs: { type: "button" },
    text: t("sheet.cancel"),
  });
  const applyBtn = createEl("button", {
    className: "image-sheet__btn image-sheet__btn--primary",
    attrs: { type: "button" },
    text: t("sheet.apply"),
  });
  actions.append(cancelBtn, applyBtn);

  let deleteArmTimer = null;
  let deleteBtn = null;
  if (mode === "edit") {
    let deleteArmed = false;
    deleteBtn = createEl("button", {
      className: "image-sheet__icon-btn image-sheet__icon-btn--danger scene-sheet__delete-btn",
      attrs: { type: "button", "aria-label": t("scene.delete") },
      html: ICON.delete,
    });
    function resetDeleteArm() {
      deleteArmed = false;
      deleteBtn.classList.remove("is-armed");
      deleteBtn.innerHTML = ICON.delete;
      deleteBtn.setAttribute("aria-label", t("scene.delete"));
    }
    deleteBtn.addEventListener("click", () => {
      if (!deleteArmed) {
        deleteArmed = true;
        deleteBtn.classList.add("is-armed");
        deleteBtn.innerHTML = ICON.check;
        deleteBtn.setAttribute("aria-label", t("scene.deleteConfirm"));
        deleteArmTimer = setTimeout(resetDeleteArm, 3000);
        return;
      }
      clearTimeout(deleteArmTimer);
      clearSceneSelection();
      editor.runCommand(deleteScene, sceneId);
      close();
    });
    actions.appendChild(deleteBtn);
  }

  mainCol.appendChild(actions);
  panelMain.appendChild(mainCol);

  /* ========== COLOR PANEL ========== */
  // Custom colors yang ditambahkan user ke grid (persist di session sheet + localStorage)
  // Boleh hex (#RRGGBB) atau rgba(...)
  const CUSTOM_COLORS_KEY = "meimo-scene-custom-colors";
  const CUSTOM_COLOR_RE = /^(#[0-9A-Fa-f]{6}|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\))$/;
  function loadCustomColors() {
    try {
      const raw = localStorage.getItem(CUSTOM_COLORS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr)
        ? arr.filter((c) => typeof c === "string" && CUSTOM_COLOR_RE.test(c.trim()))
        : [];
    } catch {
      return [];
    }
  }
  function saveCustomColors(list) {
    try {
      localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(list.slice(0, 24)));
    } catch {
      /* ignore quota */
    }
  }
  let extraCustomColors = loadCustomColors();

  /** Parse CSS color string → { r, g, b, a } (a 0–1). Gagal → null. */
  function parseCssColor(value) {
    if (!value || typeof value !== "string") return null;
    const v = value.trim();
    if (/^var\(/.test(v)) return null;
    const hex = v.match(/^#([0-9A-Fa-f]{6})$/);
    if (hex) {
      const n = parseInt(hex[1], 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
    }
    const rgb = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
    if (rgb) {
      return {
        r: Math.min(255, +rgb[1]),
        g: Math.min(255, +rgb[2]),
        b: Math.min(255, +rgb[3]),
        a: rgb[4] !== undefined ? Math.max(0, Math.min(1, +rgb[4])) : 1,
      };
    }
    // Fallback: biarkan browser resolve (mis. nama warna), lalu baca computed
    try {
      const probe = document.createElement("div");
      probe.style.cssText = "position:absolute;left:-9999px;width:1px;height:1px;";
      probe.style.backgroundColor = v;
      document.body.appendChild(probe);
      const computed = getComputedStyle(probe).backgroundColor;
      document.body.removeChild(probe);
      const m = computed && computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
      if (!m) return null;
      return {
        r: +m[1],
        g: +m[2],
        b: +m[3],
        a: m[4] !== undefined ? +m[4] : 1,
      };
    } catch {
      return null;
    }
  }

  function toHex({ r, g, b }) {
    const h = (n) => n.toString(16).padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
  }

  /** Format simpan: hex jika a≈1, else rgba() */
  function formatCssColor({ r, g, b, a }) {
    if (a >= 0.995) return toHex({ r, g, b });
    // 2 desimal cukup; hilangkan trailing zero kasar
    const aStr = Math.round(a * 100) / 100;
    return `rgba(${r}, ${g}, ${b}, ${aStr})`;
  }

  function normalizeColorKey(value) {
    const p = parseCssColor(value);
    if (!p) return String(value || "").trim().toUpperCase();
    return formatCssColor(p).toUpperCase();
  }

  // State picker custom (RGB dari input color + alpha dari slider)
  let customRgb = { r: 240, g: 233, b: 251 };
  let customAlpha = 1;
  const parsedInitial = parseCssColor(settings.backgroundColor);
  if (parsedInitial) {
    customRgb = { r: parsedInitial.r, g: parsedInitial.g, b: parsedInitial.b };
    customAlpha = parsedInitial.a;
  }

  const colorRail = createEl("div", { className: "image-sheet__sub-rail" });
  const colorBack = createEl("button", {
    className: "image-sheet__back-btn",
    attrs: { type: "button", "aria-label": t("sheet.back") },
    html: ICON.back,
  });
  colorBack.addEventListener("click", () => showPanel("main"));
  const colorRailIcon = createEl("button", {
    className: "image-sheet__rail-icon-btn is-active",
    attrs: { type: "button", "aria-label": t("scene.color"), tabindex: "-1" },
    html: ICON.color,
  });

  // Tombol pilih warna custom → icon di rail kiri (bukan di grid)
  const isCustomActive = !!settings.backgroundColor && !/^var\(/.test(settings.backgroundColor);
  const customRailBtn = createEl("label", {
    className: "scene-sheet__rail-custom" + (isCustomActive ? " is-active" : ""),
    attrs: { title: t("scene.customColor"), "aria-label": t("scene.customColor") },
  });
  customRailBtn.innerHTML = ICON.eyedropper;
  const customInput = createEl("input", {
    attrs: { type: "color", value: toHex(customRgb) },
  });
  customRailBtn.appendChild(customInput);
  colorRail.append(colorBack, colorRailIcon, customRailBtn);

  const colorBody = createEl("div", {
    className: "image-sheet__sub-body scene-sheet__color-body",
  });

  // Chip opacity — selalu tampil, di atas card color preset
  const opacityChip = createEl("div", { className: "scene-sheet__opacity-chip" });
  const opacityIcon = createEl("span", {
    className: "scene-sheet__opacity-icon",
    html: ICON.opacity,
  });
  const opacitySlider = createEl("input", {
    className: "scene-sheet__opacity-slider",
    attrs: {
      type: "range",
      min: "0",
      max: "100",
      step: "1",
      value: String(Math.round(customAlpha * 100)),
      "aria-label": t("scene.opacity"),
    },
  });
  const opacityValue = createEl("span", {
    className: "scene-sheet__opacity-value",
    text: `${Math.round(customAlpha * 100)}%`,
  });
  opacityChip.append(opacityIcon, opacitySlider, opacityValue);

  const colorCard = createEl("div", { className: "scene-sheet__color-card" });

  // Bar warna (sticky di atas card): full bar diisi warna aktif + kode + square-plus kanan
  const colorBar = createEl("div", { className: "scene-sheet__color-bar" });
  const colorBarCode = createEl("span", { className: "scene-sheet__color-bar-code" });
  const colorBarAdd = createEl("button", {
    className: "scene-sheet__color-bar-add",
    attrs: {
      type: "button",
      "aria-label": t("scene.addColor"),
      title: t("scene.addColor"),
    },
    html: ICON.plusSquare,
  });
  colorBar.append(colorBarCode, colorBarAdd);

  const colorGridWrap = createEl("div", { className: "scene-sheet__color-grid-wrap" });
  const colorGrid = createEl("div", { className: "scene-sheet__color-grid" });
  const bgSwatches = {};

  /** Resolve warna apa pun (hex / rgba / var(...)) ke {r,g,b,a} via computed style. */
  function resolveAnyColor(value) {
    const direct = parseCssColor(value);
    if (direct) return direct;
    if (!value) return null;
    try {
      const probe = document.createElement("div");
      probe.style.cssText = "position:absolute;left:-9999px;width:1px;height:1px;";
      probe.style.backgroundColor = value;
      document.body.appendChild(probe);
      const computed = getComputedStyle(probe).backgroundColor;
      document.body.removeChild(probe);
      const m = computed && computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
      if (!m) return null;
      return {
        r: +m[1],
        g: +m[2],
        b: +m[3],
        a: m[4] !== undefined ? +m[4] : 1,
      };
    } catch {
      return null;
    }
  }

  function syncOpacityUi(alpha) {
    const pct = Math.round(Math.max(0, Math.min(1, alpha)) * 100);
    opacitySlider.value = String(pct);
    opacityValue.textContent = `${pct}%`;
  }

  function resolveColorLabel(value) {
    if (!value) return "—";
    if (/^var\(/.test(value)) {
      const found = BG_PRESETS.find((p) => p.hex === value);
      if (!found) return value;
      return found.labelKey ? t(found.labelKey) : found.label;
    }
    const p = parseCssColor(value);
    if (p) {
      if (p.a < 0.995) {
        const aStr = Math.round(p.a * 100) / 100;
        return `RGBA(${p.r}, ${p.g}, ${p.b}, ${aStr})`;
      }
      return toHex(p);
    }
    return String(value).toUpperCase();
  }

  function isColorInGrid(value) {
    if (!value) return true;
    // Preset var: cocok hanya jika exact key-nya ada di grid
    if (/^var\(/.test(value)) return BG_PRESETS.some((p) => p.hex === value);
    // Hex/rgba: bandingkan RGB+alpha (hue sama tapi opacity beda = warna baru)
    const key = normalizeColorKey(value);
    return (
      BG_PRESETS.some((p) => normalizeColorKey(p.hex) === key) ||
      extraCustomColors.some((c) => normalizeColorKey(c) === key)
    );
  }

  function isLightColor(cssColor) {
    try {
      const p = resolveAnyColor(cssColor);
      if (!p) return false;
      const lum = (0.2126 * p.r + 0.7152 * p.g + 0.0722 * p.b) / 255;
      const effective = lum * p.a + 0.72 * (1 - p.a);
      return effective > 0.62;
    } catch {
      return false;
    }
  }

  function applyCustomColor() {
    const css = formatCssColor({ ...customRgb, a: customAlpha });
    settings.backgroundColor = css;
    markActiveSwatch(css);
    updateColorBar();
    applyScenePreview(wrapperEl, settings);
  }

  function updateColorBar() {
    const val = settings.backgroundColor || "";
    colorBar.style.setProperty("--scene-bar-color", val || "transparent");
    colorBar.classList.toggle("is-light", isLightColor(val));
    colorBarCode.textContent = resolveColorLabel(val);

    const resolved = resolveAnyColor(val);
    if (resolved) {
      customRgb = { r: resolved.r, g: resolved.g, b: resolved.b };
      customAlpha = resolved.a;
      customInput.value = toHex(customRgb);
      syncOpacityUi(customAlpha);
    }

    // Square plus: muncul jika warna (termasuk beda opacity) belum ada di grid
    // Preset var yang exact match dianggap sudah di grid
    const canAdd = !!val && !isColorInGrid(val);
    colorBarAdd.disabled = !canAdd;
    colorBarAdd.style.visibility = canAdd ? "visible" : "hidden";
    customRailBtn.classList.toggle("is-active", !!val && !/^var\(/.test(val));
  }

  function markActiveSwatch(hex) {
    const activeKey = normalizeColorKey(hex || "none");
    for (const key in bgSwatches) {
      const isVarMatch = /^var\(/.test(hex || "") && key === hex;
      const isNormMatch = normalizeColorKey(key) === activeKey;
      bgSwatches[key].classList.toggle("is-active", isVarMatch || isNormMatch);
    }
  }

  function buildSwatch(key, bg, label) {
    const swatch = createEl("button", {
      className: "scene-sheet__swatch",
      attrs: { type: "button", title: label, "aria-label": label },
    });
    if (bg) swatch.style.backgroundColor = bg;
    swatch.addEventListener("click", () => {
      settings.backgroundColor = key;
      // Slider realtime ikut alpha warna yang dipilih (preset rgba / custom)
      const resolved = resolveAnyColor(key);
      if (resolved) {
        customRgb = { r: resolved.r, g: resolved.g, b: resolved.b };
        customAlpha = resolved.a;
        customInput.value = toHex(customRgb);
        syncOpacityUi(customAlpha);
      }
      markActiveSwatch(key);
      updateColorBar();
      applyScenePreview(wrapperEl, settings);
    });
    bgSwatches[key] = swatch;
    return swatch;
  }

  function rebuildColorGrid() {
    colorGrid.innerHTML = "";
    for (const k in bgSwatches) delete bgSwatches[k];
    for (const preset of BG_PRESETS) {
      colorGrid.appendChild(buildSwatch(preset.hex, preset.hex, preset.label));
    }
    for (const col of extraCustomColors) {
      colorGrid.appendChild(buildSwatch(col, col, resolveColorLabel(col)));
    }
    markActiveSwatch(settings.backgroundColor);
  }

  colorBarAdd.addEventListener("click", () => {
    const val = settings.backgroundColor;
    if (!val || isColorInGrid(val)) return;
    // Simpan resolved form (hex atau rgba) supaya opacity ikut tersimpan
    const resolved = resolveAnyColor(val) || parseCssColor(val);
    const normalized = resolved
      ? formatCssColor(resolved)
      : val;
    if (!extraCustomColors.some((c) => normalizeColorKey(c) === normalizeColorKey(normalized))) {
      extraCustomColors = [normalized, ...extraCustomColors].slice(0, 24);
      saveCustomColors(extraCustomColors);
      rebuildColorGrid();
      updateColorBar();
    }
  });

  customInput.addEventListener("input", () => {
    const p = parseCssColor(customInput.value);
    if (!p) return;
    customRgb = { r: p.r, g: p.g, b: p.b };
    // Pertahankan alpha dari slider
    applyCustomColor();
  });

  opacitySlider.addEventListener("input", () => {
    customAlpha = Math.max(0, Math.min(1, (+opacitySlider.value || 0) / 100));
    opacityValue.textContent = `${Math.round(customAlpha * 100)}%`;
    // Pastikan RGB dari warna aktif (termasuk preset var yang di-resolve)
    const resolved = resolveAnyColor(settings.backgroundColor);
    if (resolved) {
      customRgb = { r: resolved.r, g: resolved.g, b: resolved.b };
    }
    applyCustomColor();
  });

  rebuildColorGrid();
  updateColorBar();

  colorGridWrap.appendChild(colorGrid);
  colorCard.append(colorBar, colorGridWrap);
  // Chip opacity di atas card, lebar sama dengan card
  colorBody.append(opacityChip, colorCard);
  panelColor.append(colorRail, colorBody);

  /* ========== EDGE PANEL ========== */
  const edgeRail = createEl("div", { className: "image-sheet__sub-rail" });
  const edgeBack = createEl("button", {
    className: "image-sheet__back-btn",
    attrs: { type: "button", "aria-label": t("sheet.back") },
    html: ICON.back,
  });
  edgeBack.addEventListener("click", () => showPanel("main"));
  const edgeRailIcon = createEl("button", {
    className: "image-sheet__rail-icon-btn is-active",
    attrs: { type: "button", "aria-label": t("scene.edge"), tabindex: "-1" },
    html: ICON.edge,
  });
  edgeRail.append(edgeBack, edgeRailIcon);

  const edgeBody = createEl("div", { className: "image-sheet__sub-body image-sheet__sub-body--crop scene-sheet__edge-body" });
  const edgeGrid = createEl("div", { className: "scene-sheet__edge-grid" });
  const edgeButtons = {};
  for (const style of SCENE_EDGE_STYLES) {
    const btn = createEl("button", {
      className: "scene-sheet__edge-btn" + (style === settings.edgeStyle ? " is-active" : ""),
      attrs: { type: "button", "aria-label": t(EDGE_KEYS[style] || style) },
    });
    btn.appendChild(buildEdgePreview(style));
    btn.addEventListener("click", () => {
      settings.edgeStyle = style;
      for (const k in edgeButtons) edgeButtons[k].classList.toggle("is-active", k === style);
      applyScenePreview(wrapperEl, settings);
    });
    edgeButtons[style] = btn;
    edgeGrid.appendChild(btn);
  }
  edgeBody.appendChild(edgeGrid);
  panelEdge.append(edgeRail, edgeBody);

  /* ---- apply / cancel ---- */
  function doCancel() {
    if (mode === "insert") {
      clearSceneSelection();
      editor.runCommand(deleteScene, sceneId);
    } else {
      editor.renderAll();
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
  lockNoteContent();

  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.classList.add("is-open");
    setTimeout(() => {
      startReservingSpace();
      wrapperEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 200);
  });
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
