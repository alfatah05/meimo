/**
 * modal.js
 * Dialog konfirmasi sederhana (mis. "Hapus permanen dari Sampah?"). Bukan
 * modal serbaguna — cukup untuk kebutuhan konfirmasi aksi destruktif di app
 * ini. Mengembalikan Promise<boolean> (true = user menekan tombol konfirmasi).
 */

import { createEl } from "../js/utils/dom.js";

export function confirmDialog({
  title = "Konfirmasi",
  message = "",
  confirmLabel = "Hapus",
  cancelLabel = "Batal",
  danger = true,
} = {}) {
  return new Promise((resolve) => {
    const overlay = createEl("div", { className: "modal-overlay anim-fade-in" });
    const panel = createEl("div", {
      className: "modal-panel anim-scale-in",
      attrs: { role: "alertdialog", "aria-modal": "true" },
    });

    panel.appendChild(createEl("div", { className: "modal-panel__title", text: title }));
    if (message) {
      panel.appendChild(createEl("p", { className: "modal-panel__message", text: message }));
    }

    const actions = createEl("div", { className: "modal-panel__actions" });
    const cancelBtn = createEl("button", {
      className: "modal-btn modal-btn--ghost",
      text: cancelLabel,
      attrs: { type: "button" },
    });
    const confirmBtn = createEl("button", {
      className: `modal-btn ${danger ? "modal-btn--danger" : "modal-btn--primary"}`,
      text: confirmLabel,
      attrs: { type: "button" },
    });

    function close(result) {
      overlay.remove();
      document.removeEventListener("keydown", onKeydown);
      resolve(result);
    }

    function onKeydown(e) {
      if (e.key === "Escape") close(false);
    }

    cancelBtn.addEventListener("click", () => close(false));
    confirmBtn.addEventListener("click", () => close(true));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(false);
    });
    document.addEventListener("keydown", onKeydown);

    actions.append(cancelBtn, confirmBtn);
    panel.appendChild(actions);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    confirmBtn.focus();
  });
}
