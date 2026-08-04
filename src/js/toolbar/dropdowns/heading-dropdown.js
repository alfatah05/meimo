/**
 * heading-dropdown.js
 * Dropdown pilihan Paragraph / H1–H6. Menerapkan commands.setHeading()
 * ke block yang tercakup seleksi/kursor.
 */

import { createEl, openPanel, closeTransientPickers } from "../../utils/dom.js";
import { setHeading } from "../../editor/commands.js";

const OPTIONS = [
  { level: 0, label: "Paragraf" },
  { level: 1, label: "Heading 1" },
  { level: 2, label: "Heading 2" },
  { level: 3, label: "Heading 3" },
  { level: 4, label: "Heading 4" },
  { level: 5, label: "Heading 5" },
  { level: 6, label: "Heading 6" },
];

export function initHeadingDropdown(button, editor) {
  const labelEl = button.querySelector(".toolbar-dropdown__label");
  let currentLevel = 0;
  let renderedItems = []; // { el, level }

  function markActive() {
    for (const { el, level } of renderedItems) {
      el.classList.toggle("is-active", level === currentLevel);
    }
  }

  function updateLabel(level) {
    currentLevel = level || 0;
    const opt = OPTIONS.find((o) => o.level === currentLevel);
    if (labelEl && opt) labelEl.textContent = opt.label;
    markActive();
  }

  button.addEventListener("click", () => {
    const panel = createEl("div", { className: "toolbar-panel__list" });
    renderedItems = [];
    for (const opt of OPTIONS) {
      const item = createEl("button", {
        className: `toolbar-panel__item toolbar-panel__item--heading-${opt.level}`,
        attrs: { type: "button" },
        text: opt.label,
      });
      item.addEventListener("click", () => {
        editor.runCommand(setHeading, opt.level);
        updateLabel(opt.level);
        closeTransientPickers();
      });
      renderedItems.push({ el: item, level: opt.level });
      panel.appendChild(item);
    }
    markActive();
    openPanel(button, panel);
  });

  return { updateLabel };
}
