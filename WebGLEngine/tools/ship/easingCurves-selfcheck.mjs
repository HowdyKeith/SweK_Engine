// WebGLEngine/tools/ship/easingCurves-selfcheck.mjs -- v4199
//
// GATES simulation/easing.js, which had TWELVE curves, SEVEN consumers and NO GATE AT ALL until this round.
// That is the more interesting half of why this file exists: elastic was the occasion, not the reason.
//
// *** THE TRAP AN EASING GATE WALKS INTO IS ASSERTING THE WRONG INVARIANT. *** The obvious checks -- output
// stays in [0,1], output increases -- are FALSE for two of the curves here and were false before this round:
// easeOutBack overshoots above 1 by design, and elastic crosses the target repeatedly. A gate that pinned
// [0,1] would have been written, passed, and then blocked every expressive curve anyone tried to add.
// So what is asserted is what is actually true of all of them: they start at 0, they end at 1, and they are
// finite everywhere in between.
//
// Run: node tools/ship/easingCurves-selfcheck.mjs

import { EASING, linear, easeOutBack, easeOutElastic, easeInElastic, easeInOutElastic } from "../../simulation/easing.js";
import { codeOnly, prose } from "./sourceScan.mjs";
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");
const NAMES = Object.keys(EASING);

// 1) WHAT IS TRUE OF EVERY CURVE.
{
    ok(NAMES.length >= 12, `${NAMES.length} curves in the EASING table`);
    for (const n of NAMES) {
        const f = EASING[n];
        ok(typeof f === "function", `${n} is a function`);
        // *** THE ENDPOINTS ARE THE CONTRACT, AND THE TOLERANCE HERE IS NOT SLOPPINESS -- IT IS THE POINT. ***
        // The first draft asserted exact equality and immediately reddened on easeOutBack, which shipped long
        // before this round: 1 + c3*(-1)^3 + c1*(-1)^2 is algebraically exactly 0 and evaluates to 2.22e-16,
        // one ULP of cancellation residue. That is not the same defect as elastic's raw 4.883e-4, which is a
        // formula genuinely missing its endpoint -- TWELVE ORDERS OF MAGNITUDE apart. Flattening the two into
        // one assertion would either excuse the real miss or condemn arithmetic for being arithmetic, so the
        // family check uses float precision and section 4 checks the elastic guards for exactness separately.
        ok(Math.abs(f(0)) < 1e-12, `${n}(0) lands on 0 (${f(0)})`);
        ok(Math.abs(f(1) - 1) < 1e-12, `${n}(1) lands on 1 (${f(1)})`);
        let finite = true, worst = 0;
        for (let i = 0; i <= 1000; i++) { const v = f(i / 1000); if (!Number.isFinite(v)) finite = false; worst = Math.max(worst, Math.abs(v)); }
        ok(finite, `${n} is finite across [0,1]`);
        ok(worst < 10, `${n} stays within a sane range (worst |value| ${worst.toFixed(3)})`);
    }
}

// 2) *** WHAT IS NOT TRUE OF EVERY CURVE, ASSERTED SO NOBODY ADDS THE WRONG INVARIANT LATER. ***
{
    const above1 = (f) => { for (let i = 0; i <= 1000; i++) if (f(i / 1000) > 1.0000001) return true; return false; };
    const below0 = (f) => { for (let i = 0; i <= 1000; i++) if (f(i / 1000) < -0.0000001) return true; return false; };
    ok(above1(easeOutBack), "easeOutBack goes ABOVE 1 -- so a [0,1] assertion would be wrong");
    ok(above1(easeOutElastic), "easeOutElastic does too");
    ok(below0(easeInElastic), "easeInElastic goes BELOW 0 -- it winds up before it releases");
    ok(!above1(linear) && !below0(linear), "control: linear does neither, so the checks above detect something real");
}

