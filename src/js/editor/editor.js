/**
 * editor.js
 * Inisialisasi area contenteditable sebagai MEDIA RENDER dari model dokumen.
 * Mengatur:
 *   - render awal model -> DOM
 *   - sinkronisasi DOM -> model saat pengetikan native (input event)
 *   - Enter (split block) & Backspace-at-start (merge block) sebagai
 *     perubahan STRUKTUR model, lalu re-render
 *   - eksekusi command toolbar: re-render block yang berubah & pulihkan kursor
 *
 * editor.js TIDAK berisi aturan visual (itu tugas serializer.js + CSS) dan
 * TIDAK berisi definisi format (itu tugas commands.js). Ia hanya orkestrator.
 */

import * as selectionApi from "./selection.js";
import { renderBlock, renderSceneWrapper } from "./serializer.js";
import { parseBlockElement } from "./serializer.js";
import {
  splitBlockAt,
  mergeBlocks,
  blockText,
  blockTextLength,
  applyMarksPatchToRange,
  spliceBlockText,
  listItemOrdinal,
  isListItemType,
  isVoidBlockType,
  cloneBlock,
  DEFAULT_SCENE_META,
  findMusicTargetAt,
  musicKeyForTarget,
  musicKeyForDivider,
} from "./block-model.js";
import { toggleChecklistItem, insertPastedText, effectiveMarksAtCollapsedCaret } from "./commands.js";
import { getPastedLines } from "./paste-handler.js";
import { hydrateImageElements } from "../services/image-service.js";
import { applyTitleStyle } from "./title-style.js";

// inputType native yang berarti "teks biasa disisipkan langsung oleh user"
// (bukan delete, bukan paste, dan sengaja TIDAK termasuk input saat IME
// masih dalam proses komposisi — memanipulasi DOM/seleksi di tengah
// komposisi bisa merusak input metode input non-Latin).
const INSERT_INPUT_TYPES = new Set(["insertText"]);

// Tombol yang memindahkan kursor secara eksplisit: pending marks (format
// yang "menunggu" dari klik toolbar saat kursor collapsed) dianggap tidak
// relevan lagi begitu user pindah posisi kursor sendiri.
const CARET_MOVE_KEYS = new Set([
  "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
  "Home", "End", "PageUp", "PageDown",
]);

