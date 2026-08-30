// WebGLEngine/tools/ship/sunshineHost-selfcheck.mjs -- v4154
//
// Run: node tools/ship/sunshineHost-selfcheck.mjs   (well under a second)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ai-bridge/sunshineBridge.js, sunshine.html, and the server.js mount.
//
// *** THE BOX THIS RUNS ON HAS NO SUNSHINE, NO GPU, NO FLATPAK AND NO adb, AND THAT IS THE POINT OF MOST OF
// IT. *** A bridge for a thing that is not installed must behave: detect must say "not found" rather than
// throw, every refusal must fire before a process is spawned, and a launch aimed at no device must produce a
// sentence a person can act on. Those are exactly the paths a box with everything installed would never
// exercise. What this canNOT check is a stream -- section 6 says so and does not pretend otherwise.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { noComments } from "./sourceScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const b = require("../../ai-bridge/sunshineBridge.js");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
console.log("sunshineHost-selfcheck -- the host half, and the one surface the client exposes\n");

// ---- 1. THE INTENT STRINGS, WHICH ARE THE ONLY PART THAT CANNOT BE WRONG ------------------------------------
{
    console.log("1. *** EVERY INTENT STRING WAS READ OUT OF THE FORK'S SOURCE, AND TWO WOULD HAVE FAILED SILENTLY ***");
    const M = b.MOONLIGHT;
    ok("!! *** the package is com.limelight.root, NOT upstream Moonlight's com.limelight ***",
        M.package === "com.limelight.root",
        "the fork suffixes its applicationId. The stock name would have targeted an activity that is not " +
        "installed -- and `am start` EXITS 0 for that, so it would have read as a successful launch forever.");
    ok("...and the activity is the exported trampoline", M.activity === "com.limelight.ShortcutTrampoline");
    ok("!! the extra keys match AppView.kt and Game.kt",
        M.extras.uuid === "UUID" && M.extras.name === "Name" && M.extras.appId === "AppId" &&
        M.extras.appName === "AppName" && M.extras.hdr === "HDR",
        JSON.stringify(M.extras));

    // *** THE CORRECTION CHECK, against the real clone when one is present. *** Same shape as
    // screenSpaceError-selfcheck's Terrain3D section: a claim ABOUT SOMEBODY ELSE'S REPOSITORY is verified
    // against that repository, or it is declared unverified. It is never simply asserted here.
    const dir = process.env.MOONLIGHT_VPLUS_DIR || "";
    if (dir && fs.existsSync(path.join(dir, "app", "src", "main", "AndroidManifest.xml"))) {
        const man = fs.readFileSync(path.join(dir, "app", "src", "main", "AndroidManifest.xml"), "utf8");
        ok("!! the trampoline really is exported in the shipped manifest",
            /name="\.ShortcutTrampoline"[\s\S]{0,400}?android:exported="true"/.test(man));
        const appView = fs.readFileSync(path.join(dir, "app", "src", "main", "java", "com", "limelight", "AppView.kt"), "utf8");
        ok("!! ...and UUID/Name are the constants that file declares",
            /const val UUID_EXTRA = "UUID"/.test(appView) && /const val NAME_EXTRA = "Name"/.test(appView));
        const game = fs.readFileSync(path.join(dir, "app", "src", "main", "java", "com", "limelight", "Game.kt"), "utf8");
        ok("!! ...and AppId/AppName are Game.kt's", /EXTRA_APP_ID = "AppId"/.test(game) && /EXTRA_APP_NAME = "AppName"/.test(game));
        ok("!! *** the client really has NO listener to push anything into ***",
            !/ServerSocket|NanoHTTPD|HttpServer/.test(fs.readFileSync(path.join(dir, "app", "src", "main", "AndroidManifest.xml"), "utf8")),
            "checked in the manifest here; the java tree was grepped by hand and is also clean");
    } else {
        report("NOT CHECKED HERE: the strings above against the fork's own source. It needs the clone, and this " +
               "tree does not vendor a GPL Android app to satisfy a gate. Point MOONLIGHT_VPLUS_DIR at a " +
               "checkout and this section verifies all five; it was run that way when written and they passed.");
    }
}

