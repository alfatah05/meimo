/**
 * serializer.js
 * Konversi dua arah antara model dokumen (JSON) dan tampilan HTML editor.
 *
 * - render*(): Model -> HTMLElement (satu arah, "rendering")
 * - parseBlockElement(): HTMLElement -> Block (dipakai untuk menyinkronkan
 *   model setelah pengetikan native contenteditable, lihat editor.js)
 *
 * PRINSIP: HTML yang dihasilkan di sini murni media tampilan. Setiap kali
 * model berubah lewat command, block terkait di-render ULANG dari model —
 * HTML lama dibuang, bukan diedit sedikit-sedikit. HTML tidak pernah
 * dianggap sebagai data — hanya proyeksi sementara dari model.
 */

import { createRun, emptyMarks, mergeAdjacentRuns, isListItemType, listItemOrdinal, SCENE_PADDING_PRESETS, DEFAULT_SCENE_META } from "./block-model.js";
import { buildEdgeClipPath, SCENE_EDGE_HEIGHT } from "./scene-edges.js";
import { ensureClipDefsInjected, getClipPathCssValue } from "./image-clip-shapes.js";

const HEADING_TAGS = { 1: "h1", 2: "h2", 3: "h3", 4: "h4", 5: "h5", 6: "h6" };

// Highlight kustom (dari <input type="color">) disimpan sebagai hex mentah
// di marks.highlight, tapi harus dirender translucent (alpha 0.35) supaya
// konsisten dengan preset (--highlight-*, lihat themes.css) dan teks di
// bawahnya tetap terbaca.
function hexToHighlightRgba(hex) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, 0.35)`;
}

function tagForBlock(block) {
  if (block.type === "heading") return HEADING_TAGS[block.level] || "h2";
  if (block.type === "quote") return "blockquote";
  return "p";
}

function hasAnyMark(marks) {
  return (
    marks.bold || marks.italic || marks.underline || marks.strike ||
    marks.color || marks.highlight || marks.fontSize || marks.fontFamily ||
    marks.link
  );
}

function renderRunNode(run) {
  if (!hasAnyMark(run.marks) ) {
    return document.createTextNode(run.text);
  }
  const m = run.marks;
  // Run dengan link dirender sebagai <a> sungguhan (bukan span) supaya
  // benar-benar bisa dibuka lewat klik/tap biasa (lihat handleClickForLink
  // di editor.js — perilaku native contenteditable browser cuma menaruh
  // kursor di klik biasa, jadi ditimpa di sana khusus untuk elemen ini);
  // mark lain (bold, warna, dst.) tetap bisa nempel bareng lewat inline
  // style yang sama seperti span biasa.
  const span = document.createElement(m.link ? "a" : "span");
  span.className = "run";
  if (m.link) {
    span.classList.add("run-link");
    span.href = m.link;
    span.target = "_blank";
    span.rel = "noopener noreferrer";
    span.dataset.link = m.link;
  }
  const style = [];

  if (m.bold) span.dataset.bold = "1";
  if (m.italic) { span.dataset.italic = "1"; style.push("font-style:italic"); }
  const decorations = [];
  if (m.underline) decorations.push("underline");
  if (m.strike) decorations.push("line-through");
  if (decorations.length) {
    if (m.underline) span.dataset.underline = "1";
    if (m.strike) span.dataset.strike = "1";
    style.push(`text-decoration:${decorations.join(" ")}`);
  }
  if (m.color) { span.dataset.color = m.color; style.push(`color:${m.color}`); }
  if (m.highlight) {
    span.dataset.highlight = m.highlight;
    if (m.highlight.startsWith("#")) {
      span.classList.add("run-highlight-custom");
      style.push(`background-color:${hexToHighlightRgba(m.highlight)}`);
    } else {
      span.classList.add(`run-highlight-${m.highlight}`);
    }
  }
  if (m.fontSize) { span.dataset.fontSize = String(m.fontSize); style.push(`font-size:${m.fontSize}px`); }
  if (m.fontFamily) { span.dataset.fontFamily = m.fontFamily; style.push(`font-family:"${m.fontFamily}"`); }
  if (m.bold) { style.push("font-weight:700"); }

  if (style.length) span.setAttribute("style", style.join(";"));
  span.textContent = run.text;
  return span;
}

/**
 * Model Block -> HTMLElement (h1..h6 atau p), siap dipasang ke DOM.
 * `meta.number` dipakai untuk numbered-list-item (lihat listItemOrdinal di
 * block-model.js — dihitung oleh pemanggil karena butuh melihat block-block
 * tetangga, bukan cuma block ini sendiri).
 */
export function renderBlock(block, meta = {}) {
  // Divider adalah block "void" — tidak punya teks/runs yang berarti, jadi
  // dirender sebagai elemen non-editable (contenteditable="false") berisi
  // <hr>, bukan lewat jalur run-based di bawah. Ini membuatnya jadi "pulau"
  // non-editable di dalam area contenteditable, mirip garis pemisah pada
  // editor Notion/Google Docs — kursor bisa ditaruh sebelum/sesudahnya,
  // tapi tidak bisa mengetik di dalamnya. Lihat editor.js (handleBackspace)
  // untuk cara block ini dihapus tanpa merusak teks di sekitarnya.
  if (block.type === "divider") {
    const el = document.createElement("div");
    el.dataset.blockId = block.id;
    el.dataset.blockType = "divider";
    el.classList.add("editor-block", "editor-block--divider");
    el.setAttribute("contenteditable", "false");
    el.appendChild(document.createElement("hr"));
    return el;
  }

  // Image adalah block "void" lain (lihat komentar Divider di atas & block
  // VOID_BLOCK_TYPES di block-model.js) — dirender non-editable, isi
  // sungguhannya (<img src>) BELUM diisi di sini karena butuh baca blob
  // dari IndexedDB secara async (lihat services/image-service.js
  // hydrateImageElements(), dipanggil editor.js setelah block ini
  // terpasang ke DOM). Ukuran/posisi/wrap disetel lewat CSS custom
  // property + class supaya toolbar/image-sheet.js juga bisa mem-preview
  // perubahan langsung ke elemen ini tanpa lewat re-render model.
  if (block.type === "image") {
    const el = document.createElement("div");
    el.dataset.blockId = block.id;
    el.dataset.blockType = "image";
    const align = block.align === "left" || block.align === "right" ? block.align : "center";
    el.classList.add("editor-block", "editor-block--image", `editor-block--image-${align}`);
    if (block.wrap && align !== "center") el.classList.add("editor-block--image-wrap");
    el.setAttribute("contenteditable", "false");
    el.style.setProperty("--img-w", `${block.imageWidth || 320}px`);
    el.style.setProperty("--img-ox", `${block.imageOffsetX || 0}px`);
    el.style.setProperty("--img-oy", `${block.imageOffsetY || 0}px`);
    el.style.setProperty("--img-scale", String(block.imageScale != null ? block.imageScale : 1));
    el.style.setProperty("--img-rotate", `${block.imageRotate || 0}deg`);
    el.style.setProperty("--img-h", `${block.imageHeight || 200}px`);
    el.style.setProperty("--img-radius", `${block.borderRadius ?? 12}px`);
    // Crop bentuk SVG (bintang/love/dll, lihat image-clip-shapes.js) — kalau
    // aktif, border-radius di atas otomatis tidak lagi terlihat berpengaruh
    // karena editor.css menghilangkan border-radius & border frame lewat
    // class editor-block--image-clipped (bentuknya sudah ditentukan penuh
    // oleh clip-path, bukan kotak membulat lagi).
    const clipShape = block.clipShape || "none";
    ensureClipDefsInjected();
    el.style.setProperty("--img-clip", getClipPathCssValue(clipShape));
    el.classList.toggle("editor-block--image-clipped", clipShape !== "none");
    el.classList.toggle("editor-block--image-transparent", !!block.transparentBg);

    const frame = document.createElement("div");
    frame.className = "editor-image__frame";
    if (block.assetId) {
      const img = document.createElement("img");
      img.className = "editor-image__img";
      img.alt = "";
      img.draggable = false;
      img.dataset.assetId = block.assetId;
      frame.appendChild(img);
    } else {
      frame.classList.add("editor-image__frame--empty");
      frame.innerHTML =
        '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5.5-5.5L7 19"/></svg>';
    }
    el.appendChild(frame);
    return el;
  }

  const el = document.createElement(tagForBlock(block));
  el.dataset.blockId = block.id;
  el.dataset.blockType = block.type;
  if (block.level) el.dataset.level = String(block.level);
  el.style.textAlign = block.align || "left";
  if (block.lineHeight) el.style.lineHeight = String(block.lineHeight);
  if (block.letterSpacing) el.style.letterSpacing = `${block.letterSpacing}px`;
  el.classList.add("editor-block");

  // Marker (bullet "•" / nomor / checkbox) SENGAJA tidak dibuat sebagai
  // elemen DOM anak, tapi lewat CSS ::before (lihat editor.css) — supaya
  // tidak ikut terhitung sebagai karakter oleh selection.js saat
  // menghitung offset kursor dalam block ini.
  if (isListItemType(block.type)) {
    el.classList.add("editor-list-item", `editor-list-item--${block.type}`);
    if (block.type === "numbered-list-item") {
      el.dataset.markerNumber = String(meta.number || 1);
    }
    if (block.type === "checklist-item") {
      el.dataset.checked = block.checked ? "true" : "false";
    }
  }

  const totalLength = block.runs.reduce((n, r) => n + r.text.length, 0);
  if (totalLength === 0) {
    el.appendChild(document.createElement("br"));
  } else {
    for (const run of block.runs) {
      if (run.text.length === 0) continue;
      el.appendChild(renderRunNode(run));
    }
  }
  return el;
}

/**
 * Bungkus visual Scene: Model metadata Scene -> { wrapperEl, bodyEl }.
 * `wrapperEl` adalah elemen `<section>` yang harus dipasang ke bodyEl
 * editor (di posisi rentang block Scene tsb, lihat editor.js renderAll()),
 * `bodyEl` (hasil fungsi ini, JANGAN tertukar dengan bodyEl editor) adalah
 * kontainer TEMPAT block-block anggota Scene sesungguhnya dipasang oleh
 * pemanggil (satu per satu, lewat renderBlock() biasa) — dipisah dari
 * wrapperEl supaya padding & bar tepi (edge style) tidak ikut mendorong
 * posisi bar-nya sendiri.
 *
 * Scene BUKAN block "void" (lihat VOID_BLOCK_TYPES di block-model.js) —
 * wrapper ini sendiri tidak dirender lewat renderBlock() & tidak
 * mendapat `data-block-id` (supaya tidak ikut dihitung selection.js
 * sebagai satu block/posisi kursor) — hanya block ANGGOTA di dalam
 * `bodyEl`-nya yang punya `data-block-id`.
 */
export function renderSceneWrapper(sceneId, meta) {
  const m = { ...DEFAULT_SCENE_META, ...(meta || {}) };
  const wrapperEl = document.createElement("section");
  wrapperEl.className = "editor-scene";
  wrapperEl.dataset.sceneId = sceneId;
  wrapperEl.dataset.edgeStyle = m.edgeStyle || "straight";
  // wrapperEl (bar edge, gutter padding, dsb.) SENDIRI bukan tempat isi
  // catatan — cuma bodyEl-nya yang boleh diketik. Tanpa contenteditable
  // "false" di sini, wrapperEl ikut mewarisi editable dari area editor di
  // atasnya: klik yang jatuh di celah antara topEdge/bodyEl/bottomEdge
  // (mis. persis di bar edge) masih dianggap browser sebagai posisi
  // kursor valid DI WRAPPER, lalu teks yang diketik nyempil sebagai node
  // baru langsung di wrapperEl (bukan di dalam bodyEl) — makanya kelihatan
  // nongol di area edge. contenteditable="true" di bodyEl di bawah
  // menyalakan lagi editability KHUSUS untuk area isi Scene saja (pola
  // "pulau editable" standar untuk elemen non-editable yang punya area
  // editable di dalamnya).
  wrapperEl.setAttribute("contenteditable", "false");
  const paddingPx = SCENE_PADDING_PRESETS[m.padding] ?? SCENE_PADDING_PRESETS.md;
  wrapperEl.style.setProperty("--scene-padding", `${paddingPx}px`);

  const hasEdge = m.edgeStyle && m.edgeStyle !== "straight";

  // BUG FIX: dulu wrapperEl SENDIRI juga dicat backgroundColor penuh
  // sekotak-kotaknya, warna PERSIS SAMA dengan bar edge yang bentuknya
  // dipotong `clip-path` (ombak dkk). Bagian bar edge yang "dipotong"
  // (celah gelombangnya) jadinya cuma menampakkan warna wrapper di
  // baliknya yang identik — jadi celah gelombang itu tidak pernah
  // kelihatan, yang tampak dari luar cuma kotak lurus wrapper (makanya
  // ombaknya seperti "ketarik ke tengah"/ketutup). Wrapper HARUS
  // transparan begitu ada edge berbentuk, supaya bagian yang dipotong
  // clip-path menampakkan latar ASLI di belakang Scene (bukan warna
  // Scene sendiri) dan siluet ombaknya baru kelihatan sebagai batas.
  // bodyEl-lah yang pegang warna latar Scene untuk area isinya; kalau
  // TIDAK ada edge (straight), wrapperEl sendiri yang dicat penuh
  // seperti sebelumnya (tidak ada bar edge yang perlu "ditembus").
  if (hasEdge) {
    wrapperEl.style.backgroundColor = "transparent";
  } else {
    wrapperEl.style.backgroundColor = m.backgroundColor || "transparent";
  }

  if (hasEdge) {
    const topEdge = document.createElement("div");
    topEdge.className = "editor-scene__edge editor-scene__edge--top";
    topEdge.style.backgroundColor = m.backgroundColor || "transparent";
    topEdge.style.clipPath = buildEdgeClipPath(m.edgeStyle, "top", SCENE_EDGE_HEIGHT);
    topEdge.style.webkitClipPath = topEdge.style.clipPath;
    wrapperEl.appendChild(topEdge);
  }

  const bodyEl = document.createElement("div");
  bodyEl.className = "editor-scene__body";
  bodyEl.setAttribute("contenteditable", "true");
  if (hasEdge) bodyEl.style.backgroundColor = m.backgroundColor || "transparent";
  wrapperEl.appendChild(bodyEl);

  if (hasEdge) {
    const bottomEdge = document.createElement("div");
    bottomEdge.className = "editor-scene__edge editor-scene__edge--bottom";
    bottomEdge.setAttribute("contenteditable", "false");
    bottomEdge.style.backgroundColor = m.backgroundColor || "transparent";
    bottomEdge.style.clipPath = buildEdgeClipPath(m.edgeStyle, "bottom", SCENE_EDGE_HEIGHT);
    bottomEdge.style.webkitClipPath = bottomEdge.style.clipPath;
    wrapperEl.appendChild(bottomEdge);
  }

  return { wrapperEl, bodyEl };
}

/** Model Document (blocks) -> DocumentFragment berisi seluruh block. */
export function renderDocumentBody(blocks) {
  const frag = document.createDocumentFragment();
  blocks.forEach((block, i) => {
    frag.appendChild(renderBlock(block, { number: listItemOrdinal(blocks, i) }));
  });
  return frag;
}

function readMarksFromSpan(span) {
  const marks = emptyMarks();
  const ds = span.dataset;
  if (ds.bold) marks.bold = true;
  if (ds.italic) marks.italic = true;
  if (ds.underline) marks.underline = true;
  if (ds.strike) marks.strike = true;
  if (ds.color) marks.color = ds.color;
  if (ds.highlight) marks.highlight = ds.highlight;
  if (ds.fontSize) marks.fontSize = Number(ds.fontSize);
  if (ds.fontFamily) marks.fontFamily = ds.fontFamily;
  if (ds.link) marks.link = ds.link;
  return marks;
}

/**
 * HTMLElement block (h1..h6/p) -> Block model.
 * Dipakai untuk menyinkronkan model setelah browser memodifikasi DOM
 * secara native (mengetik biasa), BUKAN untuk menyimpan HTML sebagai data.
 */
export function parseBlockElement(el, previousBlock) {
  const tag = el.tagName.toLowerCase();
  const level = /^h[1-6]$/.test(tag) ? Number(tag[1]) : null;

  // List item (bulleted/numbered/checklist) dirender pakai tag <p> yang sama
  // dengan paragraph biasa (markernya cuma CSS ::before), jadi tag DOM saja
  // tidak cukup untuk tahu tipe block-nya kalau bukan heading/quote — tipe &
  // status checked dipertahankan dari model sebelumnya (mengetik native
  // tidak pernah mengubah tipe block, hanya command/Enter/Backspace yang boleh).
  let type = level ? "heading" : tag === "blockquote" ? "quote" : "paragraph";
  let checked;
  if (!level && previousBlock && isListItemType(previousBlock.type)) {
    type = previousBlock.type;
    if (type === "checklist-item") checked = !!previousBlock.checked;
  }

  const align = el.style.textAlign || "left";
  const lineHeight = el.style.lineHeight ? Number(el.style.lineHeight) : null;
  const letterSpacing = el.style.letterSpacing ? parseFloat(el.style.letterSpacing) : null;

  const runs = [];
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent.length > 0) runs.push(createRun(node.textContent, {}));
    } else if (node.nodeName === "BR") {
      // separator kosong — diabaikan, hanya penanda baris kosong
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const text = node.textContent || "";
      if (text.length > 0) runs.push(createRun(text, readMarksFromSpan(node)));
    }
  }

  const merged = mergeAdjacentRuns(runs.length ? runs : [createRun("")]);

  const result = {
    id: (previousBlock && previousBlock.id) || el.dataset.blockId,
    type,
    level,
    align,
    lineHeight,
    letterSpacing,
    runs: merged,
    // BUG FIX: tanpa ini, mengetik native (handleInput di editor.js) akan
    // menimpa block dengan hasil parseBlockElement() ini dan MENGHAPUS
    // sceneId-nya (karena tidak pernah disalin ke sini) — Scene yang
    // sedang diketik jadi "lepas" dari model tanpa terlihat sampai render
    // ulang berikutnya (mis. tekan Enter), baru kelihatan Scene-nya hilang
    // atau teksnya keluar dari Scene. sceneId dipertahankan dari block
    // sebelumnya persis seperti type/checked di atas — mengetik biasa
    // tidak pernah mengubah keanggotaan Scene suatu block.
    sceneId: (previousBlock && previousBlock.sceneId) || null,
  };
  if (type === "checklist-item") result.checked = !!checked;
  return result;
}
