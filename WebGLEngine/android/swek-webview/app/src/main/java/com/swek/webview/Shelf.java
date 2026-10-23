package com.swek.webview;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * The SweK TV home screen's logic, with NOT ONE android import.
 *
 * That is deliberate and it is the reason this file exists apart from LauncherActivity. There is no Android SDK in the
 * sandbox this tree is built in, so an Activity can be written and compiled against a stub jar but cannot be RUN; this class can.
 * tools/ship/swekTvLauncher-selfcheck.mjs compiles it with a plain javac and drives it (src/test/.../ShelfCheck.java), so what
 * goes on the shelf, in what order, and which paths the launcher may hand to the web view are all graded rather than hoped.
 *
 * Three decisions live here:
 *   - WHAT IS ON THE SHELF. SweK's own tiles first (the engine, the Android peer, the page index), then the TV's apps. On a TV only
 *     apps that declare a leanback launcher show, because a phone-only app on a TV is a tile that opens something unusable with a
 *     remote; the owner can still PIN any app and a pinned app always shows. This app itself is never a tile of itself.
 *   - IN WHAT ORDER. Pinned apps in the order they were pinned, then everything else alphabetically (case-insensitively, package
 *     name as the tiebreak, so the order is the same on every boot).
 *   - WHICH PATHS A TILE MAY OPEN. A tile carries a path on the owner's own SweK server. safePath() lets through only a relative
 *     path beginning with a single "/", so an intent from another app cannot make the web view load someone else's site by passing
 *     "//evil.example/" or "http://evil.example/" as the path.
 */
final class Shelf {
    private Shelf() {}

    private static final Pattern PKG = Pattern.compile("^[A-Za-z_][A-Za-z0-9_]*(\\.[A-Za-z0-9_]+)+$");
    private static final Pattern PATH = Pattern.compile("^/[A-Za-z0-9._~%/?=&#,+-]*$");

    /** An installed app that has a launch activity. */
    static final class App {
        final String pkg, label;
        final boolean leanback;
        App(String pkg, String label, boolean leanback) { this.pkg = pkg; this.label = label; this.leanback = leanback; }
    }

    /** One tile on the shelf: either a SweK page (path != null) or an installed app (pkg != null). */
    static final class Tile {
        static final int SWEK = 0, APP = 1;
        final int kind;
        final String pkg, label, path;
        Tile(int kind, String pkg, String label, String path) { this.kind = kind; this.pkg = pkg; this.label = label; this.path = path; }
        static Tile swek(String label, String path) { return new Tile(SWEK, null, label, path); }
        static Tile app(String pkg, String label) { return new Tile(APP, pkg, label, null); }
    }

    /**
     * Build the shelf.
     * @param installed every launchable app, leanback ones flagged (the same package may appear twice, once per category)
     * @param pinned    package names in the order the owner pinned them
     * @param selfPkg   this app's own package, never shown
     * @param tvMode    on a TV, show leanback apps and pinned apps only
     * @param swek      SweK's own tiles, kept first and in the given order
     */
    static List<Tile> build(List<App> installed, List<String> pinned, String selfPkg, boolean tvMode, List<Tile> swek) {
        List<Tile> out = new ArrayList<>();
        if (swek != null) out.addAll(swek);

        Map<String, App> byPkg = new LinkedHashMap<>();
        if (installed != null) for (App a : installed) {
            if (a == null || a.pkg == null || !PKG.matcher(a.pkg).matches() || a.pkg.equals(selfPkg)) continue;
            String label = (a.label == null || a.label.trim().isEmpty()) ? a.pkg : a.label.trim();
            App prev = byPkg.get(a.pkg);
            // the same package listed under both categories is one app, and it is leanback if EITHER listing says so
            byPkg.put(a.pkg, prev == null ? new App(a.pkg, label, a.leanback) : new App(a.pkg, prev.label, prev.leanback || a.leanback));
        }

        List<String> pins = pinned == null ? new ArrayList<String>() : pinned;
        Set<String> pinSet = new HashSet<>(pins);

        // pinned first, in pin order, whatever they declare
        Set<String> placed = new HashSet<>();
        for (String p : pins) {
            App a = byPkg.get(p);
            if (a != null && placed.add(p)) out.add(Tile.app(a.pkg, a.label));
        }
        // then the rest, alphabetical; on a TV only the leanback ones
        List<App> rest = new ArrayList<>();
        for (App a : byPkg.values()) {
            if (pinSet.contains(a.pkg)) continue;
            if (tvMode && !a.leanback) continue;
            rest.add(a);
        }
        Collections.sort(rest, new Comparator<App>() {
            @Override public int compare(App x, App y) {
                int c = x.label.toLowerCase(Locale.ROOT).compareTo(y.label.toLowerCase(Locale.ROOT));
                return c != 0 ? c : x.pkg.compareTo(y.pkg);
            }
        });
        for (App a : rest) out.add(Tile.app(a.pkg, a.label));
        return out;
    }

    /** A path on the owner's own server, or null. Only "/" then letters, digits and . _ ~ % / ? = & # , + - ; never "//", "://", "..", a backslash or a space. */
    static String safePath(String p) {
        if (p == null || p.length() > 200) return null;
        if (!PATH.matcher(p).matches()) return null;
        if (p.startsWith("//") || p.contains("://") || p.contains("..") || p.contains("//")) return null;
        return p;
    }

    /** The server address with a safe path on the end, or the address itself when there is no (safe) path. */
    static String joinUrl(String base, String path) {
        if (base == null) return null;
        if (path == null) return base;
        String b = base;
        while (b.endsWith("/")) b = b.substring(0, b.length() - 1);
        return b + path;
    }

    /** "a.b,c.d" -> [a.b, c.d]; anything that is not a package name, and repeats, are dropped; order kept. */
    static List<String> parsePinned(String csv) {
        List<String> out = new ArrayList<>();
        if (csv == null) return out;
        for (String s : csv.split(",")) {
            String t = s.trim();
            if (PKG.matcher(t).matches() && !out.contains(t)) out.add(t);
        }
        return out;
    }

    /** Pin the package if it is not pinned (at the end), unpin it if it is. A non-package name changes nothing. */
    static String togglePinned(String csv, String pkg) {
        List<String> pins = parsePinned(csv);
        if (pkg == null || !PKG.matcher(pkg).matches()) return join(pins);
        if (!pins.remove(pkg)) pins.add(pkg);
        return join(pins);
    }

    private static String join(List<String> l) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < l.size(); i++) { if (i > 0) sb.append(','); sb.append(l.get(i)); }
        return sb.toString();
    }
}
