/**
 * commands.js
 * Kumpulan perintah pemformatan yang dipicu dari toolbar. Setiap command:
 *   1. Membaca posisi seleksi saat ini (dalam koordinat MODEL, lewat selection.js)
 *   2. Memutasi model dokumen (editor-state.js) — bukan DOM
 *   3. Meminta editor.js merender ulang block yang berubah & mengembalikan kursor
 *
 * Semua command di sini menganggap model sebagai satu-satunya sumber data;
 * DOM lama untuk block yang terkena dampak akan dibuang total dan digantikan
 * hasil render baru (lihat editor.js -> rerenderBlocks).
 *
 * Command yang me-return `{ fullRerender: true }` (lihat toggleListType)
 * meminta editor.js merender ULANG SELURUH dokumen, bukan cuma block yang
 * berubah — dipakai saat perubahan satu block bisa memengaruhi tampilan
 * block lain (mis. nomor urut numbered-list-item di sekitarnya ikut geser).
 */

import {
  splitRunsAtOffsets,
  mergeAdjacentRuns,
  blockTextLength,
  cloneBlock,
  splitBlockAt,
  createBlock,
  createRun,
  createImageBlock,
  isVoidBlockType,
  isListItemType,
  createSceneMeta,
  findSceneRangeById,
  musicKeyForScene,
} from "./block-model.js";
import { uuid } from "../utils/uuid.js";

function clampRange(state, sel) {
  const total = state.getDocument().blocks.length;
  const startBlockIndex = Math.max(0, Math.min(sel.startBlockIndex, total - 1));
  const endBlockIndex = Math.max(0, Math.min(sel.endBlockIndex, total - 1));
  return { ...sel, startBlockIndex, endBlockIndex };
}

/** Terapkan fungsi mutasi ke setiap run yang berada dalam rentang [from,to) sebuah block. */
function applyToRunRange(block, from, to, mutate) {
  if (from >= to) return block;
  const runs = splitRunsAtOffsets(block.runs, [from, to]);
  let cursor = 0;
  const mutated = runs.map((run) => {
    const runStart = cursor;
    const runEnd = cursor + run.text.length;
    cursor = runEnd;
    const inRange = runStart >= from && runEnd <= to && run.text.length > 0;
    if (!inRange) return run;
    return { ...run, marks: mutate({ ...run.marks }) };
  });
  return { ...block, runs: mergeAdjacentRuns(mutated) };
}

function isMarkActiveAcrossRange(block, from, to, markName) {
  if (from >= to) return false;
  let cursor = 0;
  let allActive = true;
  let any = false;
  for (const run of block.runs) {
    const runStart = cursor;
    const runEnd = cursor + run.text.length;
    cursor = runEnd;
    const overlapStart = Math.max(runStart, from);
    const overlapEnd = Math.min(runEnd, to);
    if (overlapEnd <= overlapStart) continue;
    any = true;
    if (!run.marks[markName]) allActive = false;
  }
  return any && allActive;
}

/** Marks efektif di posisi kursor (collapsed): marks run di titik itu, ditimpa oleh pendingMarks yang aktif.
 * Diekspor juga untuk editor.js handleEnter() — dipakai toggle "Set as
 * Current Style" (lihat komentar keepStyleOnEnter di editor-state.js) buat
 * tahu format apa yang harus "dibawa" ke baris baru saat Enter ditekan. */
export function effectiveMarksAtCollapsedCaret(state, blockIndex, offset) {
  const block = state.getBlock(blockIndex);
  let cursor = 0;
  let run = block.runs[0];
  for (const r of block.runs) {
    const end = cursor + r.text.length;
    run = r;
    if (offset <= end) break;
    cursor = end;
  }
  const pending = typeof state.getPendingMarks === "function" ? state.getPendingMarks() : null;
  return { ...run.marks, ...(pending || {}) };
}

/**
 * Saat kursor collapsed (tidak ada teks terseleksi), command format tidak
 * bisa langsung memutasi teks (tidak ada rentang untuk diformat). Sebagai
 * gantinya, hitung perubahan yang SEHARUSNYA terjadi (pakai mutator yang
 * sama seperti mode seleksi) dan simpan sebagai "pending marks" — akan
 * diterapkan editor.js ke karakter yang diketik berikutnya.
 */
function applyPendingMark(state, before, mutate) {
  if (typeof state.setPendingMarks !== "function") return null;
  const mutated = mutate({ ...before });
  const patch = {};
  for (const key of Object.keys(mutated)) {
    if (mutated[key] !== before[key]) patch[key] = mutated[key];
  }
  if (Object.keys(patch).length === 0) return null;
  state.setPendingMarks(patch);
  return { pending: true };
}

