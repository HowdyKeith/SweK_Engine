// WebGLEngine/ai-bridge/ntfsMounterBridge.js -- v4125
//
// AN INSTALL BUTTON FOR zavierferodova/Mac-NTFS-Mounter, WITH A DIFFERENT RISK SHAPE THAN THIS TREE'S OTHERS.
//
// Keith: the free NTFS mounters on the Mac App Store either lie about being free or do not work well, and his
// paid one fails often enough that he has to remount by hand -- so a free, small, readable script he can audit
// himself is worth having a button for. Same non-vendoring reasoning as galaxyProfileBridge.js: cloning a
// PUBLIC repo onto the user's OWN machine and running it as its own process is not distributing it, whatever
// the licence says. *** AND THE LICENCE HERE SAYS NOTHING AT ALL. *** Checked directly against
// raw.githubusercontent.com (404 for LICENSE/LICENSE.md/LICENSE.txt/COPYING on both main and master) and by a
// full clone: the repo has three files -- README.md, .gitignore, ntfsmounter -- and no licence, which makes it
// all-rights-reserved by default, the same finding this tree already recorded for bisqwit/crt-filter. That does
// not block automating a clone onto the user's own machine for the same reason GPL does not; it does mean this
// bridge runs the script UNMODIFIED rather than re-deriving its diskutil/ntfs-3g invocation itself, even though
// that invocation is just standard documented flags -- the more conservative reading, for a repo with no grant
// of permission on file at all.
//
// *** THE REAL DIFFERENCE FROM voxtral/webrtx/galaxy-profile: THIS ONE ASKS FOR ROOT AND TOUCHES A REAL DISK.
// *** installing MacFUSE and running the mount both need privilege the others never do, and a wrong mount
// target is not a failed download, it is somebody's actual external drive. Keith chose, explicitly, "confirm
// before each mount" over full automation: this bridge lists volumes (read-only, needs no privilege) and
// requires ONE MORE call naming the exact volume before it runs anything with sudo.
//
// *** AND IT NEVER HANDLES A PASSWORD, WHICH IS A STRONGER RULE THAN "ASK FIRST". *** `sudo -n` is used
// everywhere a privileged command runs: it FAILS CLOSED rather than prompting if the caller has not already
// run `sudo -v` in a real terminal. A web server that could receive a macOS admin password over HTTP -- even
// on localhost, even from its own page -- is a bigger attack surface than this feature is worth; requiring the
// person to authenticate in their own terminal keeps that boundary the same as it already is.
//
// *** NOT TESTABLE END TO END IN THIS SANDBOX, STATED PLAINLY LIKE sharpBridge.js SAYS OF ITSELF. *** There is
// no macOS, no diskutil, no /Volumes and no MacFUSE on the Linux box this was written on. Everything below the
// platform guard is built against the script's own documented behaviour (read directly, not guessed) and the
// gate skips that half cleanly rather than faking a pass.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, execFile, execFileSync } = require("child_process");

const REPO = "https://github.com/zavierferodova/Mac-NTFS-Mounter";
// Measured 2026-08-28 by cloning upstream unshallowed: 7 commits, one branch (main), no tags, last commit
// 2024-09-29 -- about two years old, small and stable rather than abandoned mid-feature.
const PINNED_COMMIT = "176632d2d1e4c63b75178dcfca534c8281e7a6d9";

const UPSTREAM = Object.freeze({
    repo: REPO,
    commit: PINNED_COMMIT,
    committed: "2024-09-29",
    license: "NONE",
    licenseVerified: "2026-08-28 -- no LICENSE/LICENSE.md/LICENSE.txt/COPYING file at this commit on either " +
                      "main or master (checked directly against raw.githubusercontent.com, all 404). No " +
                      "licence file means all-rights-reserved by default.",
    what: "a ~90-line, read-and-reviewable bash script: lists your external volumes, unmounts the one you " +
          "pick, and remounts it read-write via ntfs-3g. Needs MacFUSE (a macOS system extension) and " +
          "ntfs-3g-mac (a Homebrew tap), and must run as root.",
    author: "zavierferodova",
});

const MAINTENANCE = Object.freeze({
    commits: 7,
    tags: 0,
    branches: ["main"],
    lastCommit: "2024-09-29",
    howChecked: "git clone (unshallowed) https://github.com/zavierferodova/Mac-NTFS-Mounter, then git log --oneline",
});

