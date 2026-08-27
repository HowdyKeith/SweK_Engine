// android/swek-webview/app/src/main/java/com/swek/webview/MainActivity.java -- v4043
// ---------------------------------------------------------------------------------------------------------------
// THE WHOLE APP. A WebView pointed at a SweK server, plus the six settings that make an engine actually run in
// one -- each of which is off by default in Android's WebView and each of which breaks something specific here.
//
// Keith: "can we make a apk WebView wrapper app that installs a web page that points to our SweK server?"
//
// *** WHY THIS EXISTS WHEN manifest.webmanifest ALREADY DOES. *** The tree already ships a PWA manifest
// (display:fullscreen, scope "/") that phone.html links, and Chrome's "Install app" turns that into a
// home-screen launcher with no browser chrome -- most of what this app is. IT CANNOT BE USED ON THE LAN,
// and that is the entire reason this project exists: Chrome only offers PWA install from a SECURE origin
// (https, or localhost). The SweK server on the LAN is plain http://192.168.50.57:8787, so the install prompt
// never appears there. The PWA is the right answer THROUGH THE TUNNEL (https), this is the right answer on the
// LAN, and neither replaces the other. A WebView has no secure-origin requirement -- it loads whatever its own
// network-security-config permits, which is what res/xml/network_security_config.xml grants for private ranges
// only (see that file for why "cleartext everywhere" was not the shortcut taken).
//
// *** AND IT IS NOT THE APK ai-bridge/androidInviteBridge.js's apkStatus() SAYS IS HARD. *** That note is about
// wrapping the TERMUX NODE PEER -- "the Termux peer CANNOT simply be wrapped into one: Android's sandbox forbids
// any app writing into Termux's private home directory... a nodejs-mobile wrapper app" -- a genuinely hard
// problem about RUNNING A SERVER on the phone. This app runs no server and hosts no node: it is a CLIENT that
// opens a page. Different problem, three orders of magnitude less code, and the two should not be confused
// because they both end in ".apk".
// ---------------------------------------------------------------------------------------------------------------
package com.swek.webview;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.Toast;

public class MainActivity extends Activity {

    // THE ADDRESS IS ASKED FOR, NOT BAKED IN. A hardcoded LAN IP is wrong the first time the router hands out a
    // different lease, and the person holding the phone is then holding an app with no way to say so. It is
    // remembered after the first answer, and reachable again from the menu (long-press) rather than being a
    // one-shot the user can never revisit.
    private static final String PREFS = "swek";
    private static final String KEY_URL = "serverUrl";
    private static final String DEFAULT_URL = "http://192.168.50.57:8787/";

