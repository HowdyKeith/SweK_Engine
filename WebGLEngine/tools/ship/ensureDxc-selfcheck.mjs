// WebGLEngine/tools/ship/ensureDxc-selfcheck.mjs -- v4646
//
// Gates tools/ship/ensureDxc.mjs. Like dxcResolve-selfcheck, EVERY row drives the win32 branch from posix
// through injected platform/exists/copy -- the behaviour under test cannot happen on the box running the
// test, and a gate that could only watch the branch it never takes would be decoration.
//
// The controls matter more than the happy path here, because this writes files into somebody's browser
// cache: it must do nothing on a box that does not need it, nothing when it cannot do it correctly, and
// nothing at all without --write.
"use strict";
import path from "node:path";
import { ensureDxc, describe, DXC_FILES } from "./ensureDxc.mjs";
import { SHELL_DIR_SAMPLES } from "./playwrightResolve.mjs";

let fails = 0;
const ok = (n, c, d = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };

const ROOT = "/FAKE-PW", ENV = { PLAYWRIGHT_BROWSERS_PATH: ROOT };
// *** THE BUNDLE DIRECTORY NAMES COME FROM THE RESOLVER, NOT FROM HERE. *** playwrightResolve-selfcheck
// asserts that no file outside the resolver spells a browser directory by hand, and it caught this file and
// dxcResolve-selfcheck doing it in a FIXTURE. It was right to: a rule that exempts fixtures cannot tell one
// from a fifth real copy. SHELL_DIR_SAMPLES is the one spelling, beside the pattern that must match it.
const [FULL_BUNDLE, SHELL_BUNDLE] = SHELL_DIR_SAMPLES;
const SHELL_DIR = path.join(ROOT, SHELL_BUNDLE, "chrome-headless-shell-win64");
const SHELL_BIN = path.join(SHELL_DIR, "chrome-headless-shell.exe");
const FULL_DIR = path.join(ROOT, FULL_BUNDLE, "chrome-win64");
const base = [SHELL_BIN, ...DXC_FILES.map((f) => path.join(FULL_DIR, f))];
const mk = (extra = []) => {
    const set = new Set([...base, ...extra]), copies = [];
    return { set, copies,
             inj: { env: ENV, home: "/nohome", exists: (p) => set.has(p),
                    readdir: (r) => (r === ROOT ? [...SHELL_DIR_SAMPLES] : (() => { throw new Error("ENOENT"); })()),
                    copy: (a, b) => { copies.push([a, b]); set.add(b); } } };
};

console.log("ensureDxc-selfcheck -- the copy that is measured to work, made repeatable\n");

console.log("1. *** THE WIN32 BRANCH, DRIVEN FROM POSIX ***");
{
    const { inj, copies } = mk();
    const dry = ensureDxc({ platform: "win32", shell: SHELL_BIN, ...inj });
    ok("!! *** it plans the copy from the full bundle to the shell's own directory ***",
       dry.needed && dry.ok && dry.dryRun && dry.src === FULL_DIR && dry.dest === SHELL_DIR,
       describe(dry));
    ok("!! *** CONTROL: a dry run copies NOTHING -- the default must not touch the machine ***",
       copies.length === 0, `${copies.length} file(s) written without --write`);

    const w = mk();
    const run = ensureDxc({ platform: "win32", shell: SHELL_BIN, write: true, ...w.inj });
    ok("!! *** with --write both files land beside the binary, which is the directory the loader searches first ***",
       run.ok && run.copied.length === DXC_FILES.length && w.copies.length === DXC_FILES.length &&
       w.copies.every(([, b]) => path.dirname(b) === SHELL_DIR),
       describe(run));
    const again = ensureDxc({ platform: "win32", shell: SHELL_BIN, write: true, ...w.inj });
    ok("  ...and running it a second time does nothing, so it is safe after every playwright install",
       !again.needed && w.copies.length === DXC_FILES.length, describe(again));
}

console.log("\n2. THE REFUSALS, WHICH ARE WHAT KEEP THIS FROM WRITING SOMEWHERE IT SHOULD NOT");
{
    const a = mk();
    ok("!! CONTROL: on a platform with no DXC in the picture it does nothing, even with --write",
       !ensureDxc({ platform: "linux", shell: SHELL_BIN, write: true, ...a.inj }).needed && a.copies.length === 0,
       "linux and darwin load Vulkan and Metal");
    const b = mk();
    const noSrc = ensureDxc({ platform: "win32", shell: SHELL_BIN, write: true, ...b.inj,
                              exists: (p) => p === SHELL_BIN });
    ok("!! CONTROL: when NO bundle carries dxil.dll it refuses and says what would fix it, rather than half-copying",
       noSrc.needed && noSrc.ok === false && b.copies.length === 0 && /playwright install/.test(noSrc.why),
       describe(noSrc));
    const c = mk();
    const partial = ensureDxc({ platform: "win32", shell: SHELL_BIN, write: true, ...c.inj,
                                exists: (p) => p === SHELL_BIN || p === path.join(FULL_DIR, "dxil.dll") });
    ok("!! CONTROL: a source bundle missing ONE of the two is refused whole -- half a toolchain is not a fix",
       partial.ok === false && c.copies.length === 0 && /dxcompiler\.dll/.test(partial.why), describe(partial));
    const d = mk(DXC_FILES.map((f) => path.join(SHELL_DIR, f)));
    ok("!! CONTROL: a box that already has them is left alone",
       !ensureDxc({ platform: "win32", shell: SHELL_BIN, write: true, ...d.inj }).needed && d.copies.length === 0,
       "idempotent, so it can be run without thinking about it");
}

console.log(`\nensureDxc-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
