// tools/roundhouse/androidPeer.mjs
//
// v2919 -- THE ANDROID PEER, ASSESSED FROM THE MANIFEST. NOT VERIFIED ON A DEVICE.
//
// Everything in this file is a claim about what a phone WILL do, made by reading files on a machine that is not
// a phone. That is a legitimate thing to do -- the dependency manifest, the import graph, and the platform
// switches in server.js are all static facts, and most porting failures are visible in them before any hardware
// is touched -- but it is a different kind of knowledge from a measurement, and the file says so in its name of
// record: every claim below is a PREDICTION TO FALSIFY ON REAL HARDWARE, in the same sense that v2918's basin
// census pre-registered what the sweep would find before it ran.
//
// SIX ITEMS, fixed before any device is powered on:
//
//   1. TERMUX PATH        ai-bridge has no native .node addon in its REQUIRED dependencies. Every required dep
//                         is pure JS or WASM, so `pkg install nodejs && npm install --omit=optional` should
//                         complete and `node server.js` should listen. The usual blocker for Node-on-Android is
//                         a gyp build against bionic; the manifest says that blocker is not present.
//   2. CHEAPEST PORT TEST the roundhouse suite is the first thing to run on the phone, because it is pure Node,
//                         CPU-only, and self-grading: 90+ selfchecks that each print PASS/FAIL against physics.
//                         Statically, every module in tools/roundhouse imports only node: builtins and relative
//                         paths; the only bare specifier in the suite is a LAZY dynamic import of the Anthropic
//                         SDK on the rig-only path, which no selfcheck touches. A green suite on bionic would
//                         also be a real result for the lab itself: a fourth libc for the strict core.
//   3. SECOND GPU VENDOR  Chrome for Android ships WebGPU, and a phone is an Adreno or a Mali -- the magmap
//                         kernel has only ever met one desktop vendor. The kernel was built for exactly this
//                         audition: WGSL restricted to + - * / sqrt with the trig arriving as CPU-built tables,
//                         and MAGMAP_TOL set once from the emulated f32 floor (4.4e-6, tol 1e-5) BEFORE any
//                         second card existed. So a Mali either lands under a tolerance it has never seen and
//                         the portability claim gains a vendor, or it fails and the failure means something.
//                         Either outcome is information, which is the point of setting tolerances early.
//   4. AUTO-UPDATE        REFINED DOWNWARD from "likely works unmodified". The updater and /self/zip resolve
//                         path.join(os.homedir(), "Downloads"). On Termux, homedir is
//                         /data/data/com.termux/files/home, and termux-setup-storage creates
//                         ~/storage/downloads (lowercase, plural) as a symlink to /storage/emulated/0/Download.
//                         ~/Downloads therefore DOES NOT EXIST out of the box. The code scans it with a
//                         try/catch, so nothing crashes -- the updater just sees an empty world. One symlink
//                         (`ln -s ~/storage/downloads ~/Downloads`) should light it up unmodified; the
//                         buildName matcher itself is path-agnostic and already gated. Prediction: works with
//                         exactly one symlink and zero code changes.
//   5. PERSISTENCE        the genuinely hard part, and NOTHING HERE CAN CHECK IT. Android has no daemon
//                         concept. The registered claim: Termux:Boot (the F-Droid build) + termux-wake-lock +
//                         a battery-optimisation exemption gets start-on-boot and Doze survival, and the OS
//                         still reaps the process under memory pressure, because no configuration makes a
//                         Termux process a foreground service. A real service means a wrapper app around
//                         nodejs-mobile -- a project, not a config change. This item exists so the prediction
//                         is on record before a phone gets to vote.
//   6. WON'T PORT         the honest inventory, verified to be real files rather than remembered ones: the
//                         KPop Listener is PowerShell (3 .ps1 files, and every non-win32 pipe path it would
//                         use hardcodes /tmp, which Termux also lacks); the GPU Brain is Deno, which ships
//                         glibc builds only (proot-distro fixes the libc and loses the GPU); the .bat
//                         launchers are Windows by definition; and ffmpeg-static + puppeteer-core are in
//                         optionalDependencies, which is precisely what --omit=optional is for.
//
// WHY A CLASSIFICATION TABLE AND NOT A GREP. Item 1 could be "grep package.json for known native packages and
// pass if none match" -- but an unclassified NEW dependency would then pass silently, which is how a port
// assessment rots. Instead every required and optional dependency must appear in DEP_CLASSIFICATION below with
// a stated kind, and the selfcheck FAILS on any dep the table does not know. Adding a dependency to the bridge
// now requires stating what it is made of. That is the same ratchet as the catalog: coverage enforced, not
// assumed.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { preRegister } from "./corroborate.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ENGINE_ROOT = path.resolve(HERE, "..", "..");   // WebGLEngine/