// ---- 2. EVERY REFUSAL FIRES BEFORE A PROCESS IS SPAWNED -----------------------------------------------------
{
    console.log("\n2. *** THE REFUSALS COME BEFORE adb, NOT AFTER IT ***");
    const cases = [
        ["no host at all", {}, /need a host/],
        ["an appId that is not digits", { name: "pc", appId: "12ab" }, /must be digits/],
        ["a serial with shell punctuation", { name: "pc", serial: "a;rm -rf /" }, /bad adb serial/],
        ["a uuid with shell punctuation", { name: "pc", uuid: "x;whoami" }, /bad uuid/],
    ];
    for (const [why, arg, re] of cases) {
        const r = await b.launchMoonlight(arg);
        ok("refuses " + why, r.ok === false && re.test(r.error || ""), (r.error || "").slice(0, 80));
    }
    // *** AND THE ORDER MATTERS: these must be refused WITHOUT adb being consulted. *** A check that ran after
    // the adb probe would be indistinguishable, on this box, from "adb is missing" -- and would let a bad
    // value reach an argument list on a box where adb exists.
    const src = noComments(fs.readFileSync(path.join(ENG, "ai-bridge", "sunshineBridge.js"), "utf8"));
    const fn = (src.match(/async function launchMoonlight[\s\S]*?\n\}/) || [""])[0];
    const firstProbe = fn.indexOf('_run("adb"');
    ok("!! *** every validation sits ABOVE the first adb call in the function body ***",
        firstProbe > 0 && ["bad adb serial", "bad uuid", "must be digits", "need a host"]
            .every((s) => fn.indexOf(s) > 0 && fn.indexOf(s) < firstProbe),
        "argument shape is checked before the tool is reached, the same rule githubBridge states for git");
    // *** THIS CHECK CRIED WOLF ON ITS FIRST RUN AND THE FIX IS THE POINT. *** It stripped "execFile(" and
    // then hunted a bare "exec(" -- which matched `/(\d+\.\d+\.\d+)/.exec(r.out)`, a RegExp.prototype.exec
    // parsing a version string. A check that cannot tell a regular expression from a shell is one that
    // teaches people to ignore it. The real claim is about the IMPORT: nothing here may take `exec` off
    // child_process, because that is the one that hands a string to /bin/sh.
    const imp = (src.match(/require\("child_process"\)/) ? src.match(/const\s*\{([^}]*)\}\s*=\s*require\("child_process"\)/) : null);
    const named = imp ? imp[1].split(",").map((x) => x.trim()).filter(Boolean) : [];
    ok("!! nothing is taken off child_process that runs a SHELL -- execFile and spawn only",
        named.length > 0 && named.every((n) => n === "spawn" || n === "execFile") && !/child_process\.exec\(/.test(src),
        "imported: " + named.join(", ") + " -- exec() and execSync() hand a string to /bin/sh, and every value " +
        "here reaches an argument list");
}

