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
import { uuid } from "../utils/uuid.js";

const FONT_LIBRARY_MANIFEST_URL = "/assets/fonts/library/manifest.json";

// Ekstensi berkas font yang diterima untuk Unggah Font Eksternal, dipetakan
// ke mimeType yang dipakai FontFace API (beberapa OS/browser tidak selalu
// mengisi `file.type` dengan benar untuk berkas font, jadi kita tentukan
// sendiri dari ekstensi sebagai fallback yang lebih bisa diandalkan).
const CUSTOM_FONT_MIME_BY_EXT = {
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
};

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

/**
 * Ambil hanya font yang diunggah manual user (bukan dari Font Library) —
 * dipakai halaman Kelola Font untuk render section "Font Kustom (Unggah)"
 * terpisah dari section Font Library.
 */
export async function getUploadedFonts() {
  const installed = await getInstalledFonts();
  return installed.filter((f) => f.source === "upload");
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
 * Tiap entri juga dikasih `source` ("builtin"/"library"/"upload", dipakai
 * tab "Font Impor" di Font Family bar untuk memfilter khusus font hasil
 * unggahan sendiri) dan `favorite` (lihat bagian Font Favorit di bawah).
 */
export async function getAvailableFonts() {
  const installed = await getInstalledFonts();
  const favoriteIds = readFavoriteFontIds();
  const installedSimplified = installed
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((f) => ({
      id: f.id,
      name: f.name,
      family: f.family,
      builtin: false,
      source: f.source || "library",
    }));
  const builtinSimplified = BUILTIN_FONTS.map((f) => ({ ...f, source: "builtin" }));
  return [...builtinSimplified, ...installedSimplified].map((f) => ({
    ...f,
    favorite: favoriteIds.has(f.id),
  }));
}

/* ------------------------------------------------------------------ */
/* Font Favorit                                                        */
/* ------------------------------------------------------------------ */

// Disimpan di localStorage (bukan IndexedDB) — bertanda "favorit" itu
// sendiri cukup ringan (cuma daftar id) dan perlu mencakup font BAWAAN
// (Inter/Georgia) yang memang sengaja TIDAK punya record di object store
// `fonts` sama sekali (lihat BUILTIN_FONTS di atas), jadi tidak ada
// tempat alami di IndexedDB untuk menempelkan flag ini tanpa menambah
// object store/migrasi baru. Pola localStorage yang sama sudah dipakai
// `seed-default-notes.js` untuk flag ringan serupa.
const FAVORITE_FONTS_KEY = "meimo:favoriteFontIds";

function readFavoriteFontIds() {
  try {
    const raw = localStorage.getItem(FAVORITE_FONTS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (err) {
    console.error("Gagal membaca daftar font favorit:", err);
    return new Set();
  }
}

function writeFavoriteFontIds(ids) {
  try {
    localStorage.setItem(FAVORITE_FONTS_KEY, JSON.stringify([...ids]));
  } catch (err) {
    console.error("Gagal menyimpan daftar font favorit:", err);
  }
}

/** True bila font (id builtin/library/upload) sedang ditandai favorit. */
export function isFontFavorite(id) {
  return readFavoriteFontIds().has(id);
}

/**
 * Balik status favorit sebuah font (favorit -> bukan, bukan -> favorit).
 * Mengembalikan status favorit YANG BARU (boolean) supaya pemanggil bisa
 * langsung update UI tanpa perlu baca ulang.
 */
export function toggleFontFavorite(id) {
  const ids = readFavoriteFontIds();
  const next = !ids.has(id);
  if (next) ids.add(id);
  else ids.delete(id);
  writeFavoriteFontIds(ids);
  return next;
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
    source: "library",
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

/* ------------------------------------------------------------------ */
/* Unggah font eksternal (berkas .ttf/.otf/.woff/.woff2 dari perangkat) */
/* ------------------------------------------------------------------ */

/** Ekstensi berkas (huruf kecil, tanpa titik) dari nama file, "" bila tidak ada. */
function getFileExtension(filename) {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

/**
 * Nama tampilan default dari nama berkas: buang ekstensi, ganti `-`/`_`
 * dengan spasi, lalu rapikan spasi ganda — dipakai sebagai `name` DAN basis
 * `family` (CSS `font-family`) untuk font kustom yang diunggah, karena kita
 * tidak mem-parsing tabel nama internal berkas font (`name` table), cukup
 * memberi label kita sendiri ke FontFace API.
 */
function deriveNameFromFilename(filename) {
  const withoutExt = filename.replace(/\.[^.]+$/, "");
  const spaced = withoutExt.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return spaced || "Font Kustom";
}

/**
 * Pastikan `family` tidak bentrok dengan font yang sudah ada (bawaan,
 * Font Library yang sudah diunduh, atau upload sebelumnya) — kalau
 * bentrok, tambahkan " (2)", " (3)" dst supaya @font-face masing-masing
 * tetap independen (family sama persis akan saling menimpa di
 * `document.fonts`).
 */
async function ensureUniqueFamily(baseName) {
  const [installed] = await Promise.all([getInstalledFonts()]);
  const taken = new Set([
    ...BUILTIN_FONTS.map((f) => f.family.toLowerCase()),
    ...installed.map((f) => f.family.toLowerCase()),
  ]);
  if (!taken.has(baseName.toLowerCase())) return baseName;
  let n = 2;
  while (taken.has(`${baseName} (${n})`.toLowerCase())) n++;
  return `${baseName} (${n})`;
}

/**
 * Unggah satu berkas font eksternal (.ttf/.otf/.woff/.woff2) dari perangkat
 * user, validasi dengan benar-benar memuatnya lewat FontFace API (menolak
 * berkas yang korup/bukan font sama sekali), lalu simpan ke IndexedDB persis
 * seperti font hasil unduhan Font Library — supaya otomatis muncul juga di
 * dropdown Font Family editor lewat getAvailableFonts().
 * @param {File} file
 */
export async function installCustomFont(file) {
  const ext = getFileExtension(file.name);
  if (!CUSTOM_FONT_MIME_BY_EXT[ext]) {
    throw new Error("Format berkas tidak didukung. Gunakan .ttf, .otf, .woff, atau .woff2.");
  }

  const bytes = await file.arrayBuffer();
  const family = await ensureUniqueFamily(deriveNameFromFilename(file.name));

  // Validasi dengan memuat sungguhan lewat FontFace API DULU sebelum
  // disimpan ke IndexedDB — kalau berkasnya korup/bukan font, `face.load()`
  // akan reject dan kita gagal lebih awal dengan pesan jelas, bukan
  // menyimpan record rusak yang nanti gagal dipakai diam-diam di editor.
  if (typeof FontFace === "undefined") {
    throw new Error("Perangkat/browser ini tidak mendukung pemuatan font kustom.");
  }
  let face;
  try {
    face = new FontFace(family, bytes);
    await face.load();
  } catch (err) {
    throw new Error("Berkas font tidak valid atau rusak.");
  }

  const record = createFontRecord({
    id: `custom-${uuid()}`,
    name: deriveNameFromFilename(file.name),
    family,
    category: "Kustom",
    files: [{ weight: 400, style: "normal", mimeType: CUSTOM_FONT_MIME_BY_EXT[ext], bytes }],
    source: "upload",
  });

  await fontsRepository.putFont(record);
  document.fonts.add(face);
  loadedFaceKeys.add(faceKey(family, 400, "normal"));
  return record;
}