    private WebView web;
    private ValueCallback<Uri[]> filePathCallback;
    private static final int FILE_CHOOSER_REQUEST = 1;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // A RENDER ENGINE THAT SLEEPS MID-FRAME IS A BUG REPORT. The pages this opens are long-running canvases
        // watched rather than tapped, so the default screen timeout reads as "it froze".
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);        // every page here is an ES-module app; without this they render blank
        s.setDomStorageEnabled(true);        // *** localStorage. OFF BY DEFAULT IN WEBVIEW AND THE TREE LEANS ON IT
                                             // HARD: voxelEngine.kpopFavorites (avatar favourites), swek-dash
                                             // (page-index's dashboard), swek.serverAvatarSlots, and every panel's
                                             // remembered state. Without it those all silently no-op -- the app
                                             // works and forgets everything, which is the worst failure shape.
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);   // engine audio/video starts itself; a gesture gate mutes it
        s.setAllowFileAccess(false);         // this app has no business reading the phone's filesystem by URL...
        s.setAllowContentAccess(false);      // ...nor content:// providers. It opens ONE origin over the network.
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(false);             // pinch-zooming a WebGL canvas fights the app's own camera controls

        // WebGL and canvas want the hardware path; it is the default on modern Android but is stated rather than
        // assumed, because a software-rasterised engine page looks like a performance bug in the ENGINE.
        web.setLayerType(View.LAYER_TYPE_HARDWARE, null);

        web.setWebViewClient(new WebViewClient() {
            // *** IN-APP NAVIGATION STAYS IN THE APP; ANYTHING ELSE LEAVES IT. *** Without this the WebView
            // happily follows an off-site link and the user is stranded inside a wrapper with no address bar and
            // no way back to the engine. Same-origin (and private-LAN) stays; the rest is handed to a real browser.
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                Uri u = req.getUrl();
                String scheme = u.getScheme() == null ? "" : u.getScheme();
                if (!scheme.equals("http") && !scheme.equals("https")) {
                    // tel:, mailto:, intent: -- not ours to render
                    try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
                    return true;
                }
                String host = u.getHost() == null ? "" : u.getHost();
                if (isOwnServer(host)) return false;          // let the WebView load it
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
                return true;
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest req, android.webkit.WebResourceError err) {
                if (req != null && !req.isForMainFrame()) return;   // a missing sub-resource is not a dead server
                // A BLANK WHITE SCREEN IS THE ONE THING THIS MUST NEVER DO. The server being off, asleep, or on a
                // new IP is the NORMAL failure here, so it says which address it tried and offers to change it,
                // rather than leaving the user to guess whether the app or the server is broken.
                Toast.makeText(MainActivity.this, "Cannot reach " + serverUrl(), Toast.LENGTH_LONG).show();
                promptForUrl(true);
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            // FILE PICKING, WHICH THE ENGINE ACTUALLY USES. krbn-compare.html's "Load .glb / .obj / .stl" is an
            // <input type=file>, and in a WebView an unhandled file input does NOTHING AT ALL -- it does not
            // error, the picker simply never opens. Wiring this is what makes that button real on a phone.
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = cb;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }

            // Camera/mic for the pages that ask (avatar/face tracking). GRANTED ONLY TO OUR OWN ORIGIN, and only
            // after Android has already granted the app itself the OS-level permission -- this callback cannot
            // conjure a permission the app does not hold, it only decides whether to pass it through.
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                Uri origin = request.getOrigin();
                if (origin != null && isOwnServer(origin.getHost())) request.grant(request.getResources());
                else request.deny();
            }
        });

        installSettingsGesture();

        String url = serverUrl();
        if (url == null || url.isEmpty()) promptForUrl(false);
        else web.loadUrl(url);
    }

    /** Same host as the configured server, or a private-LAN address. Anything else is somebody else's site. */
    private boolean isOwnServer(String host) {
        if (host == null || host.isEmpty()) return false;
        try {
            String mine = Uri.parse(serverUrl()).getHost();
            if (mine != null && host.equalsIgnoreCase(mine)) return true;
        } catch (Exception ignored) {}
        return host.equals("localhost")
            || host.startsWith("192.168.")
            || host.startsWith("10.")
            || host.matches("^172\\.(1[6-9]|2[0-9]|3[01])\\..*");
    }

    private SharedPreferences prefs() { return getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    private String serverUrl() { return prefs().getString(KEY_URL, DEFAULT_URL); }

    private void promptForUrl(final boolean isRetry) {
        final EditText in = new EditText(this);
        in.setText(serverUrl());
        in.setSelectAllOnFocus(true);
        new AlertDialog.Builder(this)
            .setTitle(isRetry ? "Server unreachable" : "SweK server address")
            .setMessage("e.g. http://192.168.50.57:8787/")
            .setView(in)
            .setPositiveButton("Connect", (d, w) -> {
                String v = in.getText().toString().trim();
                if (v.isEmpty()) return;
                if (!v.startsWith("http://") && !v.startsWith("https://")) v = "http://" + v;
                prefs().edit().putString(KEY_URL, v).apply();
                web.loadUrl(v);
            })
            .setNegativeButton("Cancel", null)
            .show();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != FILE_CHOOSER_REQUEST) { super.onActivityResult(requestCode, resultCode, data); return; }
        // *** THE CALLBACK MUST BE ANSWERED EVEN ON CANCEL. *** A WebView whose file-chooser callback is never
        // resolved leaves the <input type=file> permanently wedged -- every later click on it is ignored, with no
        // error, for the life of the page. Passing null is how "the user picked nothing" is spelled.
        if (filePathCallback == null) return;
        filePathCallback.onReceiveValue(
            resultCode == Activity.RESULT_OK ? FileChooserParamsCompat.parse(data) : null);
        filePathCallback = null;
    }

    /** Pull the selected Uri(s) out of the picker result -- single pick, or a multi-select clipData. */
    static class FileChooserParamsCompat {
        static Uri[] parse(Intent data) {
            if (data == null) return null;
            if (data.getClipData() != null) {
                int n = data.getClipData().getItemCount();
                Uri[] out = new Uri[n];
                for (int i = 0; i < n; i++) out[i] = data.getClipData().getItemAt(i).getUri();
                return out;
            }
            return data.getData() == null ? null : new Uri[]{ data.getData() };
        }
    }

    // BACK GOES BACK THROUGH THE PAGES, not straight out of the app. Without this the hardware/gesture back
    // closes the whole thing from any depth, which in a wrapper with no address bar means losing your place.
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && web != null && web.canGoBack()) { web.goBack(); return true; }
        return super.onKeyDown(keyCode, event);
    }

    // *** THE SETTING HAS TO BE REACHABLE, AND THE OBVIOUS PLACE FOR IT IS NOT. *** The first version of this
    // put "Server address" in onCreateOptionsMenu -- which under Theme.NoTitleBar has NO ACTION BAR TO HANG IT
    // ON, and hardware menu keys have been gone since ~2012. It compiled, it looked like a settings menu, and on
    // any real phone it was unreachable: once an address was saved, there was no way to ever change it again
    // short of clearing app data. An engine that loads is one thing; an engine on the wrong IP with no way to
    // say so is a brick.
    //
    // So the gesture is a LONG-PRESS ON THE PAGE BACKGROUND, and it is deliberately narrow: getHitTestResult()
    // is consulted first, so a long-press on a LINK, IMAGE or TEXT still does the normal WebView thing
    // (context menu / selection) and only UNKNOWN_TYPE -- empty canvas or bare background, which is most of an
    // engine page -- opens the address dialog. The README says so, because an invisible gesture nobody is told
    // about is the same as no gesture. The failed-load path (onReceivedError) also offers it, which is the case
    // that matters most: the address is usually wrong exactly when the page will not load.
    private void installSettingsGesture() {
        web.setOnLongClickListener(v -> {
            WebView.HitTestResult hit = web.getHitTestResult();
            if (hit != null && hit.getType() != WebView.HitTestResult.UNKNOWN_TYPE) return false;
            new AlertDialog.Builder(MainActivity.this)
                .setTitle("SweK")
                .setItems(new CharSequence[]{ "Server address…", "Reload" }, (d, which) -> {
                    if (which == 0) promptForUrl(false); else web.reload();
                })
                .show();
            return true;
        });
    }
}
