// WebGLEngine/tools/ship/swekTvLauncher-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// Run: node tools/ship/swekTvLauncher-selfcheck.mjs      (~3 s with a JDK; sections 3-4 SKIP, and say so, without one)
//
// GRADES SweK HOME, the second launcher activity in android/swek-webview: the manifest around it, the pure logic behind it
// (Shelf.java, compiled and driven here by a plain javac), and the activity itself compiled against an API-16 android.jar when one is
// cached.
//
// *** WHAT THIS CAN AND CANNOT CLAIM. *** There is no TV, no emulator and no Android SDK behind this gate. What it CAN show: the manifest
// declares what makes Android offer the activity as a home screen and declares NOTHING that could turn another app off; Shelf's logic
// (what is on the shelf, its order, which paths a tile may open) does what it says on fixtures; LauncherActivity type-checks against a
// real android.jar. What it CANNOT show: that the screen looks right, that the D-pad walks it well, or that it behaves as Home on any
// real device. Those are the rig's, and the first run on one is the test.
//
// SABOTAGES (each applied to the real file, run, restored md5-identical; every one red BY NAME; the number is rows red):
//   HOME category removed from LauncherActivity ........ 2 (answers HOME; the ONLY home)     QUERY_ALL_PACKAGES declared ................ 2 (queries row; permissions row)
//   CHANGE_COMPONENT_ENABLED_STATE declared ............ 2 (permissions row; power-permission row)   setApplicationEnabledSetting in the activity ... 1
//   MainActivity reads the path extra raw in onNewIntent  1                                  Shelf.safePath returns anything ............ 1 (ShelfCheck: 2 of its rows)
//   Shelf stops hiding this app from itself ............ 1 (ShelfCheck: 2 of its rows)      a tile points at a page that is not there .. 1
//   an API-21 symbol used (CATEGORY_LEANBACK_LAUNCHER) . 2 (the compile; the API-16 row)     MainActivity ALSO made a home screen ....... 2 (only-home; MainActivity unchanged)
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = path.join(ENG, "android", "swek-webview", "app", "src");
const MAIN = path.join(SRC, "main");
const read = (...p) => fs.readFileSync(path.join(...p), "utf8");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const noComments = (x) => x.replace(/<!--[\s\S]*?-->/g, "");
const noJavaComments = (x) => x.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"])\/\/.*$/gm, "$1");

const manifest = noComments(read(MAIN, "AndroidManifest.xml"));
const launcher = read(MAIN, "java", "com", "swek", "webview", "LauncherActivity.java");
const mainAct = read(MAIN, "java", "com", "swek", "webview", "MainActivity.java");
const launcherCode = noJavaComments(launcher), mainCode = noJavaComments(mainAct);