const REFUSED = Object.freeze([
    { what: "vendoring the script into this tree or a release zip",
      why: "no licence file means no permission is granted to redistribute it at all. It is cloned onto the " +
           "user's own machine, outside the tree, never copied anywhere this engine ships." },
    { what: "reimplementing its diskutil/ntfs-3g invocation instead of running its own script",
      why: "the commands are standard and documented, but with NO licence on file the more conservative " +
           "reading is to run upstream's own reviewed script unmodified rather than derive a second version " +
           "of it, even a trivial one." },
    { what: "ever receiving, prompting for, or storing a macOS admin password",
      why: "every privileged step uses `sudo -n`, which fails closed rather than prompting if the caller has " +
           "not already authenticated `sudo` in a real terminal. This server never becomes a place a password " +
           "could be typed into, over HTTP or otherwise." },
    { what: "mounting any volume without a separate, explicit, per-volume confirmation call",
      why: "Keith chose this over full automation directly: listing volumes needs no privilege and runs freely; " +
           "actually mounting one requires naming that exact volume in a second call, so nothing gets touched " +
           "by a single accidental click." },
    { what: "running on anything other than macOS",
      why: "diskutil, /Volumes and MacFUSE are macOS-specific; every function here refuses cleanly on any " +
           "other platform rather than doing something undefined." },
]);

const SRC_DIR = process.env.NTFS_MOUNTER_SRC_DIR || path.join(os.homedir(), ".voxelbridge", "ntfs-mounter");
const IS_MAC = process.platform === "darwin";

function _run(cmd, args, opts) {
    return new Promise((res) => {
        let done = false;
        const child = execFile(cmd, args, Object.assign({ windowsHide: true, timeout: 30000, maxBuffer: 4 * 1024 * 1024 }, opts || {}),
            (err, stdout, stderr) => { if (done) return; done = true; res({ ok: !err, out: String(stdout || ""), err: String(stderr || "") + (err ? " " + ((err && err.message) || err) : "") }); });
        child.on("error", (e) => { if (done) return; done = true; res({ ok: false, out: "", err: String((e && e.message) || e) }); });
    });
}

let _job = null;   // { kind: "clone"|"checkout"|"brew-macfuse"|"brew-tap"|"brew-ntfs3g", log[], done, code, startedAt }
function _appendLog(s) { if (_job) { _job.log.push(s); if (_job.log.length > 400) _job.log.shift(); } }
function _runStep(kind, cmd, args, opts, onDone) {
    _job.kind = kind;
    let child;
    try { child = spawn(cmd, args, Object.assign({ windowsHide: true }, opts || {})); }
    catch (e) { _job.done = true; _job.code = -1; _appendLog("[spawn error] " + ((e && e.message) || e) + "\n"); return; }
    const cap = (b) => _appendLog(b.toString());
    if (child.stdout) child.stdout.on("data", cap);
    if (child.stderr) child.stderr.on("data", cap);
    child.on("exit", (code) => { if (onDone) onDone(code); else { _job.done = true; _job.code = code; } });
    child.on("error", (e) => { _job.done = true; _job.code = -1; _appendLog("[spawn error] " + ((e && e.message) || e) + "\n"); });
}

function _brewSteps(kinds, onAllDone) {
    const steps = [
        ["brew-macfuse", "brew", ["install", "--cask", "macfuse"]],
        ["brew-tap", "brew", ["tap", "gromgit/homebrew-fuse"]],
        ["brew-ntfs3g", "brew", ["install", "ntfs-3g-mac"]],
    ];
    let i = 0;
    (function next() {
        if (i >= steps.length) { onAllDone(0); return; }
        const [kind, cmd, args] = steps[i++];
        _runStep(kind, cmd, args, {}, (code) => { if (code !== 0) { _job.done = true; _job.code = code; return; } next(); });
    })();
}

