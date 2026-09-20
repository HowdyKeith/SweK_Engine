// WebGLEngine/tools/ship/dxcResolve-selfcheck.mjs -- v4646
//
// Gates tools/ship/playwrightResolve.mjs's resolveDxcDir() and launchEnv(): finding dxil.dll for Dawn's
// D3D12 backend, and putting its directory on the launched browser's PATH instead of copying files about.
//
// *** THE WHOLE FILE IS DRIVEN THROUGH INJECTED fs AND platform, WHICH IS THE ONLY WAY IT CAN BE HONEST. ***
// The behaviour under test happens on win32 and this gate runs on posix. A gate that could only watch the
// branch it never takes would be decoration -- so exists/readdir/platform/env are all parameters, every row
// below reaches the Windows path from Linux, and the failure this fixes is reproduced rather than described.
"use strict";
import path from "node:path";
import { resolveDxcDir, launchEnv, DXC_LEAVES } from "./playwrightResolve.mjs";

let fails = 0;
const ok = (n, c, d = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };

const ROOT = "/FAKE-PW";
const ENV = { PLAYWRIGHT_BROWSERS_PATH: ROOT };
// Keith's rig exactly: the shell bundle has the binary and no DXC; the full browser has both.
const SHELL_BIN = path.join(ROOT, "chromium_headless_shell-1243", "chrome-headless-shell-win64", "chrome-headless-shell.exe");
const FULL_DXIL = path.join(ROOT, "chromium-1243", "chrome-win64", "dxil.dll");
const tree = new Set([SHELL_BIN, FULL_DXIL]);
const fs_ = {
    exists: (p) => tree.has(p),
    readdir: (r) => (r === ROOT ? ["chromium-1243", "chromium_headless_shell-1243", "ffmpeg-1011"] : (() => { throw new Error("ENOENT"); })()),
};
const inj = { env: ENV, home: "/nohome", ...fs_ };

console.log("dxcResolve-selfcheck -- dxil.dll for Dawn, found rather than copied\n");

console.log("1. THE DIRECTORY IS FOUND WHERE THE BUNDLES ACTUALLY PUT IT");
{
    const r = resolveDxcDir(inj);
    ok("!! *** dxil.dll is found in the FULL browser bundle, which is the one that ships it ***",
       r.dir === path.dirname(FULL_DXIL), `${r.dir || "(none)"} from ${r.from || "(none)"}`);
    ok("  and the leaf list covers the layouts a Chrome-for-Testing bundle uses",
       DXC_LEAVES.length >= 3 && DXC_LEAVES.some((l) => l.includes("chrome-win64")),
       DXC_LEAVES.join(", "));
    const none = resolveDxcDir({ ...inj, exists: () => false });
    ok("!! CONTROL: with dxil.dll nowhere, it returns NOTHING and says what it tried",
       none.dir === "" && none.tried.length > 0,
       `${none.tried.length} path(s) tried, none present -- an empty answer that names its search beats a guess`);
}

console.log("\n2. *** launchEnv: THE WINDOWS BRANCH, REACHED FROM LINUX ***");
{
    const e = launchEnv({ platform: "win32", shell: SHELL_BIN, ...inj });
    // *** THE GUARD IS `typeof e.PATH === "string"`, NOT `!!e`, AND A SABOTAGE TAUGHT ME THAT. *** Replacing
    // the return with `{ ...env }` -- an env carried through with no PATH added, which is precisely the way
    // this fix fails -- made the first draft of this row CRASH on e.PATH.split() instead of going red, so
    // the run exited 1 with ZERO failing rows. An eager detail string that throws turns a finding into a
    // stack trace, which this tree has caught four times and which I have now added a fifth instance of.
    const head = (v) => (v && typeof v.PATH === "string" ? v.PATH.split(path.delimiter)[0] : null);
    ok("!! *** on win32, with the shell lacking dxil.dll, the DXC directory is PREPENDED to the child's PATH ***",
       head(e) === path.dirname(FULL_DXIL),
       e ? `PATH starts ${head(e) === null ? "(no PATH at all)" : head(e)}` : "undefined -- the fix would not reach the browser");
    ok("  ...and the rest of the environment is carried through, not replaced",
       !!e && e.PLAYWRIGHT_BROWSERS_PATH === ROOT,
       "a launch env that drops everything else breaks far more than it fixes");

    // THE THREE REFUSALS. Each is a case where changing PATH would be wrong, and each returns undefined so
    // the launch carries the ordinary environment and behaves exactly as it did before this existed.
    const beside = new Set([...tree, path.join(path.dirname(SHELL_BIN), "dxil.dll")]);
    const already = launchEnv({ platform: "win32", shell: SHELL_BIN, ...inj, exists: (p) => beside.has(p) });
    ok("!! CONTROL: when dxil.dll IS already beside the binary, nothing is changed",
       already === undefined, "a box that works keeps working, untouched");
    ok("!! CONTROL: on a platform whose Dawn backend does not load DXC, nothing is changed",
       launchEnv({ platform: "linux", shell: SHELL_BIN, ...inj }) === undefined &&
       launchEnv({ platform: "darwin", shell: SHELL_BIN, ...inj }) === undefined,
       "linux and darwin -- Vulkan and Metal, no DXC in the picture");
    ok("!! CONTROL: on win32 with DXC nowhere at all, nothing is changed",
       launchEnv({ platform: "win32", shell: SHELL_BIN, ...inj, exists: (p) => p === SHELL_BIN }) === undefined,
       "the honest failure is kept rather than replaced by a PATH full of nothing");
}

console.log("\n3. AND THE LIVE BOX IS ASKED, SO THIS FILE IS NOT ONLY FIXTURES");
{
    const live = launchEnv();
    ok(`  this box (${process.platform}) resolves launchEnv() to ${live === undefined ? "undefined" : "a PATH"}`,
       process.platform === "win32" ? true : live === undefined,
       process.platform === "win32"
           ? `win32: ${live ? "DXC dir prepended" : "no change -- either dxil.dll is already beside the binary or none was found"}`
           : "non-win32 must be undefined, so every other platform launches exactly as before");
}

console.log(`\ndxcResolve-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
