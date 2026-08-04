/**
 * toolbar.js
 * Struktur dan perilaku utama floating toolbar: mengikat tombol-tombol yang
 * sudah ada di editor.html ke command yang sesuai, dan menjaga tampilannya
 * tetap sinkron dengan format teks yang sedang dipilih (toolbar-state-sync.js).
 *
 * Fitur di luar daftar ini sengaja dibiarkan dummy — belum ada command
 * yang dipasang untuknya. Quote & Divider sudah aktif, lihat bagian
 * "--- Quote / Divider ---" di bawah. Line Height & Letter Spacing juga
 * sudah aktif, lihat dropdowns/line-height-dropdown.js dan
 * letter-spacing-dropdown.js. Font Family sudah aktif, lihat
 * dropdowns/font-family-dropdown.js & src/js/services/font-service.js.
 * Sisipkan Gambar juga sudah aktif, lihat image-sheet.js. Clear Formatting
 * (Hapus Format) juga sudah aktif, lihat commands.js clearFormatting().
 *
 * Topbar sekarang cuma berisi 9 menu icon-only (back, Undo/Redo, Text,
 * Style, List, Block, Insert, Hapus Format, Read Only) — lihat editor.html.
 * Text/Style/List/Block/Insert adalah menu KELOMPOK: anak-anaknya (Bold,
 * Heading, Font Color, dst.) sudah ada langsung di editor.html di dalam
 * `.toolbar-child-group` masing-masing, dan cuma ditampilkan (di child bar,
 * baris kedua topbar) lewat openChildGroup() — lihat blok "Menu kelompok"
 * di bawah. Init function tiap fitur (initHeadingDropdown dkk.) tidak
 * berubah karena semuanya cari tombolnya lewat ID, bukan posisi DOM.
 */

import { qs, createEl, openPanel, openChildGroup, closeTransientPickers, closeAllPanels } from "../utils/dom.js";
import {
  toggleBold,
  toggleItalic,
  toggleUnderline,
  toggleStrike,
  setAlign,
  toggleListType,
  toggleQuote,
  insertDivider,
  clearFormatting,
} from "../editor/commands.js";
import { initHeadingDropdown } from "./dropdowns/heading-dropdown.js";
import { initFontFamilyDropdown } from "./dropdowns/font-family-dropdown.js";
import { initFontSizeDropdown } from "./dropdowns/font-size-dropdown.js";
import { initLineHeightDropdown } from "./dropdowns/line-height-dropdown.js";
import { initLetterSpacingDropdown } from "./dropdowns/letter-spacing-dropdown.js";
import { initColorPicker } from "./color-picker.js";
import { initHighlightPicker } from "./highlight-picker.js";
import { initLinkPicker } from "./link-picker.js";
import { initImageInsert } from "./image-sheet.js";
import { initSceneFeature } from "./scene-sheet.js";
import { initMusicFeature } from "./music-sheet.js";
import { initToolbarStateSync } from "./toolbar-state-sync.js";
import { isTitleBold } from "../editor/title-style.js";

const ALIGN_OPTIONS = [
  {
    value: "left",
    label: "Rata Kiri",
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="18" y2="18"/></svg>',
  },
  {
    value: "center",
    label: "Rata Tengah",
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="5" y1="18" x2="19" y2="18"/></svg>',
  },
  {
    value: "right",
    label: "Rata Kanan",
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="6" y1="18" x2="20" y2="18"/></svg>',
  },
  {
    value: "justify",
    label: "Rata Kanan-Kiri",
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>',
  },
];

