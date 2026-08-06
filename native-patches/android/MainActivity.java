package __PACKAGE__;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // Ganti WebViewClient default Capacitor dengan versi yang juga paham
    // URL cantik Meimo (/library, /editor/<id>, /trash, dst) — lihat
    // komentar di PrettyUrlWebViewClient.java untuk detailnya.
    this.bridge.getWebView().setWebViewClient(new PrettyUrlWebViewClient(this.bridge));
  }
}
