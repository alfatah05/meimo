/**
 * toast.js
 * Notifikasi toast sederhana: muncul di bawah-tengah layar, hilang otomatis,
 * opsional punya satu tombol aksi (mis. "Urungkan" setelah catatan
 * dipindah ke Sampah). Dipakai lintas halaman (Home, Sampah, dsb).
 */

import { createEl } from "../js/utils/dom.js";

let currentToast = null;
let currentTimer = null;

function ensureContainer() {
  let el = document.getElementById("toastContainer");
  if (!el) {
    el = createEl("div", { className: "toast-container", attrs: { id: "toastContainer" } });
    document.body.appendChild(el);
  }
  return el;
}

/**
 * Tampilkan satu toast. Toast sebelumnya (bila masih ada) langsung diganti.
 * @param {string} message
 * @param {object} [opts]
 * @param {string} [opts.actionLabel] - label tombol aksi opsional (mis. "Urungkan")
 * @param {Function} [opts.onAction] - callback saat tombol aksi ditekan
 * @param {number} [opts.duration=3200] - durasi tampil (ms)
 * @param {"default"|"danger"} [opts.tone="default"]
 */
export function showToast(message, opts = {}) {
  const { actionLabel, onAction, duration = 3200, tone = "default" } = opts;
  const container = ensureContainer();

  // Haptic feedback singkat setiap toast muncul. Prioritas: plugin
  // @capacitor/haptics (window.CapacitorHaptics — getar lewat Android
  // Vibrator API asli, jauh lebih reliabel di dalam WebView Capacitor
  // daripada Vibration API web biasa). Kalau app ini dibuka di browser/PWA
  // biasa (plugin tidak ada), fallback ke navigator.vibrate(). Dibungkus
  // try/catch karena getaran cuma "bonus", bukan hal kritis — gagal diam
  // saja, toast tetap tampil normal.
  const CapacitorHaptics = window.CapacitorHaptics;
  if (CapacitorHaptics?.Haptics) {
    CapacitorHaptics.Haptics.impact({ style: CapacitorHaptics.ImpactStyle.Light }).catch(() => {});
  } else {
    try {
      if (navigator.vibrate) navigator.vibrate(50);
    } catch (_) {
      // diamkan — getaran cuma "bonus", bukan hal kritis.
    }
  }

  if (currentToast) {
    currentToast.remove();
    clearTimeout(currentTimer);
    currentToast = null;
  }

  const toast = createEl("div", {
    className: `toast anim-slide-up${tone === "danger" ? " toast--danger" : ""}`,
  });
  toast.appendChild(createEl("span", { className: "toast__message", text: message }));

  function dismiss() {
    toast.classList.add("toast--leaving");
    setTimeout(() => toast.remove(), 150);
    if (currentToast === toast) currentToast = null;
  }

  if (actionLabel) {
    const btn = createEl("button", {
      className: "toast__action",
      text: actionLabel,
      attrs: { type: "button" },
    });
    btn.addEventListener("click", () => {
      clearTimeout(currentTimer);
      dismiss();
      if (onAction) onAction();
    });
    toast.appendChild(btn);
  }

  container.appendChild(toast);
  currentToast = toast;
  currentTimer = setTimeout(dismiss, duration);
}
