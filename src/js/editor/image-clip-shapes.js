/**
 * image-clip-shapes.js
 * Daftar bentuk crop gambar dipakai oleh:
 *   - toolbar/image-sheet.js (ikon pilihan di sheet)
 *   - editor/serializer.js (clip sungguhan di dokumen)
 *
 * Path digambar di unit square 0..1 × 0..1 (objectBoundingBox).
 */

export const IMAGE_CLIP_SHAPES = [
  { id: "none", label: "Persegi", d: null },

  // ---- Favorit yang tetap ----
  {
    id: "star",
    label: "Bintang",
    d: "M0.5,0 L0.61,0.35 L0.98,0.35 L0.68,0.57 L0.79,0.91 L0.5,0.7 L0.21,0.91 L0.32,0.57 L0.02,0.35 L0.39,0.35 Z",
  },
  {
    id: "heart",
    label: "Love",
    d: "M0.5,0.93 C0.5,0.93 0.04,0.58 0.04,0.32 C0.04,0.12 0.19,0.02 0.35,0.02 C0.44,0.02 0.5,0.09 0.5,0.16 C0.5,0.09 0.56,0.02 0.65,0.02 C0.81,0.02 0.96,0.12 0.96,0.32 C0.96,0.58 0.5,0.93 0.5,0.93 Z",
  },
  {
    id: "circle",
    label: "Lingkaran",
    d: "M1,0.5 C1,0.7761 0.7761,1 0.5,1 C0.2239,1 0,0.7761 0,0.5 C0,0.2239 0.2239,0 0.5,0 C0.7761,0 1,0.2239 1,0.5 Z",
  },
  {
    id: "blob",
    label: "Blob",
    d: "M0.15,0.35 C0.05,0.55 0.1,0.8 0.35,0.9 C0.6,1 0.85,0.9 0.92,0.65 C1,0.4 0.9,0.15 0.65,0.08 C0.4,0 0.25,0.15 0.15,0.35 Z",
  },
  {
    id: "arch",
    label: "Gapura",
    d: "M0.1,0.98 L0.1,0.5 C0.1,0.22 0.28,0.02 0.5,0.02 C0.72,0.02 0.9,0.22 0.9,0.5 L0.9,0.98 Z",
  },

  // ---- Kreatif: kertas / tiket / perangko ----
  {
    // Perangko — kotak dengan scallop di keempat sisi
    id: "stamp",
    label: "Perangko",
    d:
      "M0.08,0.02 " +
      "C0.12,0.06 0.16,0.06 0.20,0.02 L0.28,0.02 C0.32,0.06 0.36,0.06 0.40,0.02 L0.48,0.02 C0.52,0.06 0.56,0.06 0.60,0.02 L0.68,0.02 C0.72,0.06 0.76,0.06 0.80,0.02 L0.88,0.02 C0.92,0.06 0.94,0.08 0.98,0.12 " +
      "L0.98,0.20 C0.94,0.24 0.94,0.28 0.98,0.32 L0.98,0.40 C0.94,0.44 0.94,0.48 0.98,0.52 L0.98,0.60 C0.94,0.64 0.94,0.68 0.98,0.72 L0.98,0.80 C0.94,0.84 0.94,0.88 0.98,0.88 " +
      "C0.94,0.92 0.92,0.94 0.88,0.98 L0.80,0.98 C0.76,0.94 0.72,0.94 0.68,0.98 L0.60,0.98 C0.56,0.94 0.52,0.94 0.48,0.98 L0.40,0.98 C0.36,0.94 0.32,0.94 0.28,0.98 L0.20,0.98 C0.16,0.94 0.12,0.94 0.08,0.98 " +
      "C0.04,0.94 0.02,0.92 0.02,0.88 L0.02,0.80 C0.06,0.76 0.06,0.72 0.02,0.68 L0.02,0.60 C0.06,0.56 0.06,0.52 0.02,0.48 L0.02,0.40 C0.06,0.36 0.06,0.32 0.02,0.28 L0.02,0.20 C0.06,0.16 0.06,0.12 0.02,0.12 " +
      "C0.06,0.08 0.08,0.06 0.08,0.02 Z",
  },
  {
    // Tiket bioskop — lekukan di kiri & kanan tengah
    id: "ticket",
    label: "Tiket",
    d:
      "M0.02,0.08 L0.98,0.08 " +
      "L0.98,0.42 C0.92,0.45 0.92,0.55 0.98,0.58 L0.98,0.92 " +
      "L0.02,0.92 L0.02,0.58 C0.08,0.55 0.08,0.45 0.02,0.42 Z",
  },
  {
    // Stub tiket (ujung bergerigi di kanan)
    id: "ticket-stub",
    label: "Stub Tiket",
    d:
      "M0.02,0.12 L0.78,0.12 " +
      "L0.82,0.18 L0.78,0.24 L0.82,0.30 L0.78,0.36 L0.82,0.42 L0.78,0.48 " +
      "L0.82,0.54 L0.78,0.60 L0.82,0.66 L0.78,0.72 L0.82,0.78 L0.78,0.84 " +
      "L0.82,0.88 L0.02,0.88 Z",
  },
  {
    id: "bookmark",
    label: "Bookmark",
    d: "M0.12,0.02 L0.88,0.02 L0.88,0.98 L0.5,0.78 L0.12,0.98 Z",
  },
  {
    id: "tag",
    label: "Tag",
    d:
      "M0.08,0.18 L0.62,0.02 L0.98,0.5 L0.62,0.98 L0.08,0.82 " +
      "C0.02,0.78 0.02,0.22 0.08,0.18 Z",
  },
  {
    // Perisai / badge
    id: "shield",
    label: "Perisai",
    d: "M0.5,0.02 L0.92,0.14 L0.92,0.48 C0.92,0.72 0.74,0.9 0.5,0.98 C0.26,0.9 0.08,0.72 0.08,0.48 L0.08,0.14 Z",
  },
  {
    // Banner / pita
    id: "banner",
    label: "Pita",
    d:
      "M0.02,0.22 L0.18,0.38 L0.18,0.22 L0.82,0.22 L0.82,0.38 L0.98,0.22 " +
      "L0.98,0.78 L0.82,0.62 L0.82,0.78 L0.18,0.78 L0.18,0.62 L0.02,0.78 Z",
  },
  {
    // Awan
    id: "cloud",
    label: "Awan",
    d:
      "M0.28,0.72 C0.1,0.72 0.04,0.58 0.1,0.46 C0.06,0.34 0.16,0.24 0.28,0.28 " +
      "C0.34,0.14 0.52,0.1 0.62,0.22 C0.72,0.14 0.88,0.18 0.9,0.34 " +
      "C1.02,0.36 1.04,0.56 0.92,0.64 C0.94,0.76 0.8,0.82 0.7,0.76 " +
      "C0.62,0.84 0.4,0.84 0.32,0.74 C0.3,0.74 0.28,0.72 0.28,0.72 Z",
  },
  {
    // Gelembung bicara
    id: "speech",
    label: "Balon Chat",
    d:
      "M0.12,0.08 C0.04,0.08 0.02,0.16 0.02,0.24 L0.02,0.55 C0.02,0.66 0.08,0.72 0.18,0.72 " +
      "L0.32,0.72 L0.22,0.92 L0.48,0.72 L0.82,0.72 C0.92,0.72 0.98,0.66 0.98,0.55 " +
      "L0.98,0.24 C0.98,0.16 0.94,0.08 0.86,0.08 Z",
  },
  {
    // Bulan sabit
    id: "moon",
    label: "Bulan",
    d:
      "M0.62,0.08 C0.38,0.1 0.18,0.3 0.18,0.55 C0.18,0.8 0.38,0.98 0.62,0.98 " +
      "C0.42,0.92 0.3,0.74 0.3,0.53 C0.3,0.32 0.44,0.14 0.62,0.08 Z",
  },
  {
    // Daun
    id: "leaf",
    label: "Daun",
    d:
      "M0.5,0.02 C0.78,0.12 0.98,0.38 0.92,0.62 C0.86,0.86 0.62,0.98 0.5,0.98 " +
      "C0.38,0.98 0.14,0.86 0.08,0.62 C0.02,0.38 0.22,0.12 0.5,0.02 Z " +
      "M0.5,0.18 L0.5,0.9",
  },
  {
    // Siluet polaroid: area foto + margin bawah lebih tebal
    id: "polaroid",
    label: "Polaroid",
    d: "M0.06,0.02 L0.94,0.02 L0.94,0.98 L0.06,0.98 Z",
  },
  {
    // Sudut terpotong (ticket corner cut)
    id: "cut-corner",
    label: "Sudut Potong",
    d: "M0.14,0.02 L0.86,0.02 L0.98,0.14 L0.98,0.86 L0.86,0.98 L0.14,0.98 L0.02,0.86 L0.02,0.14 Z",
  },
  {
    // Oval landscape
    id: "oval",
    label: "Oval",
    d: "M0.5,0.06 C0.78,0.06 0.98,0.26 0.98,0.5 C0.98,0.74 0.78,0.94 0.5,0.94 C0.22,0.94 0.02,0.74 0.02,0.5 C0.02,0.26 0.22,0.06 0.5,0.06 Z",
  },
  {
    // Gelombang / washi edge di bawah
    id: "wavy-bottom",
    label: "Ombak Bawah",
    d:
      "M0.02,0.02 L0.98,0.02 L0.98,0.78 " +
      "C0.9,0.86 0.82,0.72 0.74,0.8 C0.66,0.88 0.58,0.72 0.5,0.8 " +
      "C0.42,0.88 0.34,0.72 0.26,0.8 C0.18,0.88 0.1,0.72 0.02,0.8 Z",
  },
  {
    // Siluet roda gigi solid (tanpa lubang tengah — aman untuk clip-path)
    id: "gear",
    label: "Roda Gigi",
    d:
      "M0.42,0.02 L0.58,0.02 L0.62,0.12 L0.74,0.08 L0.82,0.18 L0.74,0.28 L0.86,0.32 L0.86,0.48 " +
      "L0.74,0.52 L0.82,0.64 L0.72,0.74 L0.62,0.68 L0.58,0.82 L0.42,0.82 L0.38,0.7 L0.26,0.74 " +
      "L0.16,0.64 L0.26,0.54 L0.14,0.48 L0.14,0.32 L0.26,0.28 L0.18,0.18 L0.28,0.1 L0.38,0.14 Z",
  },
  {
    // Pita/rosette
    id: "rosette",
    label: "Roset",
    d:
      "M0.5,0.08 L0.58,0.28 L0.8,0.22 L0.7,0.42 L0.92,0.5 L0.7,0.58 L0.8,0.78 L0.58,0.72 " +
      "L0.5,0.92 L0.42,0.72 L0.2,0.78 L0.3,0.58 L0.08,0.5 L0.3,0.42 L0.2,0.22 L0.42,0.28 Z",
  },
  {
    // Hexagon rounded-ish soft (capsule ticket)
    id: "capsule",
    label: "Kapsul",
    d:
      "M0.28,0.08 L0.72,0.08 C0.88,0.08 0.98,0.22 0.98,0.5 C0.98,0.78 0.88,0.92 0.72,0.92 " +
      "L0.28,0.92 C0.12,0.92 0.02,0.78 0.02,0.5 C0.02,0.22 0.12,0.08 0.28,0.08 Z",
  },
  {
    // Diamond rounded (soft)
    id: "soft-diamond",
    label: "Wajik Halus",
    d:
      "M0.5,0.02 C0.58,0.12 0.78,0.28 0.92,0.4 C0.98,0.46 0.98,0.54 0.92,0.6 " +
      "C0.78,0.72 0.58,0.88 0.5,0.98 C0.42,0.88 0.22,0.72 0.08,0.6 C0.02,0.54 0.02,0.46 0.08,0.4 " +
      "C0.22,0.28 0.42,0.12 0.5,0.02 Z",
  },
];

