/**
 * fs-storage.js
 * Menggantikan db.js — satu-satunya file yang boleh memanggil API
 * `window.CapacitorFilesystem.*` mentah di seluruh aplikasi.
 *
 * Semua data (notes, assets, fonts) disimpan sebagai file JSON/biner lewat
 * plugin @capacitor/filesystem, di `Directory.External` — folder privat
 * milik app di penyimpanan eksternal Android (`getExternalFilesDir()`),
 * TIDAK butuh izin runtime, tapi ikut terhapus saat app di-uninstall.
 * (Lihat README_APK.md untuk detail & cara ganti ke folder Documents publik
 * kalau nanti mau data tetap ada setelah uninstall.)
 *
 * `window.CapacitorFilesystem` disuntik oleh vendor/capacitor-plugins.js
 * (dibundle dari @capacitor/filesystem lewat scripts/build-www.mjs) —
 * lihat tag <script> di setiap halaman HTML sebelum script module utama.
 *
 * notes-repository.js & fonts-repository.js memakai helper di sini;
 * tidak ada modul lain (editor, toolbar, notes list, dst) yang boleh
 * mengimpor file ini secara langsung — sama seperti aturan db.js dulu:
 *   Editor -> Document/Font Service -> Repository -> fs-storage.js (file ini)
 */

function api() {
  const ns = window.CapacitorFilesystem;
  if (!ns) {
    throw new Error(
      "Plugin Capacitor Filesystem belum siap. App ini harus dibuka lewat APK Android " +
        "(bukan browser biasa) — lihat README_APK.md."
    );
  }
  return ns;
}

/** True bila error kemungkinan besar berarti "file/folder tidak ada" —
 * dipakai supaya readJSON/listDir/remove/ensureDir bisa memperlakukan
 * "belum ada" sebagai kondisi normal (bukan exception), sama seperti
 * request.onsuccess dengan hasil `undefined` di IndexedDB dulu. */
function isMissingError(err) {
  const msg = (err && err.message) || "";
  return /exist/i.test(msg) || /not found/i.test(msg) || /ENOENT/i.test(msg);
}

async function ensureParentDir(path) {
  const idx = path.lastIndexOf("/");
  if (idx <= 0) return;
  await ensureDir(path.slice(0, idx));
}

/** Buat folder (rekursif) bila belum ada. Aman dipanggil berulang. */
export async function ensureDir(path) {
  const { Filesystem, Directory } = api();
  try {
    await Filesystem.mkdir({ path, directory: Directory.External, recursive: true });
  } catch (err) {
    if (!isMissingError(err)) throw err;
  }
}

/** Simpan objek sebagai file JSON (UTF-8). Menimpa bila sudah ada. */
export async function writeJSON(path, value) {
  const { Filesystem, Directory, Encoding } = api();
  await ensureParentDir(path);
  await Filesystem.writeFile({
    path,
    directory: Directory.External,
    data: JSON.stringify(value),
    encoding: Encoding.UTF8,
  });
}

/** Baca & parse file JSON. Kembalikan `undefined` bila file belum ada
 * (padanan `request.result === undefined` di IndexedDB get() dulu). */
export async function readJSON(path) {
  const { Filesystem, Directory, Encoding } = api();
  try {
    const res = await Filesystem.readFile({ path, directory: Directory.External, encoding: Encoding.UTF8 });
    return JSON.parse(res.data);
  } catch (err) {
    if (isMissingError(err)) return undefined;
    throw err;
  }
}

/** Simpan data biner (ArrayBuffer/TypedArray) sebagai file. */
export async function writeBinary(path, bytes) {
  const { Filesystem, Directory } = api();
  await ensureParentDir(path);
  await Filesystem.writeFile({
    path,
    directory: Directory.External,
    data: arrayBufferToBase64(bytes),
  });
}

/** Baca file biner, kembalikan ArrayBuffer. `undefined` bila belum ada. */
export async function readBinary(path) {
  const { Filesystem, Directory } = api();
  try {
    const res = await Filesystem.readFile({ path, directory: Directory.External });
    return base64ToArrayBuffer(res.data);
  } catch (err) {
    if (isMissingError(err)) return undefined;
    throw err;
  }
}

/** Hapus satu file. Diam saja bila memang belum/tidak ada. */
export async function remove(path) {
  const { Filesystem, Directory } = api();
  try {
    await Filesystem.deleteFile({ path, directory: Directory.External });
  } catch (err) {
    if (!isMissingError(err)) throw err;
  }
}

/** Hapus folder & seluruh isinya. Diam saja bila memang belum/tidak ada. */
export async function removeDir(path) {
  const { Filesystem, Directory } = api();
  try {
    await Filesystem.rmdir({ path, directory: Directory.External, recursive: true });
  } catch (err) {
    if (!isMissingError(err)) throw err;
  }
}

/** List nama file/folder langsung di dalam `path`. `[]` bila folder belum ada. */
export async function listDir(path) {
  const { Filesystem, Directory } = api();
  try {
    const res = await Filesystem.readdir({ path, directory: Directory.External });
    return (res.files || []).map((f) => (typeof f === "string" ? f : f.name));
  } catch (err) {
    if (isMissingError(err)) return [];
    throw err;
  }
}

/** ArrayBuffer/TypedArray -> base64 (chunked, aman untuk file besar). */
export function arrayBufferToBase64(bytesLike) {
  const bytes = bytesLike instanceof Uint8Array ? bytesLike : new Uint8Array(bytesLike);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/** base64 -> ArrayBuffer. */
export function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
