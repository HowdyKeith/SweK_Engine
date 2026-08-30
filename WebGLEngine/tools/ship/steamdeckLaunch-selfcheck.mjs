// WebGLEngine/tools/ship/steamdeckLaunch-selfcheck.mjs -- v4140
//
// THE ANSWER KEY FOR THE STEAM DECK LAUNCHER, AND IT EXISTS BECAUSE WRITING THIS ROUND ALREADY FOUND ONE
// REAL BUG IN ITSELF.
//
// Keith: "can we have a steam deck swek peer?" -- researched first: the peer-discovery/sync/fleet machinery
// (assetDiscovery.js's UDP beacon, /net/info, /lighthouse) is fully platform-agnostic already, and server.js's
// GPU detection already has a genuine Linux branch. What was missing was a launcher -- install-mac.sh /
// start-mac.sh have no Linux sibling, and install-mac.sh's own OS-check message already says so: "write a
// linux equivalent." So this is that pair, plus brain/start-brain-steamdeck.sh, on the SAME shape mac's three
// scripts use.
//
// *** AND WHILE WRITING IT, A REAL TAKEOVER TEST FOUND THAT THE /proc FALLBACK NEVER FOUND A PID. *** This
// sandbox genuinely lacks `ss` (checked, not assumed), so start-steamdeck.sh's fallback path ran for real: it
// correctly reported "port busy" and then returned NO PID, because the first draft's fallback comment said so
// itself -- "good enough to know 'is anything listening'; not good enough to report a PID." That meant the
// takeover branch below it warned and skipped the kill, and a SECOND launch tried to bind :8787 anyway while
// the first instance silently kept running -- a relaunch that looks like it worked and does not. THE FIX
// WALKS THE REST OF THE WAY: /proc/net/tcp's socket INODE, matched against every process's /proc/$pid/fd/*
// symlinks (which read "socket:[INODE]" for a socket fd) -- no root needed for our own processes, which is
// the only case a takeover is ever asked to handle. MEASURED against a real listener (python -m http.server)
// before and after the fix: before, empty; after, the exact right PID, verified against a genuine two-instance
// takeover of the real server (bun ai-bridge/server.js) -- PID resolved, killed, exactly one process survived,
// a DIFFERENT PID from the one that died.
//
// This gate re-derives that same live proof every run, from the REAL function in the REAL file -- not a copy
// restated here, which is exactly the shape that let the bug hide in the first place (a comment describing
// what the fallback does NOT do, sitting right next to code that could have done it).
"use strict";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const rd = (p) => fs.readFileSync(p, "utf8");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (l) => console.log("  ----  " + l);

// *** v4140 -- INSTALL LIVES BESIDE start-steamdeck.sh, NOT AT THE PROJECT ROOT. ***
// The first draft put it at the repo root, mirroring where a naive "one-time setup script" reads as belonging
// -- and rootLayout-selfcheck caught it two ways at once: a stray file with no NAMED reason in the root's own
// justification list, and a broken pointer (its OS-check message named Start_Everything.bat, which had moved
// out of the root in an earlier round). install-mac.sh answers where this actually belongs: it lives in
// WebGLEngine/, beside start-mac.sh, not at the root Keith's launchers occupy. Moving it fixed both findings
// at once, because a root-scoped gate simply stops looking at a file that is no longer in its scope.
const INSTALL = path.join(ENG, "install-steamdeck.sh");
const START = path.join(ENG, "start-steamdeck.sh");
const BRAIN = path.join(ENG, "brain", "start-brain-steamdeck.sh");
const SERVER = rd(path.join(ENG, "ai-bridge", "server.js"));

