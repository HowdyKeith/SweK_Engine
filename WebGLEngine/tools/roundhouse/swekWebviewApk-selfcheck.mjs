// WebGLEngine/tools/roundhouse/swekWebviewApk-selfcheck.mjs -- v4043
// ---------------------------------------------------------------------------------------------------------------
// GATES android/swek-webview -- the WebView wrapper APK project.
//
// Keith: "can we make a apk WebView wrapper app that installs a web page that points to our SweK server? could we
// use https://github.com/wxxsfxyzm/InstallerX-Revived"
//
// *** THIS GATE CANNOT BUILD THE APK AND DOES NOT PRETEND TO. *** The Android SDK is absent from this sandbox and
// dl.google.com is 403 through the egress proxy (measured), so nothing here has ever been compiled, type-checked
// against real android.* classes, or installed. What IS checkable without a toolchain is checked, and the rest is
// stated as unverified rather than quietly implied -- which matters more than usual here, because every failure
// mode below is SILENT ON A PHONE: the app launches, renders something, and is subtly useless.
//
// THE FOUR THINGS THAT BREAK WITHOUT ANNOUNCING THEMSELVES, hence the four load-bearing checks:
//
//   1. XML COMMENTS CANNOT CONTAIN "--".  This tree's prose style uses `--` constantly, and it is ILLEGAL inside
//      an XML comment. The first draft of AndroidManifest.xml and network_security_config.xml were both
//      malformed for exactly this reason and would have failed the build -- caught here by PARSING them rather
//      than eyeballing them.
//   2. DOM STORAGE IS OFF BY DEFAULT IN WEBVIEW.  localStorage silently no-ops. The engine leans on it hard
//      (voxelEngine.kpopFavorites, swek-dash, swek.serverAvatarSlots), so the app would work and forget
//      everything -- the worst failure shape there is.
//   3. AN UNHANDLED <input type=file> DOES NOTHING AT ALL.  No error, the picker simply never opens. That is
//      krbn-compare.html's "Load .glb / .obj / .stl" button, dead, with no diagnostic.
//   4. THE SETTINGS ENTRY POINT MUST BE REACHABLE.  The first version used an options menu, which under
//      Theme.NoTitleBar has no action bar and no hardware menu key on any modern phone: unreachable, so a wrong
//      server IP could never be corrected short of clearing app data.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { codeOnly } from "../ship/sourceScan.mjs";

// *** ASSERT AGAINST CODE, NEVER AGAINST RAW SOURCE -- THIS GATE CAUGHT ITS OWN AUTHOR DOING IT. ***
// Both load-bearing negatives below failed on their first run, and neither had anything to do with the app:
// network_security_config.xml's own comment QUOTES `<domain>192.168.0.0</domain>` as the mistake it is warning
// about, and MainActivity's comment NAMES `onCreateOptionsMenu` as the thing that was removed. A regex over raw
// text found both and called the bug present in the very files that had fixed it. That is exactly the
// commentFalsePass species this tree already tracks, so the JS/Java stripping is DELEGATED to
// tools/ship/sourceScan.mjs's codeOnly() (comment- and string-aware, regex-literal-aware) rather than
// re-invented here, and XML gets the one-line equivalent its far simpler comment syntax allows.
const xmlCode = (s) => String(s || "").replace(/<!--[\s\S]*?-->/g, "");
const javaCode = (s) => codeOnly(String(s || ""));

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
const APP = path.join(ENG, "android", "swek-webview");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const report = (l) => console.log("  ----  " + l);

console.log("swekWebviewApk-selfcheck -- the WebView wrapper project\n");

const read = (rel) => { try { return fs.readFileSync(path.join(APP, rel), "utf8"); } catch { return null; } };
const MANIFEST = read("app/src/main/AndroidManifest.xml");
const NSC = read("app/src/main/res/xml/network_security_config.xml");
const JAVA = read("app/src/main/java/com/swek/webview/MainActivity.java");
const README = read("README.md");

