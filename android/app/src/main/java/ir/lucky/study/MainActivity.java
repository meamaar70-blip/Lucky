package ir.lucky.study;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

/**
 * Lucky — پوستهٔ اندروید برای وب‌اپ.
 *
 * برنامه یک WebView است که آدرس سرور Lucky را باز می‌کند. آدرس در تنظیمات
 * دستگاه ذخیره می‌شود، بنابراین هم با سرور خانگی (http) و هم با نسخهٔ
 * اینترنتی (https) کار می‌کند.
 */
public class MainActivity extends Activity {

    private static final String PREFS = "lucky";
    private static final String KEY_URL = "server_url";
    private static final String KEY_SEEN = "seen_setup";
    private static final int REQ_FILE = 1001;
    private static final int REQ_NOTIF = 1002;

    private FrameLayout root;
    private WebView web;
    private ValueCallback<Uri[]> filePathCallback;
    private String currentUrl = "";

    /* ---------------- چرخهٔ عمر ---------------- */

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        root = new FrameLayout(this);
        root.setBackgroundColor(0xFFF6F1E8);
        setContentView(root);

        String saved = prefs().getString(KEY_URL, "");
        if (saved == null || saved.trim().isEmpty()) {
            showSetup();
        } else {
            openWeb(saved);
        }

        maybeAskNotifications();
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        new AlertDialog.Builder(this)
                .setTitle(R.string.app_name)
                .setPositiveButton(R.string.change_server, (d, w) -> showSetup())
                .setNegativeButton(R.string.exit, (d, w) -> finish())
                .setNeutralButton(R.string.cancel, null)
                .show();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            root.removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /* ---------------- صفحهٔ تنظیم آدرس ---------------- */

    private void showSetup() {
        if (web != null) {
            root.removeView(web);
            web.destroy();
            web = null;
        }
        root.removeAllViews();

        View view = getLayoutInflater().inflate(R.layout.setup, root, false);
        EditText input = view.findViewById(R.id.url_input);
        Button open = view.findViewById(R.id.open_btn);

        String saved = prefs().getString(KEY_URL, "");
        if (saved != null) input.setText(saved);

        open.setOnClickListener(v -> {
            String url = normalize(input.getText().toString());
            if (url == null) {
                Toast.makeText(this, R.string.setup_error, Toast.LENGTH_SHORT).show();
                return;
            }
            prefs().edit().putString(KEY_URL, url).putBoolean(KEY_SEEN, true).apply();
            openWeb(url);
        });

        root.addView(view);
    }

    /** نرمال‌سازی آدرس: افزودن http:// و حذف / انتهایی */
    private String normalize(String raw) {
        if (raw == null) return null;
        String url = raw.trim();
        if (url.isEmpty()) return null;
        if (!url.startsWith("http://") && !url.startsWith("https://")) url = "http://" + url;
        while (url.endsWith("/")) url = url.substring(0, url.length() - 1);
        if (url.length() < 12) return null;
        return url;
    }

    /* ---------------- نمایش برنامه ---------------- */

    private void openWeb(String url) {
        currentUrl = url;
        root.removeAllViews();

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(false);
        s.setUseWideViewPort(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            s.setForceDark(WebSettings.FORCE_DARK_OFF);
        }

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) cm.setAcceptThirdPartyCookies(web, true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                return handleUrl(req.getUrl().toString());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                return handleUrl(url);
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) showOffline(currentUrl);
            }

            @Override
            @SuppressWarnings("deprecation")
            public void onReceivedError(WebView v, int code, String desc, String failingUrl) {
                // فقط در اندرویدهای قدیمی که callback مدرن را صدا نمی‌زنند
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) showOffline(currentUrl);
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = cb;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("*/*");
                pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false);
                pick.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/pdf"});
                try {
                    startActivityForResult(Intent.createChooser(pick, getString(R.string.choose_file)), REQ_FILE);
                    return true;
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
            }
        });

        // دانلود پاورپوینت و خروجی تقویم با مدیر دانلود اندروید
        web.setDownloadListener((dlUrl, userAgent, contentDisposition, mime, size) -> {
            try {
                DownloadManager.Request req = new DownloadManager.Request(Uri.parse(dlUrl));
                req.setMimeType(mime);
                req.addRequestHeader("User-Agent", userAgent);
                String name = android.webkit.URLUtil.guessFileName(dlUrl, contentDisposition, mime);
                req.setTitle(name);
                req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "Lucky/" + name);
                DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                if (dm != null) dm.enqueue(req);
                    if (Build.VERSION.SDK_INT < 29
                        && checkSelfPermission("android.permission.WRITE_EXTERNAL_STORAGE") != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{"android.permission.WRITE_EXTERNAL_STORAGE"}, 1003);
                }
                Toast.makeText(this, R.string.download_started, Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(dlUrl)));
            }
        });

        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.loadUrl(url);
    }

    /** لینک‌های بیرونی و مسیرهای دیگر را در مرورگر باز می‌کند */
    private boolean handleUrl(String url) {
        if (url == null) return false;
        if (url.startsWith("http")) {
            Uri uri = Uri.parse(url);
            String host = uri.getHost() == null ? "" : uri.getHost();
            String base = Uri.parse(currentUrl).getHost();
            boolean internal = host.equals(base) || host.endsWith("." + base);
            if (internal) return false;
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
            return true;
        }
        if (url.startsWith("mailto:") || url.startsWith("tel:") || url.startsWith("sms:")) {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            return true;
        }
        return false;
    }

    /* ---------------- خطای اتصال ---------------- */

    private void showOffline(String retryUrl) {
        root.removeAllViews();

        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setPadding(dp(24), dp(24), dp(24), dp(24));
        box.setBackgroundColor(0xFFF6F1E8);

        TextView title = new TextView(this);
        title.setText(R.string.offline_title);
        title.setTextSize(19);
        title.setTextColor(0xFF1C1916);
        title.setGravity(Gravity.CENTER);

        TextView sub = new TextView(this);
        sub.setText(R.string.offline_sub);
        sub.setTextSize(13);
        sub.setTextColor(0xFF5F5952);
        sub.setGravity(Gravity.CENTER);
        sub.setPadding(0, dp(8), 0, dp(20));

        Button retry = new Button(this);
        retry.setText(R.string.retry);
        retry.setBackgroundColor(0xFF0E6B58);
        retry.setTextColor(0xFFFFFFFF);
        retry.setOnClickListener(v -> openWeb(retryUrl));

        Button change = new Button(this);
        change.setText(R.string.change_server);
        change.setOnClickListener(v -> showSetup());

        box.addView(title);
        box.addView(sub);
        box.addView(retry, new LinearLayout.LayoutParams(dp(200), dp(48)));
        box.addView(change, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(44)));

        root.addView(box, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    /* ---------------- انتخاب فایل ---------------- */

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE) {
            if (filePathCallback == null) return;
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    result = new Uri[count];
                    for (int i = 0; i < count; i++) {
                        result[i] = data.getClipData().getItemAt(i).getUri();
                    }
                } else if (data.getData() != null) {
                    result = new Uri[]{data.getData()};
                }
            }
            filePathCallback.onReceiveValue(result);
            filePathCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    /* ---------------- اعلان‌ها ---------------- */

    private void maybeAskNotifications() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, REQ_NOTIF);
        }
    }
}
