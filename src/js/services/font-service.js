/**
 * font-service.js
 * Font Service — satu-satunya lapisan yang boleh dipanggil oleh dropdown
 * Font Family di toolbar (font-family-dropdown.js) dan halaman Font Manager
 * (font-manager.html / src/js/fonts/font-manager.js) untuk apa pun yang
 * berhubungan dengan font. Berisi ATURAN BISNIS di atas Repository:
 *   - 2 font bawaan (Inter, Georgia) yang selalu tersedia tanpa diunduh,
 *   - membaca daftar Font Library (assets/fonts/library/manifest.json),
 *   - mengunduh berkas font dari Font Library -> simpan ke IndexedDB,
 *   - memuat font yang sudah tersimpan jadi @font-face aktif (FontFace API)
 *     supaya bisa langsung dipakai di editor lewat CSS `font-family`.
 *
 * Font Service TIDAK PERNAH memanggil IndexedDB langsung — semua akses
 * data lewat fonts-repository.js.
 *
 * Arsitektur:
 *   Font Family Dropdown / Font Manager -> Font Service (file ini) -> Repository -> IndexedDB
 */

import * as fontsRepository from "../db/fonts-repository.js";
import { createFontRecord } from "../db/schema.js";

const FONT_LIBRARY_MANIFEST_URL = "/assets/fonts/library/manifest.json";

/**
 * 2 font bawaan aplikasi — SELALU tersedia di dropdown Font Family tanpa
 * perlu diunduh dari Font Library sama sekali:
 *  - Inter: sudah dimuat lewat Google Fonts <link> di setiap halaman.
 *  - Georgia: font sistem (sudah terpasang di hampir semua OS), jadi tidak
 *    butuh berkas apa pun untuk bisa dipakai.
 */
export const BUILTIN_FONTS = [
  { id: "builtin-inter", name: "Inter", family: "Inter", builtin: true },
  { id: "builtin-georgia", name: "Georgia", family: "Georgia", builtin: true },
];

let libraryPromise = null;

/**
 * Ambil daftar font yang tersedia di Font Library (belum tentu sudah
 * diunduh) dari manifest.json. Hasilnya di-cache di memori untuk sesi
 * berjalan supaya tidak fetch berulang tiap dropdown dibuka.
 */
