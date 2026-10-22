package com.swek.webview;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Drives Shelf with plain javac and a main(): no JUnit, no Android SDK, no Gradle. Prints "PASS name" / "FAIL name  detail" lines that
 * tools/ship/swekTvLauncher-selfcheck.mjs reads, so a Java-side result is graded by the same gate that grades the manifest around it.
 */
public final class ShelfCheck {
    static int fails = 0;
    static void ok(String name, boolean cond, String detail) {
        System.out.println((cond ? "PASS " : "FAIL ") + name + (detail == null || detail.isEmpty() ? "" : "  " + detail));
        if (!cond) fails++;
    }
    static void ok(String name, boolean cond) { ok(name, cond, ""); }
    static String labels(List<Shelf.Tile> t) {
        StringBuilder sb = new StringBuilder();
        for (Shelf.Tile x : t) { if (sb.length() > 0) sb.append(" | "); sb.append(x.kind == Shelf.Tile.SWEK ? "[" + x.label + "]" : x.label); }
        return sb.toString();
    }
    static Shelf.App app(String pkg, String label, boolean lb) { return new Shelf.App(pkg, label, lb); }

    public static void main(String[] args) {
        // `--safe <path>...` prints what safePath makes of each argument, for the gate to check the launcher's real tile paths against the real rule
        if (args.length > 0 && args[0].equals("--safe")) {
            for (int i = 1; i < args.length; i++) System.out.println("SAFE " + args[i] + " -> " + Shelf.safePath(args[i]));
            return;
        }
        List<Shelf.Tile> swek = new ArrayList<>(Arrays.asList(Shelf.Tile.swek("SweK", "/"), Shelf.Tile.swek("Android peer", "/android-peer.html")));
        List<Shelf.App> apps = new ArrayList<>(Arrays.asList(
            app("com.netflix.ninja", "Netflix", true), app("com.google.android.youtube.tv", "YouTube", true),
            app("com.android.camera", "Camera", false), app("com.swek.webview", "SweK", true),
            app("org.zzz.player", "alpha player", true), app("com.aaa.tool", "Tool", false)));

        // 1. the shelf: swek first, self hidden, TV mode shows leanback only, alphabetical case-insensitively
        List<Shelf.Tile> tv = Shelf.build(apps, new ArrayList<String>(), "com.swek.webview", true, swek);
        ok("SweK's tiles come first, in the order given", tv.get(0).label.equals("SweK") && tv.get(1).label.equals("Android peer") && tv.get(0).kind == Shelf.Tile.SWEK, labels(tv));
        ok("this app is never a tile of itself", !labels(tv).contains("| SweK |") && count(tv, "com.swek.webview") == 0, labels(tv));
        ok("on a TV only leanback apps show, alphabetical regardless of case: alpha player, Netflix, YouTube", labels(tv).endsWith("alpha player | Netflix | YouTube"), labels(tv));
        List<Shelf.Tile> phone = Shelf.build(apps, null, "com.swek.webview", false, swek);
        ok("off a TV every launchable app shows", labels(phone).contains("Camera") && labels(phone).contains("Tool"), labels(phone));

        // 2. pinning: pinned first in pin order, shows on a TV even when not leanback, never twice
        List<Shelf.Tile> pin = Shelf.build(apps, Arrays.asList("com.android.camera", "com.netflix.ninja"), "com.swek.webview", true, swek);
        ok("pinned apps come right after SweK's tiles in pin order, and a pinned non-leanback app shows on a TV",
            pin.get(2).label.equals("Camera") && pin.get(3).label.equals("Netflix") && count(pin, "com.netflix.ninja") == 1, labels(pin));
        ok("a pin for an app that is not installed is ignored", labels(Shelf.build(apps, Arrays.asList("com.gone.app"), "x.y", true, swek)).indexOf("gone") < 0);

        // 3. one app listed under both categories is one tile, leanback if either says so
        List<Shelf.App> dup = Arrays.asList(app("com.dual.app", "Dual", false), app("com.dual.app", "Dual", true));
        List<Shelf.Tile> d = Shelf.build(dup, null, "x.y", true, null);
        ok("!! the same package under two categories is ONE tile, and leanback if either listing says so", d.size() == 1 && d.get(0).pkg.equals("com.dual.app"), labels(d));

        // 4. hostile or broken input
        List<Shelf.App> bad = Arrays.asList(app(null, "x", true), app("not a package", "y", true), app("com.ok.one", null, true), app("com.ok.two", "   ", true), null);
        List<Shelf.Tile> b = Shelf.build(bad, null, "x.y", true, null);
        ok("!! a null, a malformed package name and a null entry are dropped; a missing label falls back to the package name",
            b.size() == 2 && b.get(0).label.equals("com.ok.one") && b.get(1).label.equals("com.ok.two"), labels(b));
        ok("null lists do not throw", Shelf.build(null, null, null, true, null).isEmpty());
        ok("the order is stable: the same input twice gives the same shelf", labels(Shelf.build(apps, null, "a.b", true, swek)).equals(labels(Shelf.build(apps, null, "a.b", true, swek))));

        // 5. safePath: the one gate between an intent extra and the web view
        String[] good = { "/", "/android-peer.html", "/server.html?tab=smarthome", "/a/b_c-d.e~f%20g#h" };
        boolean allGood = true; for (String g : good) allGood &= g.equals(Shelf.safePath(g));
        ok("!! ordinary paths on the server pass unchanged", allGood);
        String[] evil = { "//evil.example/", "http://evil.example/", "https://evil.example", "/a/../etc", "/..", "javascript:alert(1)", "evil.example/x", "", " /x", "/x y", "/x\\y", "/a//b", "file:///etc/passwd", "/x\n", null };
        StringBuilder leaked = new StringBuilder();
        for (String e : evil) if (Shelf.safePath(e) != null) leaked.append('"').append(e).append("\" ");
        ok("!! an intent cannot steer the web view off the server: protocol-relative, absolute, traversal, javascript:, empty, spaced, backslashed and null paths are all refused", leaked.length() == 0, leaked.toString());
        StringBuilder longp = new StringBuilder("/"); for (int i = 0; i < 300; i++) longp.append('a');
        ok("a path over 200 characters is refused", Shelf.safePath(longp.toString()) == null);

        // 6. joinUrl
        ok("the path lands on the server address with exactly one slash between", "http://192.168.50.57:8787/android-peer.html".equals(Shelf.joinUrl("http://192.168.50.57:8787/", "/android-peer.html")) && "http://h:1/x".equals(Shelf.joinUrl("http://h:1///", "/x")));
        ok("no path (or a refused one, which is null) opens the server address itself", "http://h:1/".equals(Shelf.joinUrl("http://h:1/", null)) && Shelf.joinUrl(null, "/x") == null);

        // 7. pins round-trip
        ok("!! pinning adds at the end, pinning again removes, junk and repeats are dropped, and a non-package name changes nothing",
            "a.b".equals(Shelf.togglePinned("", "a.b")) && "a.b,c.d".equals(Shelf.togglePinned("a.b", "c.d")) && "c.d".equals(Shelf.togglePinned("a.b,c.d", "a.b")) && "a.b".equals(Shelf.togglePinned("a.b", "evil; rm")) && "a.b,c.d".equals(Shelf.togglePinned(" a.b ,junk,a.b,, c.d ,", "zzz")) , Shelf.togglePinned(" a.b ,junk,a.b,, c.d ,", "zzz"));

        System.out.println(fails == 0 ? "ShelfCheck: all passed" : "ShelfCheck: " + fails + " FAILED");
        System.exit(fails == 0 ? 0 : 1);
    }

    static int count(List<Shelf.Tile> t, String pkg) { int n = 0; for (Shelf.Tile x : t) if (pkg.equals(x.pkg)) n++; return n; }
}
