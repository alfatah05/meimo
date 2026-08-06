/**
 * block-clipboard-service.js
 * Copy/Paste Block — menyalin sebagian block terpilih dari satu note dan
 * menempelkannya di note yang sedang dibuka (bisa note yang SAMA atau
 * note LAIN, termasuk lintas halaman karena app ini multi-page: `<a href>`
 * beneran antar note, jadi variable JS biasa hilang tiap pindah halaman).
 *
 * ---- Copy: MURNI sync ----
 * Semua asset (gambar & musik) itu satu IndexedDB global yang diakses lewat
 * assetId (bukan storage terpisah per-note — noteId di record asset cuma
 * metadata buat cleanup, lihat db/schema.js createAssetRecord), jadi Copy
 * tidak perlu menyalin byte apa pun sama sekali. Cukup serialize block-block
 * terpilih APA ADANYA (assetId & id block aslinya dibawa mentah-mentah) ke
 * sessionStorage — BUKAN variable JS biasa (lihat alasan multi-page di
 * atas), BUKAN localStorage juga (sengaja "hilang begitu tab ditutup" —
 * tetap terasa "internal aplikasi", bukan clipboard OS sungguhan). Ini yang
 * membuat Copy Block instan, tanpa spinner sama sekali.
 *
 * ---- Paste: async, assetId di-resolve ke asset BARU ----
 * assetId lama di payload clipboard dibaca dari IndexedDB (getImageAsset —
 * dipakai juga untuk musik, lihat catatan di dalamnya) lalu disimpan ULANG
 * sebagai asset BARU milik note tujuan (saveImageAsset) — assetId BARU ini
 * yang dipakai di block/musik hasil paste. Ini persis pola `idMap` yang
 * sudah dipakai services/meimo-import.js untuk impor file .meimo, cuma
 * skopnya bukan "satu dokumen penuh" tapi "sebagian block terpilih", dan
 * tujuannya bukan note baru tapi note yang sedang dibuka. Asset SELALU
 * di-duplicate walau paste-nya ke note yang SAMA dengan sumber copy — biar
 * hasil paste itu independen (edit/hapus salah satu tidak memengaruhi yang
 * lain), sekaligus tidak perlu logic khusus "sama note vs beda note".
 *
 * File ini TIDAK mengubah model dokumen sama sekali — lihat
 * editor/commands.js pasteBlockClipboard() untuk bagian mutasi model
 * (murni sinkron, dipanggil SETELAH seluruh resolusi asset di sini kelar).
 */

import * as documentService from "./document-service.js";
import { cloneBlock, createSceneMeta, musicKeyForScene } from "../editor/block-model.js";
import { uuid } from "../utils/uuid.js";

export const CLIPBOARD_FORMAT_VERSION = 1;

// SENGAJA sessionStorage (lihat blok komentar berkas ini) — bukan
// localStorage, bukan variable modul biasa.
const STORAGE_KEY = "meimo:block-clipboard:v1";

function readRawPayload() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // sessionStorage tidak tersedia (mode privat ketat dsb.) atau JSON
    // rusak — diperlakukan sama seperti "tidak ada clipboard", bukan crash.
    return null;
  }
}

/** true kalau ada sesuatu tersimpan di clipboard block SAAT INI — dipakai
 * block-selection-bar.js untuk memutuskan bar harus tetap terbuka atau
 * tidak (termasuk begitu note lain baru saja dibuka). Sengaja tidak
 * memvalidasi formatVersion di sini (cukup "ada isinya atau tidak" untuk
 * keperluan tampilan bar) — validasi versi sungguhan ada di
 * readClipboard(). */
export function hasClipboard() {
  return !!readRawPayload();
}

/** Baca payload clipboard, atau `null` kalau tidak ada / formatVersion
 * tidak cocok (mis. app ke-update di antara copy & paste, skema block
 * berubah) — diperlakukan sebagai clipboard kosong, BUKAN error/crash. */
export function readClipboard() {
  const payload = readRawPayload();
  if (!payload || payload.formatVersion !== CLIPBOARD_FORMAT_VERSION) return null;
  if (!Array.isArray(payload.blocks) || !payload.blocks.length) return null;
  return payload;
}

/** Buang clipboard — dipakai setelah Paste berhasil, atau saat user
 * menutup bottom bar secara manual (tombol "X"), lihat block-selection-bar.js. */
export function clearClipboard() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // diamkan — tidak ada yang bisa dilakukan kalau sessionStorage memang
    // tidak bisa ditulis sama sekali di browser ini.
  }
}

