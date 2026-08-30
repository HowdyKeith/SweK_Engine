// WebGLEngine/tools/ship/iosDevice-selfcheck.mjs -- v4155
//
// Run: node tools/ship/iosDevice-selfcheck.mjs   (a second or two -- it probes for a CLI that is not here)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ai-bridge/iosDeviceBridge.js, ios-tools.html and the server.js mount.
//
// *** THE BOX THIS RUNS ON HAS NO iPHONE AND NO pymobiledevice3, WHICH IS WHAT MAKES MOST OF IT WORTH RUNNING.
// *** The paths that must behave with nothing attached are exactly the ones a developer with a phone on the
// desk never exercises: detection must report "not installed" rather than throw, and every refusal must fire
// before a CLI is even resolved. What this cannot check is a device answering, and section 5 says so.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { noComments, codeOnly } from "./sourceScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const b = require("../../ai-bridge/iosDeviceBridge.js");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
console.log("iosDevice-selfcheck -- adb for iOS, behind an allowlist\n");

// ---- 1. *** AN ALLOWLIST, NOT A DENYLIST, AND THE DIFFERENCE IS DRIVEN *** ----------------------------------
{
    console.log("1. *** EVERYTHING IS REFUSED BY DEFAULT, INCLUDING COMMANDS UPSTREAM HAS NOT WRITTEN YET ***");
    // pymobiledevice3 ships 29 command groups and several CHANGE OR DESTROY A DEVICE. A denylist is correct
    // only until the next dangerous verb is added upstream, and would then pass it straight through.
    const destructive = ["restore", "activation", "profile", "amfi", "mounter", "backup", "cryptex", "provision"];
    for (const v of destructive) {
        const r = await b.run(v);
        ok("refuses `" + v + "`", r.ok === false && r.refused === true, (r.error || "").slice(0, 60));
    }
    const invented = await b.run("wipe-everything-please");
    ok("!! *** and refuses a verb that does not exist ANYWHERE -- which is the denylist's failure mode ***",
        invented.ok === false && invented.refused === true && Array.isArray(invented.allowed),
        "a name nobody has ever written is refused by the same rule that refuses `restore`");
    ok("!! the refusal NAMES what is allowed, so it is actionable rather than a wall",
        invented.allowed.length >= 4 && invented.allowed.includes("list"), invented.allowed.join(", "));

    // *** NO CALLER-SUPPLIED argv REACHES THE CLI. *** This is what makes the allowlist meaningful instead of
    // decorative: run() indexes a frozen table by name and builds the argument list itself.
    const src = noComments(fs.readFileSync(path.join(ENG, "ai-bridge", "iosDeviceBridge.js"), "utf8"));
    const fn = (src.match(/async function run\(name[\s\S]*?\n\}/) || [""])[0];
    ok("!! run() builds argv from the FROZEN table, never from the caller",
        /ALLOWED\[name\]/.test(fn) && /spec\.argv/.test(fn) && !/o\.args|opts\.args|\.\.\.o\.argv/.test(fn),
        "the only caller value that reaches the process is a udid, and it is pattern-checked");
    ok("!! ...and the table is frozen, so it cannot be extended at runtime",
        Object.isFrozen(b.ALLOWED) && Object.isFrozen(b.REFUSED));
    ok("every allowlist entry says WHAT IT READS, not just what it runs",
        Object.values(b.ALLOWED).every((v) => typeof v.reads === "string" && v.reads.length > 10));
}

// ---- 2. THE REFUSALS COME BEFORE THE CLI IS EVEN RESOLVED ---------------------------------------------------
{
    console.log("\n2. A BAD VALUE IS REFUSED BEFORE ANYTHING IS SPAWNED");
    const bad = await b.run("list", { udid: "x;rm -rf /" });
    ok("!! a udid carrying shell punctuation is refused", bad.ok === false && /bad udid/.test(bad.error || ""), bad.error);
    const src = noComments(fs.readFileSync(path.join(ENG, "ai-bridge", "iosDeviceBridge.js"), "utf8"));
    const fn = (src.match(/async function run\(name[\s\S]*?\n\}/) || [""])[0];
    ok("!! *** the checks sit ABOVE _resolveCli, so nothing is spawned to reject a value ***",
        fn.indexOf("bad udid") > 0 && fn.indexOf("bad udid") < fn.indexOf("_resolveCli"),
        "and the allowlist check is above that again");
    ok("...and the allowlist is the FIRST thing in the body",
        fn.indexOf("ALLOWED[name]") < fn.indexOf("bad udid"));
    const imp = src.match(/const\s*\{([^}]*)\}\s*=\s*require\("child_process"\)/);
    const named = imp ? imp[1].split(",").map((x) => x.trim()).filter(Boolean) : [];
    ok("!! nothing that runs a SHELL is taken off child_process -- execFile and spawn only",
        named.length > 0 && named.every((n) => n === "spawn" || n === "execFile"), "imported: " + named.join(", "));
    // *** THIS CHECK FAILED ON ITS FIRST RUN AND THE INSTRUMENT WAS THE BUG, NOT THE BRIDGE. *** It read
    // noComments() source, which KEEPS STRING LITERALS -- and the bridge legitimately says the word in its
    // refusal text and in the hint that tells a person the exact command to run themselves. The claim is about
    // EXECUTING it, which is a code shape, so codeOnly() is the right instrument: it blanks strings as well as
    // comments. v4021 landed that exact rule (noComments for string literals, codeOnly for code shapes) and
    // this is the third file to re-learn it -- so the mention is now asserted as REQUIRED rather than merely
    // tolerated, because a bridge that refuses to elevate owes the user the command it is refusing to run.
    const codeSrc = codeOnly(fs.readFileSync(path.join(ENG, "ai-bridge", "iosDeviceBridge.js"), "utf8"));
    ok("!! *** the bridge NEVER elevates: no sudo in any CODE path ***", !/\bsudo\b/.test(codeSrc),
        "the iOS 17+ tunnel needs root on Linux and Windows, and starting it is left to a person in a terminal " +
        "who can see what they are agreeing to. A button that silently asked for root would be the wrong button.");
    ok("...and it TELLS you the command it will not run for you", /sudo python3 -m pymobiledevice3 remote tunneld/.test(src),
        "refusing without naming the alternative is a wall, not a refusal");
}

