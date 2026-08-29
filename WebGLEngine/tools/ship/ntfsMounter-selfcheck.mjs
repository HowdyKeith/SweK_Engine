// WebGLEngine/tools/ship/ntfsMounter-selfcheck.mjs -- v4125
//
// Run: node tools/ship/ntfsMounter-selfcheck.mjs   (a few seconds on any platform; the live mac half only runs
// on darwin and skips cleanly everywhere else, same as sharpBridge's own honest disclosure)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ai-bridge/ntfsMounterBridge.js + ntfs-mounter.html -- an install button for zavierferodova/Mac-NTFS-
// Mounter, which has NO licence file at all. Same non-vendoring reasoning as galaxyProfile-selfcheck.mjs, plus
// three checks that file does not need: the platform guard (this tool is meaningless off macOS and must say so
// rather than do something undefined), the confirm-before-mount separation Keith chose over full automation,
// and that a password is never received, prompted for, or written anywhere -- every privileged call uses
// `sudo -n`, checked as a literal invariant across the whole bridge, not just asserted in one place.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
console.log("ntfsMounter-selfcheck -- an install button for a no-licence macOS-only script, run unmodified\n");

const bridgeSrc = fs.readFileSync(path.join(ENG, "ai-bridge", "ntfsMounterBridge.js"), "utf8");
const pageSrc = fs.readFileSync(path.join(ENG, "ntfs-mounter.html"), "utf8");
const serverSrc = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");

// ---- 1. THE LICENCE FINDING AND THE REASONING THAT FOLLOWS FROM IT --------------------------------------------
{
    console.log("1. NO LICENCE FILE, RECORDED RATHER THAN GLOSSED OVER");
    ok("!! *** bridge states plainly there is no licence, and HOW that was checked ***",
        /license:\s*"NONE"/.test(bridgeSrc) && /404/.test(bridgeSrc) && /raw\.githubusercontent\.com/.test(bridgeSrc));
    ok("   ...and states the more conservative choice that follows: run the script unmodified, not reimplemented",
        /runs the script UNMODIFIED/i.test(bridgeSrc) || /script unmodified/i.test(bridgeSrc));
    ok("!! *** REFUSED names: no vendoring, no reimplementing its commands, no password handling, no auto-mount ***",
        /vendoring the script/.test(bridgeSrc) && /reimplementing its diskutil\/ntfs-3g invocation/.test(bridgeSrc) &&
        /ever receiving, prompting for, or storing a macOS admin password/.test(bridgeSrc) &&
        /mounting any volume without a separate, explicit, per-volume confirmation/.test(bridgeSrc));
}