/**
 * Salin rentang block [start, end] (index, inklusif) dari `doc` ke
 * clipboard. Struktur block dibawa APA ADANYA (id & assetId asli, lewat
 * cloneBlock() supaya tetap snapshot BERDIRI SENDIRI, tidak ikut berubah
 * kalau dokumen sumbernya terus diedit setelah ini).
 *
 * `scenes`/`music` di payload HANYA berisi Scene yang ke-copy UTUH — ini
 * otomatis terjamin oleh pemanggilnya (lihat block-selection-bar.js: baik
 * rentang dari block-select-mode.js maupun dari resolveBlockRange() untuk
 * seleksi teks biasa, sama-sama menjamin Scene yang tersentuh SELALU ikut
 * utuh, tidak pernah sebagian) — jadi di sini cukup ambil metadata Scene
 * untuk tiap sceneId unik yang muncul di blocks hasil slice.
 *
 * Musik ROOT/DIVIDER SENGAJA tidak pernah ikut ter-copy sama sekali, walau
 * divider block-nya kebetulan ada di rentang yang dipilih — musik
 * root/divider itu atribut SECTION, bukan milik block itu sendiri, jadi
 * memotong sebagian section lalu membawa "musik section-nya" bakal
 * ambigu. Musik Scene beda cerita karena kepemilikannya jelas (Scene
 * selalu ke-copy utuh).
 *
 * @returns {boolean} true kalau berhasil ditulis ke sessionStorage.
 */