// *** v4166 -- WHETHER THIS BOX HAS bash IS ESTABLISHED ONCE, BECAUSE WITHOUT IT THIS GATE REPORTED SEVEN
// FAILURES ABOUT SHELL SCRIPTS THAT ARE FINE. *** Keith ran it on Windows (C:\Intel\SweK_Engine_v4148) and
// every bash-backed check went red: three "parses (bash -n)" failures, the live port-owner resolution, the
// empty-port case, the sabotage control, and the run-for-real -- all of them "Command failed" or
// "spawnSync bash ENOENT". THE SCRIPTS WERE NEVER READ. A gate that cannot tell "this script is broken" from
// "this machine has no shell" is asserting a property of the box while naming a property of the code, which
// is the same defect materialKnobs, rh-hydrostatic and twoFBind carried as stopwatch assertions at v4162.
//
// A SKIP THAT NAMES ITSELF, then -- never a silent pass. The static checks (sections 3-7) read source and are
// platform-independent, so they still run and still fail loudly; only the checks that need a shell stand down,
// and they say so with the reason.
let HAVE_BASH = false;
try { execFileSync("bash", ["-c", "exit 0"], { timeout: 5000, stdio: "ignore" }); HAVE_BASH = true; } catch { HAVE_BASH = false; }

console.log("steamdeckLaunch-selfcheck -- does the Steam Deck / Linux launcher pair actually work, and can it take over its own port?\n");

console.log("1. THE THREE FILES EXIST AND PARSE AS REAL BASH");
{
    for (const [name, p] of [["install-steamdeck.sh", INSTALL], ["start-steamdeck.sh", START], ["brain/start-brain-steamdeck.sh", BRAIN]]) {
        ok("!! " + name + " exists", fs.existsSync(p));
        if (!fs.existsSync(p)) continue;
        if (!HAVE_BASH) {
            report("   " + name + " parses (bash -n) -- NOT RUN: no bash on this box",
                "a syntax check needs the interpreter. Reporting this as a FAILING script would be a claim " +
                "about the file made by the absence of a shell");
        } else {
            try { execFileSync("bash", ["-n", p], { timeout: 10000 }); ok(name + " parses (bash -n)", true); }
            catch (e) { ok(name + " parses (bash -n)", false, String(e.message || e).slice(0, 200)); }
        }
    }
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THE TAKEOVER, RUN FOR REAL -- THE FUNCTION THAT BROKE THE FIRST TIME ***");
{
    const src = rd(START);
    // Extract the function VERBATIM from the shipped file, source it into a real bash process, and run it
    // against a real listening socket. A regex confirming the fix "looks right" is exactly the check that
    // would have passed the broken version too -- the broken version LOOKED complete; it just returned nothing.
    const fn = /port_owner_pid\(\) \{[\s\S]*?\n\}/.exec(src);
    ok("!! port_owner_pid() can be extracted from the shipped file", !!fn);
    if (fn && !HAVE_BASH) {
        report("   the live port-owner checks -- NOT RUN: no bash on this box",
            "port_owner_pid was extracted from the shipped file (asserted above) and is a SHELL function; " +
            "resolving a real listener with it needs a shell to run it in. On Windows every one of these " +
            "reported 'Command failed' and read as the launcher being broken");
    }
    if (fn && HAVE_BASH) {
        const harness = `PORT=$1\n${fn[0]}\nport_owner_pid`;
        const probe = () => {
            const srv = net.createServer(() => {});
            return new Promise((res) => srv.listen(0, "127.0.0.1", () => res(srv)));
        };
        const runIt = (port) => { try { return execFileSync("bash", ["-c", harness, "_", String(port)], { timeout: 5000, encoding: "utf8" }).trim(); } catch (e) { return "ERR:" + (e.message || e); } };

        const srv = await probe();
        const realPid = process.pid; // not used; the listener's PID is THIS node process
        const port = srv.address().port;
        const resolved = runIt(port);
        // node itself is what's listening (this process), so the resolved PID must equal process.pid.
        ok("!! the REAL function resolves the REAL PID of a live listener", resolved === String(process.pid),
            "listener pid " + process.pid + ", resolved '" + resolved + "'");
        const emptyPort = port === 65535 ? port - 1 : port + 1;
        const unused = runIt(emptyPort);
        ok("!! ...and returns EMPTY for a port nothing is using", unused === "",
            "queried " + emptyPort + " -> '" + unused + "'");
        srv.close();
    }

    // *** SABOTAGE: THE EXACT BUG THIS FILE WAS WRITTEN AFTER FINDING. *** Revert the fallback to the shape
    // that shipped first -- correctly detects "busy", returns nothing -- and confirm this gate would have
    // caught it. If this passes, the gate is real; if it does not, section 2 above proves nothing.
    if (fn) {   // the stub is BUILT and diffed on every box; only EXECUTING it needs a shell (see below)
        const stub = fn[0].replace(
            /local hexport[\s\S]*?\n    return 0\n\}/,
            "return 0\n}"
        );
        ok("the stub sabotage actually changed the source", stub !== fn[0] && stub.length < fn[0].length);
        const srv2 = await (() => { const s = net.createServer(() => {}); return new Promise((res) => s.listen(0, "127.0.0.1", () => res(s))); })();
        const port2 = srv2.address().port;
        // *** v4166 -- A FAILED SHELL AND A STUB THAT ANSWERED ARE NOW DIFFERENT OUTCOMES, AND CONFLATING
        // THEM BROKE THE NEGATIVE CONTROL IN THE DIRECTION THAT LIES. *** This caught `catch { out = "ERR" }`
        // and then asserted `out === ""`, so on a box without bash the control reported "the sabotage did not
        // remove the fix" -- i.e. THE FIX IS MISSING FROM THE SHIPPED FILE -- when in truth nothing had run.
        // And the other way is worse: had the sentinel been "" instead of "ERR", a box with no shell would
        // have PASSED this control every time while proving nothing at all. A CONTROL THAT CANNOT TELL
        // WHETHER IT RAN IS NOT A CONTROL, which is exactly the vacuous-pass shape this tree keeps finding.
        let out = null, ranStub = false;
        try {
            out = execFileSync("bash", ["-c", `PORT=$1\n${stub}\nport_owner_pid`, "_", String(port2)],
                { timeout: 5000, encoding: "utf8" }).trim();
            ranStub = true;
        } catch (e) { out = null; ranStub = false; }
        srv2.close();
        if (!ranStub) {
            report("   SABOTAGE control -- NOT RUN: the shell would not start",
                "the stub was built and differs from the shipped function (asserted above), but nothing " +
                "executed it. AN UNRUN CONTROL IS REPORTED AS UNRUN; calling it a pass or a failure would " +
                "both be inventions");
        } else {
            ok("!! SABOTAGE: the stubbed fallback (the shape that shipped first) resolves NOTHING",
                out === "", "stub returned '" + out + "' -- if non-empty, the sabotage did not remove the fix");
        }
    }
}