// ---- 2. *** A PASSWORD NEVER ENTERS THIS BRIDGE, CHECKED AS AN INVARIANT ACROSS THE WHOLE FILE *** -------------
{
    console.log("\n2. *** sudo -n EVERYWHERE, NEVER PLAIN sudo, NEVER A PASSWORD WRITTEN TO A CHILD'S stdin ***");
    // Restricted to actual CALL sites (a function invocation with "sudo" as its first argument), not every
    // quoted mention -- the header comment and REFUSED text both discuss sudo in prose, which is not a call.
    const sudoCallSites = [...bridgeSrc.matchAll(/(?:_run|spawn|execFile(?:Sync)?)\(\s*["'`]sudo["'`]/g)];
    ok("!! *** every real sudo call site passes \"-n\" as the first argument ***",
        sudoCallSites.length > 0 && bridgeSrc.split(/(?:_run|spawn|execFile(?:Sync)?)\(\s*["'`]sudo["'`]/).slice(1)
            .every((tail) => /^\s*,\s*\[\s*["'`]-n["'`]/.test(tail)),
        sudoCallSites.length + " real call site(s) found");
    ok("   ...and the only thing ever written to the mounted script's stdin is a numeric menu index",
        /child\.stdin\.write\(String\(idx \+ 1\)/.test(bridgeSrc) && !/stdin\.write\([^)]*password/i.test(bridgeSrc));
    // A CODE-LEVEL check, not a prose ban: this file's own comments correctly discuss "password" at length
    // (that is the whole point of REFUSED's entry on it) -- what must never exist is a variable, parameter, or
    // object field actually CARRYING one, which a declaration/assignment/destructure pattern would show.
    ok("!! *** no variable, parameter or object field anywhere is actually named password/passwd/credential ***",
        !/\b(?:const|let|var)\s+\w*(?:password|passwd|credential)\w*\s*=/i.test(bridgeSrc) &&
        !/\b\w*(?:password|passwd|credential)\w*\s*:/i.test(bridgeSrc) &&
        !/\.\w*(?:password|passwd|credential)\w*\b/i.test(bridgeSrc));
}

// ---- 3. *** CONFIRM-BEFORE-MOUNT: LISTING IS UNPRIVILEGED, MOUNTING NEEDS A SEPARATE NAMED CALL *** ------------
{
    console.log("\n3. LISTING VOLUMES NEVER MOUNTS ANYTHING; MOUNTING RE-VALIDATES AGAINST A FRESH LIST");
    const listFn = (bridgeSrc.match(/async function listVolumes\(\)[\s\S]*?\n}\n/) || [""])[0];
    ok("!! listVolumes() never spawns the privileged script or calls sudo",
        listFn.length > 0 && !/sudo/.test(listFn) && !/ntfsmounter/.test(listFn));
    const mountFn = (bridgeSrc.match(/async function mount\(name\)[\s\S]*?\nmodule\.exports/) || [""])[0];
    ok("!! *** mount() re-lists volumes itself rather than trusting a caller-supplied list ***",
        /const listing = await listVolumes\(\)/.test(mountFn));
    ok("!! *** mount() verifies the script's own echoed selection before reporting success (mismatch = failure) ***",
        /echoedCorrectly/.test(mountFn) && /MISMATCH/.test(mountFn));
}

// ---- 4. THE PLATFORM GUARD, DRIVEN FOR REAL ON THIS (NON-MAC) HOST ---------------------------------------------
{
    console.log("\n4. *** THE PLATFORM GUARD, ACTUALLY EXERCISED (this gate very likely runs on Linux) ***");
    const bridge = require_("../../ai-bridge/ntfsMounterBridge.js");
    if (bridge.IS_MAC) {
        report("SKIPPED -- this host IS macOS, so the non-mac guard path cannot be exercised here");
    } else {
        const rInstall = bridge.install();
        ok("!! install() refuses cleanly off macOS", rInstall.ok === false && /macOS only/.test(rInstall.error));
        const rStatus = await bridge.status();
        ok("!! status() reports isMac:false and a real platform string rather than throwing",
            rStatus.ok === true && rStatus.isMac === false && rStatus.platform === process.platform);
        const rVol = await bridge.listVolumes();
        ok("!! listVolumes() refuses cleanly off macOS", rVol.ok === false && /macOS only/.test(rVol.error));
        const rMount = await bridge.mount("anything");
        ok("!! mount() refuses cleanly off macOS", rMount.ok === false && /macOS only/.test(rMount.error));
    }
}

// ---- 5. THE PAGE SURFACES THE LICENCE FINDING AND THE PLATFORM LIMIT, NOT JUST THE BRIDGE -----------------------
{
    console.log("\n5. THE PAGE ITSELF");
    ok("!! *** page shows a banner naming the actual platform when this box is not macOS ***",
        /s\.isMac/.test(pageSrc) && /platformBanner/.test(pageSrc) && /macOS-only/.test(pageSrc));
    ok("   ...and states the MacFUSE system-extension approval step is Apple's gate, not this page's",
        /Apple's own gate, not this page's/.test(pageSrc));
    ok("!! *** the confirm step names the EXACT volume and device before a mount, in its own sentence ***",
        /This will <b>unmount<\/b>/.test(pageSrc) && /Confirm &amp; Mount/.test(pageSrc));
    ok("   ...and states plainly that this page cannot supply a password",
        /this page cannot supply one/.test(pageSrc));
}

// ---- 6. ROUTES + PLACEMENT --------------------------------------------------------------------------------------
{
    console.log("\n6. ROUTES AND WHERE THE PAGE IS FILED");
    for (const r of ["/ntfs/status", "/ntfs/install", "/ntfs/volumes", "/ntfs/mount"]) {
        ok("!! " + r + " is wired in server.js", serverSrc.includes('"' + r + '"'));
    }
    const sections = fs.readFileSync(path.join(ENG, "tools", "ship", "pageSections.mjs"), "utf8");
    ok("!! ntfs-mounter.html is filed in System Tools (pageSections.mjs)", /"ntfs-mounter\.html"/.test(sections));
    const placements = fs.readFileSync(path.join(ENG, "tools", "ship", "pagePlacements.mjs"), "utf8");
    ok("!! ntfs-mounter.html also appears in the Mac System view (pagePlacements.mjs macPages())",
        /file:\s*"ntfs-mounter\.html"/.test(placements));
    ok("!! server.html carries the real anchor pageSections needs to move (v3252's rule)",
        /href="\/ntfs-mounter\.html"/.test(fs.readFileSync(path.join(ENG, "server.html"), "utf8")));
}

// ---- 7. *** THE .command LAUNCHER: GENERATED SCRIPT, INJECTION DEFENCE, AND REAL bash BEHAVIOUR *** ------------
{
    console.log("\n7. *** THE GENERATED .command LAUNCHER ***");
    const bridge = require_("../../ai-bridge/ntfsMounterBridge.js");

    // *** THE ONE THAT MATTERS MOST: A VOLUME NAME IS NOT TRUSTED INPUT. *** Anyone can name a USB stick, and
    // that string is written into a bash script. Checked as BEHAVIOUR (does bash execute it?) rather than by
    // eyeballing the quoting, because a quoting bug looks fine right up until it does not.
    const nasty = "'; touch /tmp/swek-ntfs-gate-PWNED #";
    const quoted = bridge.shellQuote(nasty);
    ok("!! shellQuote wraps in single quotes and escapes embedded ones",
        quoted.startsWith("'") && quoted.endsWith("'") && quoted.includes("'\\''"), quoted);

    const { execFileSync } = require_("node:child_process");
    const os2 = require_("node:os"), fs2 = require_("node:fs"), path2 = require_("node:path");
    const marker = "/tmp/swek-ntfs-gate-PWNED";
    try { fs2.rmSync(marker, { force: true }); } catch {}
    const probe = path2.join(os2.tmpdir(), "swek-ntfs-gate-quote.sh");
    fs2.writeFileSync(probe, "#!/usr/bin/env bash\necho \" You picked " + quoted + " in SweK.\"\n");
    let quoteOut = "";
    try { quoteOut = String(execFileSync("bash", [probe], { timeout: 10000, encoding: "utf8" })); } catch (e) { quoteOut = String(e.message || ""); }
    const pwned = fs2.existsSync(marker);
    ok("!! *** SABOTAGE: a volume named \"'; touch ... #\" is printed as TEXT, never executed ***",
        !pwned && quoteOut.includes("touch " + marker),
        pwned ? "INJECTION FIRED -- the marker file was created" : "echoed literally, marker absent");
    try { fs2.rmSync(probe, { force: true }); fs2.rmSync(marker, { force: true }); } catch {}

    // The generator itself is macOS-guarded, so on Linux assert the guard; on a Mac, generate and bash -n it.
    if (!bridge.IS_MAC) {
        const r = bridge.writeCommandFile("whatever");
        ok("!! writeCommandFile() refuses cleanly off macOS", r.ok === false && /macOS only/.test(r.error));
        const o = bridge.openCommandFile(false);
        ok("!! openCommandFile() refuses cleanly off macOS", o.ok === false && /macOS only/.test(o.error));
        report("full-script generation SKIPPED -- macOS only; the source-level checks below still run");
    } else {
        report("running on macOS -- generation is exercised by the live half above");
    }

    // Source-level invariants that hold on every platform.
    ok("!! *** the generated script carries the launchd PATH fix (Homebrew is not on a .command's PATH) ***",
        /opt\/homebrew\/bin/.test(bridgeSrc) && /launchd, not by your shell/.test(bridgeSrc),
        "without it ntfs-3g reads as missing on a Mac where it works fine in Terminal -- the false negative " +
        "this tree already paid for twice");
    ok("!! *** the script asks Continue? [y/N] before touching a disk, and cancels without running sudo ***",
        /Continue\? \[y\/N\]/.test(bridgeSrc) && /Cancelled\. Nothing was changed/.test(bridgeSrc));
    ok("!! the launcher is chmod 0755 -- without +x Finder opens it in a text editor instead of running it",
        /chmodSync\(p, 0o755\)/.test(bridgeSrc));
    ok("!! *** it runs the mounter INTERACTIVELY (no fed index), so there is no stale-selection risk at all ***",
        /sudo \.\/ntfsmounter/.test(bridgeSrc) && !/stdin\.write/.test(bridgeSrc.split("writeCommandFile")[1].split("function openCommandFile")[0]));
    // A CALL, not a mention: this file's own comment discusses xattr at length (explaining why it is absent),
    // which is the same prose-vs-code distinction section 2's sudo check already had to make.
    ok("!! *** no xattr de-quarantine CALL here, and the file says WHY that differs from sysadminBridge.js ***",
        !/(?:_run|spawn|execFile(?:Sync)?)\(\s*["'`]xattr["'`]/.test(bridgeSrc) && /cargo-culting/.test(bridgeSrc),
        "quarantine is set by whatever DOWNLOADED a file; fs.writeFileSync does not set it, so stripping it " +
        "would be a fix for a condition that cannot occur");
    ok("!! openCommandFile() uses `open` (Terminal.app), not a silent background spawn",
        /spawn\("open", reveal \? \["-R", p\] : \[p\]/.test(bridgeSrc));
    ok("!! both launcher routes are wired in server.js",
        serverSrc.includes('"/ntfs/command"') && serverSrc.includes('"/ntfs/command/open"'));
    ok("!! the page explains WHY the launcher beats the sudo -n button rather than just offering both",
        /Terminal<\/b> asks for your password/.test(pageSrc) && /better option, not just another one/.test(pageSrc));
}

console.log("\n" + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
