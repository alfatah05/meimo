/**
 * meimo-import.js
 * Impor satu file `.meimo` (hasil ekspor meimo-export.js) jadi catatan BARU
 * di device ini. Lihat README.md bagian "Format Ekspor .meimo" §2 untuk
 * alur lengkapnya.
 *
 * TIDAK mengimpor db.js/notes-repository.js langsung — semua penulisan
 * data lewat document-service.js, sama seperti modul lain.
 */

import * as documentService from "./document-service.js";
import { readZipEntries } from "../utils/zip-reader.js";
import { MEIMO_FORMAT_VERSION } from "./meimo-export.js";
import { uuid } from "../utils/uuid.js";

/** Cari entry berdasarkan nama persis di dalam hasil readZipEntries(). */
function findEntry(entries, name) {
  return entries.find((e) => e.name === name);
}

/** Bawa `metadata.cardStyle` (kustomisasi kartu — font judul, bentuk edge,
 * warna latar, gambar latar) dari dokumen sumber, dengan `bgImageAssetId`
 * disambungkan ulang ke id asset BARU lewat `idMap` yang sama dipakai untuk
 * block image & musik (lihat loop assetManifest di importMeimoFile()).
 * Field lain di `metadata` (pinned/archived/trashed/dst.) SENGAJA TIDAK ikut
 * dibawa — itu status khusus per-device, lihat komentar di newDoc di bawah —
 * cuma cardStyle yang merupakan preferensi tampilan milik note itu sendiri. */
function remapCardStyle(sourceMetadata, idMap) {
  const cardStyle = sourceMetadata?.cardStyle;
  if (!cardStyle) return null;

  let bgImageAssetId = cardStyle.bgImageAssetId || null;
  if (bgImageAssetId) {
    // Kalau assetnya tidak ketemu di idMap (mis. hilang dari zip / gagal
    // disimpan ulang), jangan pertahankan id LAMA — id itu tidak berarti
    // apa-apa di device ini dan bisa nunjuk ke asset lain yang kebetulan
    // punya id sama. Lebih aman jatuh ke "tanpa gambar latar" daripada
    // kartu rusak nunjuk ke asset yang salah.
    bgImageAssetId = idMap.has(bgImageAssetId) ? idMap.get(bgImageAssetId) : null;
  }

  return { ...cardStyle, bgImageAssetId };
}

/**
 * Impor satu `File`/`Blob` `.meimo` jadi catatan baru.
 * @param {File|Blob} file
 * @returns {Promise<{noteId: string, title: string}>}
 */
export async function importMeimoFile(file) {
  if (!file) throw new Error("Tidak ada file yang dipilih.");

  const buf = await file.arrayBuffer();
  return importMeimoBytes(buf);
}

/**
 * Sama seperti importMeimoFile(), tapi terima bytes zip `.meimo` mentah
 * (ArrayBuffer/Uint8Array) langsung, bukan `File`/`Blob`. Dipisah supaya
 * bisa dipakai ulang oleh `backup-restore.js` (impor sekaligus banyak
 * `.meimo` dari dalam satu file `.zip` cadangan) — di jalur itu bytes-nya
 * sudah didapat dari entry `readZipEntries()` milik zip LUAR, jadi tidak
 * ada `File`/`Blob` yang bisa dipanggilkan `.arrayBuffer()` lagi.
 * @param {ArrayBuffer|Uint8Array} bytes
 * @returns {Promise<{noteId: string, title: string}>}
 */
