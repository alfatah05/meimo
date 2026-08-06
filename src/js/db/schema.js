/**
 * schema.js
 * Definisi struktur/skema penyimpanan dokumen di IndexedDB: nama database,
 * versi, object store, index, serta bentuk (shape) default record yang
 * disimpan — mengikuti docs/DOCUMENT_MODEL.md.
 *
 * File ini TIDAK membuka koneksi IndexedDB (itu tugas db.js) dan TIDAK
 * melakukan operasi CRUD (itu tugas notes-repository.js). Ia murni
 * mendefinisikan "bentuk" penyimpanan.
 */

/** Nama & versi database IndexedDB. */
export const DB_NAME = "personal-notes-db";
// v2: tambah object store FONTS (font kustom yang diunduh dari Font Library
// untuk fitur Font Family di editor — lihat src/js/services/font-service.js).
export const DB_VERSION = 2;

/** Versi skema dokumen (top-level `schemaVersion`), lihat DOCUMENT_MODEL.md §2. */
export const DOCUMENT_SCHEMA_VERSION = 1;

/** Nama object store. */
export const STORES = {
  NOTES: "notes",
  ASSETS: "assets",
  FONTS: "fonts",
};

/**
 * Dipanggil dari db.js saat `onupgradeneeded`. Membuat object store & index
 * bila belum ada. Aman dipanggil berulang antar versi (idempotent per store).
 */
export function applyUpgrade(db) {
  let notesStore;
  if (!db.objectStoreNames.contains(STORES.NOTES)) {
    notesStore = db.createObjectStore(STORES.NOTES, { keyPath: "id" });
  }
  if (notesStore) {
    // Index untuk Notes List: sorting (Last Edited/Created/Alphabet) &
    // filter (Pinned/Archived/Trash) tanpa perlu scan seluruh store.
    notesStore.createIndex("updatedAt", "updatedAt", { unique: false });
    notesStore.createIndex("createdAt", "createdAt", { unique: false });
    notesStore.createIndex("title", "title", { unique: false });
    notesStore.createIndex("trashed", "metadata.trashed", { unique: false });
    notesStore.createIndex("pinned", "metadata.pinned", { unique: false });
    notesStore.createIndex("archived", "metadata.archived", { unique: false });
  }

  let assetsStore;
  if (!db.objectStoreNames.contains(STORES.ASSETS)) {
    assetsStore = db.createObjectStore(STORES.ASSETS, { keyPath: "id" });
  }
  if (assetsStore) {
    // Dipakai untuk menghapus semua asset gambar milik satu note (mis. saat
    // note dihapus permanen dari Trash).
    assetsStore.createIndex("noteId", "noteId", { unique: false });
  }

  let fontsStore;
  if (!db.objectStoreNames.contains(STORES.FONTS)) {
    // Font yang sudah diunduh user dari halaman Font Manager (font-manager.html).
    // Berkas biner font (Blob) disimpan langsung di sini per record — lihat
    // createFontRecord() di bawah. 2 font bawaan (Inter & Georgia) TIDAK
    // disimpan di sini — keduanya selalu tersedia lewat kode
    // (src/js/services/font-service.js `BUILTIN_FONTS`), tidak perlu diunduh.
    fontsStore = db.createObjectStore(STORES.FONTS, { keyPath: "id" });
  }
  if (fontsStore) {
    fontsStore.createIndex("installedAt", "installedAt", { unique: false });
  }
}

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
 * transaksi (lihat db/db.js untuk catatan terkait tab backgrounding saat
 * picker foto terbuka). ArrayBuffer adalah data mentah tersalin penuh ke
 * memori JS, jadi tidak bergantung pada referensi file eksternal apa pun —
 * jauh lebih aman ditulis ke IndexedDB di semua browser.
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
export function createFontRecord({ id, name, family, category, files, installedAt, source } = {}) {
  return {
    id,
    name,
    family,
    category: category || null,
    files: files || [],
    installedAt: installedAt || new Date().toISOString(),
    // "library": diunduh dari Font Library (assets/fonts/library/manifest.json).
    // "upload": diunggah manual user sendiri dari berkas font eksternal lewat
    // halaman Kelola Font (lihat font-service.js installCustomFont()).
    source: source || "library",
  };
}