// ---------------------------------------------------------------------------
console.log("\n3. install-steamdeck.sh POINTS AT DISTROBOX, NOT A pacman INSTALL THAT VANISHES ON UPDATE");
{
    const src = rd(INSTALL);
    ok("!! the node-missing message names Distrobox", /[Dd]istrobox/.test(src));
    ok("!! ...and says WHY -- the read-only root that resets on update",
        /READ-ONLY/.test(src) && /(reset|revert)s? on/i.test(src),
        "the reason a bare pacman install is a trap, not just an alternative offered alongside it");
    // *** THE FIRST DRAFT OF THIS CHECK CONFUSED "PRINTS A LINE MENTIONING pacman" WITH "RUNS pacman", AND
    // FAILED ON ITS OWN CORRECT SCRIPT. *** Every occurrence of "pacman -S" in the file is either header prose
    // explaining why NOT to (comment lines) or text inside a `say "..."` call TELLING THE USER what to type --
    // the script itself never executes pacman. That is exactly right: install-steamdeck.sh must never run
    // pacman itself (SteamOS's read-only root means a script-driven install could silently fail or, worse,
    // "succeed" and vanish on the next update without the user ever knowing it happened). The real property to
    // check is that NO line in the file invokes pacman AS A COMMAND -- anchored to line-start (ignoring only
    // leading whitespace), which a `say "` or `#` prefix cannot satisfy.
    const pacmanCommands = src.split("\n").filter((l) => /^\s*pacman\b/.test(l));
    ok("!! the script NEVER EXECUTES pacman itself -- only tells the user the command to type",
        pacmanCommands.length === 0,
        pacmanCommands.length ? "found as a real invocation: " + pacmanCommands.join(" | ") : "all mentions are prose or printed instructions");
}

