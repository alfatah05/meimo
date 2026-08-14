/**
 * block-model.js
 * Struktur data dokumen — SUMBER KEBENARAN (source of truth) isi catatan.
 *
 * Disimpan sebagai JSON murni (bukan HTML), sesuai PROJECT_RULES.md:
 *   Document { id, title, createdAt, updatedAt, blocks: Block[] }
 *   Block    { id, type: 'paragraph' | 'heading' | 'bulleted-list-item' |
 *              'numbered-list-item' | 'checklist-item' | 'quote' | 'divider',
 *              level: 1-6 | null (heading saja),
 *              checked: boolean (checklist-item saja),
 *              align: 'left' | 'center' | 'right' | 'justify',
 *              lineHeight: number | null (multiplier, mis. 1.5 — null = default CSS),
 *              letterSpacing: number | null (px — null = normal),
 *              runs: Run[] }
 *
 *   'divider' adalah block "void" (tanpa teks/runs yang berarti) — dirender
 *   sebagai garis pemisah non-editable, lihat isVoidBlockType() di bawah,
 *   serializer.js (renderBlock) dan editor.js (handleBackspace).
 *   Run      { id, text: string, marks: Marks }
 *   Marks    { bold, italic, underline, strike: boolean;
 *              color: '#rrggbb' | null;
 *              highlight: 'amber'|'peach'|'rose'|'grape'|'lavender'|'sky'|
 *                         'aqua'|'mint'|'lime' | '#rrggbb' (kustom) | null;
 *              fontSize: number(px) | null;
 *              fontFamily: string (nilai CSS font-family, mis. "Inter") | null;
 *              link: string(url) | null }
 *
 * HTML (contenteditable) hanya dipakai sebagai media render — lihat serializer.js.
 */

import { uuid } from "../utils/uuid.js";

export const DEFAULT_ALIGN = "left";

// Tipe block "list item" — dirender flat (bukan <ul>/<li> bersarang) supaya
// tetap konsisten dengan arsitektur "satu block = satu elemen anak langsung
// dari bodyEl" yang dipakai editor.js/selection.js. Bullet/nomor/checkbox-nya
// digambar lewat CSS ::before di serializer.js+editor.css, BUKAN elemen DOM
// sungguhan — supaya tidak ikut terhitung sebagai karakter oleh selection.js
// (yang menjumlahkan textContent semua childNode untuk menghitung offset).
export const LIST_ITEM_TYPES = new Set([
  "bulleted-list-item",
  "numbered-list-item",
  "checklist-item",
]);

export function isListItemType(type) {
  return LIST_ITEM_TYPES.has(type);
}

// Block "void" — tidak berisi teks yang bisa diedit sama sekali (dirender
// non-editable, lihat serializer.js). Backspace/merge harus menghapus block
// ini secara utuh, bukan menggabung teks ke dalamnya (lihat editor.js).
export const VOID_BLOCK_TYPES = new Set(["divider", "image"]);

export function isVoidBlockType(type) {
  return VOID_BLOCK_TYPES.has(type);
}

export function emptyMarks() {
  return {
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    color: null,
    highlight: null,
    fontSize: null,
    fontFamily: null,
    link: null,
  };
}

export function createRun(text = "", marks = {}) {
  return { id: uuid(), text, marks: { ...emptyMarks(), ...marks } };
}

export function createBlock({
  type = "paragraph",
  level = null,
  align = DEFAULT_ALIGN,
  lineHeight = null,
  letterSpacing = null,
  runs,
  checked,
  sceneId = null,
} = {}) {
  const block = {
    id: uuid(),
    type,
    level: type === "heading" ? (level || 2) : null,
    align: align || DEFAULT_ALIGN,
    lineHeight: lineHeight || null,
    letterSpacing: letterSpacing || null,
    runs: runs && runs.length ? runs : [createRun("")],
    // `sceneId` menandai block ini sebagai isi dari sebuah Scene (lihat
    // "Scene" di bawah) — null berarti block biasa, di luar Scene mana pun.
    // BUKAN properti khusus satu tipe block (semua tipe block bisa punya
    // sceneId, termasuk image/divider), jadi diperlakukan sejajar `align`.
    sceneId: sceneId || null,
  };
  if (type === "checklist-item") block.checked = !!checked;
  return block;
}

