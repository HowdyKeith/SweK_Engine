package com.swek.webview;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;

/**
 * SweK HOME -- the TV's home screen, as a second launcher activity in the same APK as the web view wrapper.
 *
 * WHAT IT IS: a shelf. SweK's own tiles first (the engine, the Android peer, the page index), then the TV's apps, laid out in rows a
 * D-pad can walk. WHAT IT IS NOT: a debloater. It turns nothing off, runs no adb and holds no permission beyond seeing which apps
 * can be launched. The debloat planner is tv/tvDebloat.mjs on the SweK server, a dry run that executes nothing, and this screen
 * does not call it. Both are deliberately smaller than the three projects they were assessed against (tv/tvPackages.mjs says
 * which): a home screen that can also brick the TV is a bigger risk than a home screen.
 *
 * WHAT IS GRADED AND WHAT IS NOT: what goes on the shelf, its order and the paths it may open are Shelf.java, driven by
 * tools/ship/swekTvLauncher-selfcheck.mjs. THIS FILE is compiled against an API-16 android.jar in that gate when one is cached
 * and has never been RUN: there is no TV and no emulator behind it. Anything about how it LOOKS is unmeasured.
 *
 * It is set as Home by the OWNER, in the TV's own "home screen" setting or the chooser Android shows on the Home key. Nothing here
 * changes that setting, and the stock home screen is never disabled by this APK.
 */
public class LauncherActivity extends Activity {
    private static final String PREFS = "swek_tv";
    private static final String KEY_PINNED = "pinned";
    private static final String CAT_LEANBACK = "android.intent.category.LEANBACK_LAUNCHER";   // the constant is API 21; the string is older than that
    private static final int COLUMNS = 6;

