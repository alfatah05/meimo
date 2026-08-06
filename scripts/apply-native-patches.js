/**
 * scripts/apply-native-patches.js
 *
 * `npx cap add android` men-generate ulang project android/ dari nol tiap
 * kali dijalankan (termasuk MainActivity.java bawaan yang polos). Script
 * ini jalan SETELAH itu, buat:
 *   1. Baca `appId` dari capacitor.config.json -> jadi path package Java
 *      (mis. "com.meimo.app" -> android/app/.../java/com/meimo/app/).
 *   2. Timpa MainActivity.java bawaan dengan versi kita (native-patches/
 *      android/MainActivity.java) yang masang PrettyUrlWebViewClient,
 *      mendaftarkan ThemeBridgePlugin, & manggil installSplashScreen().
 *   3. Salin PrettyUrlWebViewClient.java & ThemeBridgePlugin.java ke folder
 *      package yang sama.
 *   4. Pastikan dependency `androidx.core:core-splashscreen` ada di
 *      android/app/build.gradle — dibutuhkan oleh installSplashScreen()
 *      di MainActivity.java (lihat komentar di file itu soal bug
 *      "splash gepeng" yang di-fix). Kebanyakan template Capacitor 7
 *      sudah menyertakan ini bawaan, tapi dicek dulu (bukan ditambah
 *      buta) supaya tidak dobel kalau memang sudah ada.
 * Placeholder "__PACKAGE__" di file .java diganti jadi nama package asli.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CORE_SPLASHSCREEN_DEP = 'implementation "androidx.core:core-splashscreen:1.0.1"';

function patchBuildGradle() {
  const gradlePath = path.join(ROOT, "android", "app", "build.gradle");
  if (!fs.existsSync(gradlePath)) {
    throw new Error(`build.gradle tidak ditemukan: ${gradlePath}`);
  }

  const content = fs.readFileSync(gradlePath, "utf8");
  if (content.includes("core-splashscreen")) {
    console.log("[apply-native-patches] core-splashscreen sudah ada di build.gradle, lewati.");
    return;
  }

  const dependenciesBlock = /dependencies\s*\{/;
  if (!dependenciesBlock.test(content)) {
    throw new Error(
      `Tidak menemukan blok "dependencies {" di ${gradlePath} — cek manual, ` +
        `mungkin format build.gradle template Capacitor sudah berubah.`
    );
  }

  const patched = content.replace(dependenciesBlock, (match) => `${match}\n    ${CORE_SPLASHSCREEN_DEP}`);
  fs.writeFileSync(gradlePath, patched, "utf8");
  console.log("[apply-native-patches] ditambahkan androidx.core:core-splashscreen ke android/app/build.gradle");
}

function main() {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, "capacitor.config.json"), "utf8"));
  const appId = config.appId;
  if (!appId) throw new Error("appId tidak ditemukan di capacitor.config.json");

  const packagePath = appId.split(".").join(path.sep);
  const javaDir = path.join(ROOT, "android", "app", "src", "main", "java", packagePath);

  if (!fs.existsSync(javaDir)) {
    throw new Error(
      `Folder package Java tidak ditemukan: ${javaDir}\n` +
        `Pastikan "npx cap add android" sudah dijalankan dan appId di ` +
        `capacitor.config.json ("${appId}") sesuai dengan project yang di-generate.`
    );
  }

  const patchSrcDir = path.join(ROOT, "native-patches", "android");
  for (const fileName of ["MainActivity.java", "PrettyUrlWebViewClient.java", "ThemeBridgePlugin.java"]) {
    const raw = fs.readFileSync(path.join(patchSrcDir, fileName), "utf8");
    const patched = raw.replace(/__PACKAGE__/g, appId);
    fs.writeFileSync(path.join(javaDir, fileName), patched, "utf8");
    console.log(`[apply-native-patches] ditulis -> android/.../${packagePath}/${fileName}`);
  }

  patchBuildGradle();
}

main();
