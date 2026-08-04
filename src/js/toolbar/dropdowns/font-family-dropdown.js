/**
 * font-family-dropdown.js
 * Dropdown Font Family di floating toolbar. Daftarnya BUKAN daftar bebas —
 * hanya font yang boleh dipakai user:
 *   1. 2 font bawaan (Inter, Georgia) — selalu ada.
 *   2. Font kustom yang sudah diunduh user dari Font Library (halaman
 *      Kelola Font / font-manager.html) — dibaca dari IndexedDB lewat
 *      font-service.js.
 * Kalau user mau font lain di luar itu, dropdown ini mengarahkan ke
 * font-manager.html untuk mengunduhnya dulu — TIDAK ada input font bebas.
 */

import { createEl, openPanel, closeTransientPickers } from "../../utils/dom.js";
import { setFontFamily } from "../../editor/commands.js";
import { getAvailableFonts } from "../../services/font-service.js";

const DEFAULT_FAMILY = "Inter";

export function initFontFamilyDropdown(button, editor) {
  const labelEl = button.querySelector(".toolbar-dropdown__label");
  let currentFamily = null;
  let renderedItems = []; // { el, family }

  function markActive() {
    const effective = currentFamily || DEFAULT_FAMILY;
    for (const { el, family } of renderedItems) {
      el.classList.toggle("is-active", family === effective);
    }
  }

  function updateLabel(family, fallback = DEFAULT_FAMILY) {
    currentFamily = family || null;
    if (labelEl) labelEl.textContent = family || fallback;
    markActive();
  }

  async function buildPanel() {
    const fonts = await getAvailableFonts();
    const panel = createEl("div", { className: "toolbar-panel__list" });
    renderedItems = [];

    if (fonts.length === 0) {
      panel.appendChild(
        createEl("div", {
          className: "toolbar-panel__empty",
          text: "Belum ada font tersedia.",
        })
      );
    }

    for (const font of fonts) {
      const item = createEl("button", {
        className: "toolbar-panel__item",
        attrs: { type: "button" },
        text: font.name,
      });
      item.style.fontFamily = `"${font.family}"`;
      item.addEventListener("click", () => {
        if (document.activeElement === editor.titleEl) {
          editor.setTitleStyle({ fontFamily: font.family });
        } else {
          editor.runCommand(setFontFamily, font.family);
        }
        updateLabel(font.family);
        closeTransientPickers();
      });
      renderedItems.push({ el: item, family: font.family });
      panel.appendChild(item);
    }

    panel.appendChild(
      createEl("a", {
        className: "toolbar-panel__item toolbar-panel__item--manage-fonts",
        attrs: { href: "/font-manager" },
        text: "+ Kelola Font…",
      })
    );

    markActive();
    return panel;
  }

  button.addEventListener("click", async () => {
    const panel = await buildPanel();
    openPanel(button, panel);
  });

  return { updateLabel };
}