const CLIP_DEFS_CONTAINER_ID = "editor-image-clip-defs";

/**
 * Suntikkan sekali <svg><defs><clipPath ...> untuk semua bentuk (kecuali "none").
 */
export function ensureClipDefsInjected() {
  if (document.getElementById(CLIP_DEFS_CONTAINER_ID)) return;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("id", CLIP_DEFS_CONTAINER_ID);
  svg.setAttribute("aria-hidden", "true");
  svg.style.position = "absolute";
  svg.style.width = "0";
  svg.style.height = "0";
  svg.style.overflow = "hidden";

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  for (const shape of IMAGE_CLIP_SHAPES) {
    if (!shape.d) continue;
    const clipPath = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
    clipPath.setAttribute("id", clipPathId(shape.id));
    clipPath.setAttribute("clipPathUnits", "objectBoundingBox");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", shape.d);
    clipPath.appendChild(path);
    defs.appendChild(clipPath);
  }
  svg.appendChild(defs);
  document.body.appendChild(svg);
}

export function clipPathId(shapeId) {
  return `editor-image-clip-${shapeId}`;
}

/** Nilai CSS `clip-path` yang siap dipasang ke elemen frame gambar. */
export function getClipPathCssValue(shapeId) {
  if (!shapeId || shapeId === "none") return "none";
  const known = IMAGE_CLIP_SHAPES.some((s) => s.id === shapeId);
  if (!known) return "none";
  return `url(#${clipPathId(shapeId)})`;
}