// ---- ITEM 1: the dependency classification -------------------------------------------------------------------------
//
// kind: "pure-js"  runs anywhere Node runs, bionic included
//       "wasm"     ships a .wasm binary; the WASM runtime is Node's own, so bionic vs glibc is irrelevant
//       "native"   requires a compiled .node addon -- the Termux blocker, if it appears in REQUIRED deps
//       "binary"   downloads a prebuilt platform executable (no android build exists) -- fine only if optional
export const DEP_CLASSIFICATION = {
    "@discordjs/voice":   { kind: "pure-js", note: "voice orchestration; encryption via libsodium-wrappers (wasm), opus via opusscript (wasm)" },
    "@noble/ciphers":     { kind: "pure-js", note: "audited pure-JS crypto" },
    "aedes":              { kind: "pure-js", note: "MQTT broker on node:net" },
    "bonjour-service":    { kind: "pure-js", note: "mDNS on node:dgram" },
    "discord.js":         { kind: "pure-js", note: "zlib-sync/bufferutil accelerators are OPTIONAL peers it runs without" },
    "jolt-physics":       { kind: "wasm",    note: "Jolt compiled to WASM" },
    "libsodium-wrappers": { kind: "wasm",    note: "sodium compiled to WASM (sodium-native would be the native trap; not used)" },
    "mqtt":               { kind: "pure-js", note: "MQTT client" },
    "node-unrar-js":      { kind: "wasm",    note: "unrar compiled to WASM" },
    "openrgb-sdk":        { kind: "pure-js", note: "OpenRGB wire protocol over node:net; pointless on a phone but harmless" },
    "opusscript":         { kind: "wasm",    note: "opus compiled to WASM" },
    "selfsigned":         { kind: "pure-js", note: "cert generation on node-forge" },
    "ws":                 { kind: "pure-js", note: "bufferutil/utf-8-validate accelerators are OPTIONAL peers it runs without" },
    // optionalDependencies -- allowed to be unportable, that is what optional means
    "ffmpeg-static":      { kind: "binary",  note: "prebuilt ffmpeg; no android binary; skipped by --omit=optional" },
    "puppeteer-core":     { kind: "pure-js", note: "pure JS, but drives a desktop Chrome that is not there; optional" },
};

export function readBridgeManifest(root = ENGINE_ROOT) {
    const p = path.join(root, "ai-bridge", "package.json");
    return JSON.parse(fs.readFileSync(p, "utf8"));
}

/** Classify a manifest against the table. Unknown deps are the failure mode, not native ones -- see header. */
export function classifyDeps(pkg) {
    const out = { required: [], optional: [], unknown: [], nativeRequired: [] };
    for (const [name] of Object.entries(pkg.dependencies || {})) {
        const c = DEP_CLASSIFICATION[name];
        if (!c) { out.unknown.push(name); continue; }
        out.required.push({ name, ...c });
        if (c.kind === "native" || c.kind === "binary") out.nativeRequired.push(name);
    }
    for (const [name] of Object.entries(pkg.optionalDependencies || {})) {
        const c = DEP_CLASSIFICATION[name];
        if (!c) { out.unknown.push(name); continue; }
        out.optional.push({ name, ...c });
    }
    return out;
}

