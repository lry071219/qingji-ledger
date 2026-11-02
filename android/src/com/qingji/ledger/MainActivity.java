package com.qingji.ledger;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.window.OnBackInvokedDispatcher;
import android.webkit.JavascriptInterface;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** Local Android host with a bundled ARM64 Chinese OCR model. */
public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String ENTRY = "https://" + HOST + "/assets/index.html";
    private static final int PICK_FILE = 1001;
    private static final int SAVE_FILE = 1002;
    private static final int MAX_EXPORT_BYTES = 25 * 1024 * 1024;
    private final ExecutorService fileExecutor = Executors.newSingleThreadExecutor();
    private final ExecutorService ocrExecutor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean recognizing = new AtomicBoolean(false);
    private volatile boolean destroyed;
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private byte[] pendingExport;

    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xffffffff);
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        // Keep controls clear of notches, gesture bars and the on-screen keyboard.
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            int left, top, right, bottom;
            if (Build.VERSION.SDK_INT >= 30) {
                int types = WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout();
                if (Build.VERSION.SDK_INT >= 35) types |= WindowInsets.Type.ime();
                android.graphics.Insets safe = insets.getInsets(types);
                left = safe.left; top = safe.top; right = safe.right; bottom = safe.bottom;
            } else {
                left = insets.getSystemWindowInsetLeft(); top = insets.getSystemWindowInsetTop();
                right = insets.getSystemWindowInsetRight(); bottom = insets.getStableInsetBottom();
            }
            view.setPadding(left, top, right, bottom);
            return insets;
        });
        root.requestApplyInsets();
        WebView.setWebContentsDebuggingEnabled(false);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true); // User-selected documents only, via the system picker.
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setBuiltInZoomControls(false);
        settings.setTextZoom(100);
        webView.addJavascriptInterface(new LocalFiles(), "QingjiNative");
        webView.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetResponse(request.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isLocal(uri)) return false;
                if (request.isForMainFrame() && ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                    catch (ActivityNotFoundException ignored) { notifyUser("没有可用的浏览器"); }
                }
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (isLocal(Uri.parse(url))) view.evaluateJavascript(
                    "if(!window.HTMLDialogElement||!HTMLDialogElement.prototype.showModal){alert('请先更新 Android System WebView 或 Chrome，再使用截图识别。');}", null);
            }
        });
        ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                return assetResponse(request.getUrl());
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                String[] accepted = params.getAcceptTypes();
                boolean images = false;
                for (String type : accepted) if (type.startsWith("image/")) images = true;
                intent.setType(images ? "image/*" : "*/*");
                if (images) intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/png", "image/jpeg", "image/webp"});
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try { startActivityForResult(intent, PICK_FILE); }
                catch (ActivityNotFoundException error) { fileCallback.onReceiveValue(null); fileCallback = null; notifyUser("请安装或启用系统文件管理器"); }
                return true;
            }
        });
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
            OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        boolean accepted = getPreferences(MODE_PRIVATE).getBoolean("privacy-v3", false);
        webView.loadUrl(accepted ? ENTRY : "https://" + HOST + "/assets/privacy.html?first=1");
    }

    private static boolean isLocal(Uri uri) {
        return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost())
            && uri.getPort() == -1 && uri.getUserInfo() == null && uri.getPath() != null && uri.getPath().startsWith("/assets/");
    }

    private WebResourceResponse assetResponse(Uri uri) {
        if ("blob".equals(uri.getScheme()) || "data".equals(uri.getScheme())) return null;
        if (!isLocal(uri)) return errorResponse(403, "Forbidden");
        String name = uri.getPath().substring("/assets/".length());
        if (name.length() == 0) name = "index.html";
        if (name.contains("..") || name.contains("\\") || name.indexOf('\0') >= 0) return errorResponse(403, "Forbidden");
        try {
            InputStream input = getAssets().open("web/" + name);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-store");
            headers.put("X-Content-Type-Options", "nosniff");
            headers.put("Content-Security-Policy", "default-src 'self' blob: data:; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' blob:; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'self'");
            return new WebResourceResponse(mime(name), "UTF-8", 200, "OK", headers, input);
        } catch (IOException error) { return errorResponse(404, "Not Found"); }
    }

    private static String mime(String name) {
        if (name.endsWith(".js")) return "text/javascript";
        if (name.endsWith(".css")) return "text/css";
        if (name.endsWith(".html")) return "text/html";
        if (name.endsWith(".json") || name.endsWith(".webmanifest")) return "application/json";
        if (name.endsWith(".svg")) return "image/svg+xml";
        if (name.endsWith(".png")) return "image/png";
        if (name.endsWith(".jpg")) return "image/jpeg";
        if (name.endsWith(".wasm")) return "application/wasm";
        if (name.endsWith(".gz")) return "application/gzip";
        return "application/octet-stream";
    }

    private static WebResourceResponse errorResponse(int code, String reason) {
        return new WebResourceResponse("text/plain", "UTF-8", code, reason, new HashMap<>(),
            new ByteArrayInputStream(reason.getBytes(StandardCharsets.UTF_8)));
    }

    private void notifyUser(String message) { runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show()); }

    private final class LocalFiles {
        @JavascriptInterface public String getWechatStatus() { return WechatLogin.status(getApplicationContext()); }
        @JavascriptInterface public boolean startWechatLogin() {
            return getPreferences(MODE_PRIVATE).getBoolean("privacy-v3", false) && WechatLogin.start(MainActivity.this);
        }
        @JavascriptInterface public void logoutWechat() { WechatLogin.logout(getApplicationContext()); }
        @JavascriptInterface public void acceptPrivacy() {
            runOnUiThread(() -> {
                getPreferences(MODE_PRIVATE).edit().putBoolean("privacy-v3", true).apply();
                webView.loadUrl(ENTRY);
            });
        }
        @JavascriptInterface public void exitApp() { runOnUiThread(() -> finish()); }
        @JavascriptInterface public String getDeviceInfo() {
            try {
                JSONObject data = new JSONObject();
                data.put("version", "1.5.0"); data.put("android", Build.VERSION.RELEASE);
                data.put("ocrEngine", "mlkit-chinese-bundled"); data.put("networkPermission", false);
                data.put("abis", new JSONArray(Build.SUPPORTED_ABIS));
                data.put("supports64Bit", Build.SUPPORTED_64_BIT_ABIS.length > 0);
                return data.toString();
            } catch (Exception ignored) { return "{}"; }
        }
        @JavascriptInterface public boolean saveFile(String name, String type, String content) {
            if (content == null || content.length() > MAX_EXPORT_BYTES || name == null) return false;
            final String mime = type != null && type.startsWith("text/csv") ? "text/csv" : "application/json";
            final byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
            if (bytes.length > MAX_EXPORT_BYTES) return false;
            final String safeName = name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
            runOnUiThread(() -> {
                if (pendingExport != null) { notifyUser("请先完成当前文件的保存"); return; }
                pendingExport = bytes;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType(mime);
                intent.putExtra(Intent.EXTRA_TITLE, safeName);
                try { startActivityForResult(intent, SAVE_FILE); }
                catch (ActivityNotFoundException error) { pendingExport = null; notifyUser("系统文件保存器不可用"); }
            });
            return true;
        }
        @JavascriptInterface public boolean recognizeImage(String requestId, String pngBase64) {
            if (destroyed || !getPreferences(MODE_PRIVATE).getBoolean("privacy-v3", false) ||
                    requestId == null || !requestId.matches("ocr[0-9]+") || pngBase64 == null ||
                    pngBase64.length() > 12 * 1024 * 1024 || !recognizing.compareAndSet(false, true)) return false;
            ocrExecutor.execute(() -> {
                JSONObject response;
                try { response = OfflineTextRecognizer.recognize(getApplicationContext(), pngBase64); }
                catch (Exception | LinkageError error) {
                    response = new JSONObject();
                    try { response.put("error", "本地中文识别未完成，请重试或将长截图分开导入"); } catch (Exception ignored) {}
                } finally { recognizing.set(false); }
                final String payload = response.toString();
                runOnUiThread(() -> {
                    if (!destroyed) webView.evaluateJavascript("window.__qingjiOcrResult && window.__qingjiOcrResult(" +
                        JSONObject.quote(requestId) + "," + JSONObject.quote(payload) + ")", null);
                });
            });
            return true;
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_FILE && fileCallback != null) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null) {
                ClipData clips = data.getClipData();
                if (clips != null) {
                    result = new Uri[Math.min(clips.getItemCount(), 10)];
                    for (int i = 0; i < result.length; i++) result[i] = clips.getItemAt(i).getUri();
                } else if (data.getData() != null) result = new Uri[]{data.getData()};
            }
            fileCallback.onReceiveValue(result); fileCallback = null;
        } else if (requestCode == SAVE_FILE) {
            final byte[] bytes = pendingExport; pendingExport = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null && bytes != null) {
                final Uri uri = data.getData();
                fileExecutor.execute(() -> {
                    try (OutputStream output = getContentResolver().openOutputStream(uri, "wt")) {
                        if (output == null) throw new IOException("No output stream");
                        output.write(bytes); notifyUser("文件已保存，请妥善保管账本备份");
                    } catch (IOException | SecurityException error) { notifyUser("保存失败，请检查所选位置的空间和权限"); }
                });
            } else notifyUser("已取消保存");
        }
    }

    @Override public void onBackPressed() { handleBack(); }

    private void handleBack() {
        webView.evaluateJavascript("(()=>{const modal=document.querySelector('dialog[open]');if(modal){modal.dispatchEvent(new Event('cancel',{cancelable:true}));return true;}return false;})()", value -> {
            if ("true".equals(value)) return;
            if (webView.canGoBack()) webView.goBack();
            else new AlertDialog.Builder(this).setMessage("退出轻记？账单已保存在此设备。")
                .setNegativeButton("继续记账", null).setPositiveButton("退出", (dialog, which) -> finish()).show();
        });
    }

    @Override protected void onPause() { webView.onPause(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); if (webView != null) webView.onResume(); }
    @Override protected void onDestroy() {
        destroyed = true;
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        pendingExport = null;
        webView.removeJavascriptInterface("QingjiNative"); webView.destroy();
        fileExecutor.shutdown(); ocrExecutor.shutdownNow(); super.onDestroy();
    }
}