/**
 * Terapkan sebuah operasi run-level (toggle atau set) ke seluruh block yang
 * dicakup seleksi (bisa lintas block). `getMutator(active)` menerima status
 * "aktif secara seragam" (dipakai untuk toggle) dan mengembalikan fungsi
 * (marks) => marks.
 */
function applyInlineCommand(state, bodyEl, selectionApi, markName, getMutator) {
  const rawSel = selectionApi.getModelSelection(bodyEl);
  if (!rawSel) return null;

  if (rawSel.collapsed) {
    const before = effectiveMarksAtCollapsedCaret(state, rawSel.startBlockIndex, rawSel.startOffset);
    const mutate = getMutator(!!before[markName]);
    return applyPendingMark(state, before, mutate);
  }

  const sel = clampRange(state, rawSel);

  // Tentukan status aktif seragam dulu (untuk toggle bold/italic/dst)
  let activeEverywhere = true;
  let touchedAny = false;
  for (let i = sel.startBlockIndex; i <= sel.endBlockIndex; i++) {
    const block = state.getBlock(i);
    const from = i === sel.startBlockIndex ? sel.startOffset : 0;
    const to = i === sel.endBlockIndex ? sel.endOffset : blockTextLength(block);
    if (from >= to) continue;
    touchedAny = true;
    if (!isMarkActiveAcrossRange(block, from, to, markName)) activeEverywhere = false;
  }
  if (!touchedAny) return null;

  const mutate = getMutator(activeEverywhere);
  const changedIndexes = [];
  for (let i = sel.startBlockIndex; i <= sel.endBlockIndex; i++) {
    const block = state.getBlock(i);
    const from = i === sel.startBlockIndex ? sel.startOffset : 0;
    const to = i === sel.endBlockIndex ? sel.endOffset : blockTextLength(block);
    if (from >= to) continue;
    const nextBlock = applyToRunRange(block, from, to, mutate);
    state.updateBlock(i, nextBlock);
    changedIndexes.push(i);
  }

  return { changedIndexes, selection: sel };
}

export function toggleBold(state, bodyEl, selectionApi) {
  return applyInlineCommand(state, bodyEl, selectionApi, "bold", (active) => (marks) => {
    marks.bold = !active;
    return marks;
  });
}

export function toggleItalic(state, bodyEl, selectionApi) {
  return applyInlineCommand(state, bodyEl, selectionApi, "italic", (active) => (marks) => {
    marks.italic = !active;
    return marks;
  });
}

export function toggleUnderline(state, bodyEl, selectionApi) {
  return applyInlineCommand(state, bodyEl, selectionApi, "underline", (active) => (marks) => {
    marks.underline = !active;
    return marks;
  });
}

export function toggleStrike(state, bodyEl, selectionApi) {
  return applyInlineCommand(state, bodyEl, selectionApi, "strike", (active) => (marks) => {
    marks.strike = !active;
    return marks;
  });
}

export function setFontSize(state, bodyEl, selectionApi, px) {
  return applyInlineCommand(state, bodyEl, selectionApi, "fontSize", () => (marks) => {
    marks.fontSize = px || null;
    return marks;
  });
}

export function setFontFamily(state, bodyEl, selectionApi, family) {
  return applyInlineCommand(state, bodyEl, selectionApi, "fontFamily", () => (marks) => {
    marks.fontFamily = family || null;
    return marks;
  });
}

export function setColor(state, bodyEl, selectionApi, hex) {
  return applyInlineCommand(state, bodyEl, selectionApi, "color", () => (marks) => {
    marks.color = hex || null;
    return marks;
  });
}

export function setHighlight(state, bodyEl, selectionApi, key) {
  return applyInlineCommand(state, bodyEl, selectionApi, "highlight", () => (marks) => {
    marks.highlight = key || null;
    return marks;
  });
}

/** Terapkan (atau hapus, kalau url falsy) link ke teks terseleksi. */
export function setLink(state, bodyEl, selectionApi, url) {
  return applyInlineCommand(state, bodyEl, selectionApi, "link", () => (marks) => {
    marks.link = url || null;
    return marks;
  });
}