    private LinearLayout rows;
    private boolean tvMode;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        // a home screen is watched, not tapped: do not let the TV sleep on it mid-session
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        PackageManager pm = getPackageManager();
        tvMode = pm.hasSystemFeature("android.software.leanback") || pm.hasSystemFeature("android.hardware.type.television");

        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(Color.rgb(10, 14, 12));
        scroll.setFillViewport(true);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(48), dp(32), dp(48), dp(32));
        TextView title = new TextView(this);
        title.setText("SweK");
        title.setTextColor(Color.rgb(111, 227, 154));
        title.setTextSize(28);
        col.addView(title);
        TextView hint = new TextView(this);
        hint.setText("Hold OK on an app to pin it to the front");
        hint.setTextColor(Color.rgb(127, 167, 142));
        hint.setTextSize(14);
        hint.setPadding(0, 0, 0, dp(16));
        col.addView(hint);
        rows = new LinearLayout(this);
        rows.setOrientation(LinearLayout.VERTICAL);
        col.addView(rows);
        scroll.addView(col, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        setContentView(scroll);
    }

    @Override
    protected void onResume() {
        super.onResume();
        rebuild();      // apps come and go while another activity is in front
    }

    /** Home is the bottom of the stack: Back does nothing here, as on every home screen. */
    @Override
    public void onBackPressed() { }

    private void rebuild() {
        rows.removeAllViews();
        List<Shelf.Tile> tiles = Shelf.build(installedApps(), Shelf.parsePinned(prefs().getString(KEY_PINNED, "")), getPackageName(), tvMode, swekTiles());
        LinearLayout row = null;
        View first = null;
        for (int i = 0; i < tiles.size(); i++) {
            if (i % COLUMNS == 0) {
                row = new LinearLayout(this);
                row.setOrientation(LinearLayout.HORIZONTAL);
                rows.addView(row);
            }
            View v = tileView(tiles.get(i));
            row.addView(v);
            if (first == null) first = v;
        }
        if (first != null) first.requestFocus();
    }

    private List<Shelf.Tile> swekTiles() {
        List<Shelf.Tile> t = new ArrayList<Shelf.Tile>();
        t.add(Shelf.Tile.swek("SweK Engine", "/"));
        t.add(Shelf.Tile.swek("Android peer", "/android-peer.html"));
        t.add(Shelf.Tile.swek("All pages", "/server.html"));
        return t;
    }

    /** Every launchable app, the leanback ones flagged. Needs only the <queries> intents in the manifest, not QUERY_ALL_PACKAGES. */
    private List<Shelf.App> installedApps() {
        PackageManager pm = getPackageManager();
        List<Shelf.App> out = new ArrayList<Shelf.App>();
        Intent lb = new Intent(Intent.ACTION_MAIN).addCategory(CAT_LEANBACK);
        Intent std = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        for (ResolveInfo ri : pm.queryIntentActivities(lb, 0)) out.add(new Shelf.App(ri.activityInfo.packageName, ri.loadLabel(pm).toString(), true));
        for (ResolveInfo ri : pm.queryIntentActivities(std, 0)) out.add(new Shelf.App(ri.activityInfo.packageName, ri.loadLabel(pm).toString(), false));
        return out;
    }

    private View tileView(final Shelf.Tile t) {
        LinearLayout v = new LinearLayout(this);
        v.setOrientation(LinearLayout.VERTICAL);
        v.setGravity(Gravity.CENTER_HORIZONTAL);
        v.setPadding(dp(10), dp(12), dp(10), dp(12));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(150), dp(130));
        lp.setMargins(dp(6), dp(6), dp(6), dp(6));
        v.setLayoutParams(lp);
        v.setFocusable(true);
        v.setClickable(true);
        v.setBackground(tileBackground());
        ImageView icon = new ImageView(this);
        icon.setLayoutParams(new LinearLayout.LayoutParams(dp(64), dp(64)));
        icon.setImageDrawable(t.kind == Shelf.Tile.APP ? appIcon(t.pkg) : null);
        if (t.kind == Shelf.Tile.SWEK) icon.setBackgroundColor(Color.rgb(23, 64, 42));
        v.addView(icon);
        TextView label = new TextView(this);
        label.setText(t.label);
        label.setTextColor(Color.rgb(207, 233, 216));
        label.setTextSize(14);
        label.setGravity(Gravity.CENTER_HORIZONTAL);
        label.setSingleLine(true);
        label.setPadding(0, dp(6), 0, 0);
        v.addView(label);
        v.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View x) { open(t); }
        });
        if (t.kind == Shelf.Tile.APP) v.setOnLongClickListener(new View.OnLongClickListener() {
            @Override public boolean onLongClick(View x) {
                String next = Shelf.togglePinned(prefs().getString(KEY_PINNED, ""), t.pkg);
                prefs().edit().putString(KEY_PINNED, next).commit();
                Toast.makeText(LauncherActivity.this, Shelf.parsePinned(next).contains(t.pkg) ? "Pinned " + t.label : "Unpinned " + t.label, Toast.LENGTH_SHORT).show();
                rebuild();
                return true;
            }
        });
        return v;
    }

    private void open(Shelf.Tile t) {
        try {
            if (t.kind == Shelf.Tile.SWEK) {
                // the path is checked again where it is READ (MainActivity), so this is not the only gate
                startActivity(new Intent(this, MainActivity.class).putExtra(MainActivity.EXTRA_PATH, t.path));
            } else {
                Intent i = getPackageManager().getLaunchIntentForPackage(t.pkg);
                if (i != null) startActivity(i);
            }
        } catch (Exception e) {
            Toast.makeText(this, "Could not open " + t.label, Toast.LENGTH_SHORT).show();
        }
    }

    private Drawable appIcon(String pkg) {
        try { return getPackageManager().getApplicationIcon(pkg); } catch (Exception e) { return null; }
    }

    private Drawable tileBackground() {
        StateListDrawable sl = new StateListDrawable();
        sl.addState(new int[] { android.R.attr.state_focused }, box(Color.rgb(28, 74, 50), Color.rgb(111, 227, 154), 3));
        sl.addState(new int[] {}, box(Color.rgb(15, 23, 18), Color.rgb(34, 74, 54), 1));
        return sl;
    }

    private GradientDrawable box(int fill, int stroke, int strokeDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(fill);
        g.setStroke(dp(strokeDp), stroke);
        g.setCornerRadius(dp(10));
        return g;
    }

    private SharedPreferences prefs() { return getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    private int dp(int v) { return (int) (v * getResources().getDisplayMetrics().density + 0.5f); }
}
