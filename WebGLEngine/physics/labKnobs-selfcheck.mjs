// WebGLEngine/physics/labKnobs-selfcheck.mjs -- v4586
//
// Run: node physics/labKnobs-selfcheck.mjs
//
// THE FOUR LAB-SCENE PROPOSERS FROM THE TWELVE SCENES THE TRIAGE NEVER SAW (task 75): bh-start-radius and ns-start-radius
// (physics/apsidalKnob.mjs), impact-aim (physics/impactKnob.mjs), hologram-sep (physics/hologramKnob.mjs). knobRegistry's
// bar is the only one that matters here: EACH ADJUDICATOR MUST SAY NO ON ITS OWN SUBJECT -- a well-formed value at which the
// key is not true, or cannot be read -- and each tolerance must be DERIVED, not chosen. Then the join: every one of the four
// is registered, joined to its triage row, and reachable from the lab's front door.
//
// FOUND BY THE MEASUREMENTS THAT PRECEDED THE REGISTRATIONS (the numbers are in each module's MEASURED_V4586): the black
// hole's and neutron star's 'below the ISCO' status lines describe a launch that never plunges; the impact scene printed a
// capture radius of 1.73 for a boundary that is 1.703; the hologram's slider opened at a separation whose fringes cannot be
// read (all three rewritten at v4587); the plasma scene's mirror-point law is 5-11 % off at its gyroradius with dt ruled out, so it is REFUSED on a
// measurement rather than registered with a tolerance that could never fail; the pendulum wave re-syncs to 1e-13 at every k.
//
// SABOTAGES (each restored):
//   A  apsidalKnob's quadrature uses the Newtonian potential     -> 4 red: both scenes' routes disagree, and the runs accept nothing
//   B  impactKnob's boundary uses the page's vInf = v0 form        -> 5 red: the boundary, the 1.71 miss, the undecidable band, both laws.
//                                                                     THE FIRST DRAFT CRASHED HERE: a detail string called toExponential on
//                                                                     a residual a refused row does not carry -- every detail is null-safe now
//   C  hologramKnob accepts one peak (MIN_PEAKS 1)                 -> 1 red, by name (sep 4 and 8 no longer refused)
//   D  the ns-start-radius registration dropped                    -> 3 red: registered, joined, the run. THE FIRST DRAFT CRASHED HERE TOO:
//                                                                     runProposer threw "no such proposer" and the gate died -- a missing
//                                                                     proposer now reads as a failed run
//   E  the neutron star's comparison not taken modulo a turn       -> 1 red, by name (380 against 20 at r0 = 5.4)
//   Every sabotage reaches the verdict line now.
"use strict";
import * as A from "./apsidalKnob.mjs";
import * as IK from "./impactKnob.mjs";
import * as HK from "./hologramKnob.mjs";
import * as I from "./impact.js";
import { resetRegistry, listProposers, getProposer, runProposer } from "./proposers.mjs";
import { registerAll } from "./knobRegistry.mjs";
import { SCENE_TRIAGE, joinRegistered } from "./labScenes.mjs";
import { INSTRUMENTS } from "./instruments.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);
const deg = (x) => x * 180 / Math.PI;

console.log("labKnobs-selfcheck -- four adjudicators that say no, from the twelve scenes the triage never saw\n");

