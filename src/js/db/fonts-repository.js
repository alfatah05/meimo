/**
 * fonts-repository.js
 * Repository layer untuk font kustom yang sudah diunduh user — versi
 * filesystem (lewat fs-storage.js), menggantikan versi IndexedDB lama.
 * SIGNATURE setiap fungsi dipertahankan sama persis supaya font-service.js
 * tidak perlu diubah.
 *
 * Satu font record (lihat createFontRecord() di db/schema.js) berisi
 * beberapa `files[]` (per weight/style), masing-masing dengan `bytes`
 * (ArrayBuffer). Karena file font biasanya kecil (puluhan-ratusan KB),
 * seluruh record — termasuk bytes-nya (di-encode base64) — disimpan dalam
 * SATU file JSON per font di `meimo-data/fonts/<fontId>.json`, supaya
 * tidak perlu mengelola file biner terpisah.
 *
 * Arsitektur:
 *   Font Family Dropdown / Font Manager -> Font Service -> Repository (file ini) -> fs-storage.js
 *
 * Modul lain DILARANG mengimpor file ini secara langsung — semua akses
 * lewat font-service.js.
 */

import * as fs from "./fs-storage.js";

const FONTS_DIR = "meimo-data/fonts";

function fontPath(id) {
  return `${FONTS_DIR}/${id}.json`;
}

/** Serialisasi: ArrayBuffer di tiap files[].bytes -> base64 string, supaya
 * bisa ikut disimpan dalam satu file JSON. */
function serializeFont(font) {
  return {
    ...font,
    files: (font.files || []).map(({ bytes, ...rest }) => ({
      ...rest,
      bytesBase64: bytes ? fs.arrayBufferToBase64(bytes) : null,
    })),
  };
}

/** Kebalikan serializeFont() — base64 string -> ArrayBuffer lagi. */
function deserializeFont(raw) {
  if (!raw) return raw;
  return {
    ...raw,
    files: (raw.files || []).map(({ bytesBase64, ...rest }) => ({
      ...rest,
      bytes: bytesBase64 ? fs.base64ToArrayBuffer(bytesBase64) : null,
    })),
  };
}

/** Simpan (buat baru atau timpa) satu font kustom. */
export async function putFont(font) {
  await fs.writeJSON(fontPath(font.id), serializeFont(font));
  return font;
}

/** Ambil satu font berdasarkan id. `undefined` bila belum diunduh/tidak ada. */
export async function getFontById(id) {
  const raw = await fs.readJSON(fontPath(id));
  return deserializeFont(raw);
}

/** Ambil seluruh font kustom yang sudah diunduh. */
export async function getAllFonts() {
  const files = await fs.listDir(FONTS_DIR);
  const fonts = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const raw = await fs.readJSON(`${FONTS_DIR}/${file}`);
    if (raw) fonts.push(deserializeFont(raw));
  }
  return fonts;
}

/** Hapus satu font kustom secara permanen dari penyimpanan lokal. */
export async function deleteFont(id) {
  await fs.remove(fontPath(id));
}