/* ------------------------------------------------------------------ */
/* Scene — container full-width yang mengelompokkan sederet block       */
/* berurutan sekaligus memberi suasana visual (background/padding/tepi). */
/*                                                                        */
/* SENGAJA TIDAK dimodelkan sebagai satu block "induk" yang menyimpan     */
/* array block anak bersarang — arsitektur editor ini (selection.js,      */
/* editor.js, commands.js) seluruhnya berasumsi `document.blocks` adalah  */
/* array DATAR yang tiap elemennya dipetakan 1:1 ke sebuah index kursor.  */
/* Block "bersarang" akan memaksa penulisan ulang seluruh mesin split/    */
/* merge/undo/paste. Sebagai gantinya Scene direpresentasikan lewat DUA   */
/* bagian:                                                                */
/*   1. `block.sceneId` (lihat createBlock di atas) — menandai block itu  */
/*      "milik" Scene mana. Sederet block BERURUTAN dengan sceneId sama   */
/*      = satu Scene (dihitung ulang dari array blocks tiap saat perlu,   */
/*      TIDAK disimpan terpisah sebagai daftar index/rentang).            */
/*   2. `document.scenes[sceneId]` — metadata visual Scene itu sendiri    */
/*      (backgroundColor/padding/edgeStyle), lihat createDocument().      */
/* Block di dalam Scene TETAP block biasa (bisa diformat, dipecah lewat   */
/* Enter, digabung lewat Backspace, dst — jalur yang sudah ada berlaku    */
/* apa adanya); Scene sendiri "cuma" pengelompokan visual + operasi       */
/* tambahan (pindah/duplikat/hapus SATU rentang block sekaligus), lihat   */
/* findSceneRangeAt() & commands.js (insertScene/duplicateScene/deleteScene). */
export const SCENE_EDGE_STYLES = [
  "straight",
  "wave",
  "double-wave",
  "ripple",
  "torn",
  "deckle",
  "stamp",
  "stamp-fine",
  "scallop",
  "cloud",
  "zigzag",
  "pinked",
  "steps",
  "brush",
  "notch",
  "arc",
  "peaks",
  "saw",
];

export const SCENE_PADDING_PRESETS = { none: 0, sm: 12, md: 24, lg: 40, xl: 64 };

export const DEFAULT_SCENE_META = Object.freeze({
  // Default Scene BARU langsung berwarna (bukan transparan lagi) — pilihan
  // "Tanpa warna" sudah dihapus dari sheet kustomisasi (scene-sheet.js),
  // jadi Scene baru harus punya warna nyata sejak awal. `null` di sini
  // TIDAK PERNAH lagi jadi nilai default, tapi tetap ditangani apa adanya
  // (fallback ke "transparent") di applyScenePreview()/serializer.js untuk
  // Scene LAMA yang sudah kadung tersimpan dengan backgroundColor null dari
  // sebelum perubahan ini.
  backgroundColor: "var(--scene-bg-mint)",
  padding: "md",
  edgeStyle: "straight",
});

export function createSceneMeta(overrides = {}) {
  return { ...DEFAULT_SCENE_META, ...overrides };
}

/**
 * Cari rentang [start, end] (index, inklusif) block-block BERSAMBUNG yang
 * berbagi sceneId sama dengan block di `index`. Mengembalikan `null` kalau
 * block di `index` bukan anggota Scene mana pun (sceneId-nya null).
 */
export function findSceneRangeAt(blocks, index) {
  if (!blocks[index] || !blocks[index].sceneId) return null;
  const sceneId = blocks[index].sceneId;
  let start = index;
  while (start - 1 >= 0 && blocks[start - 1].sceneId === sceneId) start--;
  let end = index;
  while (end + 1 < blocks.length && blocks[end + 1].sceneId === sceneId) end++;
  return { start, end, sceneId };
}

/** Sama seperti findSceneRangeAt(), tapi mencari lewat sceneId langsung
 * (dipakai commands.js saat sudah tahu sceneId-nya, mis. dari tombol
 * Duplicate/Delete di bottom sheet, tanpa perlu tahu index kursor). */
export function findSceneRangeById(blocks, sceneId) {
  const index = blocks.findIndex((b) => b.sceneId === sceneId);
  if (index === -1) return null;
  return findSceneRangeAt(blocks, index);
}

