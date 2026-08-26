// WebGLEngine/tools/render-qa/deviceOwed.mjs — v3339
// ---------------------------------------------------------------------------------------------------------------
// PAGES THAT OWE A MEASUREMENT, AND THE STATE THAT KEEPS "RENDERED" FROM READING AS "VERIFIED".
//
// server.html already tracks per-page run state and gets the hard part right -- its own comment says "NEVER RUN
// is deliberately distinct from PASS. A page nobody has tested and a page that passed look the same in any list
// that only has two states, and they are not the same claim." That list is driven by render-qa/manifest.json,
// which tracks 54 pages.
//
// *** AND NONE OF THE FIVE PAGES THAT ACTUALLY OWE A MEASUREMENT ARE IN IT. *** hmc-bench, ising-bench,
// magmap-bench, consistency-fleet and floor-atlas appear only as links in a pageSections drawer, which records
// WHERE a page lives and not WHETHER IT HAS EVER SAID ANYTHING. They are findable and unaccountable: the very
// machinery that would stop them being ignored is pointed somewhere else.
//
// *** AND THE OBVIOUS FIX IS A TRAP. *** Adding them to the render-qa manifest would show "never run", then
// "pass" after a rig run -- but render-QA screenshots a page and checks pixel invariants, while these pages need
// a GPU run that SUBMITS A REPORT TO THE FLEET. Those are different claims. A green "pass" meaning "the page
// rendered" while reading as "the kernel is verified" is exactly the conflation this tree keeps punishing, and it
// would be worse than the current silence because it would look like an answer.
//
// So there are THREE states here, not two:
//     RENDERED        -- the page loaded and its pixel invariants held. render-QA can establish this.
//     VERDICT-OWED    -- it rendered, and the measurement it exists to produce has never arrived.
//     VERDICT-IN      -- a report of the declared kind is on file.
// The middle state is the whole point. It is the one that cannot be reached by rendering harder.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Pages whose purpose is to produce a MEASUREMENT, not merely to render. Each names the submission kind that
 * settles it, so "has this been done" is answered by looking for that kind rather than by anyone's memory.
 */
export const OWES_VERDICT = {
    "hmc-bench.html": { kind: "swek-hmc-bench", what: "WGSL leapfrog kernel graded against the CPU mirror at a measured f32 floor" },
    "ising-bench.html": { kind: "swek-ising-bench", what: "Philox checkerboard kernel at ZERO tolerance -- bit-exact or rejected" },
    "magmap-bench.html": { kind: "swek-magmap-bench", what: "magnetostatics kernel against its float-gap floor" },
    "consistency-fleet.html": { kind: "swek-consistency-route", what: "one side of a consistency-board pair, run on a peer" },
    "floor-atlas.html": { kind: null, what: "aggregates submitted floors; it is a READER, so it owes nothing itself and is listed to say so" },
};

/**
 * Which submission kinds have ever been received, read from the directory ai-bridge/androidPeerBridge.js's
 * /android/submit endpoint actually writes to (CFG.roundhouseDir there) -- tools/roundhouse, not ai-bridge/fleet.
 * v3339 pointed this at ai-bridge/fleet, a directory nothing has ever written a bench report to (it does not even
 * exist); ai-bridge/fleetBridge.js owns /fleet/announce, an unrelated peer-join/leave broadcast with no JSON files
 * of its own. Every real submission landed in tools/roundhouse and this reader never looked there, so
 * receivedKinds() returned empty forever regardless of what the fleet had actually confirmed -- the exact
 * writer/reader mismatch this file's own header warns "rendering harder" cannot fix.
 */
export function receivedKinds({ dir = null } = {}) {
    const d = dir || path.join(ENG, "tools", "roundhouse");
    const seen = new Set();
    const add = (obj) => { if (obj && typeof obj.kind === "string") seen.add(obj.kind); };
    try {
        for (const f of fs.readdirSync(d)) {
            if (!f.endsWith(".json")) continue;
            try { add(JSON.parse(fs.readFileSync(path.join(d, f), "utf8"))); } catch { /* a malformed file is not a verdict */ }
        }
        const sub = path.join(d, "submissions");
        if (fs.existsSync(sub)) for (const f of fs.readdirSync(sub)) {
            if (!f.endsWith(".json")) continue;
            try { add(JSON.parse(fs.readFileSync(path.join(sub, f), "utf8"))); } catch { /* ditto */ }
        }
    } catch { /* no roundhouse directory yet is a legitimate state and is reported, not thrown */ }
    return seen;
}

/**
 * The register. `rendered` is whatever render-QA knows (a set of page names that have passed a render run); it is
 * OPTIONAL, because the middle state does not depend on it -- a page can owe a verdict whether or not anyone has
 * screenshotted it.
 */
export function audit({ rendered = new Set(), dir = null } = {}) {
    const seen = receivedKinds({ dir });
    const rows = [];
    for (const [page, spec] of Object.entries(OWES_VERDICT)) {
        const exists = fs.existsSync(path.join(ENG, page));
        const owes = spec.kind != null;
        const hasVerdict = owes ? seen.has(spec.kind) : true;
        rows.push({
            page, exists, kind: spec.kind, what: spec.what,
            rendered: rendered.has(page),
            state: !owes ? "READER" : (hasVerdict ? "VERDICT-IN" : "VERDICT-OWED"),
        });
    }
    return { rows, owed: rows.filter((r) => r.state === "VERDICT-OWED"), receivedKinds: [...seen] };
}

export function owedLines(a) {
    const out = [];
    if (!a.owed.length) return ["every page that owes a measurement has one on file"];
    out.push(`${a.owed.length} page(s) OWE A DEVICE VERDICT -- rendering them again cannot settle this:`);
    for (const r of a.owed) out.push(`  ${r.page}  (needs a "${r.kind}" submission)  -- ${r.what}`);
    out.push(`  received kinds so far: ${a.receivedKinds.length ? a.receivedKinds.join(", ") : "NONE"}`);
    return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const a = audit({});
    // v3342 -- NAME ITSELF. The front-door gate requires it and the requirement is right: two reports sharing
    // a terminal are unattributable otherwise. Missing since this file shipped one patch ago.
    console.log("[deviceOwed] which bench pages owe a verdict -- tools/render-qa/deviceOwed.mjs");
    for (const l of owedLines(a)) console.log(l);
}
