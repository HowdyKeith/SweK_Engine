// WebGLEngine/tools/ship/demosReach.mjs -- v4425
//
// *** demos_code/ IS 56 FILES AND 19,110 LINES, AND IT IS EXCLUDED FROM EVERY SCANNER THAT DECIDES WHAT SHIPS. ***
//
// v4412 renamed a GLSL `fireRamp` in demos_code/fitzhugh_nagumo.js to `infernoRamp`, because one name meant two
// different colour ramps and nothing had noticed for 4,412 versions. Its own closing note said why: demos_code
// is outside staleness.mjs's walk, "and widening that scan is its own round". This is that round.
//
// MEASURED, and the exclusion is real and in two places:
//
//     tools/ship/staleness.mjs:40        SKIP = /node_modules|...|GPU_Assets|demos_code/
//     tools/ship/buildKnowledgeIndex.mjs SKIP = /node_modules|...|GPU_Assets|demos_code/
//
// staleness.mjs's gateFiles() is what countGateFiles(), the knowledge index and the affected-file filter all
// read, so a gate living in demos_code would exist, pass by hand, and NEVER RUN ON A SHIP -- which is exactly
// the defect that file's own header records for the old `[\\/]vendor` pattern.
//
// ---- *** THE FIRST THING TO CHECK IS WHETHER THAT DEFECT HAS ALREADY HAPPENED. IT HAS NOT. *** -------------
//
//     gates (*-selfcheck.mjs) inside demos_code/     0
//
// So nothing is currently hidden, and the exclusion costs COVERAGE rather than correctness. Saying that
// plainly is worth more than implying a disaster: the vendor defect bit because a gate WAS there, and here
// none is. What the check below does is make that a standing fact rather than today's luck.
//
// ---- WHAT THE EXCLUSION HAS BEEN HIDING, MEASURED RATHER THAN FEARED ----------------------------------------
//
//     function names defined in demos_code/                      242   (comments stripped, v4424's rule)
//     of those, names ALSO exported from the scanned tree           7
//
//         sha256          demos_code/bitcoin_miner.js   vs  tools/roundhouse/updatePolicy.mjs
//         mat4Identity    demos_code/texture_studio.js  vs  engine/xrSession.mjs
//         render, frame, initGL, setMode, buildPlane    -- generic names, different jobs, no shared contract
//
// *** AND EVERY COLLISION THAT HAS AN ORACLE AGREES. *** After v4412's fireRamp this file expected to find more
// traps and did not, which is a result rather than a disappointment:
//
//     sha256        demos_code hand-rolls SHA-256; updatePolicy uses node crypto. 3 of 3 NIST vectors pass
//                   and 200 of 200 random inputs hash IDENTICALLY to node's. The demo's header claims "real
//                   double-SHA-256" and "byte-identical hashes" -- BOTH TRUE, AND NEVER ONCE CHECKED.
//     mat4Identity  one returns a Float32Array via an out-param, the other a plain Array; the sixteen values
//                   are the same matrix. Different container, same mathematics.
//
// v4412's fireRamp WAS a real trap and these are not, and the difference is worth naming: THAT collision was
// between two COLOUR RAMPS, where "the same name" implied "the same curve" and the curves differed. These are
// between two implementations of a STANDARD -- and a standard has a known answer to test against, which is
// exactly why one could be caught by reading and the others by running.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DEMOS = path.join(ENG, "demos_code");

/** The scanners that exclude it, so the gate asserts the exclusion is where this file says it is. */
export const EXCLUDED_BY = Object.freeze(["tools/ship/staleness.mjs", "tools/ship/buildKnowledgeIndex.mjs"]);

export const demoFiles = () =>
    fs.readdirSync(DEMOS).filter((f) => /\.(js|mjs)$/.test(f)).sort();

/** Gates hiding inside the excluded directory. MUST be empty, or they exist and never run on a ship. */
export const hiddenGates = () => demoFiles().filter((f) => /-selfcheck\.mjs$/.test(f));

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/** Every function name demos_code defines, from CODE rather than prose (v4424's lesson, applied by default). */
export function demoFunctionNames() {
    const names = new Map();
    for (const f of demoFiles()) {
        const src = stripComments(fs.readFileSync(path.join(DEMOS, f), "utf8"));
        for (const m of src.matchAll(/(?:^|\n)\s*(?:export\s+)?function\s+([A-Za-z_$][\w$]*)/g))
            names.set(m[1], (names.get(m[1]) || []).concat("demos_code/" + f));
    }
    return names;
}

/** Every name the SCANNED tree exports, for the collision comparison. */
export function exportedNames(root = ENG) {
    const skip = new Set(["node_modules", ".git", "vendor", "GPU_Assets", "demos_code"]);
    const out = new Map();
    const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (skip.has(e.name)) continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) walk(p);
            else if (/\.(js|mjs)$/.test(e.name)) {
                const src = stripComments(fs.readFileSync(p, "utf8"));
                for (const m of src.matchAll(/(?:^|\n)\s*export\s+function\s+([A-Za-z_$][\w$]*)/g))
                    out.set(m[1], (out.get(m[1]) || []).concat(path.relative(root, p).replace(/\\/g, "/")));
            }
        }
    };
    walk(root);
    return out;
}

/** Names defined in demos_code that are also exported by the scanned tree. Short names are noise, not signal. */
export function collisions() {
    const demo = demoFunctionNames(), tree = exportedNames();
    return [...demo.keys()].filter((n) => tree.has(n) && n.length > 4).sort()
        .map((n) => ({ name: n, demo: demo.get(n), tree: tree.get(n) }));
}

/** NIST FIPS 180-4 known-answer vectors. A standard has a right answer and this is it. */
export const SHA256_KAT = Object.freeze([
    Object.freeze(["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"]),
    Object.freeze(["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"]),
    Object.freeze(["abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
                   "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"]),
]);

export const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** What v4425 measured. Re-take with: node tools/ship/demosReach-selfcheck.mjs */
export const MEASURED_AT_V4425 = Object.freeze({
    files: 56, lines: 19110, hiddenGates: 0,
    functionNames: 242, collisions: 7,
    sha256: Object.freeze({ nistVectors: 3, nistPassing: 3, randomInputs: 200, randomDisagreeing: 0 }),
    // The collision list, by NAME, so an arrival can be pointed at rather than inferred (v4424's rule).
    collisionNames: Object.freeze(["buildPlane", "frame", "initGL", "mat4Identity", "render", "setMode", "sha256"]),
});
