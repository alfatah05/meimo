package __PACKAGE__;

import android.graphics.Color;
import android.webkit.WebView;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * ThemeBridgePlugin
 *
 * KENAPA PLUGIN INI PERLU ADA (lihat juga MainActivity.java &
 * src/js/pwa/capacitor-status-bar.js):
 *
 * `EdgeToEdge.enable(this)` di MainActivity bikin WebView digambar penuh
 * sampai ke belakang status/navigation bar. Tapi itu cuma ngatur
 * TRANSPARANSI system bar — warna LATAR Window itu sendiri (decor view)
 * dan warna latar WebView-nya sendiri (properti native `WebView`, TERPISAH
 * dari <body> di halaman web) TIDAK ikut berubah otomatis. Keduanya diam
 * di warna splash/launch bawaan (`android.backgroundColor` di
 * capacitor.config.json — sengaja gelap fix, dipakai juga sebagai warna
 * splash screen) sepanjang proses app berjalan, walau tema DI DALAM app
 * (Terang/Gelap/Sepia/Kertas/OLED) sudah lama diganti user.
 *
 * Dua warna latar native yang statis itu penyebab dua bug yang dilaporkan:
 *
 * 1. "Item hitam kayak splash screen gepeng di atas header" — celah
 *    inset status bar (area yang sekarang transparan gara-gara
 *    EdgeToEdge) menembus ke warna/latar splash-launch yang tertinggal
 *    itu, BUKAN warna tema aktif — kelihatan seperti potongan splash
 *    screen yang "kepepet" jadi strip tipis di atas.
 * 2. "Warna transisi pindah halaman gak ngikut tema aktif" — pindah
 *    halaman di app (mis. Home -> Editor) TETAP WebView yang SAMA
 *    (`window.location.href`, bukan Activity/WebView baru). ADA celah
 *    singkat antara <body> halaman lama ter-unload & <body> halaman baru
 *    sempat ke-paint — di celah itu yang kelihatan adalah warna latar
 *    WebView native ini, bukan `--color-bg` tema aktif.
 *
 * SOLUSI: expose satu method yang dipanggil dari JS (lihat
 * `syncCapacitorStatusBar()` di capacitor-status-bar.js — dipanggil sekali
 * tiap cold start, dan ulang tiap kali tema diganti lewat Floating Menu)
 * buat menimpa warna latar Window & WebView itu supaya SELALU sinkron
 * sama warna background tema yang lagi aktif, bukan diam di warna
 * splash/launch statis selamanya.
 */
@CapacitorPlugin(name = "ThemeBridge")
public class ThemeBridgePlugin extends Plugin {

  @PluginMethod
  public void syncBackground(PluginCall call) {
    String hex = call.getString("color");
    if (hex == null || hex.isEmpty()) {
      call.reject("Parameter 'color' wajib diisi (format heksadesimal, mis. \"#17181C\").");
      return;
    }

    final int color;
    try {
      color = Color.parseColor(hex);
    } catch (IllegalArgumentException e) {
      call.reject("Format warna tidak valid: " + hex);
      return;
    }

    getActivity().runOnUiThread(() -> {
      // 1) Latar Window (decor view) — ini yang "nembus" di celah inset
      //    edge-to-edge (status/nav bar) sebelum WebView sempat menggambar
      //    penuh. Menimpanya di sini menggantikan warna/drawable splash-
      //    launch yang statis dengan warna tema aktif yang sebenarnya.
      getActivity().getWindow().getDecorView().setBackgroundColor(color);

      // 2) Latar WebView itu sendiri (beda dari <body> di halaman web) —
      //    ini yang kelihatan sekilas pas WebView pindah dokumen
      //    (window.location.href di WebView yang SAMA), sebelum <body>
      //    halaman baru sempat ter-paint.
      WebView webView = (bridge != null) ? bridge.getWebView() : null;
      if (webView != null) {
        webView.setBackgroundColor(color);
      }
    });

    call.resolve();
  }
}
