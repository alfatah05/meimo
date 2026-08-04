/**
 * note-card.js
 * Representasi satu item catatan dalam daftar — dua varian:
 *   - createNoteCard(note)   -> kartu grid "Terbaru"/"Semua Notes"
 *   - createPinnedCard(note) -> kartu ringkas untuk strip "Pinned"
 *
 * Murni fungsi render (note -> DOM element), tidak menyentuh IndexedDB
 * atau Document Service selain memakai getSnippet() untuk cuplikan isi.
 *
 * Kustomisasi kartu (font judul/bentuk edge/warna & gambar latar — lihat
 * card-style-presets.js & halaman card-style.html) diterapkan di sini
 * berdasarkan `note.metadata.cardStyle` yang tersimpan, kalau ada.
 */

import { createEl, openPanel, closeAllPanels } from "../utils/dom.js";
import { getSnippet } from "../services/document-service.js";
import { getObjectUrl } from "../services/image-service.js";
import { formatRelativeDate } from "../utils/date-format.js";
import { applyCardShapeAndColor, applyTitleFont, applyWashiTapeDecor } from "./card-style-presets.js";

const PIN_ICON_SVG =
  '<svg class="note-card__pin-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
  '<path d="M12 2l1.5 5.5L19 9l-4 3.5 1 6-4-3-4 3 1-6-4-3.5 5.5-1.5z"/></svg>';

const MORE_ICON_SVG =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
  '<circle cx="12" cy="5" r="1.8"></circle>' +
  '<circle cx="12" cy="12" r="1.8"></circle>' +
  '<circle cx="12" cy="19" r="1.8"></circle></svg>';

const CUSTOMIZE_ICON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>';

const PIN_MENU_ICON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M12 17v5"></path>' +
  '<path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 1 1 0 0 0 0-2H8a1 1 0 0 0 0 2 1 1 0 0 1 1 1z"></path></svg>';

const UNPIN_MENU_ICON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M12 17v5"></path>' +
  '<path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 1 1 0 0 0 0-2H8a1 1 0 0 0 0 2 1 1 0 0 1 1 1z"></path>' +
  '<line x1="4" y1="4" x2="20" y2="20"></line></svg>';

const TRASH_ICON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<polyline points="3 6 5 6 21 6"></polyline>' +
  '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>' +
  '<path d="M10 11v6"></path><path d="M14 11v6"></path>' +
  '<path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>';

// id note dikirim lewat query string (?id=<id>) — TIDAK pakai bentuk
// "cantik" /editor/<id> lagi, karena app ini sekarang APK (Capacitor
// WebView tidak punya rewrite engine seperti .htaccess Apache dulu).
// Lihat getNoteIdFromUrl() di app.js untuk cara id ini dibaca balik.
function noteHref(note) {
  return `/editor.html?id=${encodeURIComponent(note.id)}`;
}

// Sama seperti noteHref() di atas — lihat getNoteIdFromUrl() di
// src/js/notes/card-style.js.
function cardStyleHref(note) {
  return `/card-style.html?id=${encodeURIComponent(note.id)}`;
}

/** Terapkan cardStyle tersimpan (kalau ada) ke elemen kartu & judulnya,
 * termasuk gambar latar (async, lewat image-service getObjectUrl). */
function applyStoredCardStyle(cardEl, titleEl, note) {
  const cardStyle = note.metadata && note.metadata.cardStyle;
  if (!cardStyle) return;

  applyCardShapeAndColor(cardEl, cardStyle);
  applyTitleFont(titleEl, cardStyle);
  applyWashiTapeDecor(cardEl, cardStyle);

  if (cardStyle.bgImageAssetId) {
    cardEl.classList.add("has-bg-image");
    cardEl.style.setProperty(
      "--card-bg-opacity",
      cardStyle.bgImageOpacity != null ? cardStyle.bgImageOpacity : 1
    );
    getObjectUrl(cardStyle.bgImageAssetId).then((url) => {
      if (url) cardEl.style.setProperty("--card-bg-image", `url("${url}")`);
    });
  }
}

/**
 * Bangun & buka panel dropdown menu kartu (Sematkan / Customisasi / Hapus),
 * dipicu dari tombol titik-tiga. Memakai panel manager yang sama dengan
 * dropdown lain (openPanel di utils/dom.js), jadi otomatis tertutup saat
 * klik di luar / Escape / dropdown lain dibuka.
 */
