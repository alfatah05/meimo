/**
 * capacitor-entry.js
 * Entry point yang di-bundle esbuild (lewat scripts/build-www.mjs) jadi
 * www/vendor/capacitor-plugins.js — satu file JS biasa yang dimuat lewat
 * <script> di semua halaman HTML (project ini vanilla JS tanpa bundler
 * untuk app-nya sendiri, jadi bare-import "@capacitor/..." harus dibundle
 * dulu di sini).
 *
 * Menyuntikkan 3 plugin ke `window`:
 *   - CapacitorFilesystem -> dipakai src/js/db/fs-storage.js (penyimpanan)
 *   - CapacitorApp         -> dipakai src/js/utils/native-back.js (tombol/gesture back Android)
 *   - CapacitorHaptics     -> dipakai src/components/toast.js (getar saat toast muncul)
 */
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { App } from "@capacitor/app";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

window.CapacitorFilesystem = { Filesystem, Directory, Encoding };
window.CapacitorApp = { App };
window.CapacitorHaptics = { Haptics, ImpactStyle };
