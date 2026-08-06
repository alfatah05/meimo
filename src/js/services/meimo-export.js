/**
 * meimo-export.js
 * Ekspor SATU catatan jadi satu file `.meimo` — file zip custom-extension
 * berisi `document.json` (isi dokumen) + folder `assets/` (gambar & musik
 * yang dipakai dokumen itu). Lihat README.md bagian "Format Ekspor .meimo"
 * untuk detail struktur zip-nya & alasan tiap keputusan.
 *
 * Dua konsumen modul ini:
 *   - exportNoteAsMeimo(doc): ekspor SATU note, langsung memicu unduhan
 *     `.meimo`-nya sendiri — dipakai item menu "Download" di menu
 *     titik-tiga note card (Home maupun Arsip), lihat notes/download-note.js
 *     & notes/note-card.js openCardMenu(). Sebelumnya ini tombol "Ekspor
 *     .meimo" per-baris di cadangkan.html, sudah dipindah ke sini.
 *   - buildMeimoZipBytes(doc): versi "mentah" (bytes zip-nya saja, TANPA
 *     memicu unduhan) yang dipakai ULANG oleh backup-service.js
 *     (exportAllNotesAsMeimoZip) untuk membungkus SEMUA note, satu
 *     `.meimo` per note, jadi satu file `.zip` cadangan — supaya format
 *     `.meimo` per-note yang dihasilkan PERSIS SAMA di kedua jalur, tidak
 *     ada assembly logic yang digandakan/berisiko drift.
 *
 * "Lengkap" di sini termasuk kustomisasi tampilan per-note: `titleStyle`
 * (font/warna/ukuran judul, lihat editor/title-style.js) dan
 * `metadata.cardStyle` (kustomisasi kartu di Notes List, lihat
 * notes/card-style.js) — keduanya bagian dari `doc` yang diserialisasi apa
 * adanya ke `document.json` di bawah, jadi otomatis ikut terbawa tanpa
 * perlakuan khusus di sisi Export. Yang butuh perlakuan khusus cuma asset
 * biner yang dirujuknya (lihat collectReferencedAssetIds() di bawah) &
 * pemulihan referensinya di sisi Import (lihat meimo-import.js).
 *
 * TIDAK mengimpor db.js/notes-repository.js langsung — semua akses data
 * lewat document-service.js, sama seperti modul lain (lihat catatan
 * arsitektur di app.js).
 */

import * as documentService from "./document-service.js";
import { buildZipBlob } from "../utils/zip-writer.js";
import { saveOrShareBlob } from "../utils/native-share.js";


// Versi format file .meimo itu sendiri (BEDA dari DOCUMENT_SCHEMA_VERSION
// di db/schema.js, yang itu versi struktur `document.json` internal app).
// Dinaikkan kalau struktur zip-nya sendiri berubah (mis. nambah folder
// baru selain assets/), supaya Import versi lama bisa tetap kasih pesan
// yang jelas ke user alih-alih gagal diam-diam.
export const MEIMO_FORMAT_VERSION = 1;
const MEIMO_MIME_TYPE = "application/x-meimo+zip";

/** Ekstensi file berdasarkan mimeType asset — dipakai biar nama file di
 * dalam folder assets/ enak dibaca kalau di-unzip manual (bukan cuma demi
 * fungsionalitas — mimeType asli tetap disimpan di manifest `assets` pada
 * document.json, jadi Import nanti TIDAK bergantung/menebak dari ekstensi
 * ini sama sekali). */
function extensionForMimeType(mimeType) {
  const map = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
  };
  return map[mimeType] || "bin";
}

/** Kumpulkan semua `assetId` yang benar-benar dirujuk dokumen (block image
 * + musik per section + gambar latar kustomisasi kartu) — SENGAJA bukan
 * documentService.getAssetsByNoteId(), supaya asset "yatim" (mis. bekas
 * gambar yang sudah dihapus dari editor tapi record binernya masih nyangkut
 * di IndexedDB — lihat catatan di commands.js removeImageBlock()) tidak ikut
 * kebawa ke dalam file ekspor.
 *
 * `metadata.cardStyle.bgImageAssetId` (lihat db/schema.js
 * createDefaultCardStyle() & notes/card-style.js) SENGAJA ikut dikumpulkan
 * di sini juga — asset itu disimpan di object store `assets` yang sama
 * dengan gambar isi catatan, jadi kalau tidak dibundle, gambar latar kartu
 * akan hilang begitu note ini di-import lagi di device lain (lihat
 * meimo-import.js remapCardStyle()). */
function collectReferencedAssetIds(doc) {
  const ids = new Set();
  for (const block of doc.blocks || []) {
    if (block.type === "image" && block.assetId) ids.add(block.assetId);
  }
  for (const meta of Object.values(doc.music || {})) {
    if (meta && meta.assetId) ids.add(meta.assetId);
  }
  const cardBgAssetId = doc.metadata?.cardStyle?.bgImageAssetId;
  if (cardBgAssetId) ids.add(cardBgAssetId);
  return [...ids];
}

