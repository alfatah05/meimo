/**
 * backup-service.js
 * Ekspor SEMUA catatan (termasuk yang di Arsip & Sampah) jadi satu file
 * cadangan yang bisa diunduh user. App ini tidak punya server/cloud sync
 * (lihat PROJECT_RULES.md — "Jangan menggunakan server"), jadi ini
 * satu-satunya cara data "dibawa keluar" dari IndexedDB perangkat.
 *
 * PERUBAHAN FORMAT: sebelumnya cadangan ini JSON polos berisi semua note
 * apa adanya, TANPA asset (gambar/musik tidak ikut terbawa) — cukup buat
 * lihat isi teksnya lagi, tapi kalau di-restore manual note yang punya
 * gambar/musik/gambar-latar-kartu bakal kehilangan media-nya sama sekali.
 * Sekarang tiap note dibungkus jadi `.meimo` masing-masing (format yang
 * SAMA PERSIS dengan tombol "Ekspor .meimo" per-baris, lihat
 * meimo-export.js — LENGKAP dengan asset & kustomisasi tampilannya), lalu
 * semua `.meimo` itu digabung jadi SATU file `.zip` — supaya satu tombol
 * "Cadangkan Semua Catatan" tetap menghasilkan satu file unduhan seperti
 * sebelumnya, tapi isinya sekarang benar-benar lengkap per note.
 *
 * Pemulihan/restore dari file ini bisa lewat tombol "Impor Cadangan (.zip)"
 * di halaman yang sama (backup-restore.js, `importMeimoBackupZip()`) — semua
 * `.meimo` di dalam zip diimpor sekaligus. Unzip manual lalu Impor tiap
 * `.meimo` satu-satu lewat tombol "Impor Catatan (.meimo)" (meimo-import.js)
 * tetap bisa dipakai juga kalau mau (lihat README.md bagian "Impor" untuk
 * detail lengkapnya).
 */

import * as documentService from "./document-service.js";
import { buildMeimoZipBytes, safeFileNameFromTitle } from "./meimo-export.js";
import { buildZipBlob } from "../utils/zip-writer.js";
import { saveOrShareBlob } from "../pwa/native-bridge.js";

// Versi format file cadangan-semua-catatan ITU SENDIRI (struktur zip
// terluarnya: daftar entry `*.meimo` + `backup-manifest.json`) — BEDA dari
// MEIMO_FORMAT_VERSION di meimo-export.js (itu format tiap `.meimo` DI
// DALAM zip ini). Ditulis ke `backup-manifest.json` untuk referensi/debug,
// tapi BELUM dibaca/divalidasi oleh backup-restore.js (`importMeimoBackupZip()`)
// — jalur impor sekaligus itu sengaja hanya mengandalkan filter nama entry
// `*.meimo` (tiap entry-nya tetap divalidasi sendiri lewat MEIMO_FORMAT_VERSION
// oleh importMeimoBytes()), supaya file yang di dalamnya kebetulan tidak
// punya `backup-manifest.json` (mis. hasil susun-ulang manual oleh user)
// tetap bisa diimpor selama entry `.meimo`-nya sendiri valid.
const BACKUP_FORMAT_VERSION = 1;

/** Bikin nama file `.meimo` di dalam zip unik walau beberapa note judulnya
 * sama persis setelah disanitasi (mis. dua-duanya "Tanpa judul") — zip
 * dengan nama entry duplikat valid secara teknis, tapi bikin bingung saat
 * di-unzip manual (entry belakangan bisa menimpa yang duluan tergantung
 * tool). Tabrakan kedua-dst diberi akhiran " (2)", " (3)", dst sebelum
 * ekstensi, sama seperti pola rename otomatis file manager kebanyakan OS. */
function uniqueZipEntryName(baseName, usedNames) {
  if (!usedNames.has(baseName)) {
    usedNames.add(baseName);
    return baseName;
  }
  const dot = baseName.lastIndexOf(".");
  const stem = dot === -1 ? baseName : baseName.slice(0, dot);
  const ext = dot === -1 ? "" : baseName.slice(dot);
  let n = 2;
  let candidate = `${stem} (${n})${ext}`;
  while (usedNames.has(candidate)) {
    n += 1;
    candidate = `${stem} (${n})${ext}`;
  }
  usedNames.add(candidate);
  return candidate;
}

// BUGFIX (dukungan app native Capacitor): <a download> ke blob: URL tidak
// berfungsi di WebView Android (tidak ada UI unduhan bawaan seperti
// browser). saveOrShareBlob() di native-bridge.js otomatis pakai jalur
// yang benar tergantung konteksnya — anchor+blob URL lama di web/PWA,
// atau tulis-ke-cache + lembar "Bagikan" native kalau di app native.
function triggerBlobDownload(blob, fileName) {
  saveOrShareBlob(blob, fileName).catch((err) => {
    console.error("Gagal menyimpan/membagikan file cadangan:", err);
  });
}

/**
 * Buat & picu unduhan satu file `.zip` berisi `.meimo` (lengkap dengan
 * asset & kustomisasi tampilan) untuk SETIAP catatan, termasuk yang di
 * Arsip & Sampah.
 *
 * @returns {Promise<{noteCount: number, assetCount: number}>} jumlah
 *   catatan & total asset (gambar/musik) yang berhasil ikut dicadangkan.
 */
export async function exportAllNotes() {
  const notes = await documentService.listNotes({ includeTrashed: true, includeArchived: true });
  if (notes.length === 0) return { noteCount: 0, assetCount: 0 };

  const usedNames = new Set();
  const zipEntries = [];
  let totalAssetCount = 0;

  for (const note of notes) {
    const { bytes, assetCount } = await buildMeimoZipBytes(note);
    const entryName = uniqueZipEntryName(`${safeFileNameFromTitle(note.title)}.meimo`, usedNames);
    zipEntries.push({ name: entryName, data: bytes });
    totalAssetCount += assetCount;
  }

  const manifest = {
    backupManifest: {
      formatVersion: BACKUP_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      app: "meimo",
      noteCount: notes.length,
    },
    // Daftar file .meimo yang dibundle, biar bisa dicek tanpa perlu buka
    // satu-satu — urutannya sama dengan entry-nya di dalam zip.
    notes: zipEntries.map((entry) => ({ file: entry.name })),
  };
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2));

  const zipBlob = buildZipBlob([{ name: "backup-manifest.json", data: manifestBytes }, ...zipEntries], "application/zip");

  const dateStr = new Date().toISOString().slice(0, 10);
  triggerBlobDownload(zipBlob, `catatan-cadangan-${dateStr}.zip`);

  return { noteCount: notes.length, assetCount: totalAssetCount };
}