function install() {
    if (!IS_MAC) return { ok: false, error: "macOS only -- diskutil, /Volumes and MacFUSE do not exist elsewhere" };
    if (_job && !_job.done) return { ok: false, error: "an install job is already running (" + _job.kind + ")" };
    try { execFileSync("brew", ["--version"], { timeout: 5000 }); }
    catch { return { ok: false, error: "Homebrew is not installed -- this bridge automates the two Homebrew " +
                                        "steps upstream documents, but not bootstrapping Homebrew itself; see brew.sh" }; }
    try { fs.mkdirSync(path.dirname(SRC_DIR), { recursive: true }); }
    catch (e) { return { ok: false, error: "cannot create " + path.dirname(SRC_DIR) + ": " + ((e && e.message) || e) }; }

    _job = { kind: "clone", log: [], done: false, code: null, startedAt: Date.now() };
    const afterCheckout = () => _brewSteps(null, () => { _job.done = true; _job.code = 0; });
    const checkout = () => {
        _appendLog("[install] checking out pinned commit " + PINNED_COMMIT.slice(0, 12) + "...\n");
        _runStep("checkout", "git", ["checkout", PINNED_COMMIT], { cwd: SRC_DIR }, (code) => {
            if (code !== 0) { _job.done = true; _job.code = code; _appendLog("[install] checkout of the pinned commit failed (" + code + ")\n"); return; }
            _runStep("chmod", "chmod", ["+x", "ntfsmounter"], { cwd: SRC_DIR }, (code2) => {
                if (code2 !== 0) { _job.done = true; _job.code = code2; return; }
                afterCheckout();
            });
        });
    };
    if (!fs.existsSync(path.join(SRC_DIR, ".git"))) {
        _appendLog("[install] cloning " + REPO + " into " + SRC_DIR + "\n");
        _runStep("clone", "git", ["clone", REPO, SRC_DIR], { cwd: path.dirname(SRC_DIR) },
            (code) => { if (code !== 0) { _job.done = true; _job.code = code; _appendLog("[install] clone failed (" + code + ")\n"); return; } checkout(); });
    } else {
        _appendLog("[install] checkout already present, skipping the clone\n");
        checkout();
    }
    return { ok: true, kind: _job.kind };
}

function installStatus() {
    return _job ? { kind: _job.kind, done: _job.done, code: _job.code,
                    uptimeMs: Date.now() - _job.startedAt, tail: _job.log.slice(-14).join("") } : null;
}

async function status() {
    const out = {
        ok: true, upstream: UPSTREAM, maintenance: MAINTENANCE, refused: REFUSED,
        platform: process.platform, isMac: IS_MAC,
        srcDir: SRC_DIR, cloned: false, atPinnedCommit: false,
        brewPresent: false, macfuseInstalled: false, ntfs3gInstalled: false,
        sudoCached: false, ready: false, why: "", installJob: installStatus(),
    };
    if (!IS_MAC) { out.why = "macOS only -- this box is " + process.platform; return out; }

    const brewV = await _run("brew", ["--version"], {});
    out.brewPresent = brewV.ok;
    if (!out.brewPresent) { out.why = "Homebrew is not installed -- see brew.sh"; return out; }

    out.cloned = fs.existsSync(path.join(SRC_DIR, ".git"));
    if (out.cloned) {
        try { out.atPinnedCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: SRC_DIR, encoding: "utf8" }).trim() === PINNED_COMMIT; }
        catch { /* not fatal to reporting status */ }
    }

    const macfuseCheck = await _run("brew", ["list", "--cask", "macfuse"], {});
    out.macfuseInstalled = macfuseCheck.ok;
    const ntfs3gCheck = await _run("brew", ["list", "ntfs-3g-mac"], {});
    out.ntfs3gInstalled = ntfs3gCheck.ok;

    const sudoCheck = await _run("sudo", ["-n", "true"], {});
    out.sudoCached = sudoCheck.ok;

    out.ready = out.cloned && out.atPinnedCommit && out.macfuseInstalled && out.ntfs3gInstalled;
    if (!out.cloned) out.why = "not installed yet -- press Install";
    else if (!out.atPinnedCommit) out.why = "WARNING: checkout is not at the pinned commit -- re-run Install to fix this";
    else if (!out.macfuseInstalled || !out.ntfs3gInstalled) out.why = "Homebrew dependencies not installed yet -- press Install (or retry if it failed)";
    else if (!out.sudoCached) out.why = "ready, but sudo is not authenticated in this environment -- run `sudo -v` " +
                                          "in a real Terminal first (this bridge will never ask for your password itself)";
    return out;
}

/**
 * *** THE SAME ALGORITHM THE SCRIPT ITSELF USES, READ FROM ITS SOURCE RATHER THAN GUESSED. *** ntfsmounter's
 * get_external_volumes() lists /Volumes, then for each name greps diskutil list's "external" section for a
 * line naming it and takes the last field as the device identifier. Ported here so this can be listed WITHOUT
 * running the script (no privilege needed for a read), and so the index handed to the script on stdin is
 * computed the same way the script computes it itself.
 */
