// tools/roundhouse/androidPeer-selfcheck.mjs
//
// Run: node tools/roundhouse/androidPeer-selfcheck.mjs   (<5 s, fully static)
//
// v2919 -- SIX ITEMS. THREE ARE CHECKABLE HERE AND CHECKED; FIVE CLAIMS ONLY A PHONE CAN GRADE, AND THE GATE'S
// JOB FOR THOSE IS TO PROVE THEY WERE REGISTERED BEFORE THE PHONE VOTED.
//
// This gate never claims Android works. It claims the manifest-level PREREQUISITES hold -- no native required
// dependency, a pure roundhouse import graph, specified-operations-only WGSL, a located (and refined) auto-update
// path, a real won't-port inventory -- and that the device-only predictions are frozen. When a real device runs,
// its transcript is compared against ANDROID_REGISTRATION.claim, and any miss is a finding, not an embarrassment.
//
// NOTE ON WHAT THIS RUN ITSELF DEMONSTRATES. This selfcheck executing green is evidence for item 2 at exactly
// one remove: it proves the suite's entry cost is `node <file>` with an empty node_modules. It does NOT prove
// bionic behaves -- this box is glibc. The claim stays registered, not confirmed.

import {
    readBridgeManifest, classifyDeps, DEP_CLASSIFICATION,
    scanRoundhousePurity, okSpecifier, wgslBannedCalls, downloadsPathFacts, wontPortInventory,
    ANDROID_REGISTRATION, androidLines, ENGINE_ROOT,
} from "./androidPeer.mjs";
import { MAGMAP_TOL, F32_FLOOR, WGSL } from "./magmapGpu.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const report = (line) => console.log("  ----  " + line);

// ---- ITEM 1. TERMUX PATH: the manifest has no native blocker -------------------------------------------------------
const pkg = readBridgeManifest();
const deps = classifyDeps(pkg);
{
    ok("!! no native or binary dep in REQUIRED dependencies",
        deps.nativeRequired.length === 0,
        deps.nativeRequired.length ? "BLOCKERS: " + deps.nativeRequired.join(", ")
            : deps.required.length + " required deps, all pure-JS or WASM -- `npm install --omit=optional` has no gyp step");

    ok("every dependency is classified -- the table cannot rot silently",
        deps.unknown.length === 0,
        deps.unknown.length ? "UNCLASSIFIED (add to DEP_CLASSIFICATION with a stated kind): " + deps.unknown.join(", ")
            : Object.keys(DEP_CLASSIFICATION).length + " classifications cover " +
              (deps.required.length + deps.optional.length) + " manifest deps");

    const wasm = deps.required.filter((d) => d.kind === "wasm").map((d) => d.name).sort();
    ok("the WASM four are the WASM four",
        wasm.join(",") === "jolt-physics,libsodium-wrappers,node-unrar-js,opusscript",
        "WASM runs on Node's own runtime; bionic vs glibc is irrelevant to it: " + wasm.join(", "));

    ok("the unportable heavies are OPTIONAL, which is what --omit=optional is for",
        !!(pkg.optionalDependencies && pkg.optionalDependencies["ffmpeg-static"] && pkg.optionalDependencies["puppeteer-core"]),
        "ffmpeg-static (no android binary) and puppeteer-core (no desktop Chrome to drive) skip cleanly");
}

// ---- ITEM 2. THE CHEAPEST REAL PORT TEST: roundhouse purity --------------------------------------------------------
const purity = scanRoundhousePurity();
{
    ok("!! no roundhouse module STATICALLY imports from node_modules",
        purity.staticBare.length === 0,
        purity.staticBare.length ? purity.staticBare.map((b) => b.file + " -> " + b.spec).join("; ")
            : purity.files + " modules import only node: builtins and relative paths -- the suite runs from a bare checkout");

    const bareSpecs = [...new Set(purity.dynamicBare.map((b) => b.spec))];
    const strays = bareSpecs.filter((s) => s !== "@anthropic-ai/sdk");
    ok("bare specifiers appear only as LAZY dynamic imports (the rig-only model caller)",
        strays.length === 0,
        strays.length
            ? "UNEXPECTED BARE SPECIFIER(S): " + strays.join(", ") + " -- each one makes a bare checkout need npm install"
            : "lazy: " + (bareSpecs.join(", ") || "none") + " -- no selfcheck path awaits it, so an empty node_modules stays green");

    // *** THE CLASSIFIER IS TESTED DIRECTLY, BECAUSE IT WAS THE THING THAT WAS WRONG. *** okSpecifier used to
    // allow only ./ ../ and node:, so every `await import("/tools/roundhouse/...")` inside a page.evaluate()
    // body counted as a bare specifier and this check has been RED SINCE v3962 over five browser URLs that
    // cannot reach node_modules. Widening a classifier is exactly the change that can silently stop catching
    // anything, so the widening is bracketed from both sides here rather than trusted.
    const shouldPass = ["./x.mjs", "../y.mjs", "node:fs", "/tools/roundhouse/magmapGpu.mjs",
                        "/vendor/taichi-js/taichi.js", "https://example.com/m.js", "data:text/javascript,0"];
    const shouldFail = ["@anthropic-ai/sdk", "lodash", "playwright", "@scope/pkg/sub", "jolt-physics"];
    const wrongPass = shouldPass.filter((s) => !okSpecifier(s));
    const wrongFail = shouldFail.filter((s) => okSpecifier(s));
    ok("!! the classifier admits relative, absolute and URL specifiers -- none of which is a package",
        wrongPass.length === 0, wrongPass.length ? "WRONGLY FLAGGED: " + wrongPass.join(", ") : shouldPass.length + " forms");
    ok("!! SABOTAGE: ...and still catches every genuinely BARE specifier, which is what node_modules means",
        wrongFail.length === 0,
        wrongFail.length ? "WRONGLY ADMITTED: " + wrongFail.join(", ")
                         : shouldFail.length + " package names, all still flagged -- the widening did not blind it");
    report("the five that were being reported sit INSIDE page.evaluate() bodies, so Node never evaluates them " +
           "at all: rig.html serves the tree from the web root and /tools/... resolves exactly as written. " +
           "This scanner is a regex over source text and cannot tell those apart, which is stated in " +
           "androidPeer.mjs rather than quietly widened -- and it fails SAFE, since a browser cannot resolve a " +
           "bare specifier either without an import map");
}

