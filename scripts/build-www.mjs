#!/usr/bin/env node
/**
 * build-www.mjs
 * Project meimo adalah situs statis TANPA build step (semua HTML/CSS/JS
 * dipakai apa adanya oleh browser). Capacitor tetap butuh satu folder
 * "webDir" yang berdiri sendiri (lihat capacitor.config.json -> "www"),
 * jadi script ini cuma menyalin apa adanya file-file yang memang dipakai
 * runtime web app ke folder www/ — TIDAK ada transformasi/bundling apa pun,
 * supaya perilaku app di dalam Capacitor identik dengan versi web/PWA-nya.
 *
 * Yang SENGAJA tidak ikut disalin karena khusus deploy web server biasa
 * (tidak relevan/tidak bisa dipakai di dalam shell native):
 *  - htaccess          (rewrite URL cantik Apache — sudah digantikan oleh
 *                        fallback di service-worker.js, lihat resolveShellPath())
 *  - php.ini           (konfigurasi hosting cPanel, tidak dipakai app)
 *  - README.md, NATIVE_BUILD.md, node_modules/, android/, ios/, resources/,
 *    scripts/, file konfigurasi Node/Capacitor itu sendiri
 */

import { mkdir, rm, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(rootDir, "www");

const filesToCopy = [
  "index.html",
  "editor.html",
  "download.html",
  "cadangkan.html",
  "trash.html",
  "font-manager.html",
  "about.html",
  "card-style.html",
  "arsip.html",
  "manifest.json",
  "service-worker.js",
];

const dirsToCopy = ["assets", "src"];

async function main() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  for (const file of filesToCopy) {
    const src = path.join(rootDir, file);
    if (!existsSync(src)) {
      console.warn(`[build-www] lewati (tidak ditemukan): ${file}`);
      continue;
    }
    await cp(src, path.join(outDir, file));
  }

  for (const dir of dirsToCopy) {
    const src = path.join(rootDir, dir);
    if (!existsSync(src)) {
      console.warn(`[build-www] lewati (tidak ditemukan): ${dir}/`);
      continue;
    }
    await cp(src, path.join(outDir, dir), { recursive: true });
  }

  console.log(`[build-www] selesai -> ${path.relative(rootDir, outDir)}/`);
}

main().catch((err) => {
  console.error("[build-www] gagal:", err);
  process.exit(1);
});
