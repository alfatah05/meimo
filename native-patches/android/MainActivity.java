package __PACKAGE__;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
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