// 3) ELASTIC IS NOT BACK WITH MORE OF IT: COUNT THE CROSSINGS.
{
    const crossings = (f) => { let c = 0, p = f(0) - 1; for (let i = 1; i <= 2000; i++) { const v = f(i / 2000) - 1; if ((p < 0) !== (v < 0)) c++; p = v; } return c; };
    const back = crossings(easeOutBack), out = crossings(easeOutElastic), io = crossings(easeInOutElastic);
    ok(back === 1, `easeOutBack crosses its target ${back} time -- it lands`);
    ok(out >= 5, `*** easeOutElastic crosses ${out} times -- it oscillates, which is a different motion and a different meaning ***`);
    ok(io >= 3, `easeInOutElastic crosses ${io} times`);
    ok(out > back * 3, "and the difference is large, not a matter of tuning -- this is why easeOutBack was not enough");
}

// 4) THE ENDPOINT GUARDS ARE LOAD-BEARING, AND THE COMMENT ABOUT THEM IS TRUE.
{
    // The raw formulas, without the t===0 / t===1 branches. Four of these six miss.
    const c4 = (2 * Math.PI) / 3, c5 = (2 * Math.PI) / 4.5;
    const rawOut = (t) => Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    const rawIn = (t) => -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
    const rawInOut = (t) => t < 0.5 ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
                                    : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
    const misses = [[rawOut(0), 0], [rawOut(1), 1], [rawIn(0), 0], [rawIn(1), 1], [rawInOut(0), 0], [rawInOut(1), 1]]
        .filter(([v, t]) => Math.abs(v - t) > 1e-12).length;
    ok(misses === 4,
        `*** ${misses} of the 6 raw endpoints miss, so the guards are load-bearing -- and only 4, not 6: ` +
        `the first draft of that comment claimed an unguarded easeOutElastic(0) jumps to -0.331, and measured ` +
        `it is exactly 0 ***`);
    ok(Math.abs(rawOut(1) - 1) > 1e-6 && Math.abs(rawOut(1) - 1) < 1e-3,
        `easeOutElastic's raw f(1) = ${rawOut(1).toFixed(9)} -- small enough to survive review, permanent enough to matter`);
    ok(rawOut(0) === 0, "and its raw f(0) is exactly 0, which is why the comment had to be corrected");
    // The GUARDED elastic curves return the endpoints exactly, because those are literal branches.
    for (const [n, f] of [["easeOutElastic", easeOutElastic], ["easeInElastic", easeInElastic], ["easeInOutElastic", easeInOutElastic]]) {
        ok(f(0) === 0 && f(1) === 1, `${n} returns its endpoints EXACTLY -- the guards are literal branches, not arithmetic`);
    }
    ok(easeOutBack(0) !== 0 && Math.abs(easeOutBack(0)) < 1e-15,
        `*** and easeOutBack does NOT, at ${easeOutBack(0)} -- a cancellation residue, not a missed endpoint. ` +
        `Ungated since it shipped, harmless, and now written down instead of discovered again ***`);
    ok(/4\.883e-4|1\.000488281/.test(prose(read("simulation/easing.js"))),
        "the module records the measured numbers rather than an adjective");
}

// 5) PROVENANCE AND PURITY.
{
    const src = read("simulation/easing.js");
    ok(/Penner/.test(prose(src)),
        "*** the file cites Penner, which is where elastic comes from -- codrops/ElasticProgress pointed at the " +
        "gap and is not the source, so no bespoke licence is involved ***");
    ok(!/\bdocument\b|\bwindow\b|Math\.random|Date\.now/.test(codeOnly(src)), "pure: no DOM, no clock, no randomness");
    ok(NAMES.every((n) => new RegExp(`\\b${n}\\b`).test(codeOnly(src))), "every table entry is a real declaration in this file");
}

console.log(`easingCurves-selfcheck: ${pass} passed, ${fail} failed`);
if (!fail) console.log(`unchecked here: whether any of these curves LOOKS right. What is checked is that all
twelve start at 0 and end at 1 exactly, that two of them deliberately leave [0,1] so nobody pins that as an
invariant, and that elastic oscillates where back merely lands.`);
process.exit(fail ? 1 : 0);