// ---- ITEM 2: roundhouse purity -------------------------------------------------------------------------------------
//
// A STATIC import of a bare specifier would make a selfcheck depend on node_modules; a DYNAMIC one is lazy and
// only bites the code path that awaits it (the live rig caller). The scanner distinguishes the two.
const STATIC_IMPORT_RE = /^\s*import\s[^"'(]*["']([^"']+)["']/gm;
const DYNAMIC_IMPORT_RE = /import\(\s*["']([^"']+)["']\s*\)/g;
// *** AN ABSOLUTE PATH IS NOT A BARE SPECIFIER, AND CALLING IT ONE MADE THIS GATE RED FOR 33 VERSIONS. ***
// Only a BARE specifier -- one that is neither relative, absolute, a URL, nor a node: builtin -- can resolve
// into node_modules, and node_modules is the entire subject of this scan. A leading "/" resolves against the
// filesystem root under Node and against the server root in a browser; either way it never reaches a package.
//
// v3962 put `await import("/tools/roundhouse/magmapGpu.mjs")` into the magmap GPU gates and this scanner has
// called it a bare specifier ever since. Those five specifiers sit INSIDE page.evaluate() bodies, so they are
// browser URLs that Node never evaluates at all -- rig.html serves the tree from the web root and they resolve
// exactly as written. The gate was reporting a portability blocker that did not exist.
//
// *** WHAT THIS SCANNER STILL CANNOT DO IS STATED RATHER THAN QUIETLY WIDENED: *** it is a regex over source
// text, so it cannot tell a specifier Node will resolve from one that only ever runs inside page.evaluate().
// That is deliberate and it fails in the SAFE direction -- a browser cannot resolve a bare specifier either,
// without an import map, so a genuinely bare one inside page.evaluate() is still a defect and still flagged.
export const okSpecifier = (s) =>
    s.startsWith("./") || s.startsWith("../") || s.startsWith("/") || s.startsWith("node:") ||
    /^[a-z][a-z0-9+.-]*:/i.test(s);            // any URL scheme -- a URL is not a package either.
// *** THE SCHEME TEST DOES NOT REQUIRE "//", AND THE GATE'S OWN TABLE CAUGHT THAT. *** A first version
// matched /^[a-z][a-z0-9+.-]*:\/\//, which admits http:// and file:// and REJECTS data:text/javascript,0 --
// a data: URL has a scheme and no authority. Requiring the colon alone is still safe: an npm package name
// cannot contain a colon at all, scoped or not, so nothing that reaches node_modules can match this.

export function scanRoundhousePurity(root = ENGINE_ROOT) {
    const dir = path.join(root, "tools", "roundhouse");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".mjs"));
    const staticBare = [], dynamicBare = [];
    for (const f of files) {
        const src = fs.readFileSync(path.join(dir, f), "utf8");
        for (const m of src.matchAll(STATIC_IMPORT_RE)) if (!okSpecifier(m[1])) staticBare.push({ file: f, spec: m[1] });
        for (const m of src.matchAll(DYNAMIC_IMPORT_RE)) if (!okSpecifier(m[1])) dynamicBare.push({ file: f, spec: m[1] });
    }
    return { files: files.length, staticBare, dynamicBare };
}

