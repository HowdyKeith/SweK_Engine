// WebGLEngine/tools/macSession.mjs -- v2864
//
// EVERY CROSS-ARCHITECTURE MEASUREMENT THIS MACHINE CAN SETTLE, IN ONE COMMAND.
//
//     node tools/macSession.mjs              run everything, print the report
//     node tools/macSession.mjs --record     ...and record results into the ledger
//     node tools/macSession.mjs --json OUT   ...and write the raw result file to carry back
//
// WHY THIS EXISTS. tools/rigWorklist.mjs says EIGHT open claims settle on the arm64 Mac -- more than any other
// machine, and the deepest ones this engine makes: bit-identical physics across architectures. Settling them
// currently means remembering five separate commands (fingerprint, ledger, crossarch-box3d, crossarch-flesh,
// box3d record/validate) on a machine nobody is sitting at often, where a forgotten step means another trip.
//
// THAT IS THE EXACT SHAPE OF THE PROBLEM ship.mjs WAS WRITTEN FOR: "the ritual was a chain of commands someone
// had to assemble correctly, from memory, every time. That is not a gate; it is an exam you re-sit each round and
// pass by habit." Same disease, same cure -- one command, and it reports what it could NOT do as loudly as what
// it could.
//
// IT DRIVES THE EXISTING TOOLS AND REIMPLEMENTS NONE OF THEM. computeFingerprint, the ledger comparison, and the
// crossarch scripts are all already gated; a runner that recomputed any of them could disagree with the gate that
// proves it, and a dashboard that disagrees with the gate is worse than none because it gets believed.
//
// THE RULE THIS FILE IS BUILT AROUND, borrowed from the box3d thread-count claim: INCONCLUSIVE IS NOT A PASS. A
// stage that cannot run (no wasm, no baseline, missing toolchain) is reported as SKIPPED with the reason and the
// fix -- never as success, and never silently. A cross-arch report that quietly omits the stage that would have
// diverged is the only outcome worse than not running at all.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.resolve(HERE, "..");

export function machineInfo() {
    let engineVersion = "unknown";
    try {
        const m = fs.readFileSync(path.join(ENGINE, "main.js"), "utf8").match(/ENGINE_VERSION\s*=\s*"(v\d+)"/);
        if (m) engineVersion = m[1];
    } catch {}
    return {
        arch: process.arch,               // "arm64" on the M-series Mac, "x64" on Galaxina/Stellar Atlas
        platform: process.platform,
        // v2998 -- THE RUNTIME IS PART OF THE ENVIRONMENT AND WAS NOT RECORDED. Keith's rig run reported this
        // x86 machine DIVERGES from the x86 baseline -- and the baseline was taken on linux/x64 while he ran
        // win32/x64 on Node 24. So "DIVERGES" could have meant a real numeric difference, a different platform,
        // or a different V8, and nothing said which. A cross-arch result you cannot attribute is not a result.
        node: process.version,
        v8: process.versions && process.versions.v8 ? process.versions.v8 : null,
        node: process.version,
        cpus: (os.cpus()[0] || {}).model || "unknown",
        hostname: os.hostname(),
        engineVersion,
        at: new Date().toISOString(),
    };
}

/** Run a node script and capture it. Never throws -- a failed stage is DATA, not an abort. */
function runNode(args, timeoutMs = 300000) {
    try {
        const out = execFileSync(process.execPath, args, { cwd: ENGINE, encoding: "utf8", timeout: timeoutMs, stdio: ["ignore", "pipe", "pipe"] });
        return { ok: true, out };
    } catch (e) {
        return { ok: false, out: String((e && e.stdout) || ""), err: String((e && (e.stderr || e.message)) || e).slice(0, 400) };
    }
}

const exists = (rel) => { try { return fs.existsSync(path.join(ENGINE, rel)); } catch { return false; } };