/**
 * Resolusikan rentang block [start, end] MENTAH (mis. rentang block yang
 * dicakup seleksi teks biasa) jadi rentang FINAL yang menghormati aturan
 * Scene yang sama dipakai mode Select Block (lihat blok komentar "Aturan
 * khusus Scene" panjang di block-select-mode.js):
 *   1. Kalau block paling awal (index terkecil) di rentang adalah anggota
 *      sebuah Scene -> rentang DIKUNCI ("clamp"), tidak boleh melewati
 *      batas bawah Scene itu (batas atas otomatis tidak masalah karena
 *      titik mulainya sendiri sudah di dalam Scene).
 *   2. Kalau tidak (rentang dimulai di ROOT, di luar Scene mana pun) ->
 *      tiap Scene yang tersentuh sepanjang rentang ikut diperluas
 *      ("atomic-expand") sampai mencakup Scene itu UTUH, tidak pernah
 *      cuma sebagian.
 *
 * Fungsi murni (tidak menyentuh DOM sama sekali) — dipakai Copy Block yang
 * dipencet LANGSUNG dari seleksi teks biasa (belum masuk mode Select Block
 * sama sekali, lihat block-selection-bar.js), supaya behavior-nya tetap
 * konsisten dengan aturan Scene yang sama dipakai block-select-mode.js
 * (yang punya versi setara berbasis DOM untuk kebutuhan drag per-frame).
 */
export function resolveBlockRange(blocks, start, end) {
  if (!blocks || !blocks.length) return { start: 0, end: -1 };
  const lo = Math.max(0, Math.min(start, end, blocks.length - 1));
  const hi = Math.min(blocks.length - 1, Math.max(start, end));

  const homeSceneRange = findSceneRangeAt(blocks, lo);
  if (homeSceneRange) {
    return { start: lo, end: Math.min(hi, homeSceneRange.end) };
  }

  let resolvedEnd = hi;
  let i = lo;
  while (i <= resolvedEnd) {
    const sr = findSceneRangeAt(blocks, i);
    if (sr) {
      resolvedEnd = Math.max(resolvedEnd, sr.end);
      i = sr.end + 1;
    } else {
      i++;
    }
  }
  return { start: lo, end: resolvedEnd };
}

// Nilai default block gambar baru (lihat createImageBlock) & dipakai
// toolbar/image-sheet.js sebagai nilai awal slider/align saat sheet dibuka.
export const IMAGE_DEFAULTS = Object.freeze({
  width: 280,
  height: 280,
  borderRadius: 12,
  align: "center",
  wrap: false,
  // "none" = tanpa crop bentuk (persegi/rounded biasa lewat borderRadius).
  // Nilai lain merujuk ke id di editor/image-clip-shapes.js (mis. "star",
  // "heart") — lihat toolbar/image-sheet.js untuk strip pemilihan bentuknya.
  clipShape: "none",
  // Latar transparan: begitu aktif, kotak/frame di belakang gambar (yang
  // biasanya diberi warna --color-surface, lihat editor.css) dihilangkan
  // sepenuhnya — supaya area transparan gambar PNG (kanal alpha) benar-benar
  // tembus ke warna latar catatan/scene di belakangnya, bukan ketutup warna
  // frame. Untuk gambar tanpa transparansi (mis. JPG) toggle ini tidak
  // kelihatan efeknya karena gambarnya sendiri memang tidak punya area
  // tembus pandang.
  transparentBg: false,
  // Status toggle "Kunci Rasio" di image-sheet.js — DISIMPAN per-block (bukan
  // cuma state sementara sheet) supaya kalau user membuka lagi sheet gambar
  // yang sama nanti, preferensinya masih diingat alih-alih selalu balik ke
  // "off". Murni metadata untuk UX sheet; tidak memengaruhi tampilan gambar
  // itu sendiri (makanya tidak disentuh oleh serializer.js).
  lockAspect: false,
  imageOffsetX: 0,
  imageOffsetY: 0,
  imageScale: 1,
  imageRotate: 0,
});