/** The <activity ...>...</activity> blocks of the manifest, by android:name. */
const activities = {};
for (const m of manifest.matchAll(/<activity\b([\s\S]*?)<\/activity>/g)) { const n = (m[1].match(/android:name="([^"]+)"/) || [])[1]; if (n) activities[n] = m[0]; }
const cats = (block) => [...block.matchAll(/<category android:name="([^"]+)"/g)].map((x) => x[1].replace("android.intent.category.", ""));

console.log("swekTvLauncher-selfcheck -- SweK HOME\n");

console.log("1. THE MANIFEST");
{
    ok("!! the two activities are declared: MainActivity (the web view) and LauncherActivity (SweK Home)", Object.keys(activities).sort().join() === ".LauncherActivity,.MainActivity", Object.keys(activities).join(", "));
    const L = activities[".LauncherActivity"] || "", M = activities[".MainActivity"] || "";
    ok("!! LauncherActivity answers MAIN with HOME and DEFAULT -- what makes Android offer it when the owner picks a home screen", /action android:name="android.intent.action.MAIN"/.test(L) && cats(L).includes("HOME") && cats(L).includes("DEFAULT"), cats(L).join(", "));
    ok("!! and it is the ONLY activity in the APK that is a home screen", Object.entries(activities).filter(([, b]) => cats(b).includes("HOME")).map(([n]) => n).join() === ".LauncherActivity");
    ok("it is also listed in the TV's app row (LEANBACK_LAUNCHER) so it can be started once without being Home, and is exported (the system launches it)", cats(L).includes("LEANBACK_LAUNCHER") && /android:exported="true"/.test(L));
    ok("!! MainActivity is UNCHANGED as a launcher: still LAUNCHER and LEANBACK_LAUNCHER, and still not a home screen", cats(M).includes("LAUNCHER") && cats(M).includes("LEANBACK_LAUNCHER") && !cats(M).includes("HOME"), cats(M).join(", "));
    ok("the TV install lines survive: touchscreen and leanback both required=false", /android.hardware.touchscreen" android:required="false"/.test(manifest) && /android.software.leanback" android:required="false"/.test(manifest));
    ok("!! the app list is read through <queries> for the two launcher categories, NOT the broad QUERY_ALL_PACKAGES permission",
        /<queries>[\s\S]*category android:name="android.intent.category.LAUNCHER"[\s\S]*category android:name="android.intent.category.LEANBACK_LAUNCHER"[\s\S]*<\/queries>/.test(manifest) && !/QUERY_ALL_PACKAGES/.test(manifest));
    const perms = [...manifest.matchAll(/<uses-permission android:name="([^"]+)"/g)].map((m) => m[1].replace("android.permission.", "")).sort();
    ok("!! the APK holds INTERNET and ACCESS_NETWORK_STATE and NOTHING ELSE", perms.join() === "ACCESS_NETWORK_STATE,INTERNET", perms.join(", "));
    const POWER = ["CHANGE_COMPONENT_ENABLED_STATE", "WRITE_SECURE_SETTINGS", "PACKAGE_USAGE_STATS", "REQUEST_INSTALL_PACKAGES", "DELETE_PACKAGES", "SET_PREFERRED_APPLICATIONS", "MANAGE_EXTERNAL_STORAGE", "BIND_ACCESSIBILITY_SERVICE", "INSTALL_PACKAGES"];
    ok("!! and none of the permissions that could turn another app off, change the default home, or install something is declared, even commented out of reach", POWER.every((p) => !manifest.includes(p)), POWER.length + " checked");
    ok("the home screen has a name of its own, so it is not two identical 'SweK' entries in the chooser", /name="home_name">SweK Home</.test(read(MAIN, "res", "values", "strings.xml")) && /android:label="@string\/home_name"/.test(L));
}

console.log("\n2. WHAT THE ACTIVITY CODE CANNOT DO");
{
    const BAD = [/Runtime\.getRuntime/, /ProcessBuilder/, /setApplicationEnabledSetting/, /setComponentEnabledSetting/, /pm\s+disable/, /Settings\.Secure/, /Settings\.System/, /\bsu\b\s*["']/, /PackageInstaller/, /ACTION_DELETE/, /ACTION_UNINSTALL/, /ACTION_INSTALL/, /setPreferredActivity|addPreferredActivity|clearPackagePreferredActivities/];
    const hit = BAD.filter((re) => re.test(launcherCode)).map(String);
    ok("!! LauncherActivity cannot run a command, change an app's enabled state, install or remove anything, or take over the default home -- it only lists and launches", hit.length === 0, hit.join(", ") || BAD.length + " patterns absent");
    ok("!! it launches an app only by getLaunchIntentForPackage and a SweK page only through MainActivity -- no URL of its own", /getLaunchIntentForPackage\(t\.pkg\)/.test(launcherCode) && !/loadUrl|http:\/\/|https:\/\//.test(launcherCode));
    ok("!! MainActivity reads the path extra ONLY through Shelf.safePath, in both onCreate and onNewIntent, and never raw",
        (mainCode.match(/getStringExtra\(EXTRA_PATH\)/g) || []).length === (mainCode.match(/Shelf\.safePath\([^;]*getStringExtra\(EXTRA_PATH\)/g) || []).length &&
        (mainCode.match(/Shelf\.safePath\(/g) || []).length >= 2 && /onNewIntent\(Intent intent\)/.test(mainCode),
        (mainCode.match(/Shelf\.safePath\(/g) || []).length + " guarded reads");
    ok("Back does nothing on the home screen, as on every home screen", /public void onBackPressed\(\) \{ \}/.test(launcherCode));
}

const javac = spawnSync("javac", ["-version"], { encoding: "utf8" });
const hasJdk = javac.status === 0 || /javac/.test((javac.stderr || "") + (javac.stdout || ""));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "swek-tv-"));
const cleanup = () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } };

console.log("\n3. SHELF.JAVA, COMPILED AND DRIVEN BY A PLAIN JAVAC");
let tilePaths = [];
if (!hasJdk) say("SKIPPED -- no javac on this box. THAT IS A SKIP, NOT A PASS: Shelf's logic is graded only by running it.");
else {
    const shelf = path.join(MAIN, "java", "com", "swek", "webview", "Shelf.java");
    const check = path.join(SRC, "test", "java", "com", "swek", "webview", "ShelfCheck.java");
    const out = path.join(tmp, "shelf");
    fs.mkdirSync(out);
    const c = spawnSync("javac", ["-Xlint:all", "-d", out, shelf, check], { encoding: "utf8" });
    ok("!! Shelf.java and its check compile with NO warnings under -Xlint:all (the logic imports nothing from android)", c.status === 0 && !/warning|error/i.test(strip(c.stderr)), strip(c.stderr).slice(0, 200) || "clean");
    ok("!! Shelf.java imports nothing from android.*", !/import android\./.test(read(shelf)));
    if (c.status === 0) {
        const r = spawnSync("java", ["-cp", out, "com.swek.webview.ShelfCheck"], { encoding: "utf8" });
        const lines = strip(r.stdout).split("\n");
        const pass = lines.filter((l) => l.startsWith("PASS ")), failed = lines.filter((l) => l.startsWith("FAIL "));
        ok("!! ShelfCheck runs to the end and every one of its rows passes", r.status === 0 && failed.length === 0 && pass.length >= 14 && /ShelfCheck: all passed/.test(r.stdout), pass.length + " pass, " + failed.length + " fail" + (failed[0] ? " -- " + failed[0].slice(0, 120) : ""));
        for (const l of failed) say(l.slice(0, 200));
        // the launcher's REAL tile paths, through the REAL rule
        tilePaths = [...launcherCode.matchAll(/Tile\.swek\("[^"]*",\s*"([^"]*)"\)/g)].map((m) => m[1]);
        const s = spawnSync("java", ["-cp", out, "com.swek.webview.ShelfCheck", "--safe", ...tilePaths], { encoding: "utf8" });
        const accepted = strip(s.stdout).split("\n").filter((l) => l.startsWith("SAFE ")).filter((l) => !l.endsWith("-> null"));
        ok("!! every path the launcher's own SweK tiles carry is accepted by Shelf.safePath -- a tile the rule would refuse is a dead tile", tilePaths.length >= 3 && accepted.length === tilePaths.length, tilePaths.join(" "));
    }
}

console.log("\n4. LAUNCHERACTIVITY, TYPE-CHECKED AGAINST AN API-16 android.jar");
{
    const jar = process.env.ANDROID_JAR || path.join(os.homedir(), ".cache", "swek", "android-4.1.1.4.jar");
    if (!hasJdk || !fs.existsSync(jar)) say("SKIPPED -- " + (!hasJdk ? "no javac" : "no android.jar cached at " + jar + " (set ANDROID_JAR, or fetch com.google.android:android:4.1.1.4 from Maven Central into that path)") + ". THAT IS A SKIP, NOT A PASS: nothing here has type-checked the activity.");
    else {
        const mConst = (mainCode.match(/static final String EXTRA_PATH = "([^"]+)"/) || [])[1];
        ok("MainActivity declares the EXTRA_PATH the launcher passes", !!mConst, mConst);
        const stubDir = path.join(tmp, "stub", "com", "swek", "webview");
        fs.mkdirSync(stubDir, { recursive: true });
        // MainActivity itself uses newer APIs than this jar has, so it is stood in for by a stub that carries ONLY the constant, read from the real file
        fs.writeFileSync(path.join(stubDir, "MainActivity.java"), `package com.swek.webview;\npublic class MainActivity extends android.app.Activity { static final String EXTRA_PATH = "${mConst}"; }\n`);
        const out = path.join(tmp, "act");
        fs.mkdirSync(out);
        const c = spawnSync("javac", ["-Xlint:-options", "-cp", jar, "-d", out, path.join(stubDir, "MainActivity.java"), path.join(MAIN, "java", "com", "swek", "webview", "Shelf.java"), path.join(MAIN, "java", "com", "swek", "webview", "LauncherActivity.java")], { encoding: "utf8" });
        ok("!! LauncherActivity compiles against android 4.1 (every symbol it uses exists; the newer constants are written as strings)", c.status === 0, strip(c.stderr).split("\n").slice(0, 3).join(" | ") || "clean");
        ok("!! it uses nothing newer than API 16 that the jar could not check: no lambda-only or API-21+ symbols (Intent.CATEGORY_LEANBACK_LAUNCHER, getLeanbackLaunchIntentForPackage)", !/CATEGORY_LEANBACK_LAUNCHER|getLeanbackLaunchIntentForPackage/.test(launcherCode));
    }
}

console.log("\n5. THE TILES POINT AT REAL PAGES");
{
    const paths = tilePaths.length ? tilePaths : [...launcherCode.matchAll(/Tile\.swek\("[^"]*",\s*"([^"]*)"\)/g)].map((m) => m[1]);
    const missing = paths.filter((p) => p !== "/" && !fs.existsSync(path.join(ENG, p.replace(/^\//, "").split(/[?#]/)[0])));
    ok("!! every SweK tile's page exists in the engine folder the server serves (the root path is the server's own index)", paths.length >= 3 && missing.length === 0, paths.join(" ") + (missing.length ? "   MISSING: " + missing.join(", ") : ""));
    ok("the peer page is one of them: the Android peer is built into the TV menu, not beside it", paths.includes("/android-peer.html"));
}

say("NOT RUN: SweK Home has never run on a TV or an emulator. How it looks, how the D-pad walks it, and that Android offers and keeps it as Home are the rig's to show.");
cleanup();
console.log(`\nswekTvLauncher-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

function strip(s) { return String(s || "").split("\n").filter((l) => !/JAVA_TOOL_OPTIONS/.test(l)).join("\n"); }