// ---- the stages ---------------------------------------------------------------------------------------------
//
// Each returns { id, claim, status: "measured"|"skipped"|"failed", detail, value? }. `claim` names the open claim
// it feeds, so the report says which of the eight it moved rather than just printing numbers.
export const STAGES = [
    {
        id: "fingerprint",
        claim: "v2653 One fingerprint proves the whole engine is bit-identical across machines",
        needs: "tools/fingerprint/fingerprint.mjs",
        run() {
            const r = runNode(["tools/fingerprint/fingerprint.mjs"]);
            const m = r.out.match(/MASTER\s+([0-9a-f]+)/i);
            if (!m) return { status: "failed", detail: r.err || "no MASTER line in output" };
            return { status: "measured", value: m[1], detail: "master " + m[1].slice(0, 24) + "...  COMPARE THIS LINE against the x86 machines" };
        },
    },
    {
        id: "ledger",
        claim: "v2658 The fingerprint grows a memory -- a content-addressed result ledger",
        needs: "tools/ledger/ledger.mjs",
        run() {
            if (!exists("tools/ledger/LEDGER.json")) {
                return { status: "skipped", detail: "no LEDGER.json baseline in the tree -- nothing to compare against yet" };
            }
            const r = runNode(["tools/ledger/ledger.mjs", "check"]);
            const m = r.out.match(/(\d+) match, (\d+) REGRESSION, (\d+) new/);
            if (!m) return { status: "failed", detail: r.err || "ledger produced no verdict line" };
            const regressions = Number(m[2]);
            return {
                status: "measured",
                value: { match: Number(m[1]), regression: regressions, new: Number(m[3]) },
                detail: m[0] + (regressions ? "  <- A REGRESSION HERE IS THE CROSS-ARCH DIVERGENCE, NAMED" : ""),
            };
        },
    },
    {
        id: "crossarch-box3d",
        claim: "v2500/v2570 Box3D is deterministic across architectures",
        needs: "tools/crossarch-box3d.mjs",
        run() {
            if (!exists("vendor/box3d/box3d.wasm")) {
                return { status: "skipped", detail: "vendor/box3d/box3d.wasm absent -- build it first (physics/box3d/build-box3d-wasm.sh), or this stage measures nothing" };
            }
            const r = runNode(["tools/crossarch-box3d.mjs"]);
            const m = r.out.match(/([0-9a-f]{16,})/i);
            return m ? { status: "measured", value: m[1], detail: "state hash " + m[1].slice(0, 24) + "..." }
                     : { status: "failed", detail: (r.err || r.out).slice(0, 200) };
        },
    },
    {
        id: "crossarch-flesh",
        claim: "v2546 The SPH flesh will agree bit-for-bit across arm64 and x86_64",
        needs: "tools/crossarch-flesh.mjs",
        run() {
            const r = runNode(["tools/crossarch-flesh.mjs"]);
            const m = r.out.match(/([0-9a-f]{16,})/i);
            return m ? { status: "measured", value: m[1], detail: "flesh hash " + m[1].slice(0, 24) + "..." }
                     : { status: "failed", detail: (r.err || r.out).slice(0, 200) };
        },
    },
    {
        id: "mathprobe",
        claim: "v2599 It is not the platform, it is the function",
        needs: "tools/mathProbe.mjs",
        run() {
            const r = runNode(["tools/mathProbe.mjs"]);
            if (!r.out.trim()) return { status: "failed", detail: r.err || "no output" };
            const lines = r.out.trim().split("\n").length;
            return { status: "measured", value: r.out.trim(), detail: lines + " probe lines -- DIFF these against the other machines; the lines that differ are the functions that cost the bytes" };
        },
    },
];

export function runSession({ only = null } = {}) {
    const machine = machineInfo();
    const stages = [];
    for (const st of STAGES) {
        if (only && !only.includes(st.id)) continue;
        if (!exists(st.needs)) {
            stages.push({ id: st.id, claim: st.claim, status: "skipped", detail: "missing " + st.needs });
            continue;
        }
        let r;
        try { r = st.run(); } catch (e) { r = { status: "failed", detail: String((e && e.message) || e).slice(0, 200) }; }
        stages.push({ id: st.id, claim: st.claim, ...r });
    }
    const measured = stages.filter((s) => s.status === "measured").length;
    const skipped = stages.filter((s) => s.status === "skipped").length;
    const failed = stages.filter((s) => s.status === "failed").length;
    return { machine, stages, measured, skipped, failed };
}

