/**
 * build-www.mjs
 * Menyiapkan folder www/ — isi yang di-copy Capacitor ke dalam APK
 * (capacitor.config.json -> webDir: "www").
 *
 * Dua hal yang dilakukan:
 *   1. Copy file statis app (html, src/, assets/) apa adanya ke www/.
 *      Sengaja TIDAK ikut: file khusus hosting web/PHP (php.ini, cgi-bin,
 *      .htaccess) dan download.html (landing page promosi, pakai CDN
 *      eksternal) — tidak relevan untuk APK offline.
 *   2. Bundle @capacitor/filesystem (lewat esbuild) jadi satu file
 *      www/vendor/capacitor-filesystem.js, supaya bisa dimuat langsung
 *      lewat <script> tanpa bundler untuk app-nya sendiri (lihat
 *      build/capacitor-entry.js).
 *
 * Jalankan: npm run build
 */
import { build } from "esbuild";
import { promises as fsp } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WWW = path.join(ROOT, "www");

// Daftar file/folder yang di-copy apa adanya ke www/.
const COPY_ENTRIES = [
  "index.html",
  "editor.html",
  "trash.html",
  "cadangkan.html",
  "font-manager.html",
  "card-style.html",
  "about.html",
  "manifest.json",
  "service-worker.js",
  "src",
  "assets",
];

async function rimraf(target) {
  await fsp.rm(target, { recursive: true, force: true });
}

async function copyRecursive(src, dest) {
  const stat = await fsp.stat(src);
  if (stat.isDirectory()) {
    await fsp.mkdir(dest, { recursive: true });
    const entries = await fsp.readdir(src);
    for (const entry of entries) {
      await copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.copyFile(src, dest);
  }
}

async function main() {
  await rimraf(WWW);
  await fsp.mkdir(WWW, { recursive: true });

  for (const entry of COPY_ENTRIES) {
    const src = path.join(ROOT, entry);
    try {
      await copyRecursive(src, path.join(WWW, entry));
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
      console.warn(`[build-www] Lewati (tidak ditemukan): ${entry}`);
    }
  }

  await build({
    entryPoints: [path.join(ROOT, "build", "capacitor-entry.js")],
    bundle: true,
    format: "iife",
    target: ["es2019"],
    outfile: path.join(WWW, "vendor", "capacitor-filesystem.js"),
  });

  console.log("[build-www] www/ siap — lanjut `npx cap sync android`.");
}

main().catch((err) => {
  console.error("[build-www] Gagal:", err);
  process.exit(1);
});
