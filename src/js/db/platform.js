/**
 * platform.js
 * Akses plugin Capacitor Filesystem + Directory.Data.
 * Project ini khusus native Capacitor — tidak ada fallback web/IndexedDB.
 */

/** Ambil plugin Filesystem dari Capacitor (global). */
export function getFilesystemPlugin() {
  const Cap = typeof window !== "undefined" ? window.Capacitor : null;
  if (!Cap?.Plugins?.Filesystem) {
    throw new Error(
      "Plugin Filesystem Capacitor tidak tersedia. " +
        "Pastikan @capacitor/filesystem sudah di-install & di-sync " +
        "(npx cap sync android)."
    );
  }
  return Cap.Plugins.Filesystem;
}

/**
 * Directory.Data = private app folder
 * Android: /data/data/com.meimo.app/files/
 * Tidak butuh permission ekstra.
 */
export function getDataDirectory() {
  const Cap = typeof window !== "undefined" ? window.Capacitor : null;
  const Dir = Cap?.Plugins?.Filesystem?.Directory || Cap?.Directory;
  if (Dir?.Data) return Dir.Data;
  // Fallback string literal (didukung plugin)
  return "DATA";
}
