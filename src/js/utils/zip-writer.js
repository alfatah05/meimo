/**
 * zip-writer.js
 * Pembuat file .zip minimal, murni vanilla JS — TANPA dependency eksternal
 * (tidak ada JSZip/CDN dsb). Sengaja begitu supaya konsisten dengan prinsip
 * project ini: 100% offline-first, tanpa framework/library luar (lihat
 * README.md "Ringkasan Teknologi"). Dipakai oleh meimo-export.js untuk
 * membungkus document.json + assets jadi satu file `.meimo`.
 *
 * Method kompresi yang dipakai SELALU "STORE" (0 — tanpa kompresi), bukan
 * DEFLATE. Alasan:
 *   - Isi utama file .meimo adalah asset gambar/audio (jpg/png/mp3/dll)
 *     yang SUDAH terkompresi formatnya sendiri — DEFLATE ulang di atasnya
 *     nyaris tidak menghemat apa-apa.
 *   - document.json biasanya kecil, jadi potensi hematnya juga kecil.
 *   - STORE jauh lebih sederhana & 100% konsisten lintas browser (DEFLATE
 *     asli butuh CompressionStream API yang dukungannya belum merata),
 *     tanpa perlu fallback berlapis.
 * File .zip ber-method STORE tetap 100% valid & bisa dibuka semua tool zip
 * standar (termasuk unzip bawaan OS) — cuma tidak dikecilkan ukurannya.
 *
 * Format APPEND (belum ada write incremental) — dipanggil sekali dengan
 * seluruh entries sekaligus, cocok untuk ukuran dokumen catatan (tidak
 * dirancang untuk ratusan/ribuan entries besar).
 */

const SIG_LOCAL_FILE = 0x04034b50;
const SIG_CENTRAL_DIR = 0x02014b50;
const SIG_END_OF_CENTRAL_DIR = 0x06054b50;

/** Encoder kecil little-endian — dipakai buat nyusun tiap header binary zip. */
class ByteWriter {
  constructor() {
    this.chunks = [];
    this.length = 0;
  }
  u16(value) {
    const buf = new Uint8Array(2);
    buf[0] = value & 0xff;
    buf[1] = (value >>> 8) & 0xff;
    this.chunks.push(buf);
    this.length += 2;
    return this;
  }
  u32(value) {
    const buf = new Uint8Array(4);
    buf[0] = value & 0xff;
    buf[1] = (value >>> 8) & 0xff;
    buf[2] = (value >>> 16) & 0xff;
    buf[3] = (value >>> 24) & 0xff;
    this.chunks.push(buf);
    this.length += 4;
    return this;
  }
  bytes(uint8arr) {
    this.chunks.push(uint8arr);
    this.length += uint8arr.length;
    return this;
  }
}

// Tabel CRC32 standar (polinomial 0xEDB88320) — dihitung sekali saat modul
// dimuat, dipakai ulang untuk setiap entry. Setiap file di zip WAJIB punya
// CRC32 yang benar di header-nya (bukan cuma opsional/dekorasi) supaya tool
// unzip lain menganggapnya valid & tidak menandainya korup.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(uint8arr) {
  let crc = 0xffffffff;
  for (let i = 0; i < uint8arr.length; i++) {
    crc = CRC_TABLE[(crc ^ uint8arr[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Encode tanggal/jam JS Date ke format DOS date/time yang dipakai header zip. */
function toDosDateTime(date) {
  const dosTime =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((date.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((date.getFullYear() - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0xf) << 5) |
    (date.getDate() & 0x1f);
  return { dosTime, dosDate };
}

/**
 * Bangun Blob .zip dari daftar entries.
 * @param {Array<{name: string, data: Uint8Array}>} entries - `name` pakai
 *   forward-slash ("assets/xxx.png") untuk sub-folder, `data` isi file mentah.
 * @param {string} [mimeType] - MIME type untuk Blob hasil akhir.
 * @returns {Blob}
 */
export function buildZipBlob(entries, mimeType = "application/zip") {
  const encoder = new TextEncoder();
  const now = new Date();
  const { dosTime, dosDate } = toDosDateTime(now);

  const parts = []; // urutan final semua byte, langsung dioper ke Blob
  let offset = 0;
  const centralRecords = [];

  function pushPart(uint8arr) {
    parts.push(uint8arr);
    offset += uint8arr.length;
  }

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.data;
    const crc = crc32(data);
    const localHeaderOffset = offset;

    const local = new ByteWriter();
    local
      .u32(SIG_LOCAL_FILE)
      .u16(20) // version needed to extract
      .u16(0) // general purpose flag
      .u16(0) // compression method: 0 = STORE
      .u16(dosTime)
      .u16(dosDate)
      .u32(crc)
      .u32(data.length) // compressed size == uncompressed size (STORE)
      .u32(data.length)
      .u16(nameBytes.length)
      .u16(0); // extra field length
    for (const c of local.chunks) pushPart(c);
    pushPart(nameBytes);
    pushPart(data);

    centralRecords.push({ nameBytes, crc, size: data.length, localHeaderOffset });
  }

  const centralDirOffset = offset;
  for (const rec of centralRecords) {
    const central = new ByteWriter();
    central
      .u32(SIG_CENTRAL_DIR)
      .u16(20) // version made by
      .u16(20) // version needed to extract
      .u16(0) // general purpose flag
      .u16(0) // compression method: 0 = STORE
      .u16(dosTime)
      .u16(dosDate)
      .u32(rec.crc)
      .u32(rec.size)
      .u32(rec.size)
      .u16(rec.nameBytes.length)
      .u16(0) // extra field length
      .u16(0) // comment length
      .u16(0) // disk number start
      .u16(0) // internal file attributes
      .u32(0) // external file attributes
      .u32(rec.localHeaderOffset);
    for (const c of central.chunks) pushPart(c);
    pushPart(rec.nameBytes);
  }
  const centralDirSize = offset - centralDirOffset;

  const eocd = new ByteWriter();
  eocd
    .u32(SIG_END_OF_CENTRAL_DIR)
    .u16(0) // disk number
    .u16(0) // disk with central dir
    .u16(centralRecords.length) // entries on this disk
    .u16(centralRecords.length) // total entries
    .u32(centralDirSize)
    .u32(centralDirOffset)
    .u16(0); // comment length
  for (const c of eocd.chunks) pushPart(c);

  return new Blob(parts, { type: mimeType });
}
