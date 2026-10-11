// WebGLEngine/tools/ship/ensureDxc.mjs -- v4646
//
// Run: node tools/ship/ensureDxc.mjs [--write]
//
// *** PUT dxil.dll WHERE THE LOADER ACTUALLY LOOKS, WHICH IS THE ONE THING MEASURED TO WORK. ***
//
// Dawn's D3D12 backend loads dxcompiler.dll (and, before Chrome 156, dxil.dll). Playwright's chrome-headless-shell-win64 bundle
// ships neither; the full chrome-win64 bundle of the SAME Chrome for Testing build ships both. The tree
// prefers the shell on purpose (playwrightResolve.mjs's v4486 note: 96 gates were calibrated against it), so
// on Windows every browser-side requestDevice dies with "DynamicLib.Open: dxil.dll Windows Error: 87".
//
// TWO FIXES WERE TRIED. Copying the two files by hand into the shell's directory WORKED -- headlessGpu-
// selfcheck went 3 FAIL to ALL GREEN -- and then did not travel: the next run under a different Windows user
// had a different %LOCALAPPDATA% and the fault was back verbatim. Prepending the DXC directory to the
// launched browser's PATH was tried next and IS MEASURED NOT TO WORK: the PATH reached the browser and the
// error did not change. See launchEnv()'s own header for that falsification and its hypothesis.
//
// So this is the first fix, made repeatable: the same copy, done by a command that can be re-run after every
// `playwright install` wipes it, on any box, without anybody remembering which two files or where from.
//
// *** IT IS A COMMAND AND NOT A HARNESS SIDE EFFECT, DELIBERATELY. *** Copying files into somebody's browser
// cache is not something a gate should do while pretending to measure. The harness DETECTS and names this
// command in its skip reason; running it is a person's decision, once per box.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveDxcDir, HEADLESS_SHELL } from "./playwrightResolve.mjs";

export const DXC_FILES = Object.freeze(["dxil.dll", "dxcompiler.dll"]);
// *** v4821 -- ONLY dxcompiler.dll IS REQUIRED; dxil.dll IS COPIED WHEN THE SOURCE BUNDLE HAS ONE. *** Chrome 156's
// full bundle ships dxcompiler.dll alone (see DXC_LEAVES in playwrightResolve.mjs), and its Dawn asks for nothing
// else -- the rig's error named dxcompiler.dll. Requiring both made the remedy refuse on every box with that build.
// Older bundles carry both and still get both: the copy follows the source, it does not invent a pair.
export const DXC_REQUIRED = Object.freeze(["dxcompiler.dll"]);

/**
 * What would be done, or was. Pure enough to gate: every filesystem touch is injectable, and `write` false
 * reports the plan without performing it.
 */
export function ensureDxc({ platform = process.platform, shell = undefined, write = false,
                            exists = fs.existsSync, copy = fs.copyFileSync, ...rest } = {}) {
    const bin = shell === undefined ? HEADLESS_SHELL : shell;
    if (platform !== "win32") return { needed: false, why: `${platform} does not load DXC -- Vulkan and Metal have no dxil.dll`, copied: [] };
    if (!bin) return { needed: false, why: "no headless shell resolved, so there is nothing to put them beside", copied: [] };
    const dest = path.dirname(bin);
    const there = (f) => exists(path.join(dest, f));
    const present = `already present beside the binary in ${dest}`;
    const { dir: src } = resolveDxcDir({ exists, ...rest });
    if (!src) {
        if (DXC_REQUIRED.every(there)) return { needed: false, why: present, copied: [], dest };
        return { needed: true, ok: false, dest, missing: DXC_REQUIRED.filter((f) => !there(f)),
                 why: "no bundle on this box carries dxcompiler.dll -- a `playwright install chromium` (the FULL browser, " +
                      "not only the headless shell) is what puts one there", copied: [] };
    }
    const lacking = DXC_REQUIRED.filter((f) => !exists(path.join(src, f)));
    if (lacking.length) {
        return { needed: true, ok: false, dest, src, missing: lacking,
                 why: `found ${src} but it does not carry ${lacking.join(", ")}`, copied: [] };
    }
    // what the source carries and the shell's directory does not: the required file always, dxil.dll when it exists
    const missing = DXC_FILES.filter((f) => !there(f) && exists(path.join(src, f)));
    if (!missing.length) return { needed: false, why: present, copied: [], dest };
    if (!write) return { needed: true, ok: true, dryRun: true, dest, src, missing, copied: [] };
    const copied = [];
    for (const f of missing) { copy(path.join(src, f), path.join(dest, f)); copied.push(f); }
    return { needed: true, ok: true, dest, src, missing, copied };
}

export function describe(r) {
    if (!r.needed) return `nothing to do: ${r.why}`;
    if (!r.ok) return `CANNOT: ${r.why}`;
    if (r.dryRun) return `WOULD COPY ${r.missing.join(", ")} from ${r.src} to ${r.dest} -- re-run with --write`;
    return `copied ${r.copied.join(", ")} from ${r.src} to ${r.dest}`;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const r = ensureDxc({ write: process.argv.includes("--write") });
    console.log("[ensureDxc] " + describe(r));
    // A box that does not need this is not a failure, and a box that cannot do it is. The exit code says which.
    process.exit(r.needed && r.ok === false ? 1 : 0);
}
