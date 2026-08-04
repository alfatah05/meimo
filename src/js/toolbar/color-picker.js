/**
 * color-picker.js
 * Pemilih warna teks. Tampil sebagai baris kedua topbar (#colorPickerBar,
 * lihat openColorBar() di ../utils/dom.js) — bukan lagi floating dropdown —
 * satu baris penuh yang bisa digeser horizontal kalau presetnya banyak.
 * Preset + custom lewat <input type="color"> native.
 */

import { createEl, openColorBar } from "../utils/dom.js";
import { setColor } from "../editor/commands.js";

const PRESETS = [
  { hex: null, label: "Default" },
  { hex: "#E5484D", label: "Merah" },
  { hex: "#E0687A", label: "Rose" },
  { hex: "#E0568F", label: "Pink" },
  { hex: "#C74FC2", label: "Magenta" },
  { hex: "#7C5CE0", label: "Ungu" },
  { hex: "#5C6CE0", label: "Indigo" },
  { hex: "#3B6FE0", label: "Biru" },
  { hex: "#3B9CE0", label: "Sky" },
  { hex: "#1B9C8E", label: "Teal" },
  { hex: "#2E9E6D", label: "Hijau" },
  { hex: "#7CB342", label: "Lime" },
  { hex: "#C9A227", label: "Kuning" },
  { hex: "#E5883D", label: "Oranye" },
  { hex: "#8A6D5C", label: "Coklat" },
  { hex: "#6B7280", label: "Abu-abu" },
  { hex: "#1F2937", label: "Hitam" },
];

export function initColorPicker(button, editor) {
  // Nilai warna yang sedang aktif di posisi kursor/seleksi teks saat ini —
  // dipakai buat nge-highlight swatch yang cocok (termasuk "Default", yang
  // hex-nya null) tiap kali color bar ini dibuka. Diperbarui dari luar lewat
  // updateActive(), dipanggil toolbar.js dari hasil toolbar-state-sync.js.
  let currentValue = null;
  let renderedSwatches = []; // { el, hex }
  let customWrapEl = null;
  let customInputEl = null;

  const normalize = (hex) => (hex ? hex.toLowerCase() : null);

  function markActive() {
    const norm = normalize(currentValue);
    let matchedPreset = false;
    for (const { el, hex } of renderedSwatches) {
      const active = normalize(hex) === norm;
      el.classList.toggle("is-active", active);
      if (active) matchedPreset = true;
    }
    // Warna aktif bukan salah satu preset (dipilih lewat input kustom) —
    // highlight wrapper "Kustom"-nya saja, dan samakan nilai <input
    // type="color"> supaya swatch kustomnya sendiri juga cerminkan warna itu.
    if (customWrapEl) {
      customWrapEl.classList.toggle("is-active", !!norm && !matchedPreset);
    }
    if (customInputEl && norm && !matchedPreset) {
      customInputEl.value = currentValue;
    }
  }

  button.addEventListener("click", () => {
    openColorBar(button, (bar) => {
      renderedSwatches = [];
      for (const preset of PRESETS) {
        const swatch = createEl("button", {
          className: "color-bar__swatch" + (preset.hex ? "" : " color-bar__swatch--none"),
          attrs: { type: "button", title: preset.label, "aria-label": preset.label },
        });
        if (preset.hex) swatch.style.backgroundColor = preset.hex;
        swatch.addEventListener("click", () => {
          if (document.activeElement === editor.titleEl) {
            editor.setTitleStyle({ color: preset.hex });
          } else {
            editor.runCommand(setColor, preset.hex);
          }
          currentValue = preset.hex;
          markActive();
        });
        renderedSwatches.push({ el: swatch, hex: preset.hex });
        bar.appendChild(swatch);
      }

      bar.appendChild(createEl("span", { className: "color-bar__divider" }));

      customWrapEl = createEl("label", { className: "color-bar__custom" });
      customInputEl = createEl("input", { attrs: { type: "color", value: currentValue || "#4A55C7" } });
      customInputEl.addEventListener("input", () => {
        if (document.activeElement === editor.titleEl) {
          editor.setTitleStyle({ color: customInputEl.value });
        } else {
          editor.runCommand(setColor, customInputEl.value);
        }
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
    /** Dipanggil toolbar.js tiap seleksi/kursor berubah — `value` hex warna
     * teks yang sedang berlaku (atau null/undefined kalau default). */
    updateActive(value) {
      currentValue = value || null;
      markActive();
    },
  };
}