/** Ambil isi biner satu asset sebagai Uint8Array, terlepas apakah record-nya
 * lama (field `blob`) atau baru (field `bytes`) — lihat catatan format di
 * db/schema.js createAssetRecord() & pola yang sama di image-service.js
 * getObjectUrl(). */
async function assetBytes(asset) {
  if (asset.bytes) return new Uint8Array(asset.bytes);
  if (asset.blob) return new Uint8Array(await asset.blob.arrayBuffer());
  return new Uint8Array(0);
}

/** Nama file aman dari judul note — buang karakter yang gak valid di nama
 * file kebanyakan OS (Windows paling ketat), rapikan spasi berlebih, dan
 * sediakan fallback kalau judulnya kosong. Diekspor (bukan cuma dipakai
 * lokal di file ini) supaya backup-service.js bisa pakai aturan sanitasi
 * nama file yang PERSIS sama saat menamai tiap entry `.meimo` di dalam
 * zip cadangan-semua-catatan — satu sumber kebenaran, tidak digandakan. */
export function safeFileNameFromTitle(title) {
  const cleaned = (title || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "Catatan tanpa judul";
}

function triggerBlobDownload(blob, fileName) {
  // Native (APK): Filesystem+Share. Web: Blob+<a download> seperti
  // sebelumnya. Lihat utils/native-share.js untuk detail & alasannya.
  return saveOrShareBlob(blob, fileName);
}

/**
 * Bangun bytes file `.meimo` (zip) untuk SATU dokumen — TIDAK memicu
 * unduhan apa pun, cuma mengembalikan bytes zip-nya. Diekstrak dari
 * exportNoteAsMeimo() (di bawah) supaya logic assembly-nya bisa dipakai
 * ulang PERSIS SAMA oleh backup-service.js (exportAllNotesAsMeimoZip) saat
 * membungkus banyak `.meimo` — satu note satu entry — jadi satu file zip
 * cadangan, tanpa duplikasi/drift antara dua jalur ekspor.
 *
 * @param {object} doc - model dokumen lengkap (lihat exportNoteAsMeimo).
 * @returns {Promise<{bytes: Uint8Array, assetCount: number}>}
 */
export async function buildMeimoZipBytes(doc) {
  if (!doc) throw new Error("Dokumen tidak valid untuk diekspor.");

  const referencedAssetIds = collectReferencedAssetIds(doc);

  const assetEntries = [];
  const assetManifest = [];
  for (const assetId of referencedAssetIds) {
    const asset = await documentService.getImageAsset(assetId); // generik: gambar & musik sama-sama lewat sini (lihat document-service.js)
    if (!asset) continue; // record hilang/rusak — lewati, jangan gagalkan seluruh ekspor
    const bytes = await assetBytes(asset);
    const ext = extensionForMimeType(asset.mimeType);
    const fileNameInZip = `assets/${assetId}.${ext}`;
    assetEntries.push({ name: fileNameInZip, data: bytes });
    assetManifest.push({ assetId, file: fileNameInZip, mimeType: asset.mimeType || null });
  }

  const payload = {
    meimoExport: {
      formatVersion: MEIMO_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      app: "meimo",
    },
    // Seluruh model dokumen apa adanya (lihat DOCUMENT_MODEL.md) — Import
    // nanti tinggal ganti `id` & assetId (lihat komentar assetManifest di
    // bawah) sebelum ditulis sebagai note baru, tanpa perlu rekonstruksi.
    document: doc,
    // Daftar eksplisit asset yang dibundle + path file-nya di dalam zip.
    // Dipakai Import untuk tahu PERSIS mana yang harus di-assign ulang ID
    // barunya & disambungkan lagi ke block/music yang merujuknya — tanpa
    // ini, Import harus menebak-nebak dari isi `blocks`/`music` sendiri.
    assets: assetManifest,
  };

  const documentJsonBytes = new TextEncoder().encode(JSON.stringify(payload, null, 2));

  const zipEntries = [{ name: "document.json", data: documentJsonBytes }, ...assetEntries];
  const zipBlob = buildZipBlob(zipEntries, MEIMO_MIME_TYPE);
  const bytes = new Uint8Array(await zipBlob.arrayBuffer());

  return { bytes, assetCount: assetEntries.length };
}

/**
 * Ekspor satu catatan (berdasarkan model dokumen yang SEDANG ada di memori
 * editor — bukan baca ulang dari IndexedDB, supaya perubahan yang belum
 * sempat di-autosave tetap ikut terekspor) jadi file `.meimo`, lalu langsung
 * memicu unduhan (web) atau Share sheet native (APK) lewat
 * utils/native-share.js.
 *
 * @param {object} doc - hasil state.getDocument() dari editor-state.js
 *   (schemaVersion, id, title, blocks, scenes, music, dst).
 * @returns {Promise<{assetCount: number, fileName: string}>}
 */
export async function exportNoteAsMeimo(doc) {
  const { bytes, assetCount } = await buildMeimoZipBytes(doc);
  const zipBlob = new Blob([bytes], { type: MEIMO_MIME_TYPE });

  const fileName = `${safeFileNameFromTitle(doc.title)}.meimo`;
  const { shared } = await triggerBlobDownload(zipBlob, fileName);

  return { assetCount, fileName, shared };
}