/** Hapus SEMUA mark run (bold/italic/underline/strike/warna/highlight/
 * ukuran+jenis font/link) dari teks terseleksi, balik ke gaya default —
 * dipakai tombol "Hapus Format" di toolbar. markName pertama ("bold")
 * cuma dipakai applyInlineCommand secara internal untuk logika collapsed-
 * caret/active-detection generik; mutator di sini tidak peduli status
 * aktifnya, semua mark selalu ditimpa ke default apa pun kondisinya. */
export function clearFormatting(state, bodyEl, selectionApi) {
  return applyInlineCommand(state, bodyEl, selectionApi, "bold", () => (marks) => {
    marks.bold = false;
    marks.italic = false;
    marks.underline = false;
    marks.strike = false;
    marks.color = null;
    marks.highlight = null;
    marks.fontSize = null;
    marks.fontFamily = null;
    marks.link = null;
    return marks;
  });
}

/* ------------------------------------------------------------------ */
/* Block-level commands: Heading & Alignment                           */
/* Berlaku untuk block yang berisi kursor, atau seluruh block yang      */
/* tercakup seleksi (boleh tanpa perlu ada teks terseleksi).            */
/* ------------------------------------------------------------------ */

function affectedBlockRange(state, bodyEl, selectionApi) {
  const rawSel = selectionApi.getModelSelection(bodyEl);
  if (!rawSel) return null;
  return clampRange(state, rawSel);
}

export function setHeading(state, bodyEl, selectionApi, level) {
  const sel = affectedBlockRange(state, bodyEl, selectionApi);
  if (!sel) return null;
  const changedIndexes = [];
  for (let i = sel.startBlockIndex; i <= sel.endBlockIndex; i++) {
    if (isVoidBlockType(state.getBlock(i).type)) continue; // divider/image tidak punya heading
    const block = cloneBlock(state.getBlock(i));
    if (level === 0) {
      block.type = "paragraph";
      block.level = null;
    } else {
      block.type = "heading";
      block.level = level;
    }
    state.updateBlock(i, block);
    changedIndexes.push(i);
  }
  return { changedIndexes, selection: sel };
}

export function setAlign(state, bodyEl, selectionApi, align) {
  const sel = affectedBlockRange(state, bodyEl, selectionApi);
  if (!sel) return null;
  const changedIndexes = [];
  for (let i = sel.startBlockIndex; i <= sel.endBlockIndex; i++) {
    // Posisi block gambar diatur lewat bottom sheet-nya sendiri (lihat
    // toolbar/image-sheet.js), bukan dropdown Perataan Teks toolbar utama —
    // dan divider tidak punya konsep perataan sama sekali.
    if (isVoidBlockType(state.getBlock(i).type)) continue;
    const block = cloneBlock(state.getBlock(i));
    block.align = align;
    state.updateBlock(i, block);
    changedIndexes.push(i);
  }
  return { changedIndexes, selection: sel };
}

/** Atur line-height (angka multiplier, mis. 1.5) untuk block yang tercakup
 * seleksi/kursor. `value` falsy (0/null/undefined) -> kembali ke default CSS. */
export function setLineHeight(state, bodyEl, selectionApi, value) {
  const sel = affectedBlockRange(state, bodyEl, selectionApi);
  if (!sel) return null;
  const changedIndexes = [];
  for (let i = sel.startBlockIndex; i <= sel.endBlockIndex; i++) {
    if (isVoidBlockType(state.getBlock(i).type)) continue;
    const block = cloneBlock(state.getBlock(i));
    block.lineHeight = value || null;
    state.updateBlock(i, block);
    changedIndexes.push(i);
  }
  return { changedIndexes, selection: sel };
}

/** Atur letter-spacing (angka px) untuk block yang tercakup seleksi/kursor.
 * `value` falsy (0/null/undefined) -> kembali ke spasi normal. */
export function setLetterSpacing(state, bodyEl, selectionApi, value) {
  const sel = affectedBlockRange(state, bodyEl, selectionApi);
  if (!sel) return null;
  const changedIndexes = [];
  for (let i = sel.startBlockIndex; i <= sel.endBlockIndex; i++) {
    if (isVoidBlockType(state.getBlock(i).type)) continue;
    const block = cloneBlock(state.getBlock(i));
    block.letterSpacing = value || null;
    state.updateBlock(i, block);
    changedIndexes.push(i);
  }
  return { changedIndexes, selection: sel };
}

/* ------------------------------------------------------------------ */
/* Block-level commands: List (bulleted / numbered / checklist)        */
/* ------------------------------------------------------------------ */