/**
 * Block gambar — block "void" (lihat VOID_BLOCK_TYPES di atas): tidak
 * berisi teks yang bisa diedit, dirender non-editable (serializer.js) &
 * dihapus utuh lewat Backspace (editor.js), sama seperti divider.
 * `assetId` merujuk ke record di IndexedDB object store `assets` (lihat
 * db/schema.js createAssetRecord) — data biner gambar SENGAJA tidak
 * disimpan di dalam block ini supaya dokumen JSON tetap ringan (lihat
 * services/image-service.js untuk cara `assetId` diresolusikan jadi URL).
 * `align` dipakai ulang dari field block biasa (posisi kiri/tengah/kanan),
 * `wrap` hanya berlaku kalau align bukan "center" (lihat editor.css).
 * `clipShape` (opsional, "none" secara default) memotong gambar jadi
 * bentuk SVG tertentu (bintang, love, dll — lihat image-clip-shapes.js);
 * saat aktif, `borderRadius` diabaikan secara visual (lihat editor.css &
 * toolbar/image-sheet.js yang menonaktifkan slider Border Radius-nya).
 */
export function createImageBlock({
  assetId = null,
  width = IMAGE_DEFAULTS.width,
  height = IMAGE_DEFAULTS.height,
  borderRadius = IMAGE_DEFAULTS.borderRadius,
  align = IMAGE_DEFAULTS.align,
  wrap = IMAGE_DEFAULTS.wrap,
  clipShape = IMAGE_DEFAULTS.clipShape,
  transparentBg = IMAGE_DEFAULTS.transparentBg,
  lockAspect = IMAGE_DEFAULTS.lockAspect,
  imageOffsetX = IMAGE_DEFAULTS.imageOffsetX,
  imageOffsetY = IMAGE_DEFAULTS.imageOffsetY,
  imageScale = IMAGE_DEFAULTS.imageScale,
  imageRotate = IMAGE_DEFAULTS.imageRotate,
  sceneId = null,
} = {}) {
  return {
    id: uuid(),
    type: "image",
    level: null,
    align: align || IMAGE_DEFAULTS.align,
    lineHeight: null,
    letterSpacing: null,
    runs: [createRun("")],
    assetId: assetId || null,
    imageWidth: width,
    imageHeight: height,
    borderRadius,
    wrap: !!wrap,
    clipShape: clipShape || IMAGE_DEFAULTS.clipShape,
    transparentBg: !!transparentBg,
    lockAspect: !!lockAspect,
    imageOffsetX: Number.isFinite(imageOffsetX) ? imageOffsetX : 0,
    imageOffsetY: Number.isFinite(imageOffsetY) ? imageOffsetY : 0,
    imageScale: Number.isFinite(imageScale) ? imageScale : 1,
    imageRotate: Number.isFinite(imageRotate) ? imageRotate : 0,
    sceneId: sceneId || null,
  };
}

export function createDocument({ id, title = "", blocks, scenes, music, titleStyle } = {}) {
  const now = new Date().toISOString();
  return {
    id: id || uuid(),
    title,
    createdAt: now,
    updatedAt: now,
    blocks: blocks && blocks.length ? blocks : [createBlock()],
    // Peta metadata Scene: sceneId -> { backgroundColor, padding, edgeStyle }.
    // Lihat blok komentar "Scene" di atas createBlock() — isi Scene sendiri
    // TIDAK disimpan di sini, cuma block biasa di `blocks` yang diberi
    // `sceneId` sama.
    scenes: scenes || {},
    // Peta metadata Musik: musicKey -> { assetId, fileName, mimeType }.
    // Lihat blok komentar "Musik" di bawah untuk model datanya.
    music: music || {},
    // Style JUDUL (title) — beda dari `marks` per-karakter di block `runs`:
    // judul cuma satu baris teks polos (lihat editorTitle di editor.html),
    // jadi formatnya berlaku untuk SELURUH judul sekaligus, bukan per-run.
    // { fontFamily, fontSize(px), color('#rrggbb'), align, letterSpacing(px) }
    // — semua field opsional; field yang null/kosong berarti pakai default
    // CSS (.note-title-field di typography.css). Lihat editor/title-style.js.
    titleStyle: titleStyle || null,
  };
}

