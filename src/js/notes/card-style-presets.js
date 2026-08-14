/**
 * card-style-presets.js
 * Sumber tunggal untuk pilihan kustomisasi kartu (per-note): preset bentuk
 * edge/keliling kartu & preset warna latar, plus fungsi untuk menerapkan
 * satu objek `cardStyle` (lihat db/schema.js createDefaultCardStyle) ke
 * elemen DOM kartu.
 *
 * Dipakai oleh:
 *  - notes/note-card.js  -> menerapkan cardStyle tersimpan saat merender kartu
 *    di Notes List (Home).
 *  - notes/card-style.js -> menyusun pilihan di halaman kustomisasi
 *    (card-style.html) & pratinjau langsung sebelum disimpan.
 *
 * PENTING soal dimensi: semua preset bentuk edge di bawah SENGAJA hanya
 * memakai `border-radius` dan/atau `clip-path` — dua properti CSS yang
 * murni memotong/membulatkan tepi visual tanpa pernah mengubah lebar/tinggi
 * box aslinya (beda dari mis. `transform: scale()` atau margin negatif).
 * Nilai radius dipakai dalam persentase/keyword (bukan px tetap besar) supaya
 * tetap proporsional di kartu grid maupun kartu pinned yang lebih kecil.
 *
 * Banyak preset memakai clip-path dari notes/card-edge-outline.js
 * (EDGE_BAND ~8px) supaya tepi tidak memotong judul/snippet.
 * Preset "washi-tape" sudah dihapus dari picker; kartu lama yang masih
 * menyimpan id itu tetap ditampilkan lewat hasWashiTape()/applyWashiTapeDecor().
 */

import { CARD_EDGE_CLIP } from "./card-edge-outline.js";

/** Preset bentuk edge/keliling kartu. `id` disimpan di cardStyle.edgeShape. */
export const EDGE_SHAPES = [
  {
    id: "default",
    label: "Default",
    borderRadius: "var(--radius-lg)",
    clipPath: "none",
  },
  {
    id: "sharp",
    label: "Kotak Tajam",
    borderRadius: "0",
    clipPath: "none",
  },
  {
    // Sudut terpotong kecil (8px) — tidak mengganggu judul.
    id: "cut-corners",
    label: "Sudut Terpotong",
    borderRadius: "0",
    clipPath:
      "polygon(8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px), 0 8px)",
  },
  {
    id: "chamfer",
    label: "Chamfer",
    borderRadius: "0",
    clipPath:
      "polygon(10px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 10px), 0 10px)",
  },
  {
    // Hanya sudut kiri-atas & kanan-bawah.
    id: "diagonal-cut",
    label: "Potong Diagonal",
    borderRadius: "0",
    clipPath:
      "polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)",
  },
  {
    id: "ticket",
    label: "Tiket",
    borderRadius: "0",
    clipPath:
      "polygon(0 0, 100% 0, 100% calc(50% - 7px), calc(100% - 6px) 50%, 100% calc(50% + 7px), 100% 100%, 0 100%, 0 calc(50% + 7px), 6px 50%, 0 calc(50% - 7px))",
  },
  {
    id: "bookmark",
    label: "Bookmark",
    borderRadius: "0",
    clipPath:
      "polygon(0 0, 100% 0, 100% calc(100% - 14px), 50% 100%, 0 calc(100% - 14px))",
  },
  {
    id: "tag",
    label: "Tag",
    borderRadius: "0",
    clipPath:
      "polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)",
  },
  {
    id: "arch-top",
    label: "Lengkung Atas",
    borderRadius: "0",
    clipPath:
      "polygon(0 10px, 8% 3px, 20% 0, 35% 0, 50% 2px, 65% 0, 80% 0, 92% 3px, 100% 10px, 100% 100%, 0 100%)",
  },
  {
    id: "wave-bottom",
    label: "Ombak Bawah",
    borderRadius: "var(--radius-md) var(--radius-md) 0 0",
    clipPath:
      "polygon(0 0, 100% 0, 100% calc(100% - 8px), 87.5% 100%, 75% calc(100% - 8px), 62.5% 100%, 50% calc(100% - 8px), 37.5% 100%, 25% calc(100% - 8px), 12.5% 100%, 0 calc(100% - 8px))",
  },
  {
    id: "fold-corner",
    label: "Sudut Lipat",
    borderRadius: "var(--radius-md)",
    clipPath:
      "polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 0 100%)",
  },
  {
    id: "notched-top",
    label: "Lekuk Atas",
    borderRadius: "0",
    clipPath:
      "polygon(0 0, 42% 0, 50% 8px, 58% 0, 100% 0, 100% 100%, 0 100%)",
  },
  {
    id: "stamp",
    label: "Perangko",
    borderRadius: "0",
    clipPath: CARD_EDGE_CLIP.stamp,
  },
  {
    id: "stamp-fine",
    label: "Perforasi Halus",
    borderRadius: "0",
    clipPath: CARD_EDGE_CLIP["stamp-fine"],
  },
  {
    id: "scallop",
    label: "Kerang",
    borderRadius: "0",
    clipPath: CARD_EDGE_CLIP.scallop,
  },
  {
    id: "cloud",
    label: "Awan",
    borderRadius: "0",
    clipPath: CARD_EDGE_CLIP.cloud,
  },
  {
    id: "torn",
    label: "Sobekan Kertas",
    borderRadius: "0",
    clipPath: CARD_EDGE_CLIP.torn,
  },
  {
    id: "deckle",
    label: "Tepi Deckle",
    borderRadius: "0",
    clipPath: CARD_EDGE_CLIP.deckle,
  },
  {
    id: "wave",
    label: "Ombak",
    borderRadius: "0",
    clipPath: CARD_EDGE_CLIP.wave,
  },
  {
    id: "ripple",
    label: "Riak",
    borderRadius: "0",
    clipPath: CARD_EDGE_CLIP.ripple,
  },
  {
    id: "double-wave",
    label: "Ombak Ganda",
    borderRadius: "0",
    clipPath: CARD_EDGE_CLIP["double-wave"],
  },
  {
    id: "zigzag",
    label: "Zigzag",
    borderRadius: "0",
    clipPath: CARD_EDGE_CLIP.zigzag,
  },
  {
    id: "pinked",
    label: "Gunting Zigzag",
    borderRadius: "0",
    clipPath: CARD_EDGE_CLIP.pinked,
  },
  {
    id: "steps",
    label: "Tangga",
    borderRadius: "0",
    clipPath: CARD_EDGE_CLIP.steps,
  },
  {
    id: "brush",
    label: "Sapuan Kuas",
    borderRadius: "0",
    clipPath: CARD_EDGE_CLIP.brush,
  },
  {
    id: "notch",
    label: "Lekukan Tengah",
    borderRadius: "0",
    clipPath: CARD_EDGE_CLIP.notch,
  },
];

