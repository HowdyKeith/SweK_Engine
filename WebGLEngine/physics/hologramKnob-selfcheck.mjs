// WebGLEngine/physics/hologramKnob-selfcheck.mjs -- v4587
//
// Run: node physics/hologramKnob-selfcheck.mjs
//
// THE SIBLING GATE OF physics/hologramKnob.mjs, the source-separation adjudicator of the hologram scene: the separation read
// back from the scene's own screen scan through hologram.recoverSeparation, under a bound derived from the screen's pitch,
// refused where fewer than three bright fringes fit the screen. physics/labKnobs-selfcheck.mjs holds the four v4586
// proposers together; this file sits beside the module, as reportDoors-selfcheck asks of every reportLines() provider.
//
// SABOTAGE LOG -- v4587, each applied to physics/hologramKnob.mjs, the gate run, the module restored.
//   A  the measured spacing returned as the separation (recoverSeparation skipped)   -> 2 red: every separation
//      from 10 to 60, and the worst recovery at sep = 12.
//   B  fewer than three fringes accepted (the MIN_PEAKS refusal skipped)             -> 1 red: sep = 4 and 8 refused.
//   C  the tolerance a constant (0.5) instead of TOL_PITCHES * pitch / spacing        -> 1 red: the bound row.
//   D  the score preferring the narrowest fringes (sep instead of 1 / sep)           -> 1 red: the greedy pick is
//      sep = 4 and refused.
"use strict";
import * as HK from "./hologramKnob.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
console.log("hologramKnob-selfcheck -- the separation read back from the fringes\n");

console.log("1. THE SEPARATION IS RECOVERED WHEREVER THREE FRINGES FIT");
{
    const good = [10, 12, 20, 40, 60].map((s) => HK.adjudicate(s));
    ok("!! every separation from 10 to 60 is recovered under the pitch-derived bound", good.every((a) => a.pass && a.evidence.rel <= a.evidence.tol && a.evidence.peaks >= HK.MIN_PEAKS), good.map((a) => `${a.evidence.sep}: ${a.evidence.recovered.toFixed(3)}`).join(" "));
    ok("the bound is TOL_PITCHES * pitch / (lambda D / sep), per candidate", good.every((a) => Math.abs(a.evidence.tol - HK.TOL_PITCHES * HK.PITCH / a.evidence.expected) < 1e-12));
    ok("the worst recovery (sep = 12, 6.2e-3) is still a factor of three inside its bound", (() => { const a = HK.adjudicate(12); return a.evidence.rel * 3 < a.evidence.tol; })());
}
console.log("\n2. *** IT SAYS NO ON ITS OWN SUBJECT ***");
{
    const low = [4, 8].map((s) => HK.adjudicate(s));
    ok("!! sep = 4 and 8 put one bright fringe on the +-60 screen and are refused as unreadable", low.every((a) => !a.pass && a.evidence.peaks === 1 && /no spacing can be read/.test(a.evidence.reason)));
    ok("the greedy pick (the widest fringes, score 1/sep) is sep = 4, so the search is told no first", (() => { const c = HK.propose(); const g = c.slice().sort((a, b) => HK.score(b) - HK.score(a))[0]; return g === 4 && !HK.adjudicate(g).pass; })());
    ok("a non-positive separation is refused with a reason", !HK.adjudicate(0).pass && /positive/.test(HK.adjudicate(0).evidence.reason));
}
console.log(fails ? `\nhologramKnob-selfcheck: ${fails} FAILED` : "\nhologramKnob-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
