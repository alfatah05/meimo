/**
 * line-height-dropdown.js
 * Dropdown jarak antar baris (line-height). Properti BLOCK-level (bukan
 * mark per-karakter, sama seperti align) — lihat commands.setLineHeight()
 * dan block-model.js.
 *
 * "Normal" SENGAJA pakai value `null` (bukan angka tetap), supaya benar-
 * benar balik ke line-height bawaan CSS (lihat typography.css/editor.css:
 * --leading-snug untuk paragraf, --leading-tight untuk heading — beda
 * per tipe block), bukan angka hardcoded yang bisa meleset dari nilai
 * bawaan aslinya.
 */

import { createEl, openPanel, closeTransientPickers } from "../../utils/dom.js";
import { setLineHeight } from "../../editor/commands.js";

const OPTIONS = [
  { value: 1, label: "Rapat" },
  { value: 1.15, label: "Ringkas" },
  { value: 1.5, label: "Sedang" },
  { value: null, label: "Normal (bawaan)" },
  { value: 2, label: "Lebar" },
  { value: 2.5, label: "Lebih Lebar" },
  { value: 3, label: "Ganda" },
];

export function initLineHeightDropdown(button, editor) {
  let currentValue = null;
  let renderedItems = [];

  function markActive() {
    for (const { el, value } of renderedItems) {
      el.classList.toggle("is-active", (value || null) === (currentValue || null));
    }
    button.classList.toggle("is-active", !!currentValue);
  }

  button.addEventListener("click", () => {
    const panel = createEl("div", { className: "toolbar-panel__list" });
    renderedItems = [];
    for (const opt of OPTIONS) {
      const item = createEl("button", {
        className: "toolbar-panel__item",
        attrs: { type: "button" },
        text: opt.value ? `${opt.label} (${opt.value})` : opt.label,
      });
      item.addEventListener("click", () => {
        editor.runCommand(setLineHeight, opt.value);
        currentValue = opt.value;
        markActive();
        closeTransientPickers();
      });
      renderedItems.push({ el: item, value: opt.value });
      panel.appendChild(item);
    }
    markActive();
    openPanel(button, panel);
  });

  return {
    updateActive(value) {
      currentValue = value || null;
      markActive();
    },
  };
}
