package __PACKAGE__;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    // registerPlugin() HARUS dipanggil sebelum super.onCreate() (di situ
    // Capacitor mendaftarkan semua plugin, termasuk custom). ThemeBridge
    // dipakai buat menyinkronkan warna latar Window & WebView dengan tema
    // aktif — lihat komentar lengkap di ThemeBridgePlugin.java soal kenapa
    // ini perlu ada (bug "splash gepeng nembus" & "warna transisi pindah
    // halaman gak ngikut tema").
    registerPlugin(ThemeBridgePlugin.class);

    // Harus dipanggil SEBELUM super.onCreate() (dan sebelum setContentView
    // internal Capacitor). Ini bikin navigation bar transparan penuh di HP
    // gesture-nav, dan otomatis dapat scrim semi-transparan yang menyesuaikan
    // tema terang/gelap di HP dengan navigasi 3-tombol.
    EdgeToEdge.enable(this);
    super.onCreate(savedInstanceState);
    // Ganti WebViewClient default Capacitor dengan versi yang juga paham
    // URL cantik Meimo (/library, /editor/<id>, /trash, dst) — lihat
    // komentar di PrettyUrlWebViewClient.java untuk detailnya.
    this.bridge.getWebView().setWebViewClient(new PrettyUrlWebViewClient(this.bridge));
  }
}