/**
 * Toggle tipe list untuk seluruh block yang tercakup seleksi. Kalau semua
 * block yang tercakup SUDAH bertipe `listType` ini, aksinya jadi "matikan"
 * (balik ke paragraph) — sama seperti perilaku toggle Bold/Italic.
 * `fullRerender: true` diminta karena mengubah tipe satu block bisa
 * menggeser nomor urut numbered-list-item di sekitarnya (lihat editor.js).
 */
export function toggleListType(state, bodyEl, selectionApi, listType) {
  const sel = affectedBlockRange(state, bodyEl, selectionApi);
  if (!sel) return null;

  let allActive = true;
  for (let i = sel.startBlockIndex; i <= sel.endBlockIndex; i++) {
    const b = state.getBlock(i);
    if (isVoidBlockType(b.type)) continue; // divider/image tidak ikut dihitung
    if (b.type !== listType) {
      allActive = false;
      break;
    }
  }

  const changedIndexes = [];
  for (let i = sel.startBlockIndex; i <= sel.endBlockIndex; i++) {
    if (isVoidBlockType(state.getBlock(i).type)) continue;
    const block = cloneBlock(state.getBlock(i));
    if (allActive) {
      block.type = "paragraph";
      block.level = null;
      delete block.checked;
    } else {
      block.type = listType;
      block.level = null;
      if (listType === "checklist-item") block.checked = !!block.checked;
      else delete block.checked;
    }
    state.updateBlock(i, block);
    changedIndexes.push(i);
  }
  return { changedIndexes, selection: sel, fullRerender: true };
}

/* ------------------------------------------------------------------ */
/* Paste (teks polos)                                                   */
/* ------------------------------------------------------------------ */

/** Potong runs sebuah block di satu offset TANPA membentuk block baru
 * (beda dari splitBlockAt di block-model.js, yang bikin block kanan selalu
 * balik jadi paragraph) — dipakai untuk menghapus rentang seleksi lintas
 * block saat teks yang ditempel menimpa seleksi yang ada. */
function splitRunsOnly(block, offset) {
  const runs = splitRunsAtOffsets(block.runs, [offset]);
  const left = [];
  const right = [];
  let cursor = 0;
  for (const run of runs) {
    if (cursor >= offset) right.push(run);
    else left.push(run);
    cursor += run.text.length;
  }
  return { left, right };
}

/**
 * Sisipkan teks (sudah dipecah per baris oleh paste-handler.js) di posisi
 * kursor, menimpa rentang seleksi yang ada kalau ada. Baris pertama nempel
 * ke teks sebelum kursor (mempertahankan tipe block asal — heading/list/dst,
 * sama seperti splitBlockAt), baris tengah masing-masing jadi paragraph
 * baru, baris terakhir nempel ke teks sesudah kursor. Satu baris saja (tidak
 * ada newline) cukup jadi satu block, teks lama di kanan-kirinya tetap utuh.
 */