// ---- 3. DETECTION ON A BOX WITH NOTHING INSTALLED -----------------------------------------------------------
{
    console.log("\n3. WITH NO CLI AND NO PHONE, IT MUST STILL ANSWER");
    const d = await b.detect();
    ok("!! detect() answers rather than throwing", d.ok === true && typeof d.found === "boolean", JSON.stringify(d).slice(0, 110));
    ok("...and on this box correctly finds nothing", d.found === false);
    ok("!! ...and NAMES both spellings it tried, so a wrong-python box is diagnosable",
        Array.isArray(d.tried) && d.tried.length === 2,
        "the console script and `python3 -m` -- install layouts differ, and a bridge that cannot say how it " +
        "tried cannot be re-diagnosed on the next box (sharpBridge's own rule)");
    const r = await b.run("list");
    ok("!! a run with no CLI installed is a sentence, not a stack trace",
        r.ok === false && /not installed/.test(r.error || ""), (r.error || "").slice(0, 70));
    const s = await b.status();
    ok("!! status() carries the licence and names it GPL-3.0", s.upstream.license === "GPL-3.0");
    ok("!! ...and states NO JAILBREAK, with what is actually needed instead",
        s.upstream.jailbreak === false && /Trust This Computer/i.test(s.upstream.needs));
    ok("!! ...and carries what has NOT been verified, in every reply", /NO iPHONE HAS EVER BEEN/.test(s.verified));
    ok("!! *** ...and refuses to claim the peer ladder moved ***", /UNCHANGED/.test(s.peerLadder) && /subset/.test(s.peerLadder),
        "an iPhone still cannot host the engine. Letting this read as a promotion would be the overclaim the " +
        "peer pages exist to prevent.");
    ok("the tunnel's root requirement is reported per platform, not as one blanket rule",
        s.tunnelNeedsRoot === (process.platform !== "darwin"),
        "sudo on Linux and Windows; none on macOS, where it publishes Apple's own remoted tunnel");
}

// ---- 4. WIRED, AND MOUNTED WHERE IT CAN READ A BODY ----------------------------------------------------------
{
    console.log("\n4. THE DOOR");
    const srv = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
    const lines = srv.split("\n");
    const declAt = lines.findIndex((l) => /^\s*const readJson\s*=/.test(l));
    ok("!! the bridge is mounted BELOW readJson", /iosDeviceBridge\.owns\(req\.url\)/.test(srv) &&
        lines.findIndex((l) => /iosDeviceBridge\.owns/.test(l)) > declAt,
        "the same temporal-dead-zone rule sunshineHost-selfcheck section 5 holds for every mount");
    ok("...and required at the top", /require\("\.\/iosDeviceBridge\.js"\)/.test(srv));
    ok("owns() is scoped to its own prefix", b.owns("/iosdev/status") && !b.owns("/iosdevil"));
    ok("four routes, all handled", b.ROUTES.length === 4);
}

// ---- 5. THE PAGE ---------------------------------------------------------------------------------------------
{
    console.log("\n5. THE PAGE SAYS WHAT IT HAS NOT SEEN");
    const page = fs.readFileSync(path.join(ENG, "ios-tools.html"), "utf8");
    const flat = page.replace(/\s+/g, " ");
    ok("!! it states plainly that no iPhone has ever been attached", /No\s+iPhone\s+has\s+ever\s+been\s+attached/i.test(flat));
    ok("!! *** and that this does NOT promote the iOS peer ***", /does not promote the iOS peer/i.test(flat) && /subset in Safari/i.test(flat));
    const measured = (page.match(/class="m">MEASURED/g) || []).length;
    const not = (page.match(/class="n">NOT VERIFIED/g) || []).length;
    ok("!! both kinds of row exist", measured >= 4 && not >= 3, measured + " measured, " + not + " not verified");
    ok("!! the refusals and the allowlist are rendered FROM THE BRIDGE, not restated in HTML",
        /s\.refused/.test(page) && /s\.allowed/.test(page) && !/wipe an iPhone/.test(page),
        "a second copy in the page is the one that would go stale");
    ok("the page consults res.ok before parsing a body", /if\s*\(\s*!r\.ok/.test(page));
    ok("it links the iOS peer page, whose claim it is careful not to contradict", /ios-peer\.html/.test(page));
    report("NOT RUN HERE: a device answering anything. No iPhone, no USB, no pymobiledevice3 on this box. " +
           "Sections 1-4 are the parts that can be settled without one, and the page's table names the rest.");
}

console.log("\n" + (fails ? fails + " FAILED" : "iosDevice-selfcheck: all checks pass"));
process.exit(fails ? 1 : 0);