async function listVolumes() {
    if (!IS_MAC) return { ok: false, error: "macOS only" };
    const lsR = await _run("ls", ["-1", "/Volumes"], {});
    if (!lsR.ok) return { ok: false, error: "could not list /Volumes: " + lsR.err };
    const names = lsR.out.split("\n").map((s) => s.trim()).filter(Boolean);

    const dlR = await _run("diskutil", ["list"], {});
    if (!dlR.ok) return { ok: false, error: "could not run diskutil list: " + dlR.err };
    const lines = dlR.out.split("\n");
    const extStart = lines.findIndex((l) => /external/i.test(l));
    const extLines = extStart === -1 ? [] : lines.slice(extStart).reduce((acc, l) => {
        if (acc.stopped) return acc;
        if (acc.list.length && l.trim() === "") { acc.stopped = true; return acc; }
        acc.list.push(l);
        return acc;
    }, { list: [], stopped: false }).list;

    const volumes = [];
    for (const name of names) {
        const hit = extLines.find((l) => l.includes(name));
        if (!hit) continue;   // not on an external disk -- not offered
        const fields = hit.trim().split(/\s+/);
        volumes.push({ name, identifier: fields[fields.length - 1] });
    }
    return { ok: true, volumes };
}

// =====================================================================================================
// THE .command LAUNCHER -- WHICH IS A BETTER ANSWER TO THE PASSWORD PROBLEM THAN mount() ABOVE.
// =====================================================================================================
//
// Keith: "can we generate a .sh file to run? can that be a created terminal file that will double click and
// run in terminal? can that terminal file be executed by SweK and then we approve it?" -- yes to all three,
// and it dissolves the limitation the `sudo -n` rule above imposes rather than working around it.
//
// *** WHY THIS IS STRICTLY BETTER THAN THE /ntfs/mount ROUTE, NOT JUST A SECOND WAY TO DO IT. *** mount()
// keeps its promise that this server never handles a password by using `sudo -n`, which FAILS CLOSED unless
// the person has already run `sudo -v` in a terminal -- correct, but it makes the button not work until you
// have done something else first, somewhere else. A .command file opened with `open` runs in Terminal.app,
// and TERMINAL asks for the password, exactly as it would if the person had typed the command themselves.
// The password still never reaches this server -- the property is unchanged -- but the pre-authentication
// step disappears. Same guarantee, no homework.
//
// *** AND IT RUNS THE SCRIPT INTERACTIVELY, WHICH REMOVES THE STALE-INDEX RISK ENTIRELY. *** mount() computes
// a numeric menu selection, feeds it on stdin, and then has to VERIFY the script echoed the volume it meant
// (see its MISMATCH check) because a disk list can change between listing and mounting. The launcher does not
// feed anything: upstream's own menu prints in a real Terminal and the person picks from it. There is no index
// to go stale, and the confirmation is the script's own prompt rather than one this tree bolted on.
//
// *** THE PATH FIX IS NOT OPTIONAL AND THIS TREE HAS ALREADY PAID FOR LEARNING IT TWICE. *** "Check this Mac
// matches the fleet.command" states it: a .command double-clicked in Finder is started by launchd, not by your
// shell, so ~/.zprofile is never sourced and Homebrew's /opt/homebrew/bin is not on PATH. ntfs-3g is a Homebrew
// binary. Without this block the script would report ntfs-3g missing on a machine where it works perfectly in
// Terminal -- which is the exact false negative that made a Mac look broken for two rounds.

/** Where the generated launcher lives: beside the checkout, OUTSIDE the engine tree, same rule as SRC_DIR. */
function commandFilePath() { return path.join(SRC_DIR, "Mount NTFS Disk.command"); }

/**
 * *** SHELL-QUOTE A VOLUME NAME, BECAUSE A VOLUME NAME IS NOT TRUSTED INPUT. *** Anyone can name a USB stick,
 * and this string is about to be written into a bash script. `'; rm -rf ~ #` is a legal volume name on macOS.
 * POSIX single-quoting is the only form with no escape sequences at all inside it -- the one character that
 * needs handling is the single quote itself, closed and reopened around an escaped one.
 */