console.log("1. EVERY XML FILE PARSES -- \"--\" IS ILLEGAL IN AN XML COMMENT AND THIS TREE'S PROSE IS FULL OF IT");
{
    const xmls = ["app/src/main/AndroidManifest.xml", "app/src/main/res/values/strings.xml",
                  "app/src/main/res/xml/network_security_config.xml"];
    for (const rel of xmls) {
        const full = path.join(APP, rel);
        let parsed = false, why = "";
        try {
            // python3's expat is the parser already available here; a real build uses aapt2, which is stricter,
            // not looser -- so passing this is necessary rather than sufficient, and that is the right direction.
            execFileSync("python3", ["-c", `import xml.dom.minidom;xml.dom.minidom.parse(${JSON.stringify(full)})`],
                         { stdio: ["ignore", "ignore", "pipe"] });
            parsed = true;
        } catch (e) { why = String((e.stderr || "")).trim().split("\n").pop(); }
        ok(`!! ${rel} is well-formed XML`, parsed, why || "parsed");
    }
    for (const [nm, src] of [["AndroidManifest.xml", MANIFEST], ["network_security_config.xml", NSC]]) {
        if (!src) { ok(`${nm} exists`, false, "missing"); continue; }
        const bad = (src.match(/<!--[\s\S]*?-->/g) || []).some((c) => /-{2}/.test(c.slice(4, -3)));
        ok(`...and ${nm}'s comments contain no "--"`, !bad,
           "the exact malformation the first draft of both files shipped with");
    }
}

