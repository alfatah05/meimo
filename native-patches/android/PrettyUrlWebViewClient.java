package __PACKAGE__;

import android.content.res.AssetManager;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

import java.io.IOException;
import java.io.InputStream;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * PrettyUrlWebViewClient
 *
 * Meimo (versi web) memakai rewrite URL cantik lewat .htaccess (mis.
 * "/library" -> index.html, "/editor/<id>" -> editor.html, dst — lihat
 * file htaccess di root project). Apache tidak ada di dalam APK, jadi tanpa
 * kelas ini WebView bakal 404 begitu ada navigasi/reload ke path-path
 * tersebut di dalam app.
 *
 * Solusinya: override HANYA shouldInterceptRequest (bukan
 * shouldOverrideUrlLoading) — begitu path request cocok salah satu pola di
 * bawah, kita balikin isi file .html ASLI yang bersangkutan langsung dari
 * assets, TANPA mengganti URL yang tampil di address bar internal WebView.
 * Efeknya persis sama seperti rewrite INTERNAL Apache: konten yang benar
 * yang muncul, sementara app.js/card-style.js tetap baca id note dari
 * pathname seperti biasa (getNoteIdFromUrl() di app.js) karena
 * window.location TIDAK ikut berubah.
 *
 * Request yang tidak cocok pola manapun (file asli .html, CSS, JS, gambar,
 * dll) dilepas ke super.shouldInterceptRequest() — jalur normal Capacitor
 * (Bridge.getLocalServer()) yang menangani semuanya seperti biasa.
 */
public class PrettyUrlWebViewClient extends BridgeWebViewClient {

  private static final String ASSET_PREFIX = "public/";

  private static final Pattern[] PATTERNS = new Pattern[] {
    Pattern.compile("^/editor/[^/]+/?$", Pattern.CASE_INSENSITIVE),
    Pattern.compile("^/editor/?$", Pattern.CASE_INSENSITIVE),
    Pattern.compile("^/library/?$", Pattern.CASE_INSENSITIVE),
    Pattern.compile("^/card-style/[^/]+/?$", Pattern.CASE_INSENSITIVE),
    Pattern.compile("^/download/?$", Pattern.CASE_INSENSITIVE),
    Pattern.compile("^/cadangkan/?$", Pattern.CASE_INSENSITIVE),
    Pattern.compile("^/trash/?$", Pattern.CASE_INSENSITIVE),
    Pattern.compile("^/arsip/?$", Pattern.CASE_INSENSITIVE),
    Pattern.compile("^/font-manager/?$", Pattern.CASE_INSENSITIVE),
    Pattern.compile("^/about/?$", Pattern.CASE_INSENSITIVE),
  };

  private static final String[] TARGETS = new String[] {
    "editor.html",
    "editor.html",
    "index.html",
    "card-style.html",
    "download.html",
    "cadangkan.html",
    "trash.html",
    "arsip.html",
    "font-manager.html",
    "about.html",
  };

  private final AssetManager assetManager;

  public PrettyUrlWebViewClient(Bridge bridge) {
    super(bridge);
    this.assetManager = bridge.getContext().getAssets();
  }

  @Override
  public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
    Uri url = request.getUrl();
    String path = url.getPath();

    if (path != null) {
      String target = resolvePrettyPath(path);
      if (target != null) {
        WebResourceResponse response = serveAsset(target);
        if (response != null) return response;
        // Kalau gagal baca asset (seharusnya tidak pernah terjadi), jatuh
        // ke jalur normal di bawah alih-alih nge-crash.
      }
    }

    return super.shouldInterceptRequest(view, request);
  }

  private String resolvePrettyPath(String path) {
    for (int i = 0; i < PATTERNS.length; i++) {
      Matcher m = PATTERNS[i].matcher(path);
      if (m.matches()) return TARGETS[i];
    }
    return null;
  }

  private WebResourceResponse serveAsset(String fileName) {
    try {
      InputStream stream = assetManager.open(ASSET_PREFIX + fileName);
      return new WebResourceResponse("text/html", "UTF-8", stream);
    } catch (IOException e) {
      return null;
    }
  }
}