/* ------------------------------------------------------------------ */
/* Musik — ditempel pada SECTION (Root Editor / Divider / Scene),       */
/* BUKAN pada posisi karakter seperti gambar. Karena itu musik TIDAK    */
/* dimodelkan sebagai block sama sekali — cukup satu peta datar di      */
/* `document.music`, sejajar arsitekturnya dengan `document.scenes`:    */
/*   `document.music[musicKey] = { assetId, fileName, mimeType }`       */
/* `assetId` merujuk ke record di IndexedDB object store `assets` sama  */
/* seperti gambar (lihat services/music-service.js) — data biner audio  */
/* SENGAJA tidak disimpan di sini supaya dokumen JSON (termasuk snapshot */
/* undo/redo) tetap ringan.                                              */
/*                                                                        */
/* `musicKey` dibentuk dari SECTION yang jadi tempatnya menempel:        */
/*   - Root Editor  -> "root" (satu-satunya, tidak terikat block mana pun) */
/*   - Divider      -> "divider:<blockId>" (blockId milik block divider  */
/*     yang bersangkutan, HARUS block 'divider' di luar Scene mana pun — */
/*     divider di dalam Scene tidak relevan, lihat findMusicTargetAt())  */
/*   - Scene        -> "scene:<sceneId>"                                 */
/* Satu section paling banyak punya SATU musik (beda dari gambar yang    */
/* boleh banyak per posisi) — tapi satu NOTE boleh punya banyak musik    */
/* sekaligus karena bisa ada banyak section (banyak Divider/Scene).      */
/* ------------------------------------------------------------------ */

export const ROOT_MUSIC_KEY = "root";

export function musicKeyForScene(sceneId) {
  return `scene:${sceneId}`;
}

export function musicKeyForDivider(blockId) {
  return `divider:${blockId}`;
}

/** `target` -> musicKey. `target` adalah `{ type: 'root' }`,
 * `{ type: 'divider', id: blockId }`, atau `{ type: 'scene', id: sceneId }`
 * — lihat findMusicTargetAt() di bawah untuk cara `target` didapat dari
 * posisi kursor. */
export function musicKeyForTarget(target) {
  if (!target) return ROOT_MUSIC_KEY;
  if (target.type === "scene") return musicKeyForScene(target.id);
  if (target.type === "divider") return musicKeyForDivider(target.id);
  return ROOT_MUSIC_KEY;
}

/** Kebalikan dari musicKeyForTarget() — dipakai saat membuka bottom sheet
 * dari tombol play yang sudah ada di dokumen (cuma tahu musicKey-nya,
 * lewat data-music-key di DOM), butuh balik jadi `target` lagi. */
export function parseMusicKey(key) {
  if (!key || key === ROOT_MUSIC_KEY) return { type: "root" };
  if (key.startsWith("scene:")) return { type: "scene", id: key.slice(6) };
  if (key.startsWith("divider:")) return { type: "divider", id: key.slice(8) };
  return { type: "root" };
}

export function createMusicMeta({ assetId = null, fileName = "", mimeType = null } = {}) {
  return { assetId: assetId || null, fileName: fileName || "", mimeType: mimeType || null };
}

/**
 * Tentukan section musik ("target") dari posisi kursor (index block) —
 * dipakai toolbar/music-sheet.js begitu tombol "Insert Music" ditekan:
 *   1. Kalau block di `index` anggota sebuah Scene (`sceneId` truthy) ->
 *      target Scene tsb, TIDAK PEDULI ada Divider di dalamnya atau tidak
 *      (berada "di dalam Scene" selalu menang, sesuai spec).
 *   2. Kalau tidak, telusuri MUNDUR dari `index` (masih di wilayah root,
 *      bukan Scene) mencari block 'divider' TERDEKAT. Ketemu -> target
 *      Divider itu. Telusuran berhenti begitu masuk wilayah Scene lain
 *      (block ber-sceneId) di sepanjang jalan mundurnya — Divider di
 *      dalam Scene lain tidak relevan buat section root/divider ini.
 *   3. Tidak ketemu Divider sama sekali (berarti sebelum block ini,
 *      masih di wilayah root, tidak ada Divider) -> target Root Editor.
 */
export function findMusicTargetAt(blocks, index) {
  const block = blocks[index];
  if (block && block.sceneId) return { type: "scene", id: block.sceneId };

  const from = block ? index : blocks.length - 1;
  for (let i = from; i >= 0; i--) {
    const b = blocks[i];
    if (!b) continue;
    if (b.sceneId) break; // masuk wilayah Scene lain -> berhenti, bagian ini milik root
    if (b.type === "divider") return { type: "divider", id: b.id };
  }
  return { type: "root" };
}

export function blockText(block) {
  return block.runs.map((r) => r.text).join("");
}

export function blockTextLength(block) {
  return block.runs.reduce((sum, r) => sum + r.text.length, 0);
}

export function cloneMarks(marks) {
  return { ...marks };
}