export async function importMeimoBytes(bytes) {
  const entries = await readZipEntries(bytes);

  const docEntry = findEntry(entries, "document.json");
  if (!docEntry) {
    throw new Error("Bukan file .meimo yang valid (document.json tidak ditemukan).");
  }

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(docEntry.data));
  } catch {
    throw new Error("Bukan file .meimo yang valid (document.json rusak/tidak bisa dibaca).");
  }

  const formatVersion = payload?.meimoExport?.formatVersion;
  if (formatVersion !== MEIMO_FORMAT_VERSION) {
    // Sengaja ditolak tegas (bukan dipaksa lanjut menebak-nebak struktur)
    // supaya kalau formatnya berubah di masa depan, user dapat pesan yang
    // jelas alih-alih note yang ke-import setengah rusak.
    throw new Error(
      `Versi format file .meimo ini (${formatVersion ?? "tidak dikenal"}) tidak didukung ` +
        `versi app saat ini (${MEIMO_FORMAT_VERSION}).`
    );
  }

  const sourceDoc = payload.document;
  const assetManifest = Array.isArray(payload.assets) ? payload.assets : [];
  if (!sourceDoc || !Array.isArray(sourceDoc.blocks)) {
    throw new Error("Bukan file .meimo yang valid (struktur dokumen tidak lengkap).");
  }

  // `document.id` WAJIB diganti baru — jangan pernah pakai id dari file
  // apa adanya, supaya tidak tabrakan/menimpa note lain yang kebetulan
  // sudah ada dengan id yang sama di device ini (mis. import file .meimo
  // yang sama dua kali, atau device asal & tujuan kebetulan pernah sinkron
  // sebagian). Block id & sceneId di DALAM dokumen TIDAK perlu diganti —
  // itu cuma unik dalam lingkup satu dokumen, bukan lintas note.
  const newNoteId = uuid();

  // assetId lama -> assetId baru, diisi SETELAH tiap asset benar-benar
  // tersimpan ke IndexedDB (saveImageAsset() men-generate id-nya sendiri,
  // lihat document-service.js) — bukan digenerate duluan lalu dipaksakan,
  // supaya tetap lewat satu jalur API yang sama dengan upload gambar/musik
  // biasa, tidak butuh ubah document-service.js sama sekali.
  const idMap = new Map();
  for (const manifestEntry of assetManifest) {
    const zipEntry = findEntry(entries, manifestEntry.file);
    if (!zipEntry) continue; // asset hilang dari zip — lewati, jangan gagalkan seluruh impor
    // SENGAJA tidak langsung pakai `zipEntry.data.buffer` — kalau `data`
    // ternyata sebuah VIEW ke buffer yang lebih besar (bukan copy berdiri
    // sendiri), `.buffer` akan mengembalikan buffer BESAR itu utuh, bukan
    // cuma bagian punya entry ini (lihat catatan panjang & bug yang pernah
    // kejadian karena ini di zip-reader.js). Potong eksplisit sesuai
    // byteOffset/byteLength-nya sendiri supaya PASTI cuma byte milik asset
    // ini, apa pun implementasi zip-reader.js ke depannya.
    const assetArrayBuffer = zipEntry.data.buffer.slice(
      zipEntry.data.byteOffset,
      zipEntry.data.byteOffset + zipEntry.data.byteLength
    );
    const newAssetId = await documentService.saveImageAsset(
      newNoteId,
      assetArrayBuffer,
      manifestEntry.mimeType
    );
    idMap.set(manifestEntry.assetId, newAssetId);
  }

  const remappedBlocks = sourceDoc.blocks.map((block) => {
    if (block.type === "image" && block.assetId && idMap.has(block.assetId)) {
      return { ...block, assetId: idMap.get(block.assetId) };
    }
    return block;
  });

  const remappedMusic = {};
  for (const [key, meta] of Object.entries(sourceDoc.music || {})) {
    if (meta && meta.assetId && idMap.has(meta.assetId)) {
      remappedMusic[key] = { ...meta, assetId: idMap.get(meta.assetId) };
    } else {
      remappedMusic[key] = meta;
    }
  }

  // metadata.cardStyle DIBAWA (dengan bgImageAssetId disambungkan ulang ke
  // asset baru di atas) — ini preferensi tampilan kartu milik note itu
  // sendiri, bukan status per-device seperti pinned/archived/trashed di
  // bawah, jadi wajar ikut pindah bareng note-nya. `null` (tidak pernah
  // dikustomisasi di device asal) tetap dibiarkan `null` supaya kartu pakai
  // tampilan default seperti biasa, bukan dipaksa jadi objek cardStyle kosong.
  const cardStyle = remapCardStyle(sourceDoc.metadata, idMap);

  const now = new Date().toISOString();
  const newDoc = {
    schemaVersion: sourceDoc.schemaVersion,
    id: newNoteId,
    title: sourceDoc.title || "",
    // createdAt historis dipertahankan (kapan CATATANNYA pertama kali
    // dibuat di device asal) — updatedAt di-set ke sekarang karena secara
    // teknis ini "penulisan baru" di device ini.
    createdAt: sourceDoc.createdAt || now,
    updatedAt: now,
    // Field status per-device (pinned/archived/trashed/dst.) SENGAJA di-reset
    // total (BUKAN dibawa dari file) — status itu punya makna khusus per
    // device, bukan sesuatu yang masuk akal dibawa lintas device begitu
    // saja. `cardStyle` beda cerita: itu preferensi TAMPILAN note-nya
    // sendiri (lihat remapCardStyle() di atas), jadi ikut dibawa kalau ada.
    // documentService.saveNote() akan melengkapi field metadata lain yang
    // belum diisi di sini dengan default-nya (lihat createDefaultMetadata()
    // di db/schema.js) — jadi cukup taruh cardStyle saja di sini.
    metadata: cardStyle ? { cardStyle } : {},
    blocks: remappedBlocks,
    scenes: sourceDoc.scenes || {},
    music: remappedMusic,
    // Style judul (font/warna/ukuran/align/letterSpacing/bold — lihat
    // editor/title-style.js) SEBELUMNYA TIDAK ikut dibawa karena newDoc
    // dibangun field-by-field tanpa menyalinnya dari sourceDoc sama sekali.
    // Ini bukan status per-device seperti metadata di atas, jadi wajar ikut
    // pindah bareng note-nya.
    titleStyle: sourceDoc.titleStyle || null,
  };

  const saved = await documentService.saveNote(newDoc);
  if (!saved) {
    throw new Error("Catatan di file ini kosong, tidak ada yang bisa diimpor.");
  }

  return { noteId: saved.id, title: saved.title || "Tanpa judul" };
}