console.log("\n2. THE WEBVIEW SETTINGS WHOSE ABSENCE IS SILENT");
{
    ok("!! JavaScript is enabled", !!JAVA && /setJavaScriptEnabled\(true\)/.test(JAVA), "every page is an ES-module app; blank without it");
    ok("!! DOM STORAGE is enabled -- localStorage is OFF by default in a WebView",
       !!JAVA && /setDomStorageEnabled\(true\)/.test(JAVA),
       "the engine stores voxelEngine.kpopFavorites, swek-dash and swek.serverAvatarSlots there; without this the " +
       "app runs and silently forgets everything, which looks like a bug in the ENGINE rather than in the wrapper");
    ok("!! the file chooser is wired -- an unhandled <input type=file> does NOTHING, with no error",
       !!JAVA && /onShowFileChooser/.test(JAVA) && /createIntent\(\)/.test(JAVA),
       "this is krbn-compare.html's 'Load .glb / .obj / .stl' button working or not working on a phone");
    ok("...and the chooser callback is answered even when the user cancels",
       !!JAVA && /onReceiveValue\(\s*\n?\s*resultCode == Activity\.RESULT_OK/.test(JAVA.replace(/\s+/g, " ").replace(/ /g, " ")) ||
       (!!JAVA && /RESULT_OK \? FileChooserParamsCompat\.parse\(data\) : null/.test(JAVA)),
       "an unresolved callback wedges that input permanently -- every later click ignored, for the life of the page");
    ok("the screen is kept awake", !!JAVA && /FLAG_KEEP_SCREEN_ON/.test(JAVA), "a watched canvas hitting the screen timeout reads as a freeze");
}

console.log("\n3. CLEARTEXT: THE COMPROMISE IS REAL AND IS WRITTEN DOWN, NOT GLOSSED");
{
    ok("!! the app permits cleartext (it must -- the LAN server is plain http)",
       !!NSC && /cleartextTrafficPermitted="true"/.test(NSC));
    // *** THE LOAD-BEARING NEGATIVE. *** The narrow-looking config is the one that does not work, so a future
    // edit "tightening" this back into per-domain private ranges must fail here rather than ship a brick.
    ok("!! ...and it does NOT try to express private ranges as <domain> entries, which Android cannot match",
       !!NSC && !/<domain[^>]*>\s*(192\.168|10\.0|172\.(1[6-9]|2\d|3[01]))/.test(xmlCode(NSC)),
       "Android's <domain> matches LITERAL HOSTNAMES, not CIDR -- '192.168.0.0' never matches 192.168.50.57, so " +
       "that config fails to load the one address the app exists for, with an error that reads like a dead server");
    ok("!! the compensating control is real: navigation is restricted in code",
       !!JAVA && /shouldOverrideUrlLoading/.test(JAVA) && /isOwnServer/.test(JAVA),
       "the platform is not enforcing the narrowing, this method is -- weaker, and the README says so");
    ok("...and the README states the compromise rather than leaving it to be discovered",
       !!README && /cleartext/i.test(README) && /not.*CIDR|matches literal hostnames/i.test(README));
}

console.log("\n4. THE SETTINGS GESTURE IS REACHABLE, AND DOCUMENTED BECAUSE IT IS INVISIBLE");
{
    ok("!! there is a long-press entry point to the server-address dialog",
       !!JAVA && /setOnLongClickListener/.test(JAVA) && /promptForUrl/.test(JAVA));
    ok("!! ...and it does NOT rely on an options menu, which Theme.NoTitleBar makes unreachable",
       !!JAVA && !/onCreateOptionsMenu/.test(javaCode(JAVA)),
       "the first version's settings menu compiled, looked right, and could not be opened on any phone since ~2012 -- " +
       "leaving no way to correct a wrong server IP short of clearing app data");
    ok("...and the long-press yields to links/images/text rather than hijacking every press",
       !!JAVA && /HitTestResult/.test(JAVA) && /UNKNOWN_TYPE/.test(JAVA));
    ok("!! the gesture is written down (an undocumented invisible gesture is no gesture)",
       !!README && /long-press/i.test(README));
    ok("...and a failed load offers the prompt, since that is when the address is usually wrong",
       !!JAVA && /onReceivedError[\s\S]{0,600}promptForUrl/.test(JAVA));
}

console.log("\n5. THE TWO CONFUSIONS THIS PROJECT EXISTS TO NOT REPEAT");
{
    ok("!! the README states InstallerX is an INSTALLER, not a wrapper generator",
       !!README && /InstallerX/.test(README) && /package installer/i.test(README) && /GPL-3\.0/.test(README),
       "checked against the repository itself; it installs APKs and cannot create one, and its licence would travel");
    ok("!! ...and distinguishes this from the HARD apk androidInviteBridge already warned about",
       !!README && /Termux/.test(README) && /nodejs-mobile|runs no server/i.test(README),
       "that note is about running a node SERVER on the phone; this is a CLIENT that opens a page -- both end in .apk");
    ok("!! ...and says why the existing PWA does not cover the LAN case",
       !!README && /manifest\.webmanifest/.test(README) && /secure origin/i.test(README),
       "Chrome only offers PWA install from https/localhost, so the prompt never appears on http://192.168.x.y:8787");
    const pwa = fs.existsSync(path.join(ENG, "manifest.webmanifest"));
    ok("...and that PWA really is in the tree (the claim is checked, not recited)", pwa);
}

console.log("\n6. WHAT IS *NOT* VERIFIED, SAID OUT LOUD");
{
    report("*** NO APK HAS EVER BEEN BUILT FROM THIS. *** The Android SDK is absent here and dl.google.com is 403");
    report("through the sandbox proxy (measured), so this project has never been compiled, type-checked against");
    report("real android.* classes, or installed on a device. Sections 1-5 check source and XML only.");
    let syntaxOk = null;
    try {
        execFileSync("javac", ["-proc:none", "-d", "/tmp/swekapk-parse", path.join(APP, "app/src/main/java/com/swek/webview/MainActivity.java")],
                     { stdio: ["ignore", "ignore", "pipe"] });
        syntaxOk = true;
    } catch (e) {
        const err = String(e.stderr || "");
        // Missing android.* symbols are EXPECTED without an SDK. A genuine syntax error is a different species and
        // is what this is actually looking for.
        syntaxOk = !/expected|illegal start|reached end of file|not a statement|unclosed/.test(err);
    }
    ok("!! MainActivity.java at least PARSES (no syntax errors; types remain unchecked)", syntaxOk === true,
       "javac's parser runs before symbol resolution, so this separates 'malformed Java' from 'no SDK here'");
}

console.log(fails ? `\nswekWebviewApk-selfcheck: ${fails} FAILED` : "\nswekWebviewApk-selfcheck: all checks pass");
if (fails) process.exit(1);
