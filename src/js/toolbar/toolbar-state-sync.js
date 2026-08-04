/**
 * toolbar-state-sync.js
 * Sinkronisasi status toolbar dengan format teks yang sedang dipilih.
 * Murni MEMBACA model (lewat editor-state + selection.js), tidak pernah
 * memutasi apa pun.
 */

import { getModelSelection } from "../editor/selection.js";
import { blockTextLength } from "../editor/block-model.js";

function collectMarksInSelection(state, bodyEl) {
  const raw = getModelSelection(bodyEl);
  if (!raw) return null;

  const totalBlocks = state.getDocument().blocks.length;
  const startBlockIndex = Math.max(0, Math.min(raw.startBlockIndex, totalBlocks - 1));
  const endBlockIndex = Math.max(0, Math.min(raw.endBlockIndex, totalBlocks - 1));
  const caretBlock = state.getBlock(startBlockIndex);

  let marksList = [];

  if (raw.collapsed) {
    const offset = raw.startOffset;
    let cursor = 0;
    let run = caretBlock.runs[0];
    for (const r of caretBlock.runs) {
      const end = cursor + r.text.length;
      run = r;
      if (offset <= end) break;
      cursor = end;
    }
    const pending = typeof state.getPendingMarks === "function" ? state.getPendingMarks() : null;
    marksList = [{ ...run.marks, ...(pending || {}) }];
  } else {
    for (let i = startBlockIndex; i <= endBlockIndex; i++) {
      const block = state.getBlock(i);
      const from = i === startBlockIndex ? raw.startOffset : 0;
      const to = i === endBlockIndex ? raw.endOffset : blockTextLength(block);
      let cursor = 0;
      for (const run of block.runs) {
        const runStart = cursor;
        const runEnd = cursor + run.text.length;
        cursor = runEnd;
        const overlapStart = Math.max(runStart, from);
        const overlapEnd = Math.min(runEnd, to);
        if (overlapEnd > overlapStart) marksList.push(run.marks);
      }
    }
  }

  if (marksList.length === 0) marksList = [caretBlock.runs[0].marks];

  const uniformBool = (key) => marksList.every((m) => m[key]);
  const uniformValue = (key) => {
    const first = marksList[0][key];
    return marksList.every((m) => m[key] === first) ? first : null;
  };

  return {
    bold: uniformBool("bold"),
    italic: uniformBool("italic"),
    underline: uniformBool("underline"),
    strike: uniformBool("strike"),
    color: uniformValue("color"),
    highlight: uniformValue("highlight"),
    fontSize: uniformValue("fontSize"),
    fontFamily: uniformValue("fontFamily"),
    link: uniformValue("link"),
    blockType: caretBlock.type,
    level: caretBlock.level,
    align: caretBlock.align || "left",
    lineHeight: caretBlock.lineHeight || null,
    letterSpacing: caretBlock.letterSpacing || null,
  };
}

/** Set state aktif tombol toggle format: class `.is-active` + `aria-pressed`. */
function setToggleState(button, active) {
  button.classList.toggle("is-active", active);
  button.setAttribute("aria-pressed", String(active));
}

export function initToolbarStateSync({ state, bodyEl, buttons, onFormattingChange }) {
  function sync() {
    const f = collectMarksInSelection(state, bodyEl);
    if (!f) return;

    setToggleState(buttons.bold, !!f.bold);
    setToggleState(buttons.italic, !!f.italic);
    setToggleState(buttons.underline, !!f.underline);
    setToggleState(buttons.strike, !!f.strike);

    onFormattingChange(f);
  }

  document.addEventListener("selectionchange", () => {
    if (document.activeElement === bodyEl || bodyEl.contains(document.activeElement) || bodyEl.contains(window.getSelection()?.anchorNode)) {
      sync();
    }
  });
  bodyEl.addEventListener("keyup", sync);
  bodyEl.addEventListener("mouseup", sync);
  bodyEl.addEventListener("input", sync);
  // Perubahan yang tidak mengubah seleksi DOM (mis. tombol diklik saat kursor
  // collapsed, hanya menyimpan pending marks) tetap perlu memperbarui tampilan
  // tombol, jadi kita juga dengarkan langsung ke perubahan state.
  if (typeof state.onChange === "function") {
    state.onChange(sync);
  }

  return { sync };
}
