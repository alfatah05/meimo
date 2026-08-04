/**
 * schema.js
 * Definisi bentuk (shape) default record yang disimpan — mengikuti
 * docs/DOCUMENT_MODEL.md. Sejak app ini pindah ke penyimpanan file lewat
 * Capacitor Filesystem (lihat db/fs-storage.js, notes-repository.js,
 * fonts-repository.js), file ini murni definisi bentuk data — tidak ada
 * lagi konsep "database"/"object store" (itu istilah IndexedDB lama).
 */

/** Versi skema dokumen (top-level `schemaVersion`), lihat DOCUMENT_MODEL.md §2. */
export const DOCUMENT_SCHEMA_VERSION = 1;

/** Metadata default untuk dokumen baru — lihat DOCUMENT_MODEL.md §3. */
export function createDefaultMetadata() {
  return {
    pinned: false,
    archived: false,
    trashed: false,
    trashedAt: null,
    theme: null,
    tags: [],
    wordCount: 0,
    // Kustomisasi tampilan kartu (per-note) di Notes List — lihat
    // createDefaultCardStyle() di bawah & src/js/notes/card-style-presets.js
    // untuk pilihan yang valid. `null` = pakai tampilan kartu default (belum
    // pernah dikustomisasi).
    cardStyle: null,
  };
}

/**
 * Bentuk (shape) satu objek kustomisasi kartu note — lihat fitur
 * "Kustomisasi Kartu" (halaman card-style.html / src/js/notes/card-style.js),
 * dibuka lewat menu titik-tiga di tiap note card (src/js/notes/note-card.js).
 * Semua field opsional/bisa `null` yang berarti "pakai default bawaan tema".
 */
export function createDefaultCardStyle() {
  return {
    // Nama font (CSS font-family) untuk judul kartu, mis. "Georgia".
    // `null` = pakai font UI default (--font-ui, lihat variables.css).
    titleFont: null,
    // id preset bentuk edge/keliling kartu — lihat EDGE_SHAPES di
    // card-style-presets.js (mis. "default", "sharp", "pill", "organic").
    edgeShape: "default",
    // Warna latar kartu (hex). `null` = pakai --color-surface tema aktif.
    bgColor: null,
    // id asset gambar latar (object store `assets`, lihat createAssetRecord
    // di atas) — opsional. `null` = tidak ada gambar latar.
    bgImageAssetId: null,
    // Opacity gambar latar, 0 (transparan penuh) s/d 1 (penuh terlihat).
    // Hanya berlaku kalau bgImageAssetId terisi.
    bgImageOpacity: 1,
  };
}

/**
 * Bentuk record asset gambar di object store `assets`.
 * Data biner disimpan terpisah dari dokumen (lihat DOCUMENT_MODEL.md §6.3)
 * supaya dokumen JSON tetap ringan.
 *
 * PENTING: data biner disimpan sebagai `bytes` (ArrayBuffer), BUKAN sebagai
 * objek `Blob`/`File` langsung. Menyimpan Blob langsung ke IndexedDB
 * terbukti gagal secara intermiten khusus di Chrome Android dengan error
 * "Failed to write blobs (InvalidBlob)" — kemungkinan besar karena referensi
 * file dari native photo picker sudah tidak valid lagi di titik commit
 * transaksi. ArrayBuffer adalah data mentah tersalin penuh ke memori JS,
 * jadi tidak bergantung pada referensi file eksternal apa pun — jauh lebih
 * aman ditulis (baik ke IndexedDB dulu, maupun ke file lewat fs-storage.js
 * sekarang).
 *
 * `blob` tetap diterima sebagai parameter untuk KOMPATIBILITAS MUNDUR saja
 * (mis. dipanggil dari kode lama / data lama) — pemanggil baru (lihat
 * services/document-service.js saveImageAsset()) SEHARUSNYA selalu mengirim
 * `bytes`, bukan `blob`.
 */
export function createAssetRecord({ id, noteId, bytes, blob, mimeType, createdAt } = {}) {
  return {
    id,
    noteId,
    bytes: bytes || null,
    // `blob` cuma diisi kalau caller memang mengirimnya (jalur lama) —
    // caller baru tidak pernah mengirim `blob`, jadi field ini `null` untuk
    // semua asset baru mulai sekarang.
    blob: bytes ? null : blob || null,
    mimeType: mimeType || (blob && blob.type) || "application/octet-stream",
    createdAt: createdAt || new Date().toISOString(),
  };
}

/**
 * Bentuk record satu font kustom (hasil unduh dari Font Library) di object
 * store `fonts`. Satu record = satu font, bisa punya beberapa berkas
 * (per weight/style) — lihat font-service.js `installFont()`.
 *   files: Array<{ weight: number, style: 'normal'|'italic', mimeType: string, bytes: ArrayBuffer }>
 *
 * PENTING: data biner disimpan sebagai `bytes` (ArrayBuffer), BUKAN sebagai
 * objek `Blob` langsung — sama seperti alasan di createAssetRecord() di
 * atas: menyimpan Blob mentah ke IndexedDB terbukti tidak reliable di
 * sejumlah browser (gagal ditulis / gagal dibaca ulang secara intermiten).
 * ArrayBuffer adalah data mentah tersalin penuh ke memori JS, jadi jauh
 * lebih aman ditulis ke IndexedDB di semua browser.
 */
export function createFontRecord({ id, name, family, category, files, installedAt } = {}) {
  return {
    id,
    name,
    family,
    category: category || null,
    files: files || [],
    installedAt: installedAt || new Date().toISOString(),
  };
}