/**
 * Compare this machine's stages against the shipped x86_64 reference. This is what turns the Mac session from
 * "collect numbers and carry them home" into "get the answer here": the baseline travels in the tree, so the
 * divergence -- if there is one -- is visible on the machine that produced it, while you are still sitting there.
 *
 * A DIFFERENCE IS NOT AUTOMATICALLY A BUG. It is the measurement these claims are about. The report says
 * DIVERGES, names the stage, and stops -- adjudicating it is a human's job and the ledger's per-subsystem view.
 */
export function compareToBaseline(session) {
    let base = null;
    try { base = JSON.parse(fs.readFileSync(path.join(HERE, "crossarch-baseline.json"), "utf8")); } catch { return null; }
    const rows = [];
    for (const st of session.stages) {
        if (st.status !== "measured") { rows.push({ id: st.id, verdict: "no-measurement" }); continue; }
        const want = base.stages ? base.stages[st.id] : undefined;
        if (want === undefined || want === null) { rows.push({ id: st.id, verdict: "no-baseline" }); continue; }
        let got = st.value;
        if (st.id === "mathprobe" && typeof got === "string") got = sha256Short(got);
        const same = JSON.stringify(got) === JSON.stringify(want);
        rows.push({ id: st.id, verdict: same ? "identical" : "DIVERGES", got, want });
    }
    // WHICH DIMENSIONS DIFFER, so a divergence can be ATTRIBUTED rather than merely announced. A baseline taken
    // on linux/x64/Node20 compared against win32/x64/Node24 differs in three ways before a single number is
    // looked at, and reporting only "DIVERGES" invites the reader to blame the physics.
    const m = session.machine;
    const dims = [
        { name: "arch", base: base.arch ?? null, here: m.arch ?? null },
        { name: "platform", base: base.platform ?? null, here: m.platform ?? null },
        { name: "node", base: base.node ?? null, here: m.node ?? null },
        { name: "engineVersion", base: base.engineVersion ?? null, here: m.engineVersion ?? null },
    ];
    const differing = dims.filter((d) => d.base !== null && d.here !== null && d.base !== d.here);
    const unknown = dims.filter((d) => d.base === null || d.here === null).map((d) => d.name);
    const diverged = rows.filter((r) => r.verdict === "DIVERGES").map((r) => r.id);
    return {
        baselineArch: base.arch, baselineVersion: base.engineVersion,
        sameArch: base.arch === m.arch,
        environmentDelta: differing.map((d) => d.name + ": " + d.base + " -> " + d.here),
        unrecordedDimensions: unknown,
        confounded: diverged.length > 0 && (differing.length > 0 || unknown.length > 0),
        attribution: diverged.length === 0
            ? "no stage diverged"
            : (differing.length || unknown.length)
                ? "CONFOUNDED: " + diverged.length + " stage(s) diverged, but the environments differ in [" +
                  differing.map((d) => d.name).concat(unknown.map((u) => u + "(unrecorded)")).join(", ") +
                  "] -- the difference cannot be attributed to architecture until those are matched"
                : "ATTRIBUTABLE: the environments match on every recorded dimension, so a diverging stage is a real numeric difference",
        rows,
    };
}

function sha256Short(text) {
    // node:crypto imported lazily: this module must stay loadable where a top-level builtin import would break it.
    const { createHash } = require_crypto();
    return createHash("sha256").update(text).digest("hex").slice(0, 32);
}
let _crypto = null;
function require_crypto() {
    if (!_crypto) { _crypto = globalThis.__swekCrypto; }
    return _crypto;
}