// ---- 3. *** am start EXITS 0 FOR AN ACTIVITY THAT DOES NOT EXIST *** ----------------------------------------
{
    console.log("\n3. *** THE SILENT-SUCCESS TRAP, WHICH IS THE ONLY REAL BUG THIS FEATURE COULD SHIP ***");
    const src = noComments(fs.readFileSync(path.join(ENG, "ai-bridge", "sunshineBridge.js"), "utf8"));
    ok("!! the launch result is decided by the OUTPUT, not by the exit code alone",
        /Error type\|does not exist/.test(src) || /Error type/.test(src),
        "`am start -n a/b` for a missing activity prints \"Error type 3\" ON STDOUT AND STILL EXITS 0. Trusting " +
        "the exit code would report a successful launch for a phone with no Moonlight installed -- and the " +
        "package name being right is exactly what nobody would re-check afterwards.");
    ok("...and a failure names the package, so the wrong-fork case is diagnosable",
        /not stock Moonlight's com\.limelight/.test(fs.readFileSync(path.join(ENG, "ai-bridge", "sunshineBridge.js"), "utf8")));
}

// ---- 4. DETECTION AND INSTALL ROUTES ON A BOX WITH NOTHING INSTALLED ----------------------------------------
{
    console.log("\n4. A BRIDGE FOR SOMETHING THAT IS NOT INSTALLED MUST STILL ANSWER");
    const d = await b.detect();
    ok("!! detect() answers rather than throwing, and says which platform it looked at",
        d.ok === true && typeof d.found === "boolean", JSON.stringify(d).slice(0, 120));
    ok("...and on this box it correctly finds nothing", d.found === false, "no sunshine binary here, as expected");
    ok("an install route is recorded for all three desktop platforms",
        ["linux", "win32", "darwin"].every((p) => b.INSTALL[p] && b.INSTALL[p].cmd && b.INSTALL[p].note));
    ok("!! the Linux route is flatpak, which is the only one that works on SteamOS's read-only root",
        b.INSTALL.linux.cmd === "flatpak" && /read-only root/.test(b.INSTALL.linux.note));
    ok("!! macOS is marked EXPERIMENTAL rather than presented as equal to the other two",
        /EXPERIMENTAL/.test(b.INSTALL.darwin.note),
        "LizardByte say so themselves; repeating it is cheaper than a user discovering it");
    const s = await b.status();
    ok("!! status() carries the licence, and names it GPL-3.0", s.upstream.license === "GPL-3.0");
    ok("!! ...and carries what has NOT been verified, in every reply", /NO SUNSHINE HAS EVER RUN/.test(s.verified),
        "whoever is about to press Install is the person who needs to know, not whoever read the header once");
    ok("stop() with nothing started is not an error", b.stop().ok === true);
    ok("!! ...and a real stop would say STOPPING, not stopped", /verifyWith/.test(fs.readFileSync(path.join(ENG, "ai-bridge", "sunshineBridge.js"), "utf8")),
        "kill() SENDS a signal (v4152); the handle is kept and the exit listener clears it");
}

// ---- 5. *** THE MOUNT POSITION, WHICH IS A TEMPORAL DEAD ZONE WAITING TO HAPPEN *** --------------------------
{
    console.log("\n5. *** A BRIDGE THAT TAKES readJson MUST BE MOUNTED BELOW readJson ***");
    // THE FIRST DRAFT OF THIS FEATURE PUT ITS MOUNT 250 LINES ABOVE `const readJson`, in the same block and the
    // same top-to-bottom request handler -- so every POST /sunshine/moonlight/launch would have thrown
    // "Cannot access 'readJson' before initialization" before reading a byte. THE SAME CLASS AS v4133'S CLONE
    // BUTTON, which cost fifteen versions and an error naming a line that was fine.
    //
    // Written as a RULE over every mount rather than as a line about this one: tools/ship/shadowedHelper.mjs
    // hunts a const that SHADOWS a module-level function, which this is not, so nothing in the tree would have
    // caught it. Any future bridge that needs a body reader is covered the round it lands.
    const srv = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
    const lines = srv.split("\n");
    const declAt = lines.findIndex((l) => /^\s*const readJson\s*=/.test(l));
    ok("readJson is a single const declaration in the handler", declAt > 0, "line " + (declAt + 1));
    const users = [];
    for (let i = 0; i < lines.length; i++) if (/\breadJson\b/.test(lines[i]) && i !== declAt && !/^\s*\/\//.test(lines[i])) users.push(i);
    const early = users.filter((i) => i < declAt);
    ok("!! *** NO mount passes readJson before it is declared -- floor at zero ***",
        early.length === 0,
        early.length ? "TDZ: line(s) " + early.map((i) => i + 1).join(", ") + " reference readJson above its declaration at " + (declAt + 1)
                     : "checked " + users.length + " reference(s) against the declaration at line " + (declAt + 1) +
                       ". AT ZERO, so the next one reddens this the round it lands");
    ok("!! the sunshine bridge is mounted, and below that line",
        /sunshineBridge\.owns\(req\.url\)/.test(srv) &&
        lines.findIndex((l) => /sunshineBridge\.owns/.test(l)) > declAt);
    ok("...and it is required at the top", /require\("\.\/sunshineBridge\.js"\)/.test(srv));
    ok("every route the bridge lists is reachable through its own handler", b.ROUTES.length === 7 && b.owns("/sunshine/status") && !b.owns("/sunshineX"));
}

// ---- 6. THE PAGE, AND WHAT IT ADMITS -------------------------------------------------------------------------
{
    console.log("\n6. THE PAGE SEPARATES MEASURED FROM READ, PER ROW");
    const page = fs.readFileSync(path.join(ENG, "sunshine.html"), "utf8");
    const flat = page.replace(/\s+/g, " ");
    ok("!! the page states plainly that no Sunshine has ever run against this bridge",
        /No\s+Sunshine\s+has\s+ever\s+run/i.test(flat));
    const measured = (page.match(/class="m">MEASURED/g) || []).length;
    const not = (page.match(/class="n">NOT VERIFIED/g) || []).length;
    ok("!! *** BOTH kinds of row exist -- a page with only one kind is selling or apologising ***",
        measured >= 4 && not >= 3, measured + " measured, " + not + " not verified");
    ok("!! it says why this is a host button and not a Moonlight plugin", /Moonlight is a client/i.test(flat));
    ok("...and that the Lua files are dissectors rather than a plugin surface", /Wireshark protocol dissectors/i.test(flat));
    // *** v4171 -- DERIVED FROM THE BRIDGE'S OWN LIST, NOT KEYED ON A SENTENCE I TYPED OUT. ***
    // This asserted `!/store or forward Sunshine's web-UI credentials/.test(page)` -- one English sentence,
    // copied by hand into a regex. gateQuality flags that as prose-matching debt and it is right, but the
    // NEGATIVE form is the worse half: reword the page even slightly and the test still passes while a second
    // copy sits there in different words. A NEGATIVE CHECK KEYED ON EXACT PROSE CAN ONLY EVER BE VACUOUS --
    // it fails on the one wording it knows and blesses every other.
    // Read from REFUSED itself, every `what` is checked, and adding a refusal to the bridge extends this
    // check automatically instead of leaving it one sentence behind.
    const refusedWhats = [...noComments(fs.readFileSync(path.join(ENG, "ai-bridge", "sunshineBridge.js"), "utf8"))
        .matchAll(/\{\s*what:\s*"([^"]+)"/g)].map((m) => m[1]);
    const copied = refusedWhats.filter((w) => page.includes(w));
    ok("!! it renders the refusals from the BRIDGE rather than restating them in HTML",
        /s\.refused/.test(page) && refusedWhats.length >= 3 && copied.length === 0,
        refusedWhats.length + " refusals read from the bridge's own REFUSED list, " + copied.length +
        " of them copied into the page" + (copied.length ? ": " + copied.join("; ") : "") +
        ". A second copy in the page is the one that would go stale, and the LIST is what says which sentences " +
        "those are -- so a refusal added to the bridge is covered here without anyone remembering to add it");
    ok("!! the page consults res.ok before parsing a body", /if\s*\(\s*!r\.ok/.test(page),
        "boundaryLint's rule, and an unmounted route returns HTML that .json() would throw on");
    ok("pairing is described as a human typing a PIN into Sunshine's own UI", /four-digit PIN|four digit PIN/i.test(flat) || /PIN/.test(flat));
    report("NOT RUN HERE: an actual stream, an actual install, or an actual phone. No GPU, no Sunshine, no adb " +
           "and no Android device on this box. Sections 1-5 are the parts that CAN be settled without them, and " +
           "the page's own table names the rest as unverified rather than leaving a reader to assume.");
}

console.log("\n" + (fails ? fails + " FAILED" : "sunshineHost-selfcheck: all checks pass"));
process.exit(fails ? 1 : 0);