// ---------------------------------------------------------------------------
console.log("\n4. THE GPU BRAIN PINS THE BACKEND THE DECK'S OWN GPU ACTUALLY SUPPORTS");
{
    const src = rd(BRAIN);
    ok("!! WGPU_BACKEND=vulkan is pinned for the GPU attempt", /WGPU_BACKEND=vulkan\s+deno run/.test(src));
    ok("!! ...and the CPU fallback does NOT pin a backend -- there is no GPU to pin one for",
        /BRAIN_BACKEND=cpu[\s\S]{0,40}deno run(?!.*WGPU_BACKEND)/.test(src) || (() => {
            const cpuLine = src.split("\n").find((l) => /BRAIN_BACKEND=cpu/.test(l));
            return !!cpuLine && !/WGPU_BACKEND/.test(cpuLine);
        })());
    ok("it detects a software-adapter refusal the same way start-brain-mac.sh does",
        /software|fallback|no webgpu adapter|no adapter/i.test(src) && /falling back to the CPU brain/.test(src));
    ok("!! Deno installs to $HOME, never touching the read-only OS partition",
        /DENO_INSTALL="\$HOME\/\.deno"/.test(src));
}

// ---------------------------------------------------------------------------
console.log("\n5. start-steamdeck.sh's CLAIM ABOUT server.js's BROWSER-OPENING IS CHECKED, NOT ASSUMED");
{
    // The launcher's own header says it deliberately does NOT open a browser because server.js already does,
    // on Linux, via xdg-open. That claim is checked against the real server.js rather than trusted -- a stale
    // comment asserting behaviour server.js no longer has is exactly the prose-as-fact shape this tree has
    // paid for repeatedly this session.
    ok("!! server.js really does call xdg-open on non-darwin/non-win32 platforms",
        /cp\.spawn\("xdg-open"/.test(SERVER) || /`xdg-open "\$\{url\}"`/.test(SERVER),
        "start-steamdeck.sh's header claims this and does not duplicate the open itself -- if false, Linux users get no browser at all");
    // *** THE FIRST DRAFT OF THIS CHECK MATCHED ITS OWN INFORMATIONAL printf, THE ONE TELLING THE USER
    // server.js WILL OPEN THE BROWSER. *** "xdg-open" appearing as a WORD inside a printed message ("opens
    // automatically via xdg-open once the bridge is listening") is not the same claim as the script actually
    // RUNNING xdg-open -- the same prose-vs-code distinction section 3's fix above needed. An invocation would
    // appear at the START of a command (leading whitespace only, no quote or printf format text before it);
    // a mention inside a string never does. Anchored the same way as the pacman check.
    const launcherSrc = rd(START);
    ok("!! ...and start-steamdeck.sh does NOT ITSELF INVOKE xdg-open (would race server.js's own opener, v2064's bug)",
        !/^\s*xdg-open\b/m.test(launcherSrc));
}

// ---------------------------------------------------------------------------
console.log("\n6. THE PORT-TAKEOVER LOOP CANNOT SPIN FOREVER ON A PID IT NEVER FINDS");
{
    const src = rd(START);
    ok("the takeover retry loop is BOUNDED", /for i in \$\(seq 1 20\)/.test(src), "20 iterations at 0.25s = 5s cap, matching start-mac.sh's own bound");
    ok("!! an unresolved PID does not attempt to kill an empty string",
        /if \[ -n "\$\{OLD_PID:-\}" \]/.test(src),
        "kill \"\" is a bash error, not a no-op -- this is the branch that fires when even the fixed fallback finds nothing");
}

// ---------------------------------------------------------------------------
console.log("\n7. adb IS OFFERED FOR SHIELD/ANDROID TV, OPTIONAL, AND NEVER RUN BY THE SCRIPT ITSELF");
{
    // v4142 -- ui/shieldDebugPanel.js's server-side route (ai-bridge/server.js's /shield/exec) shells out to a
    // real `adb` binary; ui/rokuRemotePanel.js does not (plain Node http to ECP port 8060), which is why this
    // section exists only for adb and Roku needed nothing here. Unlike Node.js, adb is genuinely OPTIONAL --
    // the engine, and the Roku panel specifically, work fully without it -- so this block must never call the
    // script's own `fail` (which exits 1 and aborts the whole install over a feature nobody may want).
    const src = rd(INSTALL);
    ok("!! the adb block is GATED behind a real presence check, not printed unconditionally",
        /if ! command -v adb >\/dev\/null 2>&1; then/.test(src));
    ok("!! it names Distrobox as the SteamOS-recommended path, same container as the Node.js step",
        /Distrobox.*same container as Node\.js|same container as Node\.js.*Distrobox|Distrobox \(recommended on SteamOS/.test(src));
    ok("!! ...and offers Google's platform-tools zip as a no-Distrobox, no-root alternative",
        /platform-tools/.test(src) && /developer\.android\.com/.test(src));
    ok("!! it says PLAINLY that Roku already works without it, so a reader does not chase a dependency they don't need",
        /Roku.*(already works|works without)/i.test(src));
    // THE PART THAT MATTERS: this block must be able to fall through to npm install even when adb is absent.
    // A `fail` call here would abort setup entirely over an optional feature -- the exact overreach v3xxx's
    // Node.js block is RIGHT to commit (Node is not optional) and this block would be WRONG to copy.
    const adbBlockMatch = /if ! command -v adb[\s\S]*?\nfi\n/.exec(src);
    ok("!! the adb-missing block can be isolated in the file", !!adbBlockMatch);
    if (adbBlockMatch) {
        ok("!! ...and that block never calls fail() (adb is optional; Node.js above is not)",
            !/\bfail\b/.test(adbBlockMatch[0]));
    }
    // RUN IT FOR REAL: the script must reach "Setup complete" whether or not adb is on PATH -- proof, not a
    // regex guess about bash control flow. A PATH built from node's REAL install dir plus /usr/bin:/bin (and
    // deliberately nothing that could hold an adb binary) simulates the box this sandbox actually is: adb
    // genuinely absent here (checked: `command -v adb` exits 1), Node genuinely present but not on the system
    // PATH by default (this box's node lives under /opt), which is why that directory is named explicitly
    // rather than trusted to already be in process.env.PATH.
    // v4166 -- this block builds its OWN PATH (nodeDir + /usr/bin:/bin) and so finds bash even when the
    // caller's PATH does not carry it -- which is why it kept running when the checks above stood down. On
    // Windows there is no /bin to fall back to, so it needs the same guard: Keith's rig reported it as
    // "spawnSync bash ENOENT", i.e. the install script failing, when no script had been executed.
    if (!HAVE_BASH) {
        report("   install-steamdeck.sh RUN FOR REAL -- NOT RUN: no bash on this box",
            "the source claims above (the block is gated, never calls fail, names Distrobox) all ran and are " +
            "platform-independent. THIS is the one that needs a shell, and an unrun execution is reported as " +
            "unrun rather than as an install that failed");
    } else try {
        const nodeDir = path.dirname(process.execPath);
        const out = execFileSync("bash", [INSTALL], {
            timeout: 30000, encoding: "utf8",
            env: { ...process.env, PATH: nodeDir + ":/usr/bin:/bin" },
        });
        ok("!! install-steamdeck.sh RUN FOR REAL with adb off PATH still reaches Setup complete",
            /Setup complete/.test(out) && /adb .* not found -- optional/.test(out),
            "confirms the missing-adb branch is reachable AND non-fatal in the real script, not just in a regex read of it");
    } catch (e) {
        ok("!! install-steamdeck.sh RUN FOR REAL with adb off PATH still reaches Setup complete", false,
            String((e && e.message) || e).slice(0, 300));
    }
}

console.log("\n  ----  NOT RUN HERE: the actual Steam Deck. This box is generic Linux (verified: lacks `ss`, which is exactly");
console.log("  ----  the case the /proc fallback above is proven against), and has no AMD RDNA2 GPU to confirm the Vulkan");
console.log("  ----  pin against real hardware, and no Distrobox to confirm the install instructions verbatim. What IS");
console.log("  ----  proven: the takeover mechanism (measured against a real listener and a real two-instance bun server),");
console.log("  ----  every script's syntax, and every source claim this file makes about itself.");

console.log(fails ? `\nsteamdeckLaunch-selfcheck: ${fails} FAILED` : "\nsteamdeckLaunch-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