export function marksEqual(a, b) {
  return (
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.strike === b.strike &&
    a.color === b.color &&
    a.highlight === b.highlight &&
    a.fontSize === b.fontSize &&
    a.fontFamily === b.fontFamily &&
    a.link === b.link
  );
}

/**
 * Memecah array run menjadi run-run baru sehingga setiap offset di
 * `offsets` (posisi karakter dalam block, urut) menjadi batas run yang persis.
 * Tidak mengubah teks total maupun urutan, hanya menambah titik potong.
 */
export function splitRunsAtOffsets(runs, offsets) {
  const cutPoints = [...new Set(offsets)].filter((o) => o >= 0).sort((a, b) => a - b);
  if (cutPoints.length === 0) return runs.map((r) => ({ ...r, marks: cloneMarks(r.marks) }));

  const result = [];
  let cursor = 0; // posisi karakter absolut di awal run yang sedang diproses

  for (const run of runs) {
    const runStart = cursor;
    const runEnd = cursor + run.text.length;
    const localCuts = cutPoints
      .filter((o) => o > runStart && o < runEnd)
      .map((o) => o - runStart);

    if (localCuts.length === 0) {
      result.push({ ...run, marks: cloneMarks(run.marks) });
    } else {
      let prev = 0;
      for (const cut of localCuts) {
        result.push({ id: uuid(), text: run.text.slice(prev, cut), marks: cloneMarks(run.marks) });
        prev = cut;
      }
      result.push({ id: uuid(), text: run.text.slice(prev), marks: cloneMarks(run.marks) });
    }
    cursor = runEnd;
  }
  return result.filter((r) => r.text.length > 0 || runs.length === 1);
}

/** Menggabungkan run-run bersebelahan yang punya marks identik. */
export function mergeAdjacentRuns(runs) {
  const merged = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && marksEqual(last.marks, run.marks)) {
      last.text += run.text;
    } else {
      merged.push({ ...run, marks: cloneMarks(run.marks) });
    }
  }
  return merged.length ? merged : [createRun("")];
}

/**
 * Pecah sebuah block jadi dua block pada offset karakter tertentu.
 * Dipakai saat user menekan Enter di tengah/akhir teks.
 * Block kedua jadi paragraph biasa (heading tidak menurun ke anak baris),
 * KECUALI block sumbernya list item (bullet/nomor/checklist) — list item
 * lanjut jadi list item lagi di baris baru (lihat komentar di bawah).
 */
export function splitBlockAt(block, offset) {
  const runs = splitRunsAtOffsets(block.runs, [offset]);
  const leftRuns = [];
  const rightRuns = [];
  let cursor = 0;
  for (const run of runs) {
    if (cursor >= offset) rightRuns.push(run);
    else leftRuns.push(run);
    cursor += run.text.length;
  }
  const left = { ...block, runs: leftRuns.length ? leftRuns : [createRun("")] };
  // List item (bullet/nomor/checklist) lanjut jadi list item lagi di baris
  // baru, seperti Notion/Google Docs. Item checklist baru selalu mulai
  // belum dicentang, walau item sebelumnya sudah dicentang.
  const continueType = isListItemType(block.type) ? block.type : "paragraph";
  const right = createBlock({
    type: continueType,
    align: block.align,
    runs: rightRuns.length ? rightRuns : [createRun("")],
    // Baris baru hasil Enter mewarisi sceneId block sumbernya, supaya
    // mengetik terus di dalam Scene tidak "keluar" begitu saja — lihat
    // blok komentar Scene di atas createBlock().
    sceneId: block.sceneId || null,
  });
  return [left, right];
}

/**
 * Terapkan patch marks (mis. { bold: true }) ke rentang karakter [from, to)
 * sebuah block, tanpa menyentuh run lain di luar rentang tsb.
 * Dipakai untuk menerapkan "pending marks" (format yang diaktifkan dari
 * toolbar saat kursor collapsed) ke teks yang baru saja diketik.
 */
export function applyMarksPatchToRange(block, from, to, patch) {
  if (from >= to) return block;
  const runs = splitRunsAtOffsets(block.runs, [from, to]);
  let cursor = 0;
  const patched = runs.map((run) => {
    const runStart = cursor;
    const runEnd = cursor + run.text.length;
    cursor = runEnd;
    const inRange = runStart >= from && runEnd <= to && run.text.length > 0;
    if (!inRange) return run;
    return { ...run, marks: { ...run.marks, ...patch } };
  });
  return { ...block, runs: mergeAdjacentRuns(patched) };
}

