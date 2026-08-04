/**
 * font-size-dropdown.js
 * Dropdown ukuran font (px), sesuai daftar wajib di PROJECT_RULES.md.
 */

import { createEl, openPanel, closeTransientPickers } from "../../utils/dom.js";
import { setFontSize } from "../../editor/commands.js";

const SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 64];

export function initFontSizeDropdown(button, editor) {
  const labelEl = button.querySelector(".toolbar-dropdown__label");
  let currentSize = null;
  let currentFallback = 16; // beda saat judul fokus (48) — lihat toolbar.js
  let renderedItems = []; // { el, size }

  function markActive() {
    const effective = currentSize || currentFallback;
    for (const { el, size } of renderedItems) {
      el.classList.toggle("is-active", size === effective);
    }
  }

  function updateLabel(px, fallback = "16") {
    currentSize = px || null;
    currentFallback = Number(fallback);
    if (labelEl) labelEl.textContent = px ? String(px) : fallback;
    markActive();
  }

  button.addEventListener("click", () => {
    const panel = createEl("div", { className: "toolbar-panel__list" });
    renderedItems = [];
    for (const size of SIZES) {
      const item = createEl("button", {
        className: "toolbar-panel__item",
        attrs: { type: "button" },
        text: `${size}px`,
      });
      item.style.fontSize = `${Math.min(size, 24)}px`;
      item.addEventListener("click", () => {
        if (document.activeElement === editor.titleEl) {
          editor.setTitleStyle({ fontSize: size });
        } else {
          editor.runCommand(setFontSize, size);
        }
        updateLabel(size, String(currentFallback));
        closeTransientPickers();
      });
      renderedItems.push({ el: item, size });
      panel.appendChild(item);
    }
    markActive();
    openPanel(button, panel);
  });

  return { updateLabel };
}