export const DEFAULT_EDGE_SHAPE_ID = "default";

export function getEdgeShape(id) {
  return EDGE_SHAPES.find((s) => s.id === id) || EDGE_SHAPES.find((s) => s.id === DEFAULT_EDGE_SHAPE_ID);
}

/** Preset warna latar kartu (hex). `null` = pakai --color-surface tema aktif. */
// `hex` di bawah BUKAN kode warna tetap, melainkan referensi ke custom
// property --scene-bg-* (lihat themes.css) — persis preset warna latar
// Scene di toolbar/scene-sheet.js (BG_PRESETS). Nilainya rgba TIPIS yang
// otomatis "ikut" tema aktif: bercampur dengan --color-bg di baliknya, jadi
// pastel lembut di tema terang (Light/Sepia/Kertas) dan lebih gelap
// berkarakter di tema gelap (Dark/OLED) — TANPA perlu 1 set warna hex
// terpisah untuk tiap-tiap dari 5 tema. String `var(--scene-bg-rose)` valid
// dipakai langsung sebagai cardEl.style.backgroundColor (lihat
// applyCardShapeAndColor di bawah), sama seperti string hex biasa.
// Warna Kustom (input type=color di card-style.html) TETAP hex literal
// seperti sebelumnya, karena itu pilihan RGB eksplisit pengguna sendiri
// yang memang tidak seharusnya ikut berubah-ubah oleh tema.
export const BG_COLOR_PRESETS = [
  { hex: null, label: "Default" },
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

/**
 * Terapkan satu objek cardStyle ke elemen kartu (DOM). Murni memberi inline
 * style (border-radius/clip-path/background-color/font-family) — TIDAK
 * pernah menyentuh width/height elemen.
 * @param {HTMLElement} cardEl
 * @param {object|null} cardStyle - lihat db/schema.js createDefaultCardStyle()
 */
export function applyCardShapeAndColor(cardEl, cardStyle) {
  const shape = getEdgeShape(cardStyle && cardStyle.edgeShape);
  cardEl.style.borderRadius = shape.borderRadius;
  cardEl.style.clipPath = shape.clipPath;

  const bgColor = cardStyle && cardStyle.bgColor;
  cardEl.style.backgroundColor = bgColor || "";
}

/** Terapkan font judul ke elemen judul kartu (`.note-card__title`/`.pinned-card__title`). */
export function applyTitleFont(titleEl, cardStyle) {
  const font = cardStyle && cardStyle.titleFont;
  titleEl.style.fontFamily = font ? `"${font}"` : "";
}

/** @returns {boolean} true kalau preset edge aktif adalah dekorasi selotip washi. */
export function hasWashiTape(cardStyle) {
  return !!(cardStyle && cardStyle.edgeShape === "washi-tape");
}

/**
 * Pasang/lepas 2 elemen dekorasi selotip (`.note-card__tape`) di pojok atas
 * kartu, sesuai cardStyle.edgeShape. Dipanggil oleh notes/note-card.js
 * setelah kartu (createNoteCard/createPinnedCard) selesai dibangun.
 * Idempoten: aman dipanggil berkali-kali pada elemen yang sama (mis. saat
 * preview di card-style.js berubah live tiap preset di-klik).
 * @param {HTMLElement} cardEl
 * @param {object|null} cardStyle
 */
export function applyWashiTapeDecor(cardEl, cardStyle) {
  const existing = cardEl.querySelectorAll(".note-card__tape");
  if (!hasWashiTape(cardStyle)) {
    existing.forEach((el) => el.remove());
    return;
  }
  if (existing.length) return; // sudah terpasang
  for (const side of ["left", "right"]) {
    const tape = document.createElement("span");
    tape.className = `note-card__tape note-card__tape--${side}`;
    tape.setAttribute("aria-hidden", "true");
    cardEl.appendChild(tape);
  }
}
