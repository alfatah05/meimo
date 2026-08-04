/**
 * image-clip-shapes.js
 * Daftar bentuk crop gambar (bintang, love/hati, dll) dipakai bareng oleh:
 *   - toolbar/image-sheet.js: render strip ikon pilihan bentuk (scroll ke
 *     samping) di bottom sheet Sisipkan/Edit Gambar.
 *   - editor/serializer.js: menerapkan crop sungguhan ke block gambar yang
 *     sudah di-render di dokumen.
 *
 * Setiap bentuk (selain "none") punya path data SVG yang digambar dalam
 * kotak satuan 0..1 x 0..1 ("unit square") — path yang SAMA dipakai dua
 * kali dengan cara berbeda:
 *   1. Sebagai isi <path> ikon kecil di sheet (viewBox="0 0 1 1", di-fill
 *      warna currentColor) — cuma buat pratinjau bentuknya di tombol.
 *   2. Sebagai isi <clipPath clipPathUnits="objectBoundingBox"> yang
 *      di-suntik sekali ke DOM (lihat ensureClipDefsInjected) — inilah yang
 *      benar-benar memotong gambar. clipPathUnits="objectBoundingBox"
 *      penting supaya path 0..1 otomatis mengikuti lebar/tinggi kotak
 *      gambar berapa pun ukurannya (ikut slider Lebar/Tinggi di sheet),
 *      tanpa perlu dihitung ulang tiap kali ukuran berubah.
 */

export const IMAGE_CLIP_SHAPES = [
  { id: "none", label: "Persegi", d: null },
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
    id: "hexagon",
    label: "Segi Enam",
    d: "M0.25,0.05 L0.75,0.05 L1,0.5 L0.75,0.95 L0.25,0.95 L0,0.5 Z",
  },
  {
    id: "diamond",
    label: "Wajik",
    d: "M0.5,0 L1,0.5 L0.5,1 L0,0.5 Z",
  },
  {
    id: "triangle",
    label: "Segitiga",
    d: "M0.5,0.02 L0.98,0.95 L0.02,0.95 Z",
  },
  {
    id: "blob",
    label: "Blob",
    d: "M0.15,0.35 C0.05,0.55 0.1,0.8 0.35,0.9 C0.6,1 0.85,0.9 0.92,0.65 C1,0.4 0.9,0.15 0.65,0.08 C0.4,0 0.25,0.15 0.15,0.35 Z",
  },
  {
    id: "pentagon",
    label: "Segi Lima",
    d: "M0.5,0 L0.98,0.37 L0.79,0.95 L0.21,0.95 L0.02,0.37 Z",
  },
  {
    id: "octagon",
    label: "Segi Delapan",
    d: "M0.29,0.02 L0.71,0.02 L0.98,0.29 L0.98,0.71 L0.71,0.98 L0.29,0.98 L0.02,0.71 L0.02,0.29 Z",
  },
  {
    id: "cross",
    label: "Plus",
    d: "M0.35,0.02 L0.65,0.02 L0.65,0.35 L0.98,0.35 L0.98,0.65 L0.65,0.65 L0.65,0.98 L0.35,0.98 L0.35,0.65 L0.02,0.65 L0.02,0.35 L0.35,0.35 Z",
  },
  {
    id: "arrow",
    label: "Panah",
    d: "M0.02,0.32 L0.55,0.32 L0.55,0.12 L0.98,0.5 L0.55,0.88 L0.55,0.68 L0.02,0.68 Z",
  },
  {
    id: "drop",
    label: "Tetesan",
    d: "M0.5,0.02 C0.72,0.32 0.92,0.55 0.92,0.72 C0.92,0.89 0.73,0.98 0.5,0.98 C0.27,0.98 0.08,0.89 0.08,0.72 C0.08,0.55 0.28,0.32 0.5,0.02 Z",
  },
  {
    id: "arch",
    label: "Gapura",
    d: "M0.1,0.98 L0.1,0.5 C0.1,0.22 0.28,0.02 0.5,0.02 C0.72,0.02 0.9,0.22 0.9,0.5 L0.9,0.98 Z",
  },
  {
    id: "blossom",
    label: "Kelopak",
    d: "M0.8,0.28 C0.8,0.4457 0.6657,0.58 0.5,0.58 C0.3343,0.58 0.2,0.4457 0.2,0.28 C0.2,0.1143 0.3343,-0.02 0.5,-0.02 C0.6657,-0.02 0.8,0.1143 0.8,0.28 Z M1.02,0.5 C1.02,0.6657 0.8857,0.8 0.72,0.8 C0.5543,0.8 0.42,0.6657 0.42,0.5 C0.42,0.3343 0.5543,0.2 0.72,0.2 C0.8857,0.2 1.02,0.3343 1.02,0.5 Z M0.8,0.72 C0.8,0.8857 0.6657,1.02 0.5,1.02 C0.3343,1.02 0.2,0.8857 0.2,0.72 C0.2,0.5543 0.3343,0.42 0.5,0.42 C0.6657,0.42 0.8,0.5543 0.8,0.72 Z M0.58,0.5 C0.58,0.6657 0.4457,0.8 0.28,0.8 C0.1143,0.8 -0.02,0.6657 -0.02,0.5 C-0.02,0.3343 0.1143,0.2 0.28,0.2 C0.4457,0.2 0.58,0.3343 0.58,0.5 Z",
  },
];

const CLIP_DEFS_CONTAINER_ID = "editor-image-clip-defs";

/**
 * Suntikkan sekali <svg><defs><clipPath id="editor-image-clip-{id}" ...>
 * untuk semua bentuk (kecuali "none") ke document.body — aman dipanggil
 * berkali-kali (no-op kalau sudah ada). Elemen ini disembunyikan lewat
 * width/height 0 + position absolute, TAPI TIDAK pakai display:none /
 * visibility:hidden, karena beberapa browser (terutama Safari/iOS) tidak
 * menghormati referensi clip-path ke <clipPath> yang berada di subtree
 * display:none.
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

function clipPathId(shapeId) {
  return `editor-image-clip-${shapeId}`;
}

/** Nilai CSS `clip-path` yang siap dipasang ke elemen frame gambar. */
export function getClipPathCssValue(shapeId) {
  if (!shapeId || shapeId === "none") return "none";
  const known = IMAGE_CLIP_SHAPES.some((s) => s.id === shapeId);
  if (!known) return "none";
  return `url(#${clipPathId(shapeId)})`;
}
