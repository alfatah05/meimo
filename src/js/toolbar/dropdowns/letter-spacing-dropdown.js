/**
 * letter-spacing-dropdown.js
 * Dropdown jarak antar huruf (letter-spacing, dalam px). Properti
 * BLOCK-level (sama seperti align/line-height) — lihat
 * commands.setLetterSpacing() dan block-model.js.
 */

import { createEl, openPanel, closeTransientPickers } from "../../utils/dom.js";
import { setLetterSpacing } from "../../editor/commands.js";

const OPTIONS = [
  { value: -0.5, label: "Rapat" },
  { value: 0, label: "Normal" },
  { value: 1, label: "Lebar" },
  { value: 2, label: "Lebih Lebar" },
];

export function initLetterSpacingDropdown(button, editor) {
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
        text: `${opt.label} (${opt.value}px)`,
      });
      item.addEventListener("click", () => {
        if (document.activeElement === editor.titleEl) {
          editor.setTitleStyle({ letterSpacing: opt.value });
        } else {
          editor.runCommand(setLetterSpacing, opt.value);
        }
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