export function initToolbar({ toolbarEl, editor, state }) {
  const buttons = {
    undo: qs("#btnUndo", toolbarEl),
    redo: qs("#btnRedo", toolbarEl),
    readOnly: qs("#btnReadOnly", toolbarEl),
    bold: qs("#btnBold", toolbarEl),
    italic: qs("#btnItalic", toolbarEl),
    underline: qs("#btnUnderline", toolbarEl),
    strike: qs("#btnStrike", toolbarEl),
    heading: qs("#btnHeading", toolbarEl),
    fontFamily: qs("#btnFontFamily", toolbarEl),
    fontSize: qs("#btnFontSize", toolbarEl),
    textColor: qs("#btnTextColor", toolbarEl),
    highlight: qs("#btnHighlight", toolbarEl),
    align: qs("#btnAlign", toolbarEl),
    lineHeight: qs("#btnLineHeight", toolbarEl),
    letterSpacing: qs("#btnLetterSpacing", toolbarEl),
    orderedList: qs("#btnOrderedList", toolbarEl),
    unorderedList: qs("#btnUnorderedList", toolbarEl),
    checklist: qs("#btnChecklist", toolbarEl),
    quote: qs("#btnQuote", toolbarEl),
    divider: qs("#btnDivider", toolbarEl),
    link: qs("#btnLink", toolbarEl),
    insertImage: qs("#btnInsertImage", toolbarEl),
    insertScene: qs("#btnInsertScene", toolbarEl),
    insertMusic: qs("#btnInsertMusic", toolbarEl),
    clearFormat: qs("#btnClearFormat", toolbarEl),
    keepStyleText: qs("#btnKeepStyleText", toolbarEl),
    keepStyleStyle: qs("#btnKeepStyleStyle", toolbarEl),
    groupText: qs("#btnGroupText", toolbarEl),
    groupStyle: qs("#btnGroupStyle", toolbarEl),
    groupList: qs("#btnGroupList", toolbarEl),
    groupBlock: qs("#btnGroupBlock", toolbarEl),
    groupInsert: qs("#btnGroupInsert", toolbarEl),
  };

  // --- Menu kelompok (Text/Style/List/Block/Insert) ---
  // Klik salah satu tombol ini membuka child bar (baris kedua topbar)
  // berisi anak-anaknya masing-masing — lihat openChildGroup() di
  // ../utils/dom.js. Anak-anaknya sendiri (btnBold, btnHeading, dst.)
  // sudah ada langsung di editor.html di dalam masing-masing
  // .toolbar-child-group, jadi tidak perlu dibuat lewat JS di sini.
  const GROUPS = [
    { trigger: buttons.groupText, groupEl: qs("#childGroupText", toolbarEl) },
    { trigger: buttons.groupStyle, groupEl: qs("#childGroupStyle", toolbarEl) },
    { trigger: buttons.groupList, groupEl: qs("#childGroupList", toolbarEl) },
    { trigger: buttons.groupBlock, groupEl: qs("#childGroupBlock", toolbarEl) },
    { trigger: buttons.groupInsert, groupEl: qs("#childGroupInsert", toolbarEl) },
  ];
  for (const { trigger, groupEl } of GROUPS) {
    if (!trigger || !groupEl) continue;
    trigger.addEventListener("click", () => openChildGroup(trigger, groupEl));
  }

  // --- Undo / Redo ---
  buttons.undo.addEventListener("click", () => editor.undo());
  buttons.redo.addEventListener("click", () => editor.redo());

  function syncHistoryButtons() {
    buttons.undo.disabled = !editor.canUndo();
    buttons.redo.disabled = !editor.canRedo();
  }
  syncHistoryButtons();
  if (typeof state.onChange === "function") state.onChange(syncHistoryButtons);

  buttons.bold.addEventListener("click", () => {
    if (document.activeElement === editor.titleEl) {
      const ts = editor.getTitleStyle ? editor.getTitleStyle() : {};
      editor.setTitleStyle({ bold: !isTitleBold(ts) });
      syncTitleFormatting();
    } else {
      editor.runCommand(toggleBold);
    }
  });
  buttons.italic.addEventListener("click", () => editor.runCommand(toggleItalic));
  buttons.underline.addEventListener("click", () => editor.runCommand(toggleUnderline));
  buttons.strike.addEventListener("click", () => editor.runCommand(toggleStrike));

  // --- Hapus Format (reset semua mark run terseleksi ke default) ---
  buttons.clearFormat.addEventListener("click", () => editor.runCommand(clearFormatting));

  // --- Toggle "Set as Current Style" (child bar Text & Style, paling
  // kanan) — SATU state (state.keepStyleOnEnter, editor-state.js) yang
  // dibagi DUA tombol (tampilannya selalu disinkronkan bareng), supaya
  // toggle-nya bisa diakses dari kelompok mana pun yang sedang dibuka.
  // Saat aktif, format yang lagi berlaku (mark karakter + line height/
  // letter spacing) tidak ikut reset saat Enter ditekan — lihat
  // handleEnter() di editor.js. Ini preferensi UI murni: tidak ikut
  // command undo/redo, tidak disimpan ke document.
  const keepStyleButtons = [buttons.keepStyleText, buttons.keepStyleStyle].filter(Boolean);
  function syncKeepStyleButtons() {
    const active = !!(state.getKeepStyleOnEnter && state.getKeepStyleOnEnter());
    for (const btn of keepStyleButtons) {
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    }
  }
  for (const btn of keepStyleButtons) {
    btn.addEventListener("click", () => {
      const next = !(state.getKeepStyleOnEnter && state.getKeepStyleOnEnter());
      if (state.setKeepStyleOnEnter) state.setKeepStyleOnEnter(next);
      syncKeepStyleButtons();
    });
  }
  syncKeepStyleButtons();

  // --- List (bulleted / numbered / checklist) ---
  buttons.unorderedList.addEventListener("click", () => editor.runCommand(toggleListType, "bulleted-list-item"));
  buttons.orderedList.addEventListener("click", () => editor.runCommand(toggleListType, "numbered-list-item"));
  buttons.checklist.addEventListener("click", () => editor.runCommand(toggleListType, "checklist-item"));

  // --- Hyperlink ---
  initLinkPicker(buttons.link, editor);

  // --- Quote / Divider ---
  buttons.quote.addEventListener("click", () => editor.runCommand(toggleQuote));
  buttons.divider.addEventListener("click", () => editor.runCommand(insertDivider));

  // --- Sisipkan Gambar (lihat image-sheet.js untuk alur bottom sheet-nya) ---
  initImageInsert(buttons.insertImage, editor, state);

  // --- Scene (lihat scene-sheet.js untuk alur pilih/kustomisasi Scene-nya) ---
  initSceneFeature(buttons.insertScene, editor, state);

  // --- Insert Music (lihat music-sheet.js untuk alur tombol play + bottom sheet-nya) ---
  initMusicFeature(buttons.insertMusic, editor, state);

  const heading = initHeadingDropdown(buttons.heading, editor);
  const fontFamily = initFontFamilyDropdown(buttons.fontFamily, editor);
  const fontSize = initFontSizeDropdown(buttons.fontSize, editor);
  const lineHeight = initLineHeightDropdown(buttons.lineHeight, editor);
  const letterSpacing = initLetterSpacingDropdown(buttons.letterSpacing, editor);
  const colorPicker = initColorPicker(buttons.textColor, editor);
  const highlightPicker = initHighlightPicker(buttons.highlight, editor);

  const alignIconEl = qs(".toolbar-dropdown__align-icon", buttons.align);
  let currentAlign = "left";
  function updateAlignIcon(align) {
    currentAlign = align || "left";
    const opt = ALIGN_OPTIONS.find((o) => o.value === currentAlign) || ALIGN_OPTIONS[0];
    if (alignIconEl) alignIconEl.innerHTML = opt.icon;
  }

  buttons.align.addEventListener("click", () => {
    const panel = createEl("div", { className: "toolbar-panel__list" });
    for (const opt of ALIGN_OPTIONS) {
      const item = createEl("button", {
        className: "toolbar-panel__item toolbar-panel__item--align" + (opt.value === currentAlign ? " is-active" : ""),
        attrs: { type: "button" },
        html: `${opt.icon}<span>${opt.label}</span>`,
      });
      item.addEventListener("click", () => {
        if (document.activeElement === editor.titleEl) {
          editor.setTitleStyle({ align: opt.value });
        } else {
          editor.runCommand(setAlign, opt.value);
        }
        updateAlignIcon(opt.value);
        closeTransientPickers();
      });
      panel.appendChild(item);
    }
    openPanel(buttons.align, panel);
  });

  initToolbarStateSync({
    state,
    bodyEl: editor.bodyEl,
    buttons,
    onFormattingChange: (f) => {
      heading.updateLabel(f.blockType === "heading" ? f.level : 0);
      fontFamily.updateLabel(f.fontFamily);
      fontSize.updateLabel(f.fontSize);
      updateAlignIcon(f.align);
      lineHeight.updateActive(f.lineHeight);
      letterSpacing.updateActive(f.letterSpacing);
      colorPicker.updateActive(f.color);
      highlightPicker.updateActive(f.highlight);

      buttons.unorderedList.classList.toggle("is-active", f.blockType === "bulleted-list-item");
      buttons.unorderedList.setAttribute("aria-pressed", String(f.blockType === "bulleted-list-item"));
      buttons.orderedList.classList.toggle("is-active", f.blockType === "numbered-list-item");
      buttons.orderedList.setAttribute("aria-pressed", String(f.blockType === "numbered-list-item"));
      buttons.checklist.classList.toggle("is-active", f.blockType === "checklist-item");
      buttons.checklist.setAttribute("aria-pressed", String(f.blockType === "checklist-item"));

      buttons.quote.classList.toggle("is-active", f.blockType === "quote");
      buttons.quote.setAttribute("aria-pressed", String(f.blockType === "quote"));

      buttons.link.classList.toggle("is-active", !!f.link);
      buttons.link.setAttribute("aria-pressed", String(!!f.link));
    },
  });

  // --- Mode Judul ---
  // Judul (#editorTitle) cuma punya style level-dokumen (Bold on/off, Font,
  // Font Size, Warna Teks, Perataan, Letter Spacing — lihat title-style.js),
  // BUKAN format per-karakter seperti isi catatan (Heading, Italic, List,
  // Quote, Insert dst.). Saat kursor ada di judul, tombol-tombol yang TIDAK
  // berlaku untuk judul dibuat semi-transparan & tidak bisa diklik (pakai
  // atribut `disabled` bawaan — sudah ada style `.toolbar-btn:disabled`/
  // di toolbar.css, sama seperti yang dipakai mode Read Only di bawah).
  const titleEl = editor.titleEl || document.getElementById("editorTitle");
  const titleIncompatible = new Set([
    buttons.heading,
    buttons.italic,
    buttons.underline,
    buttons.strike,
    buttons.highlight,
    buttons.lineHeight,
    buttons.orderedList,
    buttons.unorderedList,
    buttons.checklist,
    buttons.quote,
    buttons.divider,
    buttons.link,
    buttons.insertImage,
    buttons.insertScene,
    buttons.insertMusic,
    buttons.clearFormat,
    // Grup List/Block/Insert isinya HANYA tombol yang tidak berlaku untuk
    // judul, jadi trigger-nya sendiri ikut dinonaktifkan (bukan cuma
    // anak-anaknya) — mencegah child bar-nya dibuka sama sekali.
    buttons.groupList,
    buttons.groupBlock,
    buttons.groupInsert,
  ]);

  // --- Toggle Read Only ---
  // Kunci isi catatan (judul + body) dari pengeditan: bodyEl/titleEl
  // ditandai contenteditable="false" (mencegah ngetik/klik-kursor), dan
  // SEMUA tombol format lain di toolbar ini (selain Undo/Redo & tombol
  // Read Only itu sendiri) ikut di-disable — soalnya command toolbar
  // (mis. Bold) jalan lewat model, bukan lewat DOM typing, jadi kalau
  // cuma bodyEl yang dikunci tapi tombolnya tetap aktif, isi catatan
  // masih bisa berubah lewat toolbar walau tidak bisa diketik langsung.
  const skipDisable = new Set([buttons.undo, buttons.redo, buttons.readOnly]);
  let isReadOnly = false;
  let isTitleFocused = false;

  /** Hitung ulang status disabled semua tombol berdasarkan gabungan mode
   * Read Only (mengunci semuanya) & mode Judul (mengunci yang tidak
   * berlaku untuk judul saja) — dipanggil tiap kali salah satu berubah. */
  function refreshButtonStates() {
    for (const btn of Object.values(buttons)) {
      if (!btn || skipDisable.has(btn)) continue;
      btn.disabled = isReadOnly || (isTitleFocused && titleIncompatible.has(btn));
    }
    buttons.readOnly.classList.toggle("is-active", isReadOnly);
    buttons.readOnly.setAttribute("aria-pressed", String(isReadOnly));
  }

  /** Tampilkan di label toolbar (Font/Font Size/Align/Letter Spacing) nilai
   * titleStyle yang sedang tersimpan untuk judul, dipanggil begitu judul
   * mendapat fokus (menggantikan sinkronisasi dari isi catatan/bodyEl). */
  function syncTitleFormatting() {
    const ts = editor.getTitleStyle ? editor.getTitleStyle() : {};
    fontFamily.updateLabel(ts.fontFamily);
    fontSize.updateLabel(ts.fontSize, "48");
    updateAlignIcon(ts.align || "left");
    letterSpacing.updateActive(ts.letterSpacing);
    colorPicker.updateActive(ts.color);
    const bold = isTitleBold(ts);
    buttons.bold.classList.toggle("is-active", bold);
    buttons.bold.setAttribute("aria-pressed", String(bold));
  }

  if (titleEl) {
    titleEl.addEventListener("focus", () => {
      isTitleFocused = true;
      // Tutup panel/child bar yang mungkin masih terbuka dari konteks
      // sebelumnya (mis. daftar List) — supaya tidak ada tombol yang baru
      // saja dinonaktifkan tapi masih kelihatan terbuka di child bar.
      closeAllPanels();
      refreshButtonStates();
      syncTitleFormatting();
    });
    titleEl.addEventListener("blur", () => {
      isTitleFocused = false;
      refreshButtonStates();
    });
  }

  function applyReadOnly(active) {
    isReadOnly = active;
    editor.bodyEl.setAttribute("contenteditable", active ? "false" : "true");
    editor.bodyEl.classList.toggle("is-read-only", active);
    if (titleEl) titleEl.setAttribute("contenteditable", active ? "false" : "true");
    // Body Scene punya contenteditable="true" SENDIRI (pulau editable
    // terpisah dari editor.bodyEl, lihat komentar di serializer.js) —
    // tanpa ini, isi Scene tetap bisa diketik walau area luar Scene
    // sudah terkunci.
    editor.bodyEl.querySelectorAll(".editor-scene__body").forEach((el) => {
      el.setAttribute("contenteditable", active ? "false" : "true");
    });
    refreshButtonStates();
  }

  buttons.readOnly.addEventListener("click", () => applyReadOnly(!isReadOnly));

  // Scene di-render ULANG TOTAL (elemen DOM lama dibuang, termasuk atribut
  // contenteditable yang tadi dikunci) tiap kali dokumennya berubah — lihat
  // editor.js renderAll(). Reapply kuncinya di sini supaya Scene baru hasil
  // render ulang itu tidak diam-diam balik jadi editable lagi selagi mode
  // Read Only masih aktif.
  if (typeof state.onChange === "function") {
    state.onChange(() => {
      if (isReadOnly) applyReadOnly(true);
    });
  }
}