function openCardMenu(trigger, note, onTrash, onTogglePin) {
  const panel = createEl("div", { className: "toolbar-panel__list" });

  if (onTogglePin) {
    const pinned = !!(note.metadata && note.metadata.pinned);
    const pinItem = createEl("button", {
      className: "toolbar-panel__item",
      attrs: { type: "button" },
      html: pinned
        ? `${UNPIN_MENU_ICON_SVG}<span>Lepas Sematan</span>`
        : `${PIN_MENU_ICON_SVG}<span>Sematkan</span>`,
    });
    pinItem.addEventListener("click", () => {
      closeAllPanels();
      onTogglePin(note);
    });
    panel.appendChild(pinItem);
  }

  const customizeItem = createEl("a", {
    className: "toolbar-panel__item",
    attrs: { href: cardStyleHref(note) },
    html: `${CUSTOMIZE_ICON_SVG}<span>Customisasi</span>`,
  });
  // Link navigasi native ke halaman Customisasi Kartu — sebelumnya tidak
  // ada handler sama sekali, jadi klik langsung pindah halaman sementara
  // dropdown masih penuh terbuka di snapshot View Transition. Tutup panel
  // (dengan animasi close, lihat close() di dom.js) di sini dulu, TANPA
  // preventDefault supaya navigasinya tetap jalan seperti biasa.
  customizeItem.addEventListener("click", () => closeAllPanels());
  panel.appendChild(customizeItem);

  const deleteItem = createEl("button", {
    className: "toolbar-panel__item toolbar-panel__item--danger",
    attrs: { type: "button" },
    html: `${TRASH_ICON_SVG}<span>Hapus</span>`,
  });
  deleteItem.addEventListener("click", () => {
    closeAllPanels();
    if (onTrash) onTrash(note);
  });
  panel.appendChild(deleteItem);

  openPanel(trigger, panel, { align: "left" });
}

/**
 * Kartu di grid "Terbaru" / "Semua Notes" / hasil pencarian.
 * @param {object} note
 * @param {object} [opts]
 * @param {(note: object) => void} [opts.onTrash] - dipanggil saat item menu
 *   "Hapus" ditekan.
 * @param {(note: object) => void} [opts.onTogglePin] - dipanggil saat item
 *   menu "Sematkan"/"Lepas Sematan" ditekan. Tombol menu titik-tiga hanya
 *   ditampilkan kalau salah satu dari onTrash/onTogglePin diberikan.
 */
export function createNoteCard(note, { onTrash, onTogglePin } = {}) {
  const card = createEl("a", {
    className: "note-card anim-slide-up",
    attrs: { href: noteHref(note), "aria-label": note.title || "Catatan tanpa judul" },
  });

  const header = createEl("div", { className: "note-card__header" });
  const titleWrap = createEl("div", { className: "note-card__title-wrap" });
  const titleEl = createEl("div", { className: "note-card__title", text: note.title || "Tanpa judul" });
  titleWrap.appendChild(titleEl);
  header.appendChild(titleWrap);
  if (note.metadata && note.metadata.pinned) {
    header.appendChild(createEl("span", { html: PIN_ICON_SVG }).firstElementChild);
  }
  if (onTrash || onTogglePin) {
    const menuBtn = createEl("button", {
      className: "note-card__menu-btn",
      attrs: { type: "button", "aria-label": "Menu catatan", "aria-haspopup": "true", "aria-expanded": "false" },
      html: MORE_ICON_SVG,
    });
    menuBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openCardMenu(menuBtn, note, onTrash, onTogglePin);
    });
    header.appendChild(menuBtn);
  }

  const snippet = createEl("p", {
    className: "note-card__snippet",
    text: getSnippet(note) || "Catatan kosong.",
  });

  const footer = createEl("div", { className: "note-card__footer" });
  footer.appendChild(createEl("span", { text: `Diubah ${formatRelativeDate(note.updatedAt)}` }));

  card.append(header, snippet, footer);
  applyStoredCardStyle(card, titleEl, note);
  return card;
}

/**
 * Kartu ringkas untuk strip "Pinned" di bagian atas Notes List.
 * @param {object} note
 * @param {object} [opts]
 * @param {(note: object) => void} [opts.onTrash] - dipanggil saat item menu
 *   "Hapus" ditekan.
 * @param {(note: object) => void} [opts.onTogglePin] - dipanggil saat item
 *   menu "Lepas Sematan" ditekan (satu-satunya cara melepas sematan, karena
 *   catatan yang disematkan tidak lagi tampil di grid utama). Tombol menu
 *   titik-tiga hanya ditampilkan kalau salah satu dari onTrash/onTogglePin
 *   diberikan.
 */
export function createPinnedCard(note, { onTrash, onTogglePin } = {}) {
  const card = createEl("a", {
    className: "pinned-card",
    attrs: { href: noteHref(note), "aria-label": note.title || "Catatan tanpa judul" },
  });
  const header = createEl("div", { className: "pinned-card__header" });
  const titleEl = createEl("div", { className: "pinned-card__title", text: note.title || "Tanpa judul" });
  header.appendChild(titleEl);
  if (onTrash || onTogglePin) {
    const menuBtn = createEl("button", {
      className: "pinned-card__menu-btn",
      attrs: { type: "button", "aria-label": "Menu catatan", "aria-haspopup": "true", "aria-expanded": "false" },
      html: MORE_ICON_SVG,
    });
    menuBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openCardMenu(menuBtn, note, onTrash, onTogglePin);
    });
    header.appendChild(menuBtn);
  }
  card.appendChild(header);
  card.appendChild(
    createEl("div", { className: "pinned-card__snippet", text: getSnippet(note, 80) || "Catatan kosong." })
  );
  applyStoredCardStyle(card, titleEl, note);
  return card;
}
