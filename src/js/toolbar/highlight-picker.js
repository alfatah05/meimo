/**
 * highlight-picker.js
 * Pemilih warna highlight/stabilo. Tampil sebagai baris kedua topbar
 * (#colorPickerBar, lihat openColorBar() di ../utils/dom.js) — bukan lagi
 * floating dropdown. Preset dipetakan lewat CSS custom property (var
 * --highlight-*) agar tetap kontras di tiap tema (lihat themes.css /
 * editor.css), DITAMBAH pilihan warna kustom lewat <input type="color">
 * native — nilainya disimpan sebagai hex langsung di marks.highlight dan
 * dirender sebagai inline background-color (lihat serializer.js).
 */

import { createEl, openColorBar } from "../utils/dom.js";
import { setHighlight } from "../editor/commands.js";

const PRESETS = [
  { key: null, label: "Tanpa Highlight" },
  { key: "amber", label: "Amber" },
  { key: "peach", label: "Peach" },
  { key: "rose", label: "Rose" },
  { key: "grape", label: "Grape" },
  { key: "lavender", label: "Lavender" },
  { key: "sky", label: "Sky" },
  { key: "aqua", label: "Aqua" },
  { key: "mint", label: "Mint" },
  { key: "lime", label: "Lime" },
];

export function initHighlightPicker(button, editor) {
  // Sama seperti color-picker.js: nilai highlight aktif di posisi kursor/
  // seleksi saat ini, dipakai buat nge-highlight swatch yang cocok (nama
  // preset seperti "amber", ATAU hex kustom) tiap kali color bar dibuka.
  let currentValue = null;
  let renderedSwatches = []; // { el, key }
  let customWrapEl = null;
  let customInputEl = null;

  const normalize = (v) => (v ? String(v).toLowerCase() : null);
  const isHex = (v) => !!v && v.startsWith("#");

  function markActive() {
    const norm = normalize(currentValue);
    let matchedPreset = false;
    for (const { el, key } of renderedSwatches) {
      const active = normalize(key) === norm;
      el.classList.toggle("is-active", active);
      if (active) matchedPreset = true;
    }
    // Highlight aktif bukan salah satu preset bernama (dipilih lewat input
    // kustom, disimpan sebagai hex langsung) — highlight wrapper "Kustom".
    if (customWrapEl) {
      customWrapEl.classList.toggle("is-active", !!norm && !matchedPreset);
    }
    if (customInputEl && isHex(currentValue) && !matchedPreset) {
      customInputEl.value = currentValue;
    }
  }

  button.addEventListener("click", () => {
    openColorBar(button, (bar) => {
      renderedSwatches = [];
      for (const preset of PRESETS) {
        const swatch = createEl("button", {
          className: "color-bar__swatch" + (preset.key ? "" : " color-bar__swatch--none"),
          attrs: { type: "button", title: preset.label, "aria-label": preset.label },
        });
        if (preset.key) swatch.style.backgroundColor = `var(--highlight-${preset.key})`;
        swatch.addEventListener("click", () => {
          editor.runCommand(setHighlight, preset.key);
          currentValue = preset.key;
          markActive();
        });
        renderedSwatches.push({ el: swatch, key: preset.key });
        bar.appendChild(swatch);
      }

      bar.appendChild(createEl("span", { className: "color-bar__divider" }));

      customWrapEl = createEl("label", { className: "color-bar__custom" });
      customInputEl = createEl("input", { attrs: { type: "color", value: isHex(currentValue) ? currentValue : "#F5C842" } });
      customInputEl.addEventListener("input", () => {
        editor.runCommand(setHighlight, customInputEl.value);
        currentValue = customInputEl.value;
        markActive();
      });
      customWrapEl.appendChild(customInputEl);
      customWrapEl.appendChild(createEl("span", { text: "Kustom" }));
      bar.appendChild(customWrapEl);

      markActive();
    });
  });

  return {
    /** Dipanggil toolbar.js tiap seleksi/kursor berubah — `value` key preset
     * (mis. "amber") atau hex kustom highlight yang sedang berlaku (atau
     * null/undefined kalau tanpa highlight). */
    updateActive(value) {
      currentValue = value || null;
      markActive();
    },
  };
}