/**
 * Ganti rentang karakter [from, to) sebuah block dengan `insertText`, sambil
 * mempertahankan marks (format) di sekitarnya — dipakai fitur "spasi 2x jadi
 * tab" (lihat editor.js: trySpaceToTab/handleBackspaceTab) untuk menyisipkan
 * atau menghapus karakter tab/spasi tanpa lewat jalur input DOM native.
 * Teks yang disisipkan mewarisi marks dari karakter tepat SEBELUM `from`
 * (atau marks kosong bila `from` di awal block), sama seperti kalau user
 * mengetik karakter itu sendiri di posisi tsb.
 */
export function spliceBlockText(block, from, to, insertText) {
  const runs = splitRunsAtOffsets(block.runs, [from, to]);
  const result = [];
  let cursor = 0;
  let inserted = false;
  let marksBeforeFrom = null;

  for (const run of runs) {
    const runStart = cursor;
    const runEnd = cursor + run.text.length;
    cursor = runEnd;

    if (runEnd <= from) {
      result.push(run);
      marksBeforeFrom = run.marks;
      continue;
    }
    if (runStart >= to) {
      if (!inserted && insertText) {
        result.push(createRun(insertText, marksBeforeFrom ? { ...marksBeforeFrom } : {}));
        inserted = true;
      }
      result.push(run);
      continue;
    }
    // run ini berada di dalam [from, to) -> persis rentang yang dihapus
    // (splitRunsAtOffsets menjamin batas run tepat di from & to), buang.
  }
  if (!inserted && insertText) {
    result.push(createRun(insertText, marksBeforeFrom ? { ...marksBeforeFrom } : {}));
  }

  return { ...block, runs: mergeAdjacentRuns(result.length ? result : [createRun("")]) };
}

/** Gabungkan dua block jadi satu (identitas/type/align ikut block pertama). */
export function mergeBlocks(first, second) {
  return {
    ...first,
    runs: mergeAdjacentRuns([...first.runs, ...second.runs]),
  };
}

export function cloneBlock(block) {
  const cloned = {
    id: block.id,
    type: block.type,
    level: block.level,
    align: block.align,
    lineHeight: block.lineHeight || null,
    letterSpacing: block.letterSpacing || null,
    runs: block.runs.map((r) => ({ id: r.id, text: r.text, marks: cloneMarks(r.marks) })),
    sceneId: block.sceneId || null,
  };
  if (block.type === "checklist-item") cloned.checked = !!block.checked;
  if (block.type === "image") {
    cloned.assetId = block.assetId || null;
    cloned.imageWidth = block.imageWidth;
    cloned.imageHeight = block.imageHeight;
    cloned.borderRadius = block.borderRadius;
    cloned.imageOffsetX = block.imageOffsetX ?? 0;
    cloned.imageOffsetY = block.imageOffsetY ?? 0;
    cloned.imageScale = block.imageScale ?? 1;
    cloned.imageRotate = block.imageRotate ?? 0;
    cloned.wrap = !!block.wrap;
    cloned.clipShape = block.clipShape || "none";
    // FIX: transparentBg & lockAspect sebelumnya TIDAK ikut di-clone di sini
    // (whitelist ini ketinggalan menambahkannya) — akibatnya operasi apa pun
    // yang lewat cloneBlock() alih-alih Object.assign(patch) langsung (mis.
    // duplicate block, copy-paste, split/merge block) diam-diam membuang
    // kedua nilai ini balik ke default. updateImageBlock() dari image-sheet.js
    // sendiri aman (clone dulu baru Object.assign(patch) di atasnya), tapi
    // jalur lain tetap butuh field ini ikut ter-preserve.
    cloned.transparentBg = !!block.transparentBg;
    cloned.lockAspect = !!block.lockAspect;
  }
  return cloned;
}

/** Hitung nomor urut sebuah numbered-list-item, dihitung dari deretan
 * numbered-list-item BERSAMBUNG sebelumnya (reset begitu ketemu tipe lain). */
export function listItemOrdinal(blocks, index) {
  let n = 1;
  for (let i = index - 1; i >= 0; i--) {
    if (blocks[i].type === "numbered-list-item") n++;
    else break;
  }
  return n;
}
