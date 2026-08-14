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
import { t } from "../../i18n/i18n.js";

function getOptions() {
  return [
    { value: 1, labelKey: "lineHeight.tight" },
    { value: 1.15, labelKey: "lineHeight.snug" },
    { value: 1.5, labelKey: "lineHeight.relaxed" },
    { value: null, labelKey: "lineHeight.normal" },
    { value: 2, labelKey: "lineHeight.loose" },
    { value: 2.5, labelKey: "lineHeight.looser" },
    { value: 3, labelKey: "lineHeight.double" },
  ];
}

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
    for (const opt of getOptions()) {
      const item = createEl("button", {
        className: "toolbar-panel__item",
        attrs: { type: "button" },
        text: opt.value != null ? `${t(opt.labelKey)} (${opt.value})` : t(opt.labelKey),
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