// ---- ITEM 3. SECOND GPU VENDOR: the WGSL is portable by construction, and the tolerance predates the vendor --------
{
    const hits = wgslBannedCalls(WGSL);
    ok("!! magmap WGSL calls no transcendental -- + - * / sqrt only, trig arrives as CPU-built tables",
        hits.length === 0,
        hits.length ? "BANNED: " + hits.join(", ")
            : "WGSL pins the rounding of none of the transcendentals, so this is the property that makes a second vendor a test rather than a gamble");

    ok("the tolerance a Mali will face was set from the emulated floor, before any second card existed",
        MAGMAP_TOL === 1e-5 && F32_FLOOR < MAGMAP_TOL && MAGMAP_TOL / F32_FLOOR < 3,
        "floor " + F32_FLOOR + ", tol " + MAGMAP_TOL + " (margin " + (MAGMAP_TOL / F32_FLOOR).toFixed(1) + "x) -- " +
        "a mobile GPU passes or fails a number it never negotiated. v2903's rule: earned before the first failure, not after");
}

// ---- ITEM 4. AUTO-UPDATE: refined from 'unmodified' to 'one symlink', by reading the actual path ------------------
const dl = downloadsPathFacts();
{
    ok("!! the updater resolves homedir/Downloads, which does not exist on stock Termux",
        dl.downloadsJoins >= 2 && !dl.downloadsAndroidAware,
        dl.downloadsJoins + " join sites, no termux-aware branch on any Downloads-resolving line. termux-setup-storage " +
        "makes ~/storage/downloads (a symlink to /storage/emulated/0/Download); ~/Downloads is absent. The scans " +
        "are try/catch'd, so the failure mode is an empty world, not a crash");

    ok("registered: exactly ONE symlink and ZERO code changes",
        ANDROID_REGISTRATION.claim.autoUpdateSymlinksRequired === 1,
        "`ln -s ~/storage/downloads ~/Downloads` -- the buildName matcher is path-agnostic and already gated by " +
        "tools/ship/buildName-selfcheck.mjs, so the only untested link is the directory itself. This DOWNGRADES " +
        "the session's 'likely working unmodified' -- the manifest read found the refinement the optimistic read missed");
}

// ---- ITEM 5. PERSISTENCE: nothing here can check it, and the gate's job is to prove that was admitted -------------
{
    const c = ANDROID_REGISTRATION.claim;
    ok("!! the hard part is registered as a prediction, with its failure mode stated",
        c.survivesDozeWithBootWakeLock === true && c.survivesMemoryPressure === false,
        "Termux:Boot (F-Droid) + termux-wake-lock + battery exemption predicted to survive Doze and NOT survive " +
        "memory pressure. If a phone shows the reverse in either direction, the registration is falsified and " +
        "that is the round's result. A real foreground service = a nodejs-mobile wrapper app -- a project, not config");

    ok("the registration was frozen before measurement",
        ANDROID_REGISTRATION.registeredAt === "before-measurement" && Object.isFrozen(ANDROID_REGISTRATION.claim),
        "preRegister freezes the claim object; a phone transcript cannot quietly edit what was predicted");
}

// ---- ITEM 6. WON'T PORT: the inventory is files on disk, not memory ------------------------------------------------
const inv = wontPortInventory();
{
    ok("!! the KPop Listener really is PowerShell, and its non-Windows pipes really hardcode /tmp",
        inv.ps1.length >= 3 && dl.tmpHardcodes > 0 && dl.tmpAllKpop,
        inv.ps1.join(", ") + "; " + dl.tmpHardcodes + " /tmp hardcodes in server.js, all KPop pipe paths -- " +
        "Termux has $PREFIX/tmp, not /tmp, so even the unix branch of this feature assumes a libc'd desktop");

    ok("the GPU Brain's Deno dependency is real in the bridges",
        inv.denoBridges.length >= 3 && ANDROID_REGISTRATION.claim.gpuBrainRunsUnderTermux === false,
        inv.denoBridges.length + " bridges reference the Deno brain. Deno ships glibc builds; proot-distro " +
        "Debian fixes the libc and has no GPU passthrough, so the brain stays off the phone either way");

    ok("the .bat launchers exist and are named as non-goals",
        inv.bats.length >= 1,
        inv.bats.slice(0, 4).join(", ") + " -- launch on Termux is `node ai-bridge/server.js`, no wrapper");
}

// ---- SUMMARY -------------------------------------------------------------------------------------------------------
console.log("");
for (const ln of androidLines({ deps, purity, wgslHits: wgslBannedCalls(WGSL), dl, inv })) console.log("  " + ln);
console.log("");
console.log(fails === 0
    ? "  ALL PASS -- prerequisites hold statically; five claims now wait on real hardware (root: " + ENGINE_ROOT + ")"
    : "  " + fails + " FAILURE(S)");
process.exit(fails ? 1 : 0);