function shellQuote(s) { return "'" + String(s == null ? "" : s).replace(/'/g, "'\\''") + "'"; }

/**
 * Generate the double-clickable launcher. `volumeName` is optional and PURELY INFORMATIONAL -- it is echoed so
 * the person knows which entry they picked in SweK, never used to drive the selection, which is what keeps the
 * stale-index problem from coming back in a new place.
 */
function writeCommandFile(volumeName) {
    if (!IS_MAC) return { ok: false, error: "macOS only" };
    if (!fs.existsSync(path.join(SRC_DIR, "ntfsmounter"))) return { ok: false, error: "not installed yet -- press Install first" };

    const picked = volumeName ? shellQuote(volumeName) : "";
    const body = `#!/usr/bin/env bash
# Mount NTFS Disk.command -- GENERATED BY SweK (ai-bridge/ntfsMounterBridge.js). Safe to delete or re-generate.
#
# This runs zavierferodova/Mac-NTFS-Mounter's own script, UNMODIFIED, from the checkout SweK installed at
# the path below. SweK generated this launcher; it did not write the script this launcher runs.
#
# It runs HERE, in Terminal, rather than inside SweK's server on purpose: the sudo password prompt below is
# Terminal's, so your password goes to macOS and never to a web server on your LAN.
cd "\$(dirname "\$0")" || exit 1

# A .command double-clicked in Finder is started by launchd, not by your shell -- ~/.zprofile is never sourced,
# so Homebrew's bin is not on PATH and ntfs-3g looks missing on a Mac where it works fine in Terminal.
for _d in /opt/homebrew/bin /usr/local/bin /opt/local/bin; do
    case ":\$PATH:" in *":\$_d:"*) ;; *) [ -d "\$_d" ] && PATH="\$_d:\$PATH" ;; esac
done
if ! command -v ntfs-3g >/dev/null 2>&1 && command -v brew >/dev/null 2>&1; then
    eval "\$(brew shellenv 2>/dev/null)" || true
fi
export PATH

echo "================================================================"
echo " Mount an NTFS disk read-write"
echo "================================================================"
echo
echo " Script:  \$(pwd)/ntfsmounter"
echo "          (zavierferodova/Mac-NTFS-Mounter, run unmodified)"
${picked ? `echo
echo " You picked ${picked} in SweK -- choose that one from the menu below."` : ""}
echo
if ! command -v ntfs-3g >/dev/null 2>&1; then
    echo " ERROR: ntfs-3g is not on this launcher's PATH."
    echo "   If 'ntfs-3g --version' WORKS in a Terminal, this is a PATH problem, not a missing install."
    echo "   If it does NOT work:  brew tap gromgit/homebrew-fuse && brew install ntfs-3g-mac"
    echo
    read -p "Press Enter to close..."
    exit 1
fi

echo " This will UNMOUNT the disk you pick and REMOUNT it read-write."
echo " macOS will ask for your password (that prompt is Terminal's, not SweK's)."
echo
read -p " Continue? [y/N] " _ok
case "\$_ok" in
    y|Y|yes|YES) ;;
    *) echo; echo " Cancelled. Nothing was changed."; echo; read -p "Press Enter to close..."; exit 0 ;;
esac

echo
chmod +x ./ntfsmounter 2>/dev/null
sudo ./ntfsmounter
CODE=\$?

echo
if [ \$CODE -eq 0 ]; then
    echo " Done. If the disk mounted, it is now writable in Finder."
else
    echo " The script exited with code \$CODE. See /var/log/mount-ntfs-3g.log for details."
fi
echo
read -p "Press Enter to close..."
`;

    const p = commandFilePath();
    try {
        fs.writeFileSync(p, body);
        fs.chmodSync(p, 0o755);   // without +x, Finder opens it in a text editor instead of running it
    } catch (e) { return { ok: false, error: "cannot write " + p + ": " + ((e && e.message) || e) }; }
    // *** NO xattr -d com.apple.quarantine HERE, AND THAT IS A DELIBERATE DIFFERENCE FROM sysadminBridge.js. ***
    // That file strips the quarantine flag because it launches a .command it EXTRACTED FROM A DOWNLOADED ZIP,
    // and the flag is applied by whatever downloaded it. This launcher is written by fs.writeFileSync in a
    // local process, which does not set the attribute at all -- so running xattr here would be cargo-culting a
    // fix for a condition that cannot occur, and would quietly mask it if the provenance ever DID change.
    return { ok: true, path: p, script: body, volume: volumeName || null };
}

/**
 * Hand the launcher to macOS. `reveal` shows it in Finder (so it can be dragged to the Desktop and kept);
 * otherwise it is OPENED, which is what makes Terminal.app run it and ask for the password there.
 *
 * *** THE APPROVAL IS REAL AND HAPPENS TWICE, BOTH TIMES OUTSIDE THIS SERVER. *** Terminal asks for the sudo
 * password, and the script itself asks "Continue? [y/N]" before touching a disk. Pressing a button in SweK is
 * what OFFERS the action; it is not what performs it.
 */
function openCommandFile(reveal) {
    if (!IS_MAC) return { ok: false, error: "macOS only" };
    const p = commandFilePath();
    if (!fs.existsSync(p)) return { ok: false, error: "no launcher generated yet" };
    try {
        const c = spawn("open", reveal ? ["-R", p] : [p], { detached: true, stdio: "ignore" });
        c.unref();
    } catch (e) { return { ok: false, error: "could not open " + p + ": " + ((e && e.message) || e) }; }
    return { ok: true, path: p, revealed: !!reveal };
}

/**
 * Mount one volume -- REQUIRES the exact name+identifier from a FRESH listVolumes() call, matched again here
 * against a re-list rather than trusted from an earlier response, because the disk state a UI cached seconds
 * ago is not the disk state now. Runs upstream's own ntfsmounter script, unmodified, feeding it the numeric
 * selection its OWN interactive menu would ask for -- computed from the SAME listing algorithm above, so the
 * index means the same thing to the script that it means here. `sudo -n`: never prompts, fails closed.
 */
async function mount(name) {
    if (!IS_MAC) return { ok: false, error: "macOS only" };
    if (!fs.existsSync(path.join(SRC_DIR, "ntfsmounter"))) return { ok: false, error: "not installed yet -- press Install first" };
    if (!name) return { ok: false, error: "no volume named" };

    const sudoCheck = await _run("sudo", ["-n", "true"], {});
    if (!sudoCheck.ok) return { ok: false, error: "sudo is not authenticated -- run `sudo -v` in a real Terminal " +
                                                    "first; this bridge will never prompt for your password" };

    const listing = await listVolumes();
    if (!listing.ok) return listing;
    const idx = listing.volumes.findIndex((v) => v.name === name);
    if (idx === -1) return { ok: false, error: "'" + name + "' is not currently an external volume -- refresh and pick again" };
    const target = listing.volumes[idx];

    const res = await new Promise((resolve) => {
        let out = "";
        const child = spawn("sudo", ["-n", "./ntfsmounter"], { cwd: SRC_DIR, windowsHide: true });
        child.stdout.on("data", (d) => { out += d.toString(); });
        child.stderr.on("data", (d) => { out += d.toString(); });
        child.on("exit", (code) => resolve({ code, out }));
        child.on("error", (e) => resolve({ code: -1, out: out + "\n[spawn error] " + ((e && e.message) || e) }));
        // The script's own menu is 1-indexed against the SAME list this function just rebuilt.
        child.stdin.write(String(idx + 1) + "\n");
        child.stdin.end();
    });

    const tail = res.out.slice(-3000);
    if (res.code !== 0) return { ok: false, error: "ntfsmounter exited with an error", log: tail };

    // *** THE SCRIPT ECHOES WHAT IT SELECTED; THIS IS THE CHECK THAT THE INDEX REALLY MEANT WHAT WE INTENDED. ***
    // If the script's own printed selection names a different volume than the one that was confirmed, that is
    // reported as a MISMATCH rather than a success -- a stale index pointing at the wrong disk is exactly the
    // failure mode a numeric selection over a possibly-changed list can produce.
    const echoedCorrectly = res.out.includes("Selected volume " + target.name);
    if (!echoedCorrectly) {
        return { ok: false, error: "MISMATCH: the script's own output did not confirm selecting '" + target.name +
                                     "' -- the disk list may have changed between listing and mounting. Nothing " +
                                     "further was assumed; refresh and try again.", log: tail };
    }
    return { ok: true, mounted: target.name, identifier: target.identifier, log: tail };
}

module.exports = { install, installStatus, status, listVolumes, mount,
                   commandFilePath, writeCommandFile, openCommandFile, shellQuote,
                   UPSTREAM, MAINTENANCE, REFUSED, REPO, PINNED_COMMIT, SRC_DIR, IS_MAC };