// ---- ITEM 3: the magmap kernel's WGSL, specified operations only ---------------------------------------------------
//
// The kernel header promises "+ - * / sqrt, no sin, no cos, no pow, no inverseSqrt". On a second GPU vendor that
// promise is the whole ballgame: WGSL pins the rounding of none of the transcendentals, so a kernel that used
// one would be comparing Adreno's sin against the CPU's strictTrig and the tolerance would mean nothing.
// Comments are stripped first, because the header TALKS about the banned functions by name.
const WGSL_BANNED_RE = /\b(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|pow|exp|exp2|log|log2|inverseSqrt|fma)\s*\(/g;

export function wgslBannedCalls(wgslSource) {
    const stripped = String(wgslSource).replace(/\/\/[^\n]*/g, "");
    const hits = [];
    for (const m of stripped.matchAll(WGSL_BANNED_RE)) hits.push(m[1]);
    return hits;
}

// ---- ITEM 4: the auto-update path, read from server.js -------------------------------------------------------------
//
// FIRST DRAFT'S FALSE POSITIVE, KEPT ON RECORD. The android-awareness probe was originally
// /termux|android|emulated/ over ALL of server.js, and it fired -- on adb intents, an Android IP-webcam bridge,
// the .apk MIME type, and a user-agent sniff. None of those is an android-aware DOWNLOADS PATH, which is the
// only thing item 4 asks about. Same lesson as v2918's thermal basin: a detector scoped wider than its question
// finds its own noise. The probe now reads only the lines that resolve a Downloads directory.
export function downloadsPathFacts(root = ENGINE_ROOT) {
    const src = fs.readFileSync(path.join(root, "ai-bridge", "server.js"), "utf8");
    const joins = (src.match(/path\.join\((?:home|os\.homedir\(\)|require\("os"\)\.homedir\(\))\s*,\s*"Downloads"\)/g) || []).length;
    const dlLines = src.split("\n").filter((ln) => /["']Downloads["']/.test(ln));
    const downloadsAndroidAware = dlLines.some((ln) => /termux|emulated\/0|storage\/downloads/i.test(ln));
    const tmpHardcodes = (src.match(/"\/tmp\//g) || []).length;
    const tmpAllKpop = (src.match(/"\/tmp\/KPopListenerPipe/g) || []).length === tmpHardcodes;
    return { downloadsJoins: joins, downloadsAndroidAware, tmpHardcodes, tmpAllKpop };
}

// ---- ITEM 6: the won't-port inventory, as files on disk ------------------------------------------------------------
export function wontPortInventory(root = ENGINE_ROOT) {
    const bridge = path.join(root, "ai-bridge");
    const ls = (d) => { try { return fs.readdirSync(d); } catch { return []; } };
    const ps1 = ls(bridge).filter((f) => f.toLowerCase().endsWith(".ps1"));
    const bats = [...ls(root), ...ls(path.dirname(root))].filter((f) => f.toLowerCase().endsWith(".bat"));
    const denoBridges = ls(bridge).filter((f) => {
        if (!f.endsWith(".js")) return false;
        try { return /\bdeno\b/i.test(fs.readFileSync(path.join(bridge, f), "utf8")); } catch { return false; }
    });
    return { ps1, bats: [...new Set(bats)], denoBridges };
}

// ---- THE PRE-REGISTRATION ------------------------------------------------------------------------------------------
//
// Registered before any phone runs anything. The falsification conditions are stated as measurables a Termux
// session can produce, because "it should mostly work" is not a claim a phone can refute.
export const ANDROID_REGISTRATION = preRegister({
    quantity: "SweK peer viability on Android/Termux, per subsystem",
    claim: {
        npmInstallOmitOptionalSucceeds: true,          // item 1: no gyp, no native required dep
        roundhouseSelfchecksPassOnBionic: true,        // item 2: the strict core's fourth libc
        magmapPassesOnMobileGpuAtRegisteredTol: true,  // item 3: Adreno/Mali under MAGMAP_TOL = 1e-5, set v2903 -- CONFIRMED v2942 on ARM/Mali Valhall (Android 10, Chrome 150): full-grid 441/441 cells worst 5.09e-6, real f32 (1.16x above floor), fellBack=false. Evidence: evidence/magmap-mali-valhall-CONFIRMED.json
        autoUpdateSymlinksRequired: 1,                 // item 4: exactly one (~/Downloads -> ~/storage/downloads), zero code changes
        survivesDozeWithBootWakeLock: true,            // item 5: but NOT memory pressure -- reaping expected
        survivesMemoryPressure: false,                 //         a foreground service needs a wrapper app
        gpuBrainRunsUnderTermux: false,                // item 6: Deno is glibc; proot fixes libc, loses WebGPU
        kpopListenerRunsUnderTermux: false,            //         PowerShell + /tmp pipes, neither exists
    },
    rationale: "assessed from the dependency manifest, the roundhouse import graph, the magmap WGSL source, and " +
        "the platform switches in server.js -- not from a device. The three checkable prerequisites (no native " +
        "required deps, suite purity, specified-ops-only WGSL) are gated statically by the selfcheck; the five " +
        "device-only claims are registered here so real hardware grades them rather than confirms them.",
});

export function androidLines(a) {
    const L = [`android peer -- assessed from the manifest, NOT verified on a device`];
    L.push(`  deps: ${a.deps.required.length} required (${a.deps.required.filter((d) => d.kind === "wasm").length} wasm, ` +
        `rest pure JS), ${a.deps.optional.length} optional, ${a.deps.nativeRequired.length} native REQUIRED, ` +
        `${a.deps.unknown.length} unclassified`);
    L.push(`  roundhouse: ${a.purity.files} modules, ${a.purity.staticBare.length} static bare imports, ` +
        `${a.purity.dynamicBare.length} lazy (rig-only)`);
    L.push(`  magmap WGSL: ${a.wgslHits.length ? "BANNED CALLS: " + a.wgslHits.join(", ") : "specified operations only"}`);
    L.push(`  auto-update: ${a.dl.downloadsJoins} homedir/Downloads joins, downloads-android-aware: ${a.dl.downloadsAndroidAware} -- one symlink predicted`);
    L.push(`  won't port: ${a.inv.ps1.length} .ps1, ${a.inv.denoBridges.length} deno bridges, ${a.inv.bats.length} .bat`);
    return L;
}