export function createEditor({ state, bodyEl, titleEl }) {
  function isEmptyDocument() {
    const blocks = state.getDocument().blocks;
    return blocks.length === 1 && blockTextLength(blocks[0]) === 0;
  }

  function syncEmptyState() {
    bodyEl.classList.toggle("is-empty", isEmptyDocument());
  }

  /**
   * Render seluruh dokumen. Block-block dengan `sceneId` yang sama & BERSAMBUNG
   * (lihat block-model.js findSceneRangeAt) dikelompokkan ke dalam SATU
   * pembungkus `<section class="editor-scene">` (lihat serializer.js
   * renderSceneWrapper — fitur Scene) alih-alih dipasang langsung sebagai
   * anak bodyEl. Block itu sendiri TETAP dirender lewat renderBlock() yang
   * sama seperti block biasa, cuma parent DOM-nya beda; lihat selection.js
   * getBlockElements() untuk kenapa ini AMAN terhadap pemetaan index kursor.
   */
  function renderAll() {
    bodyEl.innerHTML = "";
    const blocks = state.getDocument().blocks;
    const scenes = state.getDocument().scenes || {};
    let i = 0;
    while (i < blocks.length) {
      const block = blocks[i];
      if (block.sceneId) {
        const sceneId = block.sceneId;
        const meta = scenes[sceneId] || DEFAULT_SCENE_META;
        const { wrapperEl, bodyEl: sceneBodyEl } = renderSceneWrapper(sceneId, meta);
        while (i < blocks.length && blocks[i].sceneId === sceneId) {
          sceneBodyEl.appendChild(renderBlock(blocks[i], { number: listItemOrdinal(blocks, i) }));
          i++;
        }
        bodyEl.appendChild(wrapperEl);
      } else {
        bodyEl.appendChild(renderBlock(block, { number: listItemOrdinal(blocks, i) }));
        i++;
      }
    }
    syncEmptyState();
    hydrateImageElements(bodyEl);
  }

  /** Render ulang hanya block dengan index tertentu (dipakai setelah command).
   * Elemen lama dicari lewat selectionApi.getBlockElements() (document order
   * dari [data-block-id], BUKAN bodyEl.children) supaya tetap benar untuk
   * block yang berada di dalam pembungkus Scene — lihat komentar renderAll(). */
  function rerenderBlockAt(index) {
    const oldEl = selectionApi.getBlockElements(bodyEl)[index];
    const blocks = state.getDocument().blocks;
    const newEl = renderBlock(blocks[index], { number: listItemOrdinal(blocks, index) });
    if (oldEl && oldEl.parentNode) oldEl.parentNode.replaceChild(newEl, oldEl);
    else bodyEl.appendChild(newEl);
    hydrateImageElements(bodyEl);
    return newEl;
  }

  /**
   * Kalau belum ada kursor/seleksi sama sekali di area tulisan (mis. user
   * belum pernah klik ke teksnya, langsung pencet tombol toolbar), taruh
   * kursor di akhir dokumen supaya command tetap punya posisi yang jelas
   * untuk diformat / jadi acuan pending marks.
   */
  function ensureSelectionInBody() {
    const sel = selectionApi.getModelSelection(bodyEl);
    if (sel) return;
    bodyEl.focus();
    const blocks = state.getDocument().blocks;
    const lastIndex = blocks.length - 1;
    const lastOffset = blockTextLength(blocks[lastIndex]);
    selectionApi.setModelSelection(bodyEl, {
      startBlockIndex: lastIndex,
      startOffset: lastOffset,
      endBlockIndex: lastIndex,
      endOffset: lastOffset,
    });
  }

  /**
   * Jalankan sebuah command (dari commands.js). Command mengembalikan
   * { changedIndexes, selection } atau null bila tidak ada yang berubah.
   * Setelah model dimutasi, block yang berubah dirender ulang lalu kursor
   * dikembalikan ke posisi model yang sama (offset karakter tidak berubah
   * untuk command format; hanya berubah untuk split/merge struktural).
   */
  function runCommand(commandFn, ...args) {
    ensureSelectionInBody();
    if (state.checkpoint) state.checkpoint({ coalesce: false });
    const result = commandFn(state, bodyEl, selectionApi, ...args);
    if (!result) return null;

    if (result.pending) {
      // Tidak ada teks yang diformat (kursor collapsed) — command hanya
      // menyimpan "pending marks" di state. Tidak ada block yang berubah
      // dan seleksi DOM tidak disentuh, supaya fokus tetap di editor dan
      // user bisa langsung lanjut mengetik dengan format itu.
      state.emitChange({ type: "pending-format" });
      return result;
    }

    if (result.fullRerender) {
      renderAll();
    } else {
      for (const idx of result.changedIndexes) rerenderBlockAt(idx);
    }
    selectionApi.setModelSelection(bodyEl, result.selection);
    syncEmptyState();
    state.emitChange({ type: "format" });
    return result;
  }

  // Posisi kursor tepat sebelum sebuah input native terjadi (diisi lewat
  // "beforeinput", dipakai "input") — supaya saat ada pending marks kita tahu
  // persis rentang karakter mana yang baru saja disisipkan user.
  let caretBeforeInput = null;

  function handleBeforeInput(e) {
    const sel = selectionApi.getModelSelection(bodyEl);

    // BUG (Gboard): paste dari strip clipboard Gboard SERINGKALI tidak
    // pernah memicu event "paste" sama sekali (beda dengan paste dari
    // long-press/menu konteks) — di banyak device, browser melaporkannya
    // sebagai "beforeinput" biasa dengan inputType "insertText", persis
    // seperti mengetik normal (bug yang sama juga pernah dilaporkan di
    // editor lain seperti Tiptap). Karena handlePaste() (lihat listener
    // "paste" di bawah & paste-handler.js) cuma pernah terpanggil lewat
    // event "paste", kasus ini lolos begitu saja ke jalur native — teks
    // cuma "nempel" di DOM (lihat penjelasan panjang di paste-handler.js
    // kenapa itu berbahaya) dan hilang begitu ada render ulang.
    //
    // Pembeda yang dipakai: insertText hasil mengetik satu huruf/kata
    // TIDAK PERNAH mengandung newline ("\n"), sedangkan hasil tempel
    // multi-baris SELALU mengandung itu. Begitu terdeteksi, arahkan ke
    // jalur model yang benar (insertPastedText, sama seperti paste
    // native/long-press) — berlaku baik seleksi collapsed maupun lintas
    // block, makanya dicek duluan sebelum kondisi lintas-block di bawah.
    if (!e.isComposing && e.inputType === "insertText" && e.data && e.data.includes("\n")) {
      e.preventDefault();
      caretBeforeInput = null;
      const lines = e.data.replace(/\r\n?/g, "\n").split("\n");
      runCommand(insertPastedText, lines);
      return;
    }

    // BUG: seleksi lintas BEBERAPA block (mis. drag-select 3 baris lalu
    // Backspace/ketik/Enter) — browser menggabungkan elemen-elemen block
    // DOM itu sendiri secara native (mis. 3 <p> jadi 1), tapi handleInput
    // di bawah cuma pernah menyinkronkan SATU block index balik ke model.
    // Akibatnya block-block yang sudah lenyap dari DOM tidak pernah ikut
    // terhapus dari model — muncul lagi begitu dokumen dirender ulang total
    // (mis. buka lagi notenya). Solusinya: potong jalur native SAMA SEKALI
    // untuk kasus lintas-block, proses lewat insertPastedText (commands.js)
    // yang memang sudah menangani penggabungan lintas block lewat model
    // dengan benar (jalur yang sama dipakai paste). Tidak berlaku saat IME
    // sedang mengompos (lihat INSERT_INPUT_TYPES) — biarkan native supaya
    // input metode non-Latin tidak rusak.
    if (sel && !sel.collapsed && sel.startBlockIndex !== sel.endBlockIndex && !e.isComposing) {
      const type = e.inputType || "";
      if (type.startsWith("delete")) {
        e.preventDefault();
        caretBeforeInput = null;
        runCommand(insertPastedText, [""]);
        return;
      }
      if (type === "insertText" && e.data) {
        e.preventDefault();
        caretBeforeInput = null;
        runCommand(insertPastedText, [e.data]);
        return;
      }
      if (type === "insertParagraph" || type === "insertLineBreak") {
        e.preventDefault();
        caretBeforeInput = null;
        runCommand(insertPastedText, ["", ""]);
        return;
      }
    }

    // Fitur "spasi dobel jadi tab" — dicegat di sini (bukan keydown) supaya
    // konsisten jalan baik dari keyboard fisik maupun keyboard virtual/IME
    // di mobile (lihat komentar panjang di trySpaceToTab). `e.data === " "`
    // dipilih ketat (bukan cuma `.includes`) supaya word-completion IME
    // yang menyisipkan lebih dari satu karakter sekaligus (mis. "kata ")
    // tidak ikut tertangkap — itu tetap dianggap spasi biasa.
    if (!e.isComposing && e.inputType === "insertText" && e.data === " ") {
      if (trySpaceToTab(e)) {
        caretBeforeInput = null;
        return;
      }
    }

    if (!state.getPendingMarks || !state.getPendingMarks()) {
      caretBeforeInput = null;
      return;
    }
    caretBeforeInput = sel && sel.collapsed
      ? { blockIndex: sel.startBlockIndex, offset: sel.startOffset }
      : null;
  }

  function handleInput(e) {
    const sel = selectionApi.getModelSelection(bodyEl);
    const index = sel ? sel.startBlockIndex : 0;
    let el = selectionApi.getBlockElements(bodyEl)[index];
    if (!el) {
      // DOM tidak lagi punya elemen block yang cocok dengan model (bisa
      // terjadi kalau ada jalur native lain yang belum ketahuan sempat
      // merusak struktur block, mis. seperti kasus Backspace di dokumen
      // kosong yang sudah diperbaiki di handleBackspace()). Daripada diam
      // dan kehilangan ketikan berikutnya selamanya, sinkronkan ulang
      // tampilan dari model sekarang juga.
      renderAll();
      return;
    }
    const previousBlock = state.getBlock(index);
    // Divider adalah block void (contenteditable="false"), jadi seharusnya
    // tidak pernah memicu "input" — tapi jaga-jaga saja supaya tidak ada
    // yang tersimpan sebagai teks di dalamnya kalau browser sempat kasih
    // event nyasar.
    if (isVoidBlockType(previousBlock.type)) return;
    const parsed = parseBlockElement(el, previousBlock);

    const pending = state.getPendingMarks ? state.getPendingMarks() : null;
    const ctx = caretBeforeInput;
    caretBeforeInput = null;

    if (pending && ctx && ctx.blockIndex === index && e && INSERT_INPUT_TYPES.has(e.inputType)) {
      const insertedLength = blockTextLength(parsed) - blockTextLength(previousBlock);
      if (insertedLength > 0) {
        const from = ctx.offset;
        const to = ctx.offset + insertedLength;
        const patched = applyMarksPatchToRange(parsed, from, to, pending);
        if (state.checkpoint) state.checkpoint({ coalesce: true });
        state.updateBlock(index, patched);
        rerenderBlockAt(index);
        selectionApi.setModelSelection(bodyEl, {
          startBlockIndex: index,
          startOffset: to,
          endBlockIndex: index,
          endOffset: to,
        });
        syncEmptyState();
        state.emitChange({ type: "input" });
        return;
      }
    }

    // `coalesce: true` -> ketikan beruntun (huruf demi huruf) digabung jadi
    // satu langkah undo, bukan satu Ctrl+Z per karakter (lihat editor-state.js).
    if (state.checkpoint) state.checkpoint({ coalesce: true });
    state.updateBlock(index, parsed);
    syncEmptyState();
    state.emitChange({ type: "input" });
  }

  function handleEnter(e) {
    const sel = selectionApi.getModelSelection(bodyEl);
    if (!sel || !sel.collapsed) return; // biarkan perilaku default untuk kasus non-collapsed
    e.preventDefault();

    const index = sel.startBlockIndex;
    const block = state.getBlock(index);

    if (state.checkpoint) state.checkpoint({ coalesce: false });

    // Enter di item list yang masih kosong -> keluar dari list (jadi
    // paragraph biasa), bukan bikin item kosong baru lagi. Sama seperti
    // perilaku umum di Notion/Google Docs.
    if (isListItemType(block.type) && blockTextLength(block) === 0) {
      const converted = cloneBlock(block);
      converted.type = "paragraph";
      converted.level = null;
      delete converted.checked;
      state.updateBlock(index, converted);
      renderAll();
      selectionApi.setModelSelection(bodyEl, {
        startBlockIndex: index,
        startOffset: 0,
        endBlockIndex: index,
        endOffset: 0,
      });
      if (state.clearPendingMarks) state.clearPendingMarks();
      state.emitChange({ type: "list-exit" });
      return;
    }

    const [left, right] = splitBlockAt(block, sel.startOffset);

    // Toggle "Set as Current Style" aktif -> format yang lagi berlaku di
    // kursor (mark karakter Bold/Italic/.../Warna/Highlight, TIDAK termasuk
    // Link — itu properti Insert, bukan Text/Style — plus Line Height &
    // Letter Spacing block) dibawa ke baris baru, bukan direset ke default.
    // Heading & block type lain SENGAJA tetap tidak dibawa (baris baru
    // selalu jadi paragraph biasa/lanjutan list, sama seperti sebelumnya)
    // — toggle ini cuma ada di child menu Text & Style, bukan Block.
    const keepStyle = state.getKeepStyleOnEnter && state.getKeepStyleOnEnter();
    let carriedMarks = null;
    if (keepStyle) {
      const { link, ...styleMarks } = effectiveMarksAtCollapsedCaret(state, index, sel.startOffset);
      carriedMarks = styleMarks;
      right.lineHeight = block.lineHeight || null;
      right.letterSpacing = block.letterSpacing || null;
      if (right.runs.length === 1 && right.runs[0].text === "") {
        right.runs[0] = { ...right.runs[0], marks: { ...right.runs[0].marks, ...carriedMarks } };
      }
    }

    state.replaceBlocks(index, index, [left, right]);
    renderAll();
    selectionApi.setModelSelection(bodyEl, {
      startBlockIndex: index + 1,
      startOffset: 0,
      endBlockIndex: index + 1,
      endOffset: 0,
    });
    if (keepStyle && carriedMarks) {
      if (state.setPendingMarks) state.setPendingMarks(carriedMarks);
    } else if (state.clearPendingMarks) {
      state.clearPendingMarks();
    }
    state.emitChange({ type: "split" });
  }

  /**
   * Fitur "tab pakai spasi": tekan spasi 2x berturut-turut untuk bikin 1
   * tab, spasi ke-3 jadi 2 tab, spasi ke-4 jadi 3 tab, dst — spasi
   * dilanjut, bukan diulang dari awal. Aturannya per tombol spasi yang
   * ditekan:
   *   - karakter SEBELUM kursor bukan spasi/tab -> spasi biasa (default,
   *     tidak dicegat di sini).
   *   - karakter sebelum kursor spasi biasa (ini spasi ke-2 berturut) ->
   *     spasi sebelumnya itu DIHAPUS, diganti 1 tab (2 spasi -> 1 tab).
   *   - karakter sebelum kursor sudah tab (spasi ke-3/4/dst) -> tinggal
   *     tambah 1 tab baru langsung setelahnya.
   * Lihat handleBackspaceTab() untuk kebalikannya.
   *
   * PENTING soal dari mana ini dipanggil: dulu fitur ini dicegat lewat
   * `keydown` (`e.key === " "`). Itu bekerja di keyboard fisik, tapi TIDAK
   * di keyboard virtual/IME di HP — keyboard virtual umumnya tidak
   * mengirim `keydown` yang valid per-karakter (banyak yang cuma kirim
   * `key: "Unidentified"`, sebagian malah tidak kirim `keydown` sama
   * sekali untuk spasi); ketikan sesungguhnya baru muncul lewat
   * `beforeinput` (`inputType: "insertText"`, `data: " "`), yang memang
   * dirancang cross-platform untuk kasus seperti ini (dan sudah dipakai
   * untuk hal serupa di tempat lain pada `handleBeforeInput`, lihat di
   * atas). Makanya sekarang dipanggil dari `handleBeforeInput`, bukan
   * `handleKeydown` lagi — supaya bekerja sama-sama di desktop & mobile.
   *
   * @returns {boolean} true kalau spasi ini ditangani (jadi tab / tambahan
   *   tab) — caller WAJIB preventDefault() & berhenti di situ. false kalau
   *   dibiarkan jadi spasi biasa (jalur default tetap jalan).
   */
  function trySpaceToTab(e) {
    const sel = selectionApi.getModelSelection(bodyEl);
    if (!sel || !sel.collapsed) return false; // ada seleksi -> biarkan default

    const index = sel.startBlockIndex;
    const block = state.getBlock(index);
    if (isVoidBlockType(block.type)) return false;

    const offset = sel.startOffset;
    const text = blockText(block);
    const prevChar = offset > 0 ? text[offset - 1] : "";

    let newBlock;
    let newOffset;
    if (prevChar === "\t") {
      newBlock = spliceBlockText(block, offset, offset, "\t");
      newOffset = offset + 1;
    } else if (prevChar === " ") {
      newBlock = spliceBlockText(block, offset - 1, offset, "\t");
      newOffset = offset; // 2 karakter (spasi+spasi baru) jadi 1 karakter tab
    } else {
      return false; // spasi pertama dalam deretan -> spasi biasa, biarkan default
    }

    e.preventDefault();
    if (state.checkpoint) state.checkpoint({ coalesce: true });
    state.updateBlock(index, newBlock);
    rerenderBlockAt(index);
    selectionApi.setModelSelection(bodyEl, {
      startBlockIndex: index,
      startOffset: newOffset,
      endBlockIndex: index,
      endOffset: newOffset,
    });
    syncEmptyState();
    state.emitChange({ type: "tab-insert" });
    return true;
  }

  /**
   * Kebalikan dari trySpaceToTab(): Backspace tepat setelah sebuah tab.
   *   - Kalau tab itu bagian dari deretan tab (ada tab lain persis
   *     sebelumnya) -> hapus 1 tab biasa saja (mundur satu langkah dari
   *     "tambah tab baru").
   *   - Kalau itu tab "dasar" (satu-satunya / bukan sambungan tab lain) ->
   *     tab-nya hilang, dikembalikan jadi 2 spasi (mundur dari "2 spasi
   *     jadi 1 tab").
   * Return true kalau kasus ini yang menangani (supaya handleBackspace()
   * biasa tidak ikut jalan juga).
   */
  function handleBackspaceTab(e) {
    const sel = selectionApi.getModelSelection(bodyEl);
    if (!sel || !sel.collapsed || sel.startOffset === 0) return false;

    const index = sel.startBlockIndex;
    const block = state.getBlock(index);
    if (isVoidBlockType(block.type)) return false;

    const offset = sel.startOffset;
    const text = blockText(block);
    if (text[offset - 1] !== "\t") return false;

    e.preventDefault();
    const partOfTabRun = text[offset - 2] === "\t";

    let newBlock;
    let newOffset;
    if (partOfTabRun) {
      newBlock = spliceBlockText(block, offset - 1, offset, "");
      newOffset = offset - 1;
    } else {
      newBlock = spliceBlockText(block, offset - 1, offset, "  ");
      newOffset = offset + 1;
    }

    if (state.checkpoint) state.checkpoint({ coalesce: true });
    state.updateBlock(index, newBlock);
    rerenderBlockAt(index);
    selectionApi.setModelSelection(bodyEl, {
      startBlockIndex: index,
      startOffset: newOffset,
      endBlockIndex: index,
      endOffset: newOffset,
    });
    syncEmptyState();
    state.emitChange({ type: "tab-revert" });
    return true;
  }

  function handleBackspace(e) {
    const sel = selectionApi.getModelSelection(bodyEl);
    if (!sel || !sel.collapsed || sel.startOffset !== 0) return;

    // Kursor di block PERTAMA offset 0 — tidak ada block sebelumnya untuk
    // digabung (mis. dokumen masih kosong lalu user pencet Backspace).
    // Tetap harus preventDefault(): kalau dibiarkan native, browser bisa
    // menghapus elemen block (atau <br> placeholder-nya) itu sendiri karena
    // dianggap "tidak ada apa-apa untuk dihapus". Akibatnya bodyEl kehilangan
    // elemen block yang cocok dengan index-nya, lalu handleInput() di bawah
    // (lihat `if (!el) return;`) diam-diam tidak melakukan apa-apa untuk
    // SETIAP ketikan berikutnya — teks kelihatan browser render sembarangan
    // tapi tidak pernah tersinkron ke model, jadi tidak pernah ke-render
    // ulang dengan benar maupun ke-save. Di sini cukup konsumsi event-nya
    // tanpa mengubah apa pun.
    if (sel.startBlockIndex === 0) {
      e.preventDefault();
      return;
    }
    e.preventDefault();

    const index = sel.startBlockIndex;
    const prevBlock = state.getBlock(index - 1);
    const curBlock = state.getBlock(index);

    // Kasus khusus: prevBlock adalah block TERAKHIR sebuah Scene (sceneId
    // terisi) sedangkan curBlock BUKAN bagian scene manapun (sceneId
    // kosong) — berarti user sedang Backspace di AWAL baris pertama yang
    // ada tepat di bawah Scene, mencoba menggabungkannya naik ke dalam
    // Scene. Kalau baris itu satu-satunya baris yang tersisa di bawah
    // Scene, ini HARUS dicegah: begitu tergabung ke dalam Scene, tidak ada
    // lagi baris "di luar Scene" tersisa buat jadi tempat kursor keluar —
    // Enter di ujung block terakhir Scene cuma akan menambah block baru
    // yang masih mewarisi sceneId yang sama (lihat splitBlockAt di
    // block-model.js), jadi user jadi tidak bisa lagi bikin baris baru DI
    // BAWAH Scene tsb sama sekali. Kalau masih ada >= 2 baris di bawah
    // Scene, baris paling atas (curBlock ini) tetap boleh digabung seperti
    // biasa — toh masih ada sisa baris lain di bawah Scene setelahnya.
    if (prevBlock.sceneId && !curBlock.sceneId) {
      let rowsBelowScene = 0;
      let i = index;
      let b = state.getBlock(i);
      while (b && !b.sceneId) {
        rowsBelowScene++;
        i++;
        b = state.getBlock(i);
      }
      if (rowsBelowScene <= 1) {
        // Batal: event sudah preventDefault() di atas, jadi cukup keluar
        // tanpa menggabung apa pun — baris ini dikunci, tidak bisa dihapus.
        return;
      }
    }

    if (state.checkpoint) state.checkpoint({ coalesce: false });

    // Block sebelumnya adalah divider (void, tanpa teks) — jangan digabung
    // seperti block teks biasa (mergeBlocks akan menempelkan teks ke block
    // bertipe 'divider' dan merusaknya). Cukup hapus dividernya saja, kursor
    // pindah ke awal block yang sedang diisi kursor (sekarang bergeser satu
    // index ke belakang).
    if (isVoidBlockType(prevBlock.type)) {
      state.replaceBlocks(index - 1, index - 1, []);
      // Divider yang baru dihapus mungkin punya musik menempel (lihat blok
      // komentar "Musik" di block-model.js) — buang juga metadatanya supaya
      // tidak jadi entri yatim di document.music selamanya. Tidak berlaku
      // untuk block 'image' (void block lain yang lewat jalur sama ini),
      // gambar tidak pernah jadi tempat musik menempel.
      if (prevBlock.type === "divider" && state.deleteMusic) {
        state.deleteMusic(musicKeyForDivider(prevBlock.id));
      }
      renderAll();
      const newIndex = index - 1;
      selectionApi.setModelSelection(bodyEl, {
        startBlockIndex: newIndex,
        startOffset: 0,
        endBlockIndex: newIndex,
        endOffset: 0,
      });
      if (state.clearPendingMarks) state.clearPendingMarks();
      state.emitChange({ type: "delete-divider" });
      return;
    }

    const mergePoint = blockTextLength(prevBlock);
    const merged = mergeBlocks(prevBlock, curBlock);

    state.replaceBlocks(index - 1, index, [merged]);
    renderAll();
    selectionApi.setModelSelection(bodyEl, {
      startBlockIndex: index - 1,
      startOffset: mergePoint,
      endBlockIndex: index - 1,
      endOffset: mergePoint,
    });
    if (state.clearPendingMarks) state.clearPendingMarks();
    state.emitChange({ type: "merge" });
  }

  /** Taruh kursor di block+offset yang sedekat mungkin dengan `sel` (posisi
   * SEBELUM undo/redo dijalankan), di-clamp ke batas dokumen yang sekarang —
   * dokumen hasil undo/redo bisa punya jumlah block/panjang teks berbeda,
   * jadi posisi lama belum tentu masih valid persis. Tanpa ini, renderAll()
   * membuang seluruh DOM lama sehingga browser kehilangan kursor sama sekali
   * dan defaultnya "melompat" ke elemen pertama di dokumen. */
  function restoreApproxSelection(sel) {
    const blocks = state.getDocument().blocks;
    if (!blocks.length) return;
    const blockIndex = Math.max(0, Math.min(sel ? sel.startBlockIndex : blocks.length - 1, blocks.length - 1));
    const offset = Math.max(0, Math.min(sel ? sel.startOffset : 0, blockTextLength(blocks[blockIndex])));
    bodyEl.focus();
    selectionApi.setModelSelection(bodyEl, {
      startBlockIndex: blockIndex,
      startOffset: offset,
      endBlockIndex: blockIndex,
      endOffset: offset,
    });
  }

  /** Undo/redo: pulihkan snapshot dokumen dari state, lalu render ulang total
   * (struktur block bisa berubah drastis) & sinkronkan kembali field judul. */
  function performUndo() {
    const before = selectionApi.getModelSelection(bodyEl);
    if (!state.undo || !state.undo()) return;
    if (titleEl) {
      titleEl.textContent = state.getDocument().title || "";
      applyTitleStyle(titleEl, state.getTitleStyle ? state.getTitleStyle() : null);
    }
    renderAll();
    restoreApproxSelection(before);
    if (state.clearPendingMarks) state.clearPendingMarks();
    state.emitChange({ type: "history-undo" });
  }

  function performRedo() {
    const before = selectionApi.getModelSelection(bodyEl);
    if (!state.redo || !state.redo()) return;
    if (titleEl) {
      titleEl.textContent = state.getDocument().title || "";
      applyTitleStyle(titleEl, state.getTitleStyle ? state.getTitleStyle() : null);
    }
    renderAll();
    restoreApproxSelection(before);
    if (state.clearPendingMarks) state.clearPendingMarks();
    state.emitChange({ type: "history-redo" });
  }

  /**
   * Ctrl/Cmd+A saat fokus di area isi catatan: batasi seleksi supaya cuma
   * mencakup isi note (semua block di bodyEl), bukan ikut men-select field
   * lain di halaman (mis. judul) — titleEl adalah contenteditable terpisah
   * yang jadi SIBLING dari bodyEl (bukan bersarang di dalamnya), jadi tanpa
   * batasan eksplisit ini seleksi "select all" native browser bisa saja
   * melebar ke luar isi note tergantung browser/webview yang dipakai.
   */
  function selectAllBody() {
    const blocks = state.getDocument().blocks;
    if (!blocks.length) return;
    const lastIndex = blocks.length - 1;
    bodyEl.focus();
    selectionApi.setModelSelection(bodyEl, {
      startBlockIndex: 0,
      startOffset: 0,
      endBlockIndex: lastIndex,
      endOffset: blockTextLength(blocks[lastIndex]),
    });
  }

  function handleKeydown(e) {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      selectAllBody();
      return;
    }
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) performRedo();
      else performUndo();
      return;
    }
    if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      performRedo();
      return;
    }
    if (e.key === "Enter") handleEnter(e);
    else if (e.key === "Backspace") {
      if (!handleBackspaceTab(e)) handleBackspace(e);
    }
    else if (CARET_MOVE_KEYS.has(e.key) && state.getPendingMarks && state.getPendingMarks()) {
      // Pindah kursor manual pakai keyboard: pending marks jadi tidak relevan.
      state.clearPendingMarks();
      state.emitChange({ type: "caret-move" });
    }
  }

  function handleMouseUp() {
    // Klik untuk memindah kursor manual: pending marks jadi tidak relevan.
    if (state.clearPendingMarks && state.getPendingMarks && state.getPendingMarks()) {
      state.clearPendingMarks();
      state.emitChange({ type: "caret-move" });
    }
  }

  // Ukuran & posisi zona kotak centang checklist — HARUS senada dengan
  // posisi ::before di editor.css (.editor-list-item--checklist-item).
  // Marker sengaja BUKAN elemen DOM sungguhan (lihat serializer.js), jadi
  // klik di area kotaknya dideteksi lewat koordinat, bukan event target.
  const CHECKBOX_ZONE_PX = 24;

  function handleMouseDownForChecklist(e) {
    if (bodyEl.getAttribute("contenteditable") === "false") return; // mode Read Only
    const blockEl = e.target.closest(".editor-list-item--checklist-item");
    if (!blockEl || !bodyEl.contains(blockEl)) return;
    const rect = blockEl.getBoundingClientRect();
    const inZone =
      e.clientX >= rect.left &&
      e.clientX <= rect.left + CHECKBOX_ZONE_PX &&
      e.clientY >= rect.top &&
      e.clientY <= rect.top + CHECKBOX_ZONE_PX;
    if (!inZone) return;
    e.preventDefault(); // jangan taruh kursor teks, ini klik kotak centang
    const index = selectionApi.getBlockElements(bodyEl).indexOf(blockEl);
    if (index === -1) return;
    runCommand(toggleChecklistItem, index);
  }

  /**
   * Klik pada teks berlink: perilaku native contenteditable browser cuma
   * menaruh kursor teks di klik biasa (supaya link bisa diedit) dan baru
   * membuka URL-nya kalau Ctrl/Cmd+klik — ini pas untuk desktop power
   * user, tapi di HP (PWA/APK) TIDAK ADA tombol modifier sama sekali,
   * jadi link jadi tidak pernah bisa dibuka lewat tap biasa. Klik biasa
   * di sini dibalik supaya langsung membuka link (seperti hyperlink pada
   * umumnya); Ctrl/Cmd/Alt+klik (desktop) tetap dibiarkan lolos ke
   * perilaku native supaya masih bisa menaruh kursor untuk mengedit teks
   * link tersebut kalau perlu.
   */
  function handleClickForLink(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const linkEl = e.target.closest("a.run-link");
    if (!linkEl || !bodyEl.contains(linkEl)) return;
    e.preventDefault();
    const url = linkEl.dataset.link || linkEl.getAttribute("href");
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  /**
   * Timpa metadata sebuah Scene (backgroundColor/padding/edgeStyle) —
   * dipakai toolbar/scene-sheet.js saat pengguna menyentuh kontrol di
   * bottom sheet kustomisasi Scene. SENGAJA tidak lewat runCommand():
   * perubahan ini tidak berhubungan dengan seleksi/kursor teks sama
   * sekali (beda dari command format biasa), jadi tidak perlu & tidak
   * boleh memaksa fokus balik ke area tulisan atau memindah kursor
   * setiap kali satu preset warna/padding/tepi disentuh.
   */
  function updateScene(sceneId, patch) {
    const current = state.getScene ? state.getScene(sceneId) : null;
    if (!current) return false;
    if (state.checkpoint) state.checkpoint({ coalesce: false });
    state.setScene(sceneId, { ...current, ...patch });
    renderAll();
    state.emitChange({ type: "scene-update" });
    return true;
  }

  /**
   * Tentukan section musik ("target") berdasarkan posisi kursor SAAT INI —
   * dipanggil toolbar/music-sheet.js begitu tombol "Insert Music" ditekan.
   * `ensureSelectionInBody()` menjamin selalu ada posisi kursor yang valid
   * untuk dijadikan acuan, sama seperti runCommand() (lihat komentarnya).
   */
  function getMusicTargetAtCursor() {
    ensureSelectionInBody();
    const sel = selectionApi.getModelSelection(bodyEl);
    const blocks = state.getDocument().blocks;
    const index = sel ? sel.startBlockIndex : blocks.length - 1;
    return findMusicTargetAt(blocks, index);
  }

  /**
   * Timpa/tambah metadata musik satu section (`target`, lihat
   * findMusicTargetAt/musicKeyForTarget di block-model.js) — dipakai
   * toolbar/music-sheet.js saat tombol "Terapkan" di bottom sheet musik
   * ditekan. SENGAJA tidak lewat runCommand(): sama seperti updateScene()
   * di atas, aksi ini tidak berhubungan dengan seleksi/kursor teks (tombol
   * play yang ditekan dobel-tap bisa saja jauh dari posisi kursor terakhir),
   * jadi tidak perlu memaksa fokus balik ke area tulisan atau memindah
   * kursor. Tetap lewat state.checkpoint() supaya undo/redo tetap berlaku
   * (snapshot dokumen di editor-state.js sudah mencakup `document.music`
   * secara otomatis, sejajar `document.scenes`).
   */
  function setSectionMusic(target, patch) {
    if (!state.setMusic) return false;
    const key = musicKeyForTarget(target);
    const current = state.getMusic ? state.getMusic(key) : null;
    if (state.checkpoint) state.checkpoint({ coalesce: false });
    state.setMusic(key, { ...(current || {}), ...patch });
    renderAll();
    state.emitChange({ type: "music-update" });
    return true;
  }

  /** Hapus metadata musik satu section — dipakai tombol "Hapus Musik" di
   * bottom sheet musik. Lihat catatan setSectionMusic() di atas soal kenapa
   * SENGAJA tidak lewat runCommand(). */
  function removeSectionMusic(target) {
    if (!state.deleteMusic) return false;
    const key = musicKeyForTarget(target);
    if (state.checkpoint) state.checkpoint({ coalesce: false });
    state.deleteMusic(key);
    renderAll();
    state.emitChange({ type: "music-remove" });
    return true;
  }

  /**
   * Timpa/tambah style level-dokumen judul (fontFamily/fontSize/color/
   * align/letterSpacing — lihat title-style.js). SENGAJA tidak lewat
   * runCommand(): judul bukan bagian dari model block/seleksi bodyEl sama
   * sekali (satu baris teks polos, lihat app.js), jadi tidak ada block yang
   * dirender ulang atau kursor bodyEl yang perlu dipulihkan — cukup patch
   * `titleStyle` di state lalu terapkan ulang inline style-nya ke titleEl.
   */
  function setTitleStyle(patch) {
    if (state.checkpoint) state.checkpoint({ coalesce: false });
    state.setTitleStyle(patch);
    if (titleEl) applyTitleStyle(titleEl, state.getTitleStyle());
    state.emitChange({ type: "title-style" });
  }

  function getTitleStyle() {
    return (state.getTitleStyle && state.getTitleStyle()) || {};
  }

  /** Pulihkan seleksi model (blockIndex/offset) ke DOM — dipakai toolbar
   * saat tombolnya butuh elemen lain yang mencuri fokus (mis. input URL di
   * link-picker, atau <input type="color"> native) sebelum command jalan.
   * Tanpa ini, begitu fokus pindah ke elemen itu, window.getSelection()
   * di body sudah collapse/hilang duluan sebelum command sempat baca teks
   * yang terseleksi. */
  function restoreSelection(sel) {
    if (!sel) return;
    bodyEl.focus();
    selectionApi.setModelSelection(bodyEl, sel);
  }

  /**
   * Paste SELALU dicegat (e.preventDefault) — lihat paste-handler.js untuk
   * alasannya: HTML clipboard mentah tidak boleh masuk DOM langsung karena
   * bisa bikin elemen di luar satu block yang lagi disorot kursor, yang
   * tidak akan pernah ikut kesinkron ke model (dan akhirnya hilang begitu
   * ada render ulang / gagal ikut tersimpan). Teks polos clipboard diambil
   * manual lalu disisipkan lewat insertPastedText, seperti command lain.
   */
  function handlePaste(e) {
    e.preventDefault();
    const lines = getPastedLines(e);
    if (!lines) return; // clipboard tidak berisi teks (mis. paste gambar)
    runCommand(insertPastedText, lines);
  }

  bodyEl.addEventListener("input", handleInput);
  bodyEl.addEventListener("beforeinput", handleBeforeInput);
  bodyEl.addEventListener("keydown", handleKeydown);
  bodyEl.addEventListener("paste", handlePaste);
  bodyEl.addEventListener("mouseup", handleMouseUp);
  bodyEl.addEventListener("mousedown", handleMouseDownForChecklist);
  bodyEl.addEventListener("click", handleClickForLink);

  renderAll();
  if (titleEl) applyTitleStyle(titleEl, state.getTitleStyle ? state.getTitleStyle() : null);

  return {
    bodyEl,
    titleEl,
    runCommand,
    renderAll,
    undo: performUndo,
    redo: performRedo,
    canUndo: () => (state.canUndo ? state.canUndo() : false),
    canRedo: () => (state.canRedo ? state.canRedo() : false),
    getModelSelection: () => selectionApi.getModelSelection(bodyEl),
    restoreSelection,
    updateScene,
    getMusicTargetAtCursor,
    setSectionMusic,
    removeSectionMusic,
    setTitleStyle,
    getTitleStyle,
  };
}
