/**
 * scripts/apply-native-patches.js
 *
 * `npx cap add android` men-generate ulang project android/ dari nol tiap
 * kali dijalankan (termasuk MainActivity.java bawaan yang polos). Script
 * ini jalan SETELAH itu, buat:
 *   1. Baca `appId` dari capacitor.config.json -> jadi path package Java
 *      (mis. "com.meimo.app" -> android/app/.../java/com/meimo/app/).
 *   2. Timpa MainActivity.java bawaan dengan versi kita (native-patches/
 *      android/MainActivity.java) yang masang PrettyUrlWebViewClient.
 *   3. Salin PrettyUrlWebViewClient.java ke folder package yang sama.
 * Placeholder "__PACKAGE__" di kedua file diganti jadi nama package asli.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

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
  for (const fileName of ["MainActivity.java", "PrettyUrlWebViewClient.java"]) {
    const raw = fs.readFileSync(path.join(patchSrcDir, fileName), "utf8");
    const patched = raw.replace(/__PACKAGE__/g, appId);
    fs.writeFileSync(path.join(javaDir, fileName), patched, "utf8");
    console.log(`[apply-native-patches] ditulis -> android/.../${packagePath}/${fileName}`);
  }
}

main();