export async function getFontLibrary() {
  if (libraryPromise) return libraryPromise;

  libraryPromise = (async () => {
    try {
      const res = await fetch(FONT_LIBRARY_MANIFEST_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error(`Gagal memuat manifest Font Library (status ${res.status}).`);
      const data = await res.json();
      return Array.isArray(data.fonts) ? data.fonts : [];
    } catch (err) {
      console.error("Gagal memuat Font Library:", err);
      return [];
    }
  })();

  return libraryPromise;
}

/** Ambil seluruh font kustom yang sudah diunduh (record lengkap termasuk Blob). */
export function getInstalledFonts() {
  return fontsRepository.getAllFonts();
}

/** True bila sebuah font Font Library (berdasarkan id) sudah diunduh. */
export async function isFontInstalled(id) {
  const rec = await fontsRepository.getFontById(id);
  return !!rec;
}

/**
 * Daftar font yang boleh dipilih user di dropdown Font Family editor:
 * 2 font bawaan + seluruh font kustom yang sudah diunduh. Bentuknya
 * disederhanakan (tanpa Blob) karena dropdown hanya butuh nama & family.
 */
export async function getAvailableFonts() {
  const installed = await getInstalledFonts();
  const installedSimplified = installed
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((f) => ({ id: f.id, name: f.name, family: f.family, builtin: false }));
  return [...BUILTIN_FONTS, ...installedSimplified];
}

/* ------------------------------------------------------------------ */
/* Memuat @font-face ke dokumen (FontFace API)                         */
/* ------------------------------------------------------------------ */

// Lacak kombinasi family+weight+style yang sudah ditambahkan ke
// `document.fonts` di sesi berjalan ini, supaya tidak dobel-load.
const loadedFaceKeys = new Set();

function faceKey(family, weight, style) {
  return `${family}__${weight}__${style}`;
}

async function loadFontRecordFaces(record) {
  if (!record || !Array.isArray(record.files)) return;
  await Promise.all(
    record.files.map(async (file) => {
      const weight = file.weight || 400;
      const style = file.style || "normal";
      const key = faceKey(record.family, weight, style);
      if (loadedFaceKeys.has(key)) return;
      if (typeof FontFace === "undefined" || !file.bytes) return;
      try {
        // `bytes` sudah berupa ArrayBuffer (bukan Blob) — FontFace API
        // menerima ArrayBuffer langsung, jadi tidak perlu konversi apa pun.
        const face = new FontFace(record.family, file.bytes, { weight: String(weight), style });
        await face.load();
        document.fonts.add(face);
        loadedFaceKeys.add(key);
      } catch (err) {
        console.error(`Gagal memuat font "${record.family}" (${weight}/${style}):`, err);
      }
    })
  );
}

/**
 * Pastikan SEMUA font kustom yang sudah diunduh sebelumnya aktif sebagai
 * @font-face di sesi ini. Dipanggil saat editor/Font Manager dibuka supaya
 * teks yang sudah memakai font kustom langsung tampil benar (tanpa ini,
 * teks akan jatuh ke font fallback karena browser belum tahu font-nya).
 */
export async function ensureInstalledFontsLoaded() {
  const installed = await getInstalledFonts();
  await Promise.all(installed.map(loadFontRecordFaces));
}

// Lacak kombinasi family+weight+style yang sudah dimuat KHUSUS untuk
// pratinjau (belum diunduh/disimpan) di sesi berjalan ini.
const previewedFaceKeys = new Set();

/**
 * Muat SATU font Font Library (belum tentu sudah diunduh) langsung dari
 * `file.url` sebagai @font-face HANYA untuk pratinjau nama font di halaman
 * Font Manager. Ini TIDAK menulis apa pun ke IndexedDB / fonts-repository —
 * hanya `document.fonts.add()` di memori untuk sesi ini, jadi hilang lagi
 * begitu halaman di-reload dan tidak menambah storage tersimpan.
 * Aman dipanggil berkali-kali untuk font yang sama (di-skip kalau sudah
 * pernah dimuat, baik lewat pratinjau ini maupun karena sudah terpasang).
 */
export async function ensureLibraryFontPreviewLoaded(libraryFont) {
  if (typeof FontFace === "undefined") return;
  const sourceFiles = Array.isArray(libraryFont.files) ? libraryFont.files : [];
  await Promise.all(
    sourceFiles.map(async (file) => {
      const weight = file.weight || 400;
      const style = file.style || "normal";
      const key = faceKey(libraryFont.family, weight, style);
      if (loadedFaceKeys.has(key) || previewedFaceKeys.has(key)) return;
      try {
        const res = await fetch(file.url);
        if (!res.ok) throw new Error(`Gagal memuat pratinjau: ${file.url}`);
        const buffer = await res.arrayBuffer();
        const face = new FontFace(libraryFont.family, buffer, { weight: String(weight), style });
        await face.load();
        document.fonts.add(face);
        previewedFaceKeys.add(key);
      } catch (err) {
        console.error(`Gagal memuat pratinjau font "${libraryFont.family}":`, err);
      }
    })
  );
}

/* ------------------------------------------------------------------ */
/* Unduh / hapus font dari Font Library                                */
/* ------------------------------------------------------------------ */

/**
 * Unduh satu font dari Font Library (berdasarkan entri manifest.json) ke
 * IndexedDB, lalu langsung aktifkan sebagai @font-face supaya bisa dipakai
 * seketika tanpa perlu reload halaman.
 */
export async function installFont(libraryFont) {
  const sourceFiles = Array.isArray(libraryFont.files) ? libraryFont.files : [];
  if (sourceFiles.length === 0) {
    throw new Error(`Font "${libraryFont.name}" tidak punya berkas untuk diunduh.`);
  }

  const files = [];
  for (const file of sourceFiles) {
    const res = await fetch(file.url);
    if (!res.ok) throw new Error(`Gagal mengunduh berkas font: ${file.url}`);
    // Simpan sebagai ArrayBuffer (bytes), BUKAN Blob mentah — menyimpan
    // Blob langsung ke IndexedDB tidak reliable di sejumlah browser (lihat
    // catatan di createAssetRecord(), db/schema.js). `blob.type` tetap
    // dipakai buat isi `mimeType` sebelum dibuang, karena ArrayBuffer
    // sendiri tidak menyimpan info tipe.
    const blob = await res.blob();
    const bytes = await blob.arrayBuffer();
    files.push({
      weight: file.weight || 400,
      style: file.style || "normal",
      mimeType: blob.type || "font/woff2",
      bytes,
    });
  }

  const record = createFontRecord({
    id: libraryFont.id,
    name: libraryFont.name,
    family: libraryFont.family,
    category: libraryFont.category,
    files,
  });

  await fontsRepository.putFont(record);
  await loadFontRecordFaces(record);
  return record;
}

/** Hapus font kustom yang sudah diunduh dari penyimpanan lokal (IndexedDB). */
export async function removeFont(id) {
  await fontsRepository.deleteFont(id);
  // Catatan: tidak ada API standar untuk "melepas" FontFace yang sudah
  // sempat ditambahkan ke `document.fonts` pada sesi yang sedang berjalan
  // ini — teks yang kebetulan masih memakai font ini di layar saat ini
  // tetap tampil sampai halaman dimuat ulang. Sesi berikutnya tidak akan
  // memuatnya lagi karena recordnya sudah tidak ada di IndexedDB.
}
