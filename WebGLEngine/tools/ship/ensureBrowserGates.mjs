// WebGLEngine/tools/ship/ensureBrowserGates.mjs -- UNNUMBERED (the version is chosen at ship time) (the library; the command is tools/ship/ensureBrowserGatesCmd.mjs; the gate is tools/ship/ensureBrowserGates-selfcheck.mjs)
//
// AUTO-INSTALL FOR THE BROWSER GATES, UNDER THE AUTO-INSTALL DISK SETTING (Keith, 2026-10-29: "if the install needs such as playwright or the browser gates are under the auto install disk space current setting or default setting,
// they should auto install"). shipVerdict.readiness() has said since v4833 what a box needs to run the browser gates and has deliberately fixed nothing ("a npm install is a download"). This is the part that fixes it, with the
// permission Keith has now given, and WITH THE LIMITS THE ENGINE'S OWN AUTO-INSTALL ALREADY HAS (ai-bridge/autoInstall.js, the Settings -> Auto-Install slider):
//   THE CAP     the download size may not exceed autoCapMB in ~/.voxelbridge/autoinstall.json (the slider's value), or 100 MB when the file or the field is absent; 0 means unlimited; a negative number reads as 0, as there.
//               `--cap-mb N` overrides it for one run and is never written.
//   THE SPACE   the free space on the volume of the folder installed into must be at least 3 times the estimate (download + unpack), the engine's own headroom rule; unreadable free space is not a refusal, as there.
//   THE ESTIMATE  BROAD GUESSES, NOT MEASUREMENTS (as autoInstall.js says of its own): about 280 MB for Playwright plus its Chromium and headless shell, about 15 MB for Playwright alone when the headless shell is already on disk.
//               Over the DEFAULT cap of 100 MB the browser download therefore refuses until the slider is raised -- that is the setting working, and the refusal says what to do.
//   NOT THE GLOBAL TOGGLE  autoinstall.json's `enabled` is not consulted: Keith asked for this one directly. It is not a general npm installer: the one thing it installs is tools/render-qa's dependencies by the command shipVerdict's own fixCommand names, and the DXC copy ensureDxc already makes.
// It runs the install by argument list, never a string through a shell (on Windows through node's own npm-cli.js; only when that is missing through npm.cmd, whose argument list is fixed here and has nothing a person typed in it).
// Nothing here is on a graded path, and nothing installs when the box is already ready.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readiness, fixCommand } from "./shipVerdict.mjs";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { ensureDxc } from "./ensureDxc.mjs";

export const DEFAULT_CAP_MB = 100, HEADROOM = 3;   // the same two numbers as ai-bridge/autoInstall.js
export const EST_MB = Object.freeze({ browser: 280, playwrightOnly: 15 });
export const PREFS_FILE = path.join(os.homedir(), ".voxelbridge", "autoinstall.json");
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The cap in MB from the prefs file's text: autoCapMB when it is a number (negative reads 0), else the default; 0 is unlimited. Unreadable text is the default. */
export function capFromPrefs(text) {
    let p = null; try { p = JSON.parse(text); } catch { /* absent or damaged: the default */ }
    const v = p && typeof p.autoCapMB === "number" ? p.autoCapMB : DEFAULT_CAP_MB;
    return v < 0 ? 0 : v;
}
/** Free MB on the volume holding `dir` (the nearest existing parent), or null when it cannot be read. `statfs` and `exists` are seams. */
export function freeMB(dir, { statfs = fs.statfsSync, exists = fs.existsSync } = {}) {
    let d = dir; while (d && !exists(d) && path.dirname(d) !== d) d = path.dirname(d);
    try { const s = statfs(d); return Math.round((Number(s.bsize) * Number(s.bavail)) / (1024 * 1024)); } catch { return null; }
}
/** What the box lacks: the three facts shipVerdict's readiness reads, as booleans, and the estimate they imply. Pure over what it is given. */
export function needOf({ playwright, shellThere, dxcNeeded }) {
    const installs = !playwright || !shellThere;
    return { playwright, shellThere, installs, dxc: !!dxcNeeded, estMB: installs ? (shellThere ? EST_MB.playwrightOnly : EST_MB.browser) : 0 };
}
/** The decision. { action: "ready" | "install" | "refuse", reasons, steps, estMB, capMB, free }. A refusal names the way out. Pure. */
export function decide({ need, capMB, free }) {
    const steps = [];
    if (need.installs) steps.push("npm");
    if (need.dxc) steps.push("dxc");
    if (!steps.length) return { action: "ready", reasons: [], steps, estMB: 0, capMB, free };
    const reasons = [];
    // the DXC copy downloads nothing (estMB is 0), so neither limit can hold it
    if (capMB > 0 && need.estMB > capMB) reasons.push(`the download is about ${need.estMB} MB and the auto-install cap is ${capMB} MB -- raise it (Settings -> Auto-Install, or --cap-mb ${need.estMB} for this run)`);
    if (free !== null && free < need.estMB * HEADROOM) reasons.push(`${free} MB free on the install volume and about ${need.estMB * HEADROOM} MB wanted (${HEADROOM}x the ${need.estMB} MB estimate) -- free some space`);
    return reasons.length ? { action: "refuse", reasons, steps, estMB: need.estMB, capMB, free } : { action: "install", reasons, steps, estMB: need.estMB, capMB, free };
}
/** How to run npm without a shell: through node's own npm-cli.js beside the running node (Windows installs have it), else npm (npm.cmd on Windows, through a shell because node refuses to start a .cmd directly; its arguments are fixed). */
export function npmInvocation({ platform = process.platform, execPath = process.execPath, exists = fs.existsSync } = {}) {
    const cli = path.join(path.dirname(execPath), "node_modules", "npm", "bin", "npm-cli.js");
    if (platform === "win32" && exists(cli)) return { cmd: execPath, prefix: [cli], shell: false };
    return platform === "win32" ? { cmd: "npm.cmd", prefix: [], shell: true } : { cmd: "npm", prefix: [], shell: false };
}
/** The npm argument list (after the program), the same flags as shipVerdict.fixCommand. */
export function npmArgs(eng, { playwright, shell }) {
    return ["install", "--no-audit", "--no-fund", ...(shell && !playwright ? ["--ignore-scripts"] : []), "--prefix", path.join(eng, "tools", "render-qa")];
}

