package __PACKAGE__;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    // BUGFIX (splash "gepeng"/kegencet jadi strip di atas header): HARUS
    // baris PALING PERTAMA di onCreate, sebelum EdgeToEdge.enable() ATAU
    // super.onCreate() apa pun. Android 12+ otomatis menampilkan splash
    // screen sistem (pakai ikon app) walau kita tidak setting apa-apa
    // khusus — tapi proses KELUARNYA (exit animation) itu menghitung
    // ukuran/inset window saat itu juga. EdgeToEdge.enable() di bawah
    // MENGUBAH inset window (bikin status/nav bar transparan) — kalau ini
    // terjadi DI TENGAH splash sedang keluar (karena androidx tidak diberi
    // tahu splash itu ada / harus dikoordinasikan), splash-nya jadi
    // "kegencet"/kepepet jadi strip gepeng, bukan hilang mulus. Memanggil
    // installSplashScreen() di sini membuat framework tahu & menangani
    // urutan/timing itu dengan benar, terlepas dari perubahan inset
    // EdgeToEdge di baris berikutnya.
    SplashScreen.installSplashScreen(this);

    // registerPlugin() HARUS dipanggil sebelum super.onCreate() (di situ
    // Capacitor mendaftarkan semua plugin, termasuk custom). ThemeBridge
    // dipakai buat menyinkronkan warna latar Window & WebView dengan tema
    // aktif — lihat komentar lengkap di ThemeBridgePlugin.java soal kenapa
    // ini perlu ada ("warna transisi pindah halaman gak ngikut tema").
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
