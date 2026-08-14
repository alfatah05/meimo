/**
 * link-picker.js
 * Panel kecil di floating toolbar untuk menerapkan/menghapus hyperlink pada
 * teks yang sedang diseleksi. Polanya sama seperti color-picker.js /
 * highlight-picker.js (pakai openPanel dari dom.js), cuma isinya input teks
 * biasa alih-alih swatch warna.
 */

import { createEl, openPanel, closeAllPanels } from "../utils/dom.js";
import { setLink } from "../editor/commands.js";
import { t } from "../i18n/i18n.js";

/** Kasih scheme default (https://) kalau user cuma ngetik "contoh.com". */
function normalizeUrl(raw) {
  const value = raw.trim();
  if (!value) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value; // sudah ada scheme (http:, mailto:, tel:, dst.)
  return `https://${value}`;
}

export function initLinkPicker(button, editor) {
  if (!button) return;

  button.addEventListener("click", () => {
    // WAJIB disimpan di awal, SEBELUM panel dibuka & input di-fokus —
    // begitu fokus pindah ke <input>, seleksi teks di editor langsung
    // collapse/hilang, jadi kalau kita baru baca seleksi nanti (pas user
    // klik "Terapkan"), sudah kelewat dan command tidak tahu teks mana
    // yang mau diberi link.
    const savedSelection = editor.getModelSelection();

    const panel = createEl("div", { className: "toolbar-panel__link" });

    const input = createEl("input", {
      className: "toolbar-panel__link-input",
      attrs: {
        type: "url",
        placeholder: t("link.placeholder"),
        inputmode: "url",
        autocapitalize: "off",
        autocorrect: "off",
        spellcheck: "false",
      },
    });

    const hint = createEl("p", {
      className: "toolbar-panel__link-hint",
      text: t("link.hint"),
    });

    const actions = createEl("div", { className: "toolbar-panel__link-actions" });
    const removeBtn = createEl("button", {
      className: "toolbar-panel__link-remove",
      attrs: { type: "button" },
      text: t("link.remove"),
    });
    const applyBtn = createEl("button", {
      className: "toolbar-panel__link-apply",
      attrs: { type: "button" },
      text: t("link.apply"),
    });

    function apply() {
      const url = normalizeUrl(input.value);
      if (!url) return;
      editor.restoreSelection(savedSelection);
      editor.runCommand(setLink, url);
      closeAllPanels();
    }

    applyBtn.addEventListener("click", apply);
    removeBtn.addEventListener("click", () => {
      editor.restoreSelection(savedSelection);
      editor.runCommand(setLink, null);
      closeAllPanels();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        apply();
      }
    });

    actions.appendChild(removeBtn);
    actions.appendChild(applyBtn);
    panel.appendChild(input);
    panel.appendChild(hint);
    panel.appendChild(actions);

    openPanel(button, panel, { align: "left" });
    // Fokus ke input supaya keyboard mobile langsung muncul. Ini pindahin
    // fokus dari body editor (lihat komentar savedSelection di atas).
    input.focus();
  });
}