/** What the box lacks right now, from the tree's own resolvers (the same ones readiness uses). Every input is a seam. */
export function probe({ resolve = () => resolvePlaywright(createRequire(import.meta.url)), shell = HEADLESS_SHELL, exists = fs.existsSync, dxc = () => ensureDxc({ write: false }) } = {}) {
    const { chromium } = resolve(), shellThere = !!shell && exists(shell);
    if (!chromium || !shellThere) return { ...needOf({ playwright: !!chromium, shellThere, dxcNeeded: false }), dxcNote: null };
    // both there: the only thing left that readiness reads is DXC beside the shell (ensureDxc looks beside it, so with no shell it has nothing to say)
    const d = dxc();
    return { ...needOf({ playwright: true, shellThere: true, dxcNeeded: !!(d && d.needed && d.ok) }), dxcNote: d && d.needed && !d.ok ? d.why : null };
}

const USAGE = "usage: node tools/ship/ensureBrowserGatesCmd.mjs [--dry-run] [--cap-mb N]";
export function parseArgs(argv) {
    const given = { dry: false, capMB: null };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--dry-run") given.dry = true;
        else if (argv[i] === "--cap-mb") { const n = Number(argv[++i]); if (!Number.isFinite(n) || n < 0) throw new Error("ensureBrowserGates: --cap-mb is a number, 0 or more (0 = unlimited)"); given.capMB = n; }
        else throw new Error(`ensureBrowserGates: unknown argument ${argv[i]}; ${USAGE}`);
    }
    return given;
}
/** Check, decide, install what the decision allows, check again. Returns the exit code: 0 ready (before or after), 1 anything else. All outside things are seams. */
export function command(argv, io = {}) {
    const log = io.log || console.log, given = parseArgs(argv), eng = io.eng || ENG, spawn = io.spawn || spawnSync;
    const ready = io.readiness || (() => readiness());
    const before = ready();
    if (!before.length) { log("ensureBrowserGates: the browser gates can run here; nothing to install."); return 0; }
    const need = (io.probe || probe)();
    const capMB = given.capMB !== null ? given.capMB : capFromPrefs((io.readPrefs || (() => { try { return fs.readFileSync(PREFS_FILE, "utf8"); } catch { return ""; } }))());
    const free = (io.freeMB || freeMB)(path.join(eng, "tools", "render-qa"));
    const d = decide({ need, capMB, free });
    log(`ensureBrowserGates: the box lacks ${[need.installs ? (need.shellThere ? "Playwright" : need.playwright ? "the browser" : "Playwright and the browser") : null, need.dxc ? "dxcompiler.dll beside the headless shell" : null].filter(Boolean).join(" and ") || "something the probe could not name"}; estimate ${d.estMB} MB (a broad guess); cap ${capMB ? capMB + " MB" : "unlimited"}${given.capMB !== null ? " (this run)" : ""}; free ${free === null ? "unknown" : free + " MB"}.`);
    if (d.action === "ready") { log("ensureBrowserGates: nothing the probe can fix:"); for (const b of before) log("  " + b.what); return 1; }
    if (d.action === "refuse") { log("ensureBrowserGates: NOT installing --"); for (const r of d.reasons) log("  " + r); log("  by hand: " + fixCommand(eng, { playwright: need.playwright, shell: need.shellThere })); return 1; }
    if (given.dry) { log(`ensureBrowserGates: would run: ${d.steps.map((s) => s === "npm" ? "npm " + npmArgs(eng, { playwright: need.playwright, shell: need.shellThere }).join(" ") : "ensureDxc --write").join(" ; ")}   (nothing was run: --dry-run)`); return 1; }
    for (const s of d.steps) {
        if (s === "npm") {
            const inv = (io.npmInvocation || npmInvocation)(), args = [...inv.prefix, ...npmArgs(eng, { playwright: need.playwright, shell: need.shellThere })];
            log(`ensureBrowserGates: running ${inv.cmd} ${args.join(" ")}`);
            const r = spawn(inv.cmd, args, { stdio: "inherit", shell: inv.shell });
            if (r.error || r.status !== 0) { log(`ensureBrowserGates: the install failed (${r.error ? r.error.code || r.error.message : "exit " + r.status}); stopped.`); return 1; }
        } else {
            const r = (io.ensureDxc || ((o) => ensureDxc(o)))({ write: true });
            log(`ensureBrowserGates: DXC: ${r.ok && r.copied && r.copied.length ? "copied " + r.copied.join(", ") + " into " + r.dest : r.why || "nothing copied"}`);
        }
    }
    const after = ready();
    if (after.length) { log("ensureBrowserGates: installed, but the box still cannot run the browser gates:"); for (const b of after) log("  " + b.what); return 1; }
    log("ensureBrowserGates: done; the browser gates can run here."); return 0;
}