console.log("1. *** THE APSIDAL ADVANCE: INTEGRATION AGAINST QUADRATURE, AND THE REFUSALS ARE PHYSICAL ***");
{
    const bh = [5, 6, 10, 20].map((r0) => A.adjudicateBlackHole(r0));
    ok("!! the black hole passes every bound start radius, both routes within the detector-derived bound", bh.every((a) => a.pass && a.evidence.rel <= a.evidence.tol),
        bh.map((a) => `r0 ${a.evidence.r0}: ${a.evidence.rel != null ? deg(a.evidence.measured).toFixed(3) + " vs " + deg(a.evidence.exact).toFixed(3) + " deg, rel " + a.evidence.rel.toExponential(2) : a.evidence.reason}`).join("; "));
    ok("...to parts per million, far under the bound: the routes share only the potential", bh.every((a) => a.evidence.rel < 2e-5 && a.evidence.tol >= 1e-4));
    const unbound = A.adjudicateBlackHole(4);
    ok("!! *** IT SAYS NO ON ITS OWN SUBJECT: r0 = 4 (on the page's slider) is UNBOUND at 1.05 x circular speed and is refused as an escape, not a plunge ***",
        !unbound.pass && unbound.evidence.unbound && unbound.evidence.E > 0 && /unbound|escapes/.test(unbound.evidence.reason), unbound.evidence.reason);
    ok("...and NOTHING is captured across the slider: rMin = r0 at every bound start (the 'below the ISCO' line is not this launch's key)",
        [5, 5.5, 6, 8].every((r0) => { const m = A.measure(r0, A.BLACK_HOLE); return !m.captured && Math.abs(m.rMin - r0) < 1e-9; }));
    const nearCirc = (r0) => { const m = A.measure(r0, A.BLACK_HOLE), rbar = 0.5 * (m.rMin + m.rMax); return 2 * Math.PI * (Math.sqrt((rbar - A.RS) / (rbar - 3 * A.RS)) - 1); };
    const relNC = Math.abs(nearCirc(6) - A.measure(6, A.BLACK_HOLE).measured) / A.measure(6, A.BLACK_HOLE).measured;
    ok("the near-circular closed form is NOT the key: at r0 = 6 it is 90 degrees off, over a third of the measured advance (the launch is eccentric)", relNC > 0.3, "rel " + relNC.toFixed(3) + " of the measured");
    const ns = [5.4, 6, 9, 16].map((r0) => A.adjudicateNeutronStar(r0));
    ok("!! the neutron star passes its slider, the advance at r0 = 5.4 exceeding a full turn and matching MODULO 2 pi", ns.every((a) => a.pass) && deg(ns[0].evidence.exact) > 360 && deg(ns[0].evidence.measured) < 30,
        `r0 5.4: exact ${deg(ns[0].evidence.exact).toFixed(3)} deg, detector ${deg(ns[0].evidence.measured).toFixed(3)}`);
    const inside = A.adjudicateNeutronStar(5);
    ok("!! ...and refuses a start inside the surface (5.321 in rs = 2 units, below the page's slider minimum)", !inside.pass && inside.evidence.impacted && /inside the surface/.test(inside.evidence.reason), inside.evidence.reason);
    ok("the tolerance is the detector's step quantisation, per candidate, with the stated floor", bh.every((a) => a.evidence.tol === Math.max(A.TOL_FLOOR, A.TOL_DETECTOR_STEPS * a.evidence.perStep / Math.abs(a.evidence.exact))));
    const wrong = A.adjudicateBlackHole(NaN);
    ok("a malformed radius is refused with a reason, not a throw", !wrong.pass && /finite/.test(wrong.evidence.reason));
}

console.log("\n2. *** THE IMPACT AIM: THE BOUNDARY FROM THE START POINT, AND THE LAWS EITHER SIDE ***");
{
    const bc = IK.captureBoundary(), naive = I.criticalImpactParameter(IK.GM, IK.R, IK.V0);
    ok("!! the boundary from the start point is sqrt(2.9), and the page's printed form is 1.7 % wide of it", Math.abs(bc - Math.sqrt(2.9)) < 1e-12 && Math.abs(naive - Math.sqrt(3)) < 1e-12 && naive > bc, `${bc.toFixed(5)} vs printed ${naive.toFixed(4)}`);
    const m171 = IK.measure(1.71), m170 = IK.measure(1.70);
    ok("!! *** b = 1.71 MISSES where the printed boundary says capture, and b = 1.70 hits: the integration sides with the start-point form ***", m171.missed && !m171.hit && m170.hit && 1.71 < naive && 1.71 > bc, `1.71 rMin ${m171.rMin.toFixed(4)}; 1.70 hit ${m170.hit}`);
    const und = IK.adjudicate(1.703);
    ok("!! *** an aim inside the boundary's dt-resolution (b = 1.703, 6e-5 from it) is refused as UNDECIDABLE rather than graded on which side a step landed ***", !und.pass && /undecidable/.test(und.evidence.reason) && und.evidence.band < 2e-3, und.evidence.reason);
    const hits = [0.5, 1.3, 1.7].map((b) => IK.adjudicate(b)), misses = [1.71, 2.0, 3.2].map((b) => IK.adjudicate(b));
    ok("every hit passes on the speed at the radius reached (energy conservation), every miss on the (E, L) pericentre", hits.every((a) => a.pass && a.evidence.side === "hit") && misses.every((a) => a.pass && a.evidence.side === "miss"),
        [...hits, ...misses].map((a) => `${a.evidence.b}:${a.evidence.side || "refused"} ${a.evidence.rel != null ? a.evidence.rel.toExponential(1) : a.evidence.reason}`).join(" "));
    ok("...with residuals under the dt-derived bound by a stated factor", [...hits, ...misses].every((a) => a.evidence.rel != null && a.evidence.rel <= a.evidence.tol && a.evidence.tol === IK.TOL_PER_DT * IK.DT * IK.TOL_HEADROOM));
    const naiveVerdict = (b) => { const m = IK.measure(b); return m.hit === (b < naive); };
    ok("!! an adjudicator built on the printed boundary would REFUSE the correct flyby at b = 1.71 (the key can be wrong, and the first candidate was)", !naiveVerdict(1.71) && naiveVerdict(1.8) && naiveVerdict(1.6));
    const neg = IK.adjudicate(-1);
    ok("a negative aim is refused with a reason", !neg.pass && /non-negative/.test(neg.evidence.reason));
}

