/**
 * selection.js
 * Menjembatani seleksi/kursor DOM (window.getSelection) dengan posisi di
 * dalam model dokumen (index block + offset karakter). Ini yang membuat
 * command bisa memformat berdasarkan MODEL, bukan bergantung pada Range DOM
 * yang rapuh setelah re-render.
 */

function textLengthOf(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent.length;
  if (node.nodeName === "BR") return 0;
  return node.textContent.length;
}

/** Hitung offset karakter (relatif terhadap awal block) dari sebuah titik DOM (node, offset-DOM). */
function charOffsetWithinBlock(blockEl, node, domOffset) {
  let total = 0;
  let found = false;
  let result = 0;

  (function walk(n) {
    if (found) return;
    if (n === node) {
      if (n.nodeType === Node.TEXT_NODE) {
        result = total + domOffset;
      } else {
        const children = Array.from(n.childNodes);
        for (let i = 0; i < domOffset && i < children.length; i++) total += textLengthOf(children[i]);
        result = total;
      }
      found = true;
      return;
    }
    if (n.nodeType === Node.TEXT_NODE) {
      total += n.textContent.length;
      return;
    }
    if (n.nodeName === "BR") return;
    for (const child of Array.from(n.childNodes)) {
      walk(child);
      if (found) return;
    }
  })(blockEl);

  return found ? result : total;
}

/** Kebalikan dari charOffsetWithinBlock: cari (node, offset-DOM) untuk sebuah offset karakter. */
function resolveDomPosition(blockEl, targetOffset) {
  let remaining = targetOffset;
  let result = null;

  (function walk(n) {
    if (result) return;
    if (n.nodeType === Node.TEXT_NODE) {
      const len = n.textContent.length;
      if (remaining <= len) {
        result = { node: n, offset: remaining };
      } else {
        remaining -= len;
      }
      return;
    }
    if (n.nodeName === "BR") return;
    for (const child of Array.from(n.childNodes)) {
      walk(child);
      if (result) return;
    }
  })(blockEl);

  if (!result) {
    if (blockEl.lastChild && blockEl.lastChild.nodeType === Node.TEXT_NODE) {
      result = { node: blockEl.lastChild, offset: blockEl.lastChild.textContent.length };
    } else {
      result = { node: blockEl, offset: blockEl.childNodes.length };
    }
  }
  return result;
}

function closestBlockEl(bodyEl, node) {
  let n = node;
  while (n && n !== bodyEl) {
    if (n.nodeType === Node.ELEMENT_NODE && n.dataset && n.dataset.blockId) return n;
    n = n.parentNode;
  }
  return bodyEl.firstElementChild;
}

/**
 * Semua elemen block (data-block-id) di dalam bodyEl, URUT SESUAI DOKUMEN —
 * dipakai sebagai "sumber kebenaran" pemetaan index model -> elemen DOM,
 * BUKAN `bodyEl.children`. Kedua hal itu SENGAJA dipisah supaya block masih
 * bisa dibungkus elemen pembungkus non-block (mis. `<section
 * class="editor-scene">` untuk fitur Scene, lihat editor/serializer.js
 * renderSceneWrapper()) tanpa merusak pemetaan index/kursor ini — block di
 * dalam Scene tetap descendant bodyEl, cuma tidak lagi ANAK LANGSUNG-nya.
 * querySelectorAll mengembalikan node dalam document order, jadi urutannya
 * otomatis tetap sama seperti urutan `document.blocks`.
 */
export function getBlockElements(bodyEl) {
  return Array.from(bodyEl.querySelectorAll("[data-block-id]"));
}

function blockIndexOf(bodyEl, blockEl) {
  return getBlockElements(bodyEl).indexOf(blockEl);
}

/**
 * Ambil seleksi saat ini (harus berada di dalam bodyEl) dan ubah jadi
 * posisi model: { startBlockIndex, startOffset, endBlockIndex, endOffset, collapsed }
 * Selalu ternormalisasi start <= end secara urutan dokumen.
 */
export function getModelSelection(bodyEl) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!bodyEl.contains(range.startContainer) || !bodyEl.contains(range.endContainer)) return null;

  const startBlockEl = closestBlockEl(bodyEl, range.startContainer);
  const endBlockEl = closestBlockEl(bodyEl, range.endContainer);
  if (!startBlockEl || !endBlockEl) return null;

  const startBlockIndex = blockIndexOf(bodyEl, startBlockEl);
  const endBlockIndex = blockIndexOf(bodyEl, endBlockEl);
  const startOffset = charOffsetWithinBlock(startBlockEl, range.startContainer, range.startOffset);
  const endOffset = charOffsetWithinBlock(endBlockEl, range.endContainer, range.endOffset);

  return {
    startBlockIndex,
    startOffset,
    endBlockIndex,
    endOffset,
    collapsed: sel.isCollapsed,
  };
}

/** Pasang kursor/seleksi DOM sesuai posisi model (dipanggil setelah re-render). */
export function setModelSelection(bodyEl, { startBlockIndex, startOffset, endBlockIndex, endOffset }) {
  const blockEls = getBlockElements(bodyEl);
  const startBlockEl = blockEls[startBlockIndex];
  const endBlockEl = blockEls[endBlockIndex];
  if (!startBlockEl || !endBlockEl) return;

  const startPos = resolveDomPosition(startBlockEl, startOffset);
  const endPos = resolveDomPosition(endBlockEl, endOffset);

  const range = document.createRange();
  range.setStart(startPos.node, startPos.offset);
  range.setEnd(endPos.node, endPos.offset);

  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

export function getCaretBlockIndex(bodyEl) {
  const modelSel = getModelSelection(bodyEl);
  return modelSel ? modelSel.startBlockIndex : 0;
}
