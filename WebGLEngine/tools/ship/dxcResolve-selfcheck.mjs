// WebGLEngine/tools/ship/dxcResolve-selfcheck.mjs -- v4646
//
// Gates tools/ship/playwrightResolve.mjs's resolveDxcDir() and dxcAdvice(): finding dxil.dll for Dawn's
// D3D12 backend, and naming the remedy at the site where Dawn's own failure is seen.
//
// *** THE PATH IDEA THIS FILE WAS WRITTEN TO GATE IS FALSIFIED, AND SECTION 2 NOW GATES THAT. *** v4646 put
// the DXC directory on the launched browser's PATH and this gate went green on Keith's rig ("win32: DXC dir
// prepended") while microfacetWgsl died on the SAME run with the identical dxil.dll error. The gate was
// truthful and the fix was not: it measured that the PATH was built, which is not the property anybody wanted.
// launchEnv() now returns undefined always, and section 2 holds that line down so the idea cannot come back
// silently.
//
// *** THE WHOLE FILE IS DRIVEN THROUGH INJECTED fs AND platform, WHICH IS THE ONLY WAY IT CAN BE HONEST. ***
// The behaviour under test happens on win32 and this gate runs on posix. A gate that could only watch the
// branch it never takes would be decoration -- so exists/readdir/platform/env are all parameters, every row
// below reaches the Windows path from Linux, and the failure this fixes is reproduced rather than described.
"use strict";
import path from "node:path";
import fsSync from "node:fs";
import { resolveDxcDir, launchEnv, dxcAdvice, DXC_FAULT, DXC_LEAVES,
         SHELL_DIR_SAMPLES } from "./playwrightResolve.mjs";

let fails = 0;
const ok = (n, c, d = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };

const ROOT = "/FAKE-PW";
const ENV = { PLAYWRIGHT_BROWSERS_PATH: ROOT };
// Keith's rig exactly: the shell bundle has the binary and no DXC; the full browser has both.
// The bundle names come from the resolver -- see SHELL_DIR_SAMPLES. Spelling them here put this file on
// playwrightResolve-selfcheck's re-spellers list, correctly: a fixture copy is still a second spelling.
const [FULL_BUNDLE, SHELL_BUNDLE] = SHELL_DIR_SAMPLES;
const SHELL_BIN = path.join(ROOT, SHELL_BUNDLE, "chrome-headless-shell-win64", "chrome-headless-shell.exe");
const FULL_DXIL = path.join(ROOT, FULL_BUNDLE, "chrome-win64", "dxil.dll");
const tree = new Set([SHELL_BIN, FULL_DXIL]);
const fs_ = {
    exists: (p) => tree.has(p),
    readdir: (r) => (r === ROOT ? [...SHELL_DIR_SAMPLES, "ffmpeg-1011"] : (() => { throw new Error("ENOENT"); })()),
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

console.log("\n2. *** THE PATH ROUTE IS DEAD, AND THIS IS WHERE THAT IS HELD DOWN ***");
{
    // Not a style rule. The PATH was measured ARRIVING at the browser on a box where the failure it was
    // supposed to fix survived it verbatim, so any launch env this function returns is a change nobody has
    // evidence for. The row is written against the live function on every platform because the claim is
    // unconditional: there is no box on which this should start carrying an environment again.
    ok("!! *** launchEnv() returns undefined on every platform -- the PATH route was falsified on real hardware ***",
       launchEnv() === undefined && launchEnv({ platform: "win32" }) === undefined,
       "the PATH reached the browser and dxil.dll still failed with Windows Error 87; see the header above launchEnv");
}

console.log("\n3. *** THE REMEDY RIDES ON THE SYMPTOM, NOT ON A GUESS ABOUT A MISSING FILE ***");
{
    const DAWN = "Error: Failed to create device: DynamicLib.Open: dxil.dll Windows Error: 87";
    const a = dxcAdvice(DAWN);
    ok("!! *** Dawn's own message gets the one command measured to fix it ***",
       a.includes("ensureDxc.mjs --write"), a || "(nothing said)");
    ok("  ...and it is reached through a page-error ARRAY too, which is how runInEngineOrigin holds it",
       dxcAdvice(["requestDevice() returned null", DAWN]).includes("ensureDxc.mjs --write"),
       "the reason and the page errors are searched together -- Dawn writes to whichever it likes");

    // THE REFUSALS. dxcAdvice is appended to failure text, so a version that fires on anything would staple a
    // Windows DLL remedy onto every unrelated red in ~109 gates -- noise that reads as a diagnosis.
    ok("!! CONTROL: an ordinary failure gets NO DXC advice",
       dxcAdvice("requestAdapter() returned null -- present is not capable") === "" &&
       dxcAdvice("harness: the page script did not return within 120000 ms") === "",
       "silence on everything that is not this fault");
    ok("!! CONTROL: empty, null and undefined inputs say nothing and do not throw",
       dxcAdvice("") === "" && dxcAdvice(null) === "" && dxcAdvice(undefined) === "" && dxcAdvice([]) === "",
       "the advice is built from failure text, which is exactly where a null arrives");
    ok("  the signature is the distinctive part of Dawn's message, not the word 'dll'",
       DXC_FAULT.test("DynamicLib.Open") && DXC_FAULT.test("dxcompiler.dll") && !DXC_FAULT.test("some other.dll"),
       String(DXC_FAULT));
}

console.log("\n4. AND THE LIVE HARNESS REALLY CARRIES IT, SO THIS IS NOT ONLY FIXTURES");
{
    // The seam is one line in one file; a gate that proves dxcAdvice works while nothing calls it would be the
    // register-of-grievances shape. Read as text because importing webgpuHarness here launches nothing but
    // does pull in three's vendor tree for no reason.
    const src = fsSync.readFileSync(new URL("./webgpuHarness.mjs", import.meta.url), "utf8");
    ok("!! *** runInEngineOrigin imports dxcAdvice AND applies it to its failure reason ***",
       /import \{[^}]*dxcAdvice[^}]*\} from "\.\/playwrightResolve\.mjs"/.test(src) &&
       /dxcAdvice\(\[out\.reason, \.\.\.pageErrors\]\)/.test(src),
       "the ~109 gates that run through this harness inherit the remedy without each having to know it");
}

console.log(`\ndxcResolve-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
