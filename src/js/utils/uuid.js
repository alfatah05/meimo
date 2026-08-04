/**
 * uuid.js
 * Generator ID unik untuk dokumen, block, dan run.
 * Tidak memakai library — cukup crypto.randomUUID() dengan fallback manual.
 */

export function uuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback sederhana (browser lama tanpa crypto.randomUUID)
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}