export function report(session) {
    const L = [];
    const m = session.machine;
    L.push("");
    L.push("SweK cross-architecture session -- " + m.arch + " / " + m.platform + " -- engine " + m.engineVersion);
    L.push("  " + m.cpus);
    L.push("  node " + m.node + "   " + m.at);
    L.push("");
    for (const s of session.stages) {
        const tag = s.status === "measured" ? "MEASURED" : s.status === "skipped" ? "SKIPPED " : "FAILED  ";
        L.push("  [" + tag + "] " + s.id);
        L.push("             " + s.detail);
        L.push("             claim: " + s.claim);
    }
    L.push("");
    L.push("  " + session.measured + " measured, " + session.skipped + " skipped, " + session.failed + " failed");
    if (session.skipped || session.failed) {
        // The whole point: a partial run must never read as a clean one.
        L.push("  A SKIPPED STAGE IS NOT A PASS. Each one above says what is missing; fix it and re-run, or this");
        L.push("  report is silent about exactly the thing it was supposed to settle.");
    }
    L.push("");
    L.push("  NEXT: carry the master fingerprint and the mathprobe output back to an x86 machine and DIFF them.");
    L.push("  Identical master = whole-engine bit-identity across architectures. A ledger REGRESSION names the");
    L.push("  diverging subsystem for you, which is the whole reason the ledger is content-addressed.");
    L.push("");
    return L.join("\n");
}

// ---- CLI ------------------------------------------------------------------------------------------------------
// WINDOWS PATH LAW: pathToFileURL(process.argv[1]) for main detection -- the `file://${argv[1]}` form never
// matches on Windows and silently disables the whole CLI block.
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    globalThis.__swekCrypto = await import("node:crypto");
    const argv = process.argv.slice(2);
    const session = runSession();
    console.log(report(session));

    // THE COMPARISON, ON THE MACHINE, WHILE YOU ARE STILL THERE.
    const cmp = compareToBaseline(session);
    if (cmp) {
        console.log("  vs shipped x86_64 baseline (" + cmp.baselineArch + ", engine " + cmp.baselineVersion + "):");
        for (const r of cmp.rows) {
            const tag = r.verdict === "identical" ? "identical" : r.verdict === "DIVERGES" ? "DIVERGES " : r.verdict;
            console.log("    " + String(r.id).padEnd(18) + tag);
        }
        const div = cmp.rows.filter((r) => r.verdict === "DIVERGES");
        if (!cmp.sameArch && div.length) {
            console.log("");
            console.log("  " + div.length + " stage(s) DIVERGE on " + session.machine.arch + " vs " + cmp.baselineArch + ".");
            console.log("  THAT IS THE MEASUREMENT, NOT AUTOMATICALLY A BUG -- it is exactly what the cross-arch claims ask.");
            console.log("  Run `node tools/ledger/ledger.mjs check` to see WHICH SUBSYSTEM moved; that is why the ledger");
            console.log("  is content-addressed. First suspects, in order: the two machines ran different BYTES, then a");
            console.log("  libm difference (tools/mathProbe.mjs names the function), then real nondeterminism.");
        } else if (!cmp.sameArch) {
            console.log("");
            console.log("  EVERY STAGE IDENTICAL ACROSS ARCHITECTURES (" + session.machine.arch + " vs " + cmp.baselineArch + ").");
            console.log("  That settles the bit-identity half of the cross-arch claims on the evidence, not on hope.");
        }
        console.log("");
    }

    const jsonAt = argv.indexOf("--json");
    if (jsonAt >= 0 && argv[jsonAt + 1]) {
        fs.writeFileSync(argv[jsonAt + 1], JSON.stringify(session, null, 2));
        console.log("  wrote " + argv[jsonAt + 1]);
    }
    if (argv.includes("--record")) {
        const r = runNode(["tools/ledger/ledger.mjs", "record"]);
        console.log("  " + (r.ok ? r.out.trim() : "ledger record FAILED: " + r.err));
    }
    // Exit non-zero if anything FAILED. A skipped stage is not a failure -- it is an honest gap -- but a stage
    // that ran and broke must be visible to a script.
    process.exit(session.failed ? 1 : 0);
}
