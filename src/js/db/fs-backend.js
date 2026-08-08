/**
 * fs-backend.js
 * Backend penyimpanan native Capacitor — SEMUA data disimpan di
 * Directory.Data (private app folder Android/iOS).
 *
 * Struktur di dalam Directory.Data:
 *   meimo/
 *     notes/{id}.json
 *     assets/{id}.meta.json   +  assets/{id}.bin   (base64)
 *     fonts/{id}.json         (metadata + files[].bytes sebagai base64)
 *
 * Binary (gambar, font, audio) disimpan sebagai base64.
 * Tidak ada IndexedDB di jalur native ini.
 */

import { getFilesystemPlugin, getDataDirectory } from "./platform.js";

const ROOT = "meimo";
const NOTES_DIR = `${ROOT}/notes`;
const ASSETS_DIR = `${ROOT}/assets`;
const FONTS_DIR = `${ROOT}/fonts`;

/* ------------------------------------------------------------------ */
/* Helpers: base64 ↔ ArrayBuffer                                       */
/* ------------------------------------------------------------------ */

function arrayBufferToBase64(buffer) {
  if (!buffer) return "";
  const bytes =
    buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : new Uint8Array(buffer.buffer || buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  if (!base64) return new ArrayBuffer(0);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/* ------------------------------------------------------------------ */
/* Low-level FS wrappers                                               */
/* ------------------------------------------------------------------ */

function fs() {
  return getFilesystemPlugin();
}

function dir() {
  return getDataDirectory();
}

async function ensureDir(path) {
  try {
    await fs().mkdir({ path, directory: dir(), recursive: true });
  } catch (e) {
    if (e?.message && /exist|already/i.test(e.message)) return;
  }
}

async function writeJson(path, obj) {
  const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ROOT;
  await ensureDir(parent);
  await fs().writeFile({
    path,
    data: JSON.stringify(obj),
    directory: dir(),
    encoding: "utf8",
    recursive: true,
  });
}

async function readJson(path) {
  try {
    const result = await fs().readFile({
      path,
      directory: dir(),
      encoding: "utf8",
    });
    return JSON.parse(result.data);
  } catch {
    return undefined;
  }
}

async function writeBinary(path, arrayBuffer) {
  const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ROOT;
  await ensureDir(parent);
  await fs().writeFile({
    path,
    data: arrayBufferToBase64(arrayBuffer),
    directory: dir(),
    recursive: true,
  });
}

async function readBinary(path) {
  try {
    const result = await fs().readFile({
      path,
      directory: dir(),
    });
    return base64ToArrayBuffer(result.data);
  } catch {
    return null;
  }
}

async function removeFile(path) {
  try {
    await fs().deleteFile({ path, directory: dir() });
  } catch {
    // tidak ada → abaikan
  }
}

async function listDir(path) {
  try {
    const result = await fs().readdir({ path, directory: dir() });
    return (result.files || result || []).map((f) =>
      typeof f === "string" ? f : f.name
    );
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Notes                                                               */
/* ------------------------------------------------------------------ */

export async function fsPutNote(note) {
  if (!note?.id) throw new Error("Note harus punya id.");
  await writeJson(`${NOTES_DIR}/${note.id}.json`, note);
  return note;
}

export async function fsGetNoteById(id) {
  return readJson(`${NOTES_DIR}/${id}.json`);
}

export async function fsGetAllNotes() {
  await ensureDir(NOTES_DIR);
  const names = await listDir(NOTES_DIR);
  const notes = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const note = await readJson(`${NOTES_DIR}/${name}`);
    if (note) notes.push(note);
  }
  return notes;
}

export async function fsDeleteNote(id) {
  await removeFile(`${NOTES_DIR}/${id}.json`);
}

/* ------------------------------------------------------------------ */
/* Assets                                                              */
/* ------------------------------------------------------------------ */

export async function fsPutAsset(asset) {
  if (!asset?.id) throw new Error("Asset harus punya id.");
  const meta = {
    id: asset.id,
    noteId: asset.noteId,
    mimeType: asset.mimeType || "application/octet-stream",
    createdAt: asset.createdAt || new Date().toISOString(),
  };
  await writeJson(`${ASSETS_DIR}/${asset.id}.meta.json`, meta);

  let bytes = asset.bytes;
  if (!bytes && asset.blob) {
    try {
      bytes = await asset.blob.arrayBuffer();
    } catch {
      bytes = null;
    }
  }
  if (bytes) {
    await writeBinary(`${ASSETS_DIR}/${asset.id}.bin`, bytes);
  }
  return asset;
}

export async function fsGetAssetById(id) {
  const meta = await readJson(`${ASSETS_DIR}/${id}.meta.json`);
  if (!meta) return undefined;
  const bytes = await readBinary(`${ASSETS_DIR}/${id}.bin`);
  return {
    ...meta,
    bytes: bytes || null,
    blob: null,
  };
}

export async function fsGetAssetsByNoteId(noteId) {
  await ensureDir(ASSETS_DIR);
  const names = await listDir(ASSETS_DIR);
  const assets = [];
  for (const name of names) {
    if (!name.endsWith(".meta.json")) continue;
    const meta = await readJson(`${ASSETS_DIR}/${name}`);
    if (!meta || meta.noteId !== noteId) continue;
    const bytes = await readBinary(`${ASSETS_DIR}/${meta.id}.bin`);
    assets.push({
      ...meta,
      bytes: bytes || null,
      blob: null,
    });
  }
  return assets;
}

export async function fsDeleteAsset(id) {
  await removeFile(`${ASSETS_DIR}/${id}.meta.json`);
  await removeFile(`${ASSETS_DIR}/${id}.bin`);
}

export async function fsDeleteAssetsByNoteId(noteId) {
  const assets = await fsGetAssetsByNoteId(noteId);
  for (const a of assets) {
    await fsDeleteAsset(a.id);
  }
}

/* ------------------------------------------------------------------ */
/* Fonts                                                               */
/* ------------------------------------------------------------------ */

function serializeFont(font) {
  return {
    ...font,
    files: (font.files || []).map((f) => ({
      weight: f.weight,
      style: f.style,
      mimeType: f.mimeType,
      bytesBase64: f.bytes
        ? arrayBufferToBase64(f.bytes)
        : f.bytesBase64 || "",
    })),
  };
}

function deserializeFont(raw) {
  if (!raw) return undefined;
  return {
    ...raw,
    files: (raw.files || []).map((f) => ({
      weight: f.weight,
      style: f.style,
      mimeType: f.mimeType,
      bytes: f.bytesBase64
        ? base64ToArrayBuffer(f.bytesBase64)
        : f.bytes || null,
    })),
  };
}

export async function fsPutFont(font) {
  if (!font?.id) throw new Error("Font harus punya id.");
  await writeJson(`${FONTS_DIR}/${font.id}.json`, serializeFont(font));
  return font;
}

export async function fsGetFontById(id) {
  const raw = await readJson(`${FONTS_DIR}/${id}.json`);
  return deserializeFont(raw);
}

export async function fsGetAllFonts() {
  await ensureDir(FONTS_DIR);
  const names = await listDir(FONTS_DIR);
  const fonts = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const raw = await readJson(`${FONTS_DIR}/${name}`);
    const font = deserializeFont(raw);
    if (font) fonts.push(font);
  }
  return fonts;
}

export async function fsDeleteFont(id) {
  await removeFile(`${FONTS_DIR}/${id}.json`);
}
