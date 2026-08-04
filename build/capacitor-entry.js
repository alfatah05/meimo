/**
 * capacitor-entry.js
 * Entry point yang di-bundle esbuild (lewat scripts/build-www.mjs) jadi
 * www/vendor/capacitor-filesystem.js — satu file JS biasa (bukan ES module
 * bare-import) yang bisa dimuat langsung lewat <script> di semua halaman
 * HTML, karena project ini vanilla JS tanpa bundler untuk app-nya sendiri.
 *
 * Menyuntikkan plugin Filesystem ke `window.CapacitorFilesystem`, dipakai
 * oleh src/js/db/fs-storage.js.
 */
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";

window.CapacitorFilesystem = { Filesystem, Directory, Encoding };
