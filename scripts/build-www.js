/**
 * scripts/build-www.js
 *
 * Meimo tidak punya build step (murni HTML/CSS/JS statis) — script ini
 * cuma menyalin file-file yang benar-benar dibutuhkan aplikasi native ke
 * folder www/ (dibersihkan dulu tiap kali dijalankan), yang lalu jadi
 * `webDir` di capacitor.config.json. File yang sengaja TIDAK disalin:
 * node_modules, android/ios, .github, resources/, htaccess & php.ini
 * (keduanya konfigurasi server Apache — tidak relevan sama sekali untuk
 * app native yang filenya dibundel langsung ke dalam APK), serta
 * README.md.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const WWW = path.join(ROOT, "www");

const ENTRIES_TO_COPY = [
  "index.html",
  "editor.html",
  "trash.html",
  "about.html",
  "arsip.html",
  "cadangkan.html",
  "download.html",
  "card-style.html",
  "font-manager.html",
  "manifest.json",
  "service-worker.js",
  "src",
  "assets",
];

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function main() {
  fs.rmSync(WWW, { recursive: true, force: true });
  fs.mkdirSync(WWW, { recursive: true });

  for (const entry of ENTRIES_TO_COPY) {
    const src = path.join(ROOT, entry);
    if (!fs.existsSync(src)) {
      console.warn(`[build-www] lewati "${entry}" — tidak ditemukan`);
      continue;
    }
    copyRecursive(src, path.join(WWW, entry));
  }

  console.log(`[build-www] selesai -> ${WWW}`);
}

main();