export function insertPastedText(state, bodyEl, selectionApi, lines) {
  if (!lines || !lines.length) return null;
  const rawSel = selectionApi.getModelSelection(bodyEl);
  if (!rawSel) return null;
  const sel = clampRange(state, rawSel);

  const startBlock = state.getBlock(sel.startBlockIndex);
  const endBlock = state.getBlock(sel.endBlockIndex);
  const { left: keepBeforeRuns } = splitRunsOnly(startBlock, sel.startOffset);
  const { right: keepAfterRuns } = splitRunsOnly(endBlock, sel.endOffset);

  const newBlocks = [];
  if (lines.length === 1) {
    newBlocks.push({
      ...cloneBlock(startBlock),
      runs: mergeAdjacentRuns([...keepBeforeRuns, createRun(lines[0]), ...keepAfterRuns]),
    });
  } else {
    newBlocks.push({
      ...cloneBlock(startBlock),
      runs: mergeAdjacentRuns([...keepBeforeRuns, createRun(lines[0])]),
    });
    for (let i = 1; i < lines.length - 1; i++) {
      newBlocks.push(createBlock({ type: "paragraph", runs: [createRun(lines[i])], sceneId: startBlock.sceneId || null }));
    }
    newBlocks.push(
      createBlock({
        type: "paragraph",
        runs: mergeAdjacentRuns([createRun(lines[lines.length - 1]), ...keepAfterRuns]),
        sceneId: endBlock.sceneId || null,
      })
    );
  }

  state.replaceBlocks(sel.startBlockIndex, sel.endBlockIndex, newBlocks);

  const lastBlockIndex = sel.startBlockIndex + newBlocks.length - 1;
  const lastBlock = newBlocks[newBlocks.length - 1];
  const keepAfterLength = keepAfterRuns.reduce((n, r) => n + r.text.length, 0);
  const caretOffset = blockTextLength(lastBlock) - keepAfterLength;

  return {
    fullRerender: true,
    selection: {
      startBlockIndex: lastBlockIndex,
      startOffset: caretOffset,
      endBlockIndex: lastBlockIndex,
      endOffset: caretOffset,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Block-level commands: Quote & Divider                                */
/* ------------------------------------------------------------------ */

/**
 * Toggle block yang tercakup seleksi jadi tipe 'quote' (kutipan), atau
 * balik ke 'paragraph' kalau semuanya sudah quote — pola sama persis
 * dengan toggleListType, tapi tanpa numbering sehingga tidak butuh
 * fullRerender.
 */
export function toggleQuote(state, bodyEl, selectionApi) {
  const sel = affectedBlockRange(state, bodyEl, selectionApi);
  if (!sel) return null;

  let allActive = true;
  for (let i = sel.startBlockIndex; i <= sel.endBlockIndex; i++) {
    const b = state.getBlock(i);
    if (isVoidBlockType(b.type)) continue;
    if (b.type !== "quote") {
      allActive = false;
      break;
    }
  }

  const changedIndexes = [];
  for (let i = sel.startBlockIndex; i <= sel.endBlockIndex; i++) {
    if (isVoidBlockType(state.getBlock(i).type)) continue;
    const block = cloneBlock(state.getBlock(i));
    block.type = allActive ? "paragraph" : "quote";
    block.level = null;
    delete block.checked;
    state.updateBlock(i, block);
    changedIndexes.push(i);
  }
  return { changedIndexes, selection: sel };
}

/**
 * Sisipkan garis pemisah (divider) di posisi kursor: block yang sedang
 * diisi kursor dipecah dua (persis seperti menekan Enter), lalu sebuah
 * block 'divider' (void, non-editable — lihat block-model.js & serializer.js)
 * disisipkan di antara keduanya. Kursor dipindah ke awal block sesudah
 * divider supaya user bisa langsung lanjut mengetik. `fullRerender: true`
 * dipakai karena jumlah block bertambah dua sekaligus.
 */
export function insertDivider(state, bodyEl, selectionApi) {
  const rawSel = selectionApi.getModelSelection(bodyEl);
  if (!rawSel) return null;
  const sel = clampRange(state, rawSel);

  const index = sel.startBlockIndex;
  const block = state.getBlock(index);
  const offset = sel.collapsed ? sel.startOffset : blockTextLength(block);

  const [left, splitRight] = splitBlockAt(block, offset);
  const divider = createBlock({ type: "divider", sceneId: block.sceneId || null });

  // BUGFIX: splitBlockAt() melanjutkan tipe list-item (bullet/nomor/checklist)
  // ke block baru — itu perilaku yang benar untuk Enter biasa di tengah
  // list, tapi TIDAK masuk akal untuk divider: divider adalah garis pemisah
  // visual, jadi baris setelahnya seharusnya "keluar" dari list, bukan malah
  // jadi item list kosong baru. Paksa jadi paragraph biasa kalau splitRight
  // masih membawa tipe list-item.
  const right = isListItemType(splitRight.type)
    ? { ...splitRight, type: "paragraph", checked: undefined, level: null }
    : splitRight;

  state.replaceBlocks(index, index, [left, divider, right]);

  return {
    fullRerender: true,
    selection: {
      startBlockIndex: index + 2,
      startOffset: 0,
      endBlockIndex: index + 2,
      endOffset: 0,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Block-level commands: Gambar                                        */
/* ------------------------------------------------------------------ */

/**
 * Sisipkan block gambar KOSONG (placeholder, `assetId` belum ada) di posisi
 * kursor — polanya sama seperti insertDivider() di atas: block yang sedang
 * diisi kursor dipecah dua, lalu block 'image' (void, lihat block-model.js)
 * disisipkan di antaranya. Dipanggil begitu tombol "Sisipkan Gambar" di
 * toolbar ditekan; pengaturan sungguhan (gambar/posisi/wrap/ukuran) baru
 * benar-benar dikunci ke model lewat updateImageBlock() saat bottom sheet
 * ditekan "Terapkan" (lihat toolbar/image-sheet.js) — sebelum itu, sheet
 * cuma mem-preview langsung ke elemen DOM block ini tanpa menyentuh model.
 */
export function insertImagePlaceholder(state, bodyEl, selectionApi) {
  const rawSel = selectionApi.getModelSelection(bodyEl);
  if (!rawSel) return null;
  const sel = clampRange(state, rawSel);

  const index = sel.startBlockIndex;
  const block = state.getBlock(index);
  const offset = sel.collapsed ? sel.startOffset : blockTextLength(block);

  const [left, right] = splitBlockAt(block, offset);
  const imageBlock = createImageBlock({ sceneId: block.sceneId || null });

  state.replaceBlocks(index, index, [left, imageBlock, right]);

  return {
    fullRerender: true,
    selection: {
      startBlockIndex: index + 2,
      startOffset: 0,
      endBlockIndex: index + 2,
      endOffset: 0,
    },
    // Dibaca oleh toolbar/image-sheet.js untuk tahu id block placeholder
    // yang baru saja disisipkan (supaya bottom sheet tahu block mana yang
    // mau di-preview/di-commit), bukan dipakai editor.js.
    imageBlockId: imageBlock.id,
  };
}

function findBlockIndexById(state, blockId) {
  const blocks = state.getDocument().blocks;
  return blocks.findIndex((b) => b.id === blockId);
}

/**
 * Terapkan pengaturan akhir (assetId/ukuran/posisi/wrap) ke block gambar
 * yang sudah ada di model — dicari lewat `blockId`, BUKAN posisi kursor,
 * karena bottom sheet gambar bisa saja masih terbuka walau fokus/kursor
 * sudah tidak lagi berada di dekat block itu. `patch` hanya berisi field
 * yang berubah (mis. { assetId, imageWidth, imageHeight, borderRadius,
 * align, wrap }).
 */
export function updateImageBlock(state, bodyEl, selectionApi, blockId, patch) {
  const index = findBlockIndexById(state, blockId);
  if (index === -1) return null;
  const block = cloneBlock(state.getBlock(index));
  Object.assign(block, patch);
  state.updateBlock(index, block);

  // Kursor SENGAJA tidak diarahkan ke block gambar itu sendiri (void block,
  // tidak punya posisi teks yang bermakna) — diarahkan ke block teks
  // terdekat setelahnya, atau sebelumnya bila gambar ada di akhir dokumen,
  // sama seperti konvensi insertDivider/removeImageBlock di file ini.
  const blocks = state.getDocument().blocks;
  const neighborIndex = index + 1 < blocks.length ? index + 1 : Math.max(0, index - 1);
  const neighborOffset = index + 1 < blocks.length ? 0 : blockTextLength(blocks[neighborIndex]);

  return {
    changedIndexes: [index],
    selection: {
      startBlockIndex: neighborIndex,
      startOffset: neighborOffset,
      endBlockIndex: neighborIndex,
      endOffset: neighborOffset,
    },
  };
}

/**
 * Hapus block gambar sepenuhnya lewat `blockId` — dipakai tombol "Batal" di
 * bottom sheet gambar saat mode "insert" (placeholder yang baru disisipkan
 * dibuang total kalau user batal). Kursor dipindah ke akhir block SEBELUM
 * gambar (atau block pertama bila gambar ada di paling atas dokumen).
 */
export function removeImageBlock(state, bodyEl, selectionApi, blockId) {
  const index = findBlockIndexById(state, blockId);
  if (index === -1) return null;
  state.replaceBlocks(index, index, []);

  const blocks = state.getDocument().blocks;
  if (!blocks.length) return { fullRerender: true, selection: null };
  const fallbackIndex = Math.max(0, Math.min(index - 1, blocks.length - 1));
  const fallbackOffset = blockTextLength(blocks[fallbackIndex]);

  return {
    fullRerender: true,
    selection: {
      startBlockIndex: fallbackIndex,
      startOffset: fallbackOffset,
      endBlockIndex: fallbackIndex,
      endOffset: fallbackOffset,
    },
  };
}

/** Centang/batal-centang satu checklist-item lewat klik pada kotak centangnya. */
export function toggleChecklistItem(state, bodyEl, selectionApi, blockIndex) {
  const block = state.getBlock(blockIndex);
  if (!block || block.type !== "checklist-item") return null;

  const next = cloneBlock(block);
  next.checked = !block.checked;
  state.updateBlock(blockIndex, next);

  // Klik di kotak centang tidak menyeleksi teks — pertahankan seleksi yang
  // sudah ada kalau ada, atau taruh kursor di awal item sebagai fallback.
  const currentSel = selectionApi.getModelSelection(bodyEl);
  const selection = currentSel || {
    startBlockIndex: blockIndex,
    startOffset: 0,
    endBlockIndex: blockIndex,
    endOffset: 0,
  };
  return { changedIndexes: [blockIndex], selection };
}

/* ------------------------------------------------------------------ */
/* Copy/Paste Block — lihat services/block-clipboard-service.js untuk    */
/* seluruh alur (serialisasi clipboard ke sessionStorage & resolusi      */
/* assetId/sceneId saat paste). Command di sini SENGAJA cuma bagian      */
/* MUTASI MODEL yang murni sinkron: seluruh kerja async (baca/tulis      */
/* IndexedDB utk asset gambar/musik) sudah kelar duluan di layer service */
/* SEBELUM command ini dipanggil (pola yang sama dengan toolbar/         */
/* image-sheet.js -> updateImageBlock: await dulu di luar, baru          */
/* editor.runCommand() dengan hasil yang sudah jadi). Copy sendiri tidak */
/* butuh command sama sekali (tidak memutasi dokumen apa pun).           */
/* ------------------------------------------------------------------ */

/**
 * Sisipkan hasil Paste Block (`insertion.insertBlocks` — sudah di-remap
 * id/sceneId/assetId oleh block-clipboard-service.js) di posisi kursor.
 * Polanya sama seperti insertDivider/insertScene (split block di titik
 * kursor, sisipkan di antaranya) — bedanya `cursorSel` diterima sebagai
 * parameter eksplisit alih-alih dibaca ulang dari DOM lewat `selectionApi`,
 * supaya posisi kursor yang dipakai PERSIS sama dengan yang dipakai
 * block-clipboard-service.js menentukan target (Scene/root) sebelum await
 * asset selesai — DOM selection bisa saja sudah berubah/hilang selama
 * jeda async itu.
 */
export function pasteBlockClipboard(state, bodyEl, selectionApi, insertion, cursorSel) {
  if (!insertion || !insertion.insertBlocks || !insertion.insertBlocks.length) return null;
  const sel = clampRange(state, cursorSel);

  const index = sel.startBlockIndex;
  const block = state.getBlock(index);
  if (!block) return null;
  const offset = sel.collapsed ? sel.startOffset : blockTextLength(block);

  const [left, right] = splitBlockAt(block, offset);
  const { insertBlocks, scenesPatch, musicPatch } = insertion;

  state.replaceBlocks(index, index, [left, ...insertBlocks, right]);
  for (const [sceneId, meta] of Object.entries(scenesPatch || {})) state.setScene(sceneId, meta);
  for (const [key, meta] of Object.entries(musicPatch || {})) state.setMusic(key, meta);

  const landIndex = index + 1 + insertBlocks.length;
  return {
    fullRerender: true,
    selection: {
      startBlockIndex: landIndex,
      startOffset: 0,
      endBlockIndex: landIndex,
      endOffset: 0,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Scene — lihat blok komentar panjang di block-model.js untuk kenapa    */
/* Scene direpresentasikan sebagai "sceneId bersama pada sederet block   */
/* bersambung" + `document.scenes[sceneId]` metadata, bukan block        */
/* bersarang. Tiga command di bawah ini adalah SATU-SATUNYA tempat        */
/* `document.scenes` diubah lewat jalur command/undo biasa (kustomisasi   */
/* live warna/padding/tepi lewat bottom sheet TIDAK lewat sini — lihat    */
/* editor.js updateScene(), yang sengaja melewati mesin seleksi/undo per  */
/* sentuhan kontrol supaya tidak mengganggu fokus).                       */

/**
 * Sisipkan Scene baru di posisi kursor. Sama seperti insertDivider/
 * insertImagePlaceholder: block di titik kursor dipecah dua (splitBlockAt),
 * lalu SATU block paragraf kosong baru — yang diberi `sceneId` baru —
 * disisipkan di antaranya sebagai isi awal Scene. Kursor diarahkan ke
 * dalam paragraf kosong itu supaya user bisa langsung mengetik isi Scene.
 */
export function insertScene(state, bodyEl, selectionApi) {
  const rawSel = selectionApi.getModelSelection(bodyEl);
  if (!rawSel) return null;
  const sel = clampRange(state, rawSel);
  const index = sel.startBlockIndex;
  const block = state.getBlock(index);
  if (!block) return null;
  const offset = sel.collapsed ? sel.startOffset : blockTextLength(block);

  const [left, right] = splitBlockAt(block, offset);
  const sceneId = uuid();
  const sceneBlock = createBlock({ type: "paragraph", sceneId });

  state.replaceBlocks(index, index, [left, sceneBlock, right]);
  state.setScene(sceneId, createSceneMeta());

  return {
    fullRerender: true,
    selection: {
      startBlockIndex: index + 1,
      startOffset: 0,
      endBlockIndex: index + 1,
      endOffset: 0,
    },
    // Dibaca toolbar/scene-sheet.js supaya bottom sheet kustomisasi Scene
    // langsung terbuka untuk Scene yang baru saja disisipkan ini.
    sceneId,
  };
}

/**
 * Duplikasi SELURUH Scene (semua block anggotanya + metadata visualnya)
 * dan sisipkan tepat setelah Scene aslinya. `sceneId` dicari dari klik
 * tombol "Duplicate Scene" di bottom sheet (lihat toolbar/scene-sheet.js),
 * bukan dari posisi kursor — sheet bisa saja masih terbuka walau fokus
 * kursor terakhir sudah pindah.
 */
export function duplicateScene(state, bodyEl, selectionApi, sceneId) {
  const blocks = state.getDocument().blocks;
  const range = findSceneRangeById(blocks, sceneId);
  if (!range) return null;
  const { start, end } = range;

  const newSceneId = uuid();
  const meta = state.getScene(sceneId) || createSceneMeta();
  state.setScene(newSceneId, { ...meta });

  // Musik yang menempel pada Scene asli (kalau ada) ikut disalin ke Scene
  // baru — lihat blok komentar "Musik" di block-model.js. `assetId`-nya
  // BOLEH dipakai bersama oleh kedua Scene (data biner audionya read-only,
  // tidak perlu digandakan di IndexedDB).
  if (state.getMusic) {
    const originalMusic = state.getMusic(musicKeyForScene(sceneId));
    if (originalMusic) state.setMusic(musicKeyForScene(newSceneId), { ...originalMusic });
  }

  const clonedBlocks = [];
  for (let i = start; i <= end; i++) {
    const clone = cloneBlock(state.getBlock(i));
    clone.id = uuid();
    clone.sceneId = newSceneId;
    clonedBlocks.push(clone);
  }

  // Sisip tepat setelah block terakhir Scene asli, tanpa mengubah block
  // manapun di rentang aslinya: block di `end` "diganti" dengan dirinya
  // sendiri diikuti seluruh salinan.
  state.replaceBlocks(end, end, [state.getBlock(end), ...clonedBlocks]);

  return {
    fullRerender: true,
    selection: {
      startBlockIndex: end + 1,
      startOffset: 0,
      endBlockIndex: end + 1,
      endOffset: 0,
    },
    sceneId: newSceneId,
  };
}

/**
 * Hapus SELURUH Scene: semua block anggotanya dari `document.blocks` +
 * metadatanya dari `document.scenes`. Dokumen tidak boleh berakhir kosong
 * total (banyak bagian lain editor berasumsi minimal 1 block selalu ada),
 * jadi kalau Scene yang dihapus kebetulan satu-satunya isi dokumen, satu
 * paragraf kosong baru otomatis ditaruh sebagai gantinya.
 */
export function deleteScene(state, bodyEl, selectionApi, sceneId) {
  const blocksBefore = state.getDocument().blocks;
  const range = findSceneRangeById(blocksBefore, sceneId);
  if (!range) return null;
  const { start, end } = range;

  state.replaceBlocks(start, end, []);
  state.deleteScene(sceneId);
  // Musik yang menempel pada Scene ini (kalau ada) ikut dibuang — lihat
  // blok komentar "Musik" di block-model.js. Kalau musik itu kebetulan
  // sedang diputar, toolbar/music-sheet.js yang menghentikannya (lewat
  // state.onChange, lihat enforceActiveKeyStillValid() di sana).
  if (state.deleteMusic) state.deleteMusic(musicKeyForScene(sceneId));

  let blocksAfter = state.getDocument().blocks;
  if (!blocksAfter.length) {
    state.replaceBlocks(0, -1, [createBlock()]);
    blocksAfter = state.getDocument().blocks;
  }

  const fallbackIndex = Math.max(0, Math.min(start, blocksAfter.length - 1));
  const fallbackOffset = fallbackIndex === start ? 0 : blockTextLength(blocksAfter[fallbackIndex]);

  return {
    fullRerender: true,
    selection: {
      startBlockIndex: fallbackIndex,
      startOffset: fallbackOffset,
      endBlockIndex: fallbackIndex,
      endOffset: fallbackOffset,
    },
  };
}
