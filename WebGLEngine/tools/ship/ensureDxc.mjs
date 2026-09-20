// WebGLEngine/tools/ship/ensureDxc.mjs -- v4646
//
// Run: node tools/ship/ensureDxc.mjs [--write]
//
// *** PUT dxil.dll WHERE THE LOADER ACTUALLY LOOKS, WHICH IS THE ONE THING MEASURED TO WORK. ***
//
// Dawn's D3D12 backend loads dxil.dll and dxcompiler.dll. Playwright's chrome-headless-shell-win64 bundle
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
    const missing = DXC_FILES.filter((f) => !exists(path.join(dest, f)));
    if (!missing.length) return { needed: false, why: `already present beside the binary in ${dest}`, copied: [], dest };
    const { dir: src } = resolveDxcDir({ exists, ...rest });
    if (!src) {
        return { needed: true, ok: false, dest, missing,
                 why: "no bundle on this box carries dxil.dll -- a `playwright install chromium` (the FULL browser, " +
                      "not only the headless shell) is what puts one there", copied: [] };
    }
    const have = missing.filter((f) => exists(path.join(src, f)));
    if (have.length !== missing.length) {
        return { needed: true, ok: false, dest, src, missing,
                 why: `found ${src} but it does not carry ${missing.filter((f) => !have.includes(f)).join(", ")}`, copied: [] };
    }
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