export function writeClipboardFromRange(doc, start, end) {
  if (!doc || !Array.isArray(doc.blocks)) return false;
  const lo = Math.max(0, Math.min(start, end));
  const hi = Math.min(doc.blocks.length - 1, Math.max(start, end));
  if (lo > hi) return false;

  const blocks = doc.blocks.slice(lo, hi + 1).map(cloneBlock);
  if (!blocks.length) return false;

  const scenes = {};
  const music = {};
  const seenSceneIds = new Set();
  for (const block of blocks) {
    if (!block.sceneId || seenSceneIds.has(block.sceneId)) continue;
    seenSceneIds.add(block.sceneId);
    if (doc.scenes && doc.scenes[block.sceneId]) {
      scenes[block.sceneId] = doc.scenes[block.sceneId];
    }
    const musicMeta = doc.music && doc.music[musicKeyForScene(block.sceneId)];
    if (musicMeta) music[block.sceneId] = musicMeta;
  }

  const payload = { formatVersion: CLIPBOARD_FORMAT_VERSION, blocks, scenes, music };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve satu assetId lama ke assetId BARU milik `noteId`, memoized lewat
 * `idMap` (Map assetId-lama -> assetId-baru, atau -> `null` kalau gagal)
 * supaya asset yang sama yang dirujuk berkali-kali di payload (mis. gambar
 * yang sama dipakai >1 block) cuma benar-benar dibaca+ditulis SEKALI.
 *
 * `getImageAsset`/`saveImageAsset` dipakai untuk KEDUANYA gambar & musik —
 * bukan salah pilih fungsi, object store `assets` di IndexedDB memang satu
 * dan sama untuk keduanya (lihat block-model.js blok komentar "Musik" &
 * document-service.js saveAudioAsset yang murni alias saveImageAsset).
 */
async function resolveAssetId(idMap, oldAssetId, noteId) {
  if (!oldAssetId) return null;
  if (idMap.has(oldAssetId)) return idMap.get(oldAssetId);

  const asset = await documentService.getImageAsset(oldAssetId);
  // Asset sudah tidak ada lagi (mis. note/gambar sumber sudah kehapus
  // duluan sebelum sempat di-paste) — jangan gagalkan seluruh paste,
  // cukup tandai gagal untuk assetId ini saja (lihat pemanggil).
  if (!asset) {
    idMap.set(oldAssetId, null);
    return null;
  }

  // `bytes` seharusnya SELALU ada untuk asset yang dibuat lewat jalur baru
  // (lihat db/schema.js createAssetRecord) — `blob` cuma fallback untuk
  // data lama, sama seperti pola di meimo-export.js.
  let bytes = asset.bytes;
  if (!bytes && asset.blob) {
    try {
      bytes = await asset.blob.arrayBuffer();
    } catch {
      bytes = null;
    }
  }
  if (!bytes) {
    idMap.set(oldAssetId, null);
    return null;
  }

  const newAssetId = await documentService.saveImageAsset(noteId, bytes, asset.mimeType);
  idMap.set(oldAssetId, newAssetId);
  return newAssetId;
}

/**
 * Siapkan SEMUA hasil paste (block yang sudah di-remap id/sceneId/assetId,
 * plus patch scenes/music) TANPA menyentuh model dokumen sama sekali — ini
 * bagian ASYNC-nya (baca/tulis IndexedDB), dipanggil block-selection-bar.js
 * SEBELUM editor.runCommand(pasteBlockClipboard, ...) yang murni sinkron.
 *
 * @param {object} payload - hasil readClipboard()
 * @param {object} opts
 * @param {string} opts.noteId - id note TUJUAN (state.getDocument().id)
 * @param {Array} opts.documentBlocks - state.getDocument().blocks note tujuan
 * @param {number} opts.cursorBlockIndex - index block tempat kursor berada
 *   SAAT INI (dipakai findMusicTargetAt-style: menentukan target Scene/root)
 * @returns {Promise<{insertBlocks: Array, scenesPatch: object, musicPatch: object, hadFailures: boolean}>}
 */
export async function resolvePasteInsertion(payload, { noteId, documentBlocks, cursorBlockIndex }) {
  const cursorBlock = documentBlocks[cursorBlockIndex];
  // Target DI DALAM Scene (lihat findSceneRangeAt di block-model.js — di
  // sini cukup baca sceneId-nya langsung, tidak perlu rentang penuhnya)
  // vs target di ROOT.
  const targetSceneId = (cursorBlock && cursorBlock.sceneId) || null;

  const idMap = new Map();
  let hadFailures = false;

  async function remapAsset(oldAssetId) {
    if (!oldAssetId) return null;
    const resolved = await resolveAssetId(idMap, oldAssetId, noteId);
    if (!resolved) hadFailures = true;
    return resolved;
  }

  // Hanya dipakai kalau target ROOT (lihat bawah): sceneId lama -> sceneId
  // baru, satu id baru per sceneId unik di payload (bukan per block), biar
  // block-block anggota Scene yang sama tetap "senasib" jadi Scene baru
  // yang sama juga, bukan pecah jadi Scene terpisah-pisah.
  const sceneIdMap = new Map();

  const insertBlocks = [];
  for (const sourceBlock of payload.blocks) {
    const next = cloneBlock(sourceBlock);
    next.id = uuid();

    if (targetSceneId) {
      // Target di dalam Scene -> SEMUA block yang di-paste dipaksa masuk
      // Scene tujuan (bukan bikin Scene baru) — scenes/music payload
      // di-drop total (lihat resolvePasteInsertion return di bawah).
      next.sceneId = targetSceneId;
    } else if (sourceBlock.sceneId) {
      if (!sceneIdMap.has(sourceBlock.sceneId)) sceneIdMap.set(sourceBlock.sceneId, uuid());
      next.sceneId = sceneIdMap.get(sourceBlock.sceneId);
    } else {
      next.sceneId = null;
    }

    if (next.type === "image") {
      // Kalau assetnya gagal di-resolve, block TETAP masuk tapi
      // assetId: null -> jatuh ke state "gambar kosong" yang memang sudah
      // ada di UI gambar (lihat catatan hadFailures di block-selection-bar.js).
      next.assetId = await remapAsset(sourceBlock.assetId);
    }

    insertBlocks.push(next);
  }

  const scenesPatch = {};
  const musicPatch = {};

  if (!targetSceneId) {
    for (const [oldSceneId, newSceneId] of sceneIdMap.entries()) {
      const meta = (payload.scenes && payload.scenes[oldSceneId]) || createSceneMeta();
      scenesPatch[newSceneId] = { ...meta };

      const musicMeta = payload.music && payload.music[oldSceneId];
      if (musicMeta && musicMeta.assetId) {
        const newAssetId = await remapAsset(musicMeta.assetId);
        // Beda dari gambar: kalau assetnya gagal di-resolve, musik section
        // itu cukup TIDAK diset sama sekali (bukan diset dengan
        // assetId: null) — section baru tanpa musik itu wajar/valid,
        // beda dari block gambar yang memang selalu perlu tampil (biar
        // ada, walau kosong).
        if (newAssetId) musicPatch[musicKeyForScene(newSceneId)] = { ...musicMeta, assetId: newAssetId };
      }
    }
  }

  return { insertBlocks, scenesPatch, musicPatch, hadFailures };
}
