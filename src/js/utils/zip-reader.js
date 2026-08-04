/**
 * zip-reader.js
 * Pembaca file .zip minimal, murni vanilla JS — TANPA dependency eksternal,
 * pasangan dari zip-writer.js. Dipakai oleh meimo-import.js untuk membaca
 * isi file `.meimo` (document.json + assets/) yang dipilih user.
 *
 * Mendukung 2 metode kompresi per entry:
 *   - STORE (0)  — tanpa kompresi, ini yang selalu dipakai zip-writer.js kita
 *     sendiri, jadi ini jalur UTAMA yang dipakai untuk file .meimo hasil
 *     ekspor app ini sendiri.
 *   - DEFLATE (8) — didekompresi lewat DecompressionStream("deflate-raw")
 *     bawaan browser (bukan library luar) — sengaja tetap didukung sebagai
 *     jaga-jaga kalau suatu saat ada file .zip dari tool lain yang memang
 *     terkompresi, supaya Impor tidak gagal total cuma karena method-nya beda.
 * Metode lain (mis. terenkripsi/method 99) ditolak dengan pesan error yang
 * jelas, bukan gagal diam-diam.
 */

const SIG_CENTRAL_DIR = 0x02014b50;
const SIG_END_OF_CENTRAL_DIR = 0x06054b50;
const SIG_LOCAL_FILE = 0x04034b50;

const EOCD_MIN_SIZE = 22;
const MAX_COMMENT_SIZE = 65535;

class ByteReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.pos = 0;
  }
  u16() {
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }
  u32() {
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }
  skip(n) {
    this.pos += n;
  }
  slice(n) {
    const s = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return s;
  }
  text(n) {
    return new TextDecoder().decode(this.slice(n));
  }
}

/** Cari offset signature End Of Central Directory dari BELAKANG file —
 * tidak selalu persis di akhir kalau ada comment zip (kita sendiri tidak
 * pernah menulis comment, tapi file dari tool lain mungkin saja punya). */
function findEndOfCentralDir(bytes) {
  const maxScan = Math.min(bytes.length, EOCD_MIN_SIZE + MAX_COMMENT_SIZE);
  const start = bytes.length - maxScan;
  for (let i = bytes.length - EOCD_MIN_SIZE; i >= start; i--) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 &&
      bytes[i + 3] === 0x06
    ) {
      return i;
    }
  }
  return -1;
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error(
      "Berkas ini terkompresi (DEFLATE) dan browser kamu tidak mendukung dekompresinya."
    );
  }
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Baca seluruh isi file .zip jadi daftar entry { name, data }.
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {Promise<Array<{name: string, data: Uint8Array}>>}
 */
export async function readZipEntries(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  const eocdOffset = findEndOfCentralDir(bytes);
  if (eocdOffset === -1) {
    throw new Error("Bukan file .meimo yang valid (struktur zip tidak ditemukan).");
  }

  const eocd = new ByteReader(bytes.subarray(eocdOffset));
  eocd.skip(4); // signature, sudah dicek lewat pencarian di atas
  eocd.skip(2); // disk number
  eocd.skip(2); // disk with central dir
  eocd.skip(2); // entries on this disk
  const totalEntries = eocd.u16();
  eocd.skip(4); // central dir size
  const centralDirOffset = eocd.u32();

  const results = [];
  const reader = new ByteReader(bytes.subarray(centralDirOffset));

  for (let i = 0; i < totalEntries; i++) {
    const sig = reader.u32();
    if (sig !== SIG_CENTRAL_DIR) {
      throw new Error("Struktur zip rusak (central directory tidak valid).");
    }
    reader.skip(2); // version made by
    reader.skip(2); // version needed
    reader.skip(2); // general purpose flag
    const method = reader.u16();
    reader.skip(2); // last mod time
    reader.skip(2); // last mod date
    reader.skip(4); // crc32 — sengaja tidak diverifikasi ulang: cukup percaya
    // pada integritas transport file (download/unzip OS), sama seperti
    // kebanyakan pemakaian zip sehari-hari tanpa app khusus verifikasi.
    const compressedSize = reader.u32();
    reader.skip(4); // uncompressed size (dihitung ulang dari hasil dekompresi)
    const nameLen = reader.u16();
    const extraLen = reader.u16();
    const commentLen = reader.u16();
    reader.skip(2); // disk number start
    reader.skip(2); // internal attrs
    reader.skip(4); // external attrs
    const localHeaderOffset = reader.u32();
    const name = reader.text(nameLen);
    reader.skip(extraLen);
    reader.skip(commentLen);

    // Baca local file header di posisinya sendiri — panjang field
    // filename/extra di local header BISA beda dari central directory,
    // jadi tidak boleh dianggap sama & harus dibaca ulang dari sana.
    const local = new ByteReader(bytes.subarray(localHeaderOffset));
    const localSig = local.u32();
    if (localSig !== SIG_LOCAL_FILE) {
      throw new Error(`Struktur zip rusak (local header entry "${name}" tidak valid).`);
    }
    local.skip(2 + 2 + 2 + 2 + 2); // version, flag, method, time, date (dipakai dari central saja)
    local.skip(4 + 4 + 4); // crc32, compressed size, uncompressed size (dipakai dari central saja)
    const localNameLen = local.u16();
    const localExtraLen = local.u16();
    local.skip(localNameLen);
    local.skip(localExtraLen);
    const dataStart = localHeaderOffset + local.pos;
    // PENTING: pakai .slice() (COPY, buffer baru persis sepanjang data ini),
    // BUKAN .subarray() (VIEW yang cuma geser byteOffset, tapi `.buffer`-nya
    // tetap nunjuk ke ArrayBuffer SATU FILE ZIP UTUH). Kalau dibiarkan pakai
    // .subarray(), pemanggil yang ambil `entry.data.buffer` langsung (lihat
    // meimo-import.js -> saveImageAsset()) akan dapat SELURUH isi file .zip
    // sebagai "isi asset", bukan cuma bagian asset itu sendiri — file besar
    // (byte tertentu, mimeType benar) tapi rusak, karena isinya kebungkus
    // header zip + document.json + entry lain juga. Bug ini pernah sungguh
    // terjadi: asset hasil Impor gambarnya "Unsupported media" walau ukuran
    // filenya kelihatan mirip — akar masalahnya persis potongan kode ini.
    const rawData = bytes.slice(dataStart, dataStart + compressedSize);

    let data;
    if (method === 0) {
      data = rawData;
    } else if (method === 8) {
      data = await inflateRaw(rawData);
    } else {
      throw new Error(`Method kompresi zip "${method}" pada entry "${name}" tidak didukung.`);
    }

    results.push({ name, data });
  }

  return results;
}
