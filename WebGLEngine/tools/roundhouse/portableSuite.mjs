// tools/roundhouse/portableSuite.mjs
//
// v2925 -- THE SUITE WITHOUT A RUNTIME. androidRunner.mjs spawns `node <file>` per gate, which needs
// node:child_process -- fine on Termux (real Node), impossible in a-Shell (no Node at all). But the PHYSICS does
// not need Node: the strict core and the physics modules import nothing but each other. So this file is the
// suite re-expressed as a set of in-process checks that call those pure functions directly and compare against
// closed forms -- no spawning, no fs, no process. It runs identically under Node, a browser <script type=module>,
// and a-Shell's JavaScriptCore.
//
// WHAT THIS IS AND IS NOT. It is a SUBSET -- the arithmetic-only, answer-key-bearing gates, the ones whose whole
// point was cross-architecture bit-agreement. It is NOT the full 38-check suite: anything that shells out, reads
// a fixture, or drives a GPU is out of scope here by construction. That honesty matters for the verdict: an iOS
// peer is graded on the subset it CAN run, never scored against gates it structurally cannot reach. The verdict
// module knows the difference.
//
// EACH CHECK RETURNS { name, ok, got, want, relErr } so the same result object feeds a Node runner, a browser
// page, and the a-Shell reporter without reshaping.

import { strictSin, strictCos } from "../strictTrig.mjs";
import { zeta, piFromZeta } from "../../physics/zeta.js";
import { schwarzschildRadius, iscoRadius } from "../../physics/blackHole.js";

const rel = (got, want) => Math.abs(want) < 1e-300 ? Math.abs(got) : Math.abs(got - want) / Math.abs(want);
const chk = (name, got, want, tol = 1e-10) => { const r = rel(got, want); return { name, ok: r <= tol, got, want, relErr: r, tol }; };

// A pi that is bit-identical everywhere: sqrt(6*zeta(2)). The Basel bridge.
export function checkBasel() {
    return chk("zeta.basel  pi = sqrt(6 zeta(2))", piFromZeta(), Math.PI, 1e-9);
}
// zeta(2) = pi^2/6, zeta(4) = pi^4/90 -- the even zeta closed forms.
export function checkZetaEven() {
    const z2 = chk("zeta(2) = pi^2/6", zeta(2), Math.PI ** 2 / 6, 1e-9);
    const z4 = chk("zeta(4) = pi^4/90", zeta(4), Math.PI ** 4 / 90, 1e-9);
    return [z2, z4];
}
// strict trig against the Pythagorean identity at a spread of angles -- sin^2+cos^2 = 1 to the last bit.
export function checkTrigIdentity() {
    let worst = 0;
    for (let i = 0; i < 64; i++) {
        const t = (i / 64) * 2 * Math.PI - Math.PI;
        const s = strictSin(t), c = strictCos(t);
        worst = Math.max(worst, Math.abs(s * s + c * c - 1));
    }
    return chk("strict-trig  sin^2+cos^2 = 1", 1 + worst, 1, 1e-12);
}
// black hole: the Schwarzschild radius and the ISCO at exactly 3x it, in pure arithmetic.
export function checkBlackHole() {
    const G = 6.674e-11, c = 2.998e8, M = 1.989e30;   // one solar mass
    const rs = schwarzschildRadius(M, G, c);
    const isco = iscoRadius(M, G, c);
    return [chk("blackhole  rs = 2GM/c^2", rs, 2 * G * M / (c * c), 1e-9),
            chk("blackhole  ISCO = 3 rs", isco, 3 * rs, 1e-9)];
}

/** Run the whole portable subset. Pure -- returns a transcript-shaped object with no I/O. */
export function runPortableSuite() {
    const checks = [
        checkBasel(),
        ...checkZetaEven(),
        checkTrigIdentity(),
        ...checkBlackHole(),
    ];
    const pass = checks.filter((c) => c.ok).length;
    return {
        kind: "swek-portable-subset", version: 2925,
        checks, counts: { pass, fail: checks.length - pass, total: checks.length },
        allPass: pass === checks.length,
    };
}

// Node CLI convenience -- but the function above is the real interface, callable from a browser or a-Shell.
if (typeof process !== "undefined" && process.argv && process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
    const r = runPortableSuite();
    for (const c of r.checks) console.log((c.ok ? "  PASS  " : "  FAIL  ") + c.name + "   rel " + c.relErr.toExponential(2));
    console.log("\n  " + r.counts.pass + "/" + r.counts.total + (r.allPass ? " -- portable subset all pass" : " FAILURES"));
}