console.log("\n3. *** THE HOLOGRAM SEPARATION: READ BACK FROM THE FRINGES, REFUSED WHERE THEY CANNOT BE ***");
{
    const good = [10, 12, 20, 40, 60].map((s) => HK.adjudicate(s));
    ok("!! the separation is recovered from the scene's own scan wherever three fringes fit, under the pitch-derived bound", good.every((a) => a.pass && a.evidence.rel <= a.evidence.tol && a.evidence.peaks >= HK.MIN_PEAKS),
        good.map((a) => `${a.evidence.sep}: ${a.evidence.recovered != null ? a.evidence.recovered.toFixed(3) + " (rel " + a.evidence.rel.toExponential(1) + ", tol " + a.evidence.tol.toExponential(1) + ")" : a.evidence.reason}`).join("; "));
    const low = [4, 8].map((s) => HK.adjudicate(s));
    ok("!! *** IT SAYS NO ON ITS OWN SUBJECT: sep = 4 and 8 put one bright fringe on the screen and are refused as unreadable -- and 8 was the page's slider minimum until v4587 ***",
        low.every((a) => !a.pass && a.evidence.peaks === 1 && /no spacing can be read/.test(a.evidence.reason)), low.map((a) => a.evidence.sep + ": " + a.evidence.peaks + " peak").join(", "));
    ok("the bound is two pitches over the expected spacing, per candidate", good.every((a) => Math.abs(a.evidence.tol - HK.TOL_PITCHES * HK.PITCH / a.evidence.expected) < 1e-12));
    ok("the worst recovery (sep = 12) is still a factor of three inside its bound", (() => { const a = HK.adjudicate(12); return a.evidence.rel * 3 < a.evidence.tol; })());
}

console.log("\n4. *** REGISTERED, JOINED TO THE TRIAGE, AND THE FRONT DOOR CAN SEE THEM ***");
{
    resetRegistry(); registerAll();
    const props = listProposers(), joined = joinRegistered(props);
    const four = ["bh-start-radius", "ns-start-radius", "impact-aim", "hologram-sep"];
    ok("!! all four are registered with an instrument the register holds", four.every((id) => { const p = props.find((q) => q.id === id); return p && INSTRUMENTS.some((i) => i.id === p.instrument); }), props.filter((p) => four.includes(p.id)).map((p) => p.id + "->" + p.instrument).join(", "));
    const scenes = ["black-hole", "neutron-star", "impact", "hologram"];
    ok("!! ...and each of the four scenes reads REGISTERED in the join, with its row a MEASURED candidate", scenes.every((s) => { const r = joined.find((x) => x.scene === s); return r && r.registered && r.eligible === "candidate" && r.provenance === "measured"; }),
        joined.filter((r) => r.registered).map((r) => r.scene).join(", "));
    ok("the twelve scenes all carry a triage row, the eight refused ones with a reason and no key", ["pendulum-wave", "figure-eight", "solar-system", "white-dwarf", "plasma", "star-catalog", "distributed-render", "render-cluster"].every((s) => { const r = SCENE_TRIAGE.find((x) => x.scene === s); return r && r.eligible === "refused" && r.key === null && r.reason.length > 80; }));
    ok("plasma and pendulum-wave are refused on a MEASUREMENT, the other six on structure", SCENE_TRIAGE.find((r) => r.scene === "plasma").provenance === "measured" && SCENE_TRIAGE.find((r) => r.scene === "pendulum-wave").provenance === "measured" && ["figure-eight", "solar-system", "white-dwarf", "star-catalog", "distributed-render", "render-cluster"].every((s) => SCENE_TRIAGE.find((r) => r.scene === s).provenance === "assessed"));
    // a proposer that is not registered must READ as a failed run, not kill the gate: sabotage D crashed the first draft here
    const runs = four.map((id) => { try { const r = runProposer(id); return { id, tried: r.tried, adjudicated: r.adjudicated, greedyPass: r.verdict.pass, accepted: r.accepted, rank: r.acceptedRank }; } catch (e) { return { id, tried: 0, adjudicated: 0, greedyPass: true, accepted: null, rank: -1, error: String(e && e.message || e) }; } });
    ok("!! every proposer's run ACCEPTS a candidate, and ALL FOUR refuse their own greedy pick first (the search was told no, which is knobRegistry's bar)", runs.every((r) => r.accepted !== null) && runs.every((r) => !r.greedyPass),
        runs.map((r) => `${r.id}: greedy ${r.greedyPass ? "accepted" : "refused"}, accepted ${r.accepted} at rank ${r.rank}`).join("; "));
    report("registered lab scenes", joined.filter((r) => r.registered).length + " of " + SCENE_TRIAGE.length);
}

console.log(fails ? `\nlabKnobs-selfcheck: ${fails} FAILED` : "\nlabKnobs-selfcheck: all checks pass");
// v4661 -- process.exitCode, NOT process.exit: this gate compiles a wasm module, and exiting while V8's
// background compiler still has work posts a task into a torn-down platform. tools/ship/wasmTeardown.mjs.
process.exitCode = fails ? 1 : 0;
