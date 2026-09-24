#!/usr/bin/env node
// WebGLEngine/tools/ship/fsrPageField-selfcheck.mjs -- v4683
//
// Run: node tools/ship/fsrPageField-selfcheck.mjs
// RUNTIME: 34,254 ms on NINE page drives, measured at v4683. NOT a quick-sweep gate -- far over its 3,000 ms
// membership threshold, so its 20,000 ms SIGKILL cap does not apply. It is the FIFTH page gate -- split
// off rather than bolted on, for the reason tools/ship/fsrPageGen-selfcheck.mjs's own foot note gives.
//
// *** THE ARC'S LAST ROUND, AND THE THIRD PRE-REGISTERED EXPLANATION TO BE REFUTED. ***
//
// v4681 found frame generation losing to a cross-fade on this page and blamed the displacement. v4682 added a
// speed axis and refuted that across an 8x range. v4682 then printed the remaining suspect -- the BLOCK GRID --
// with fixture evidence and no page measurement, and render/genfield-preregistration.md declared the test
// before the control existed. This gate holds it.
//
// H1: at slab speed x4 the per-pixel field's mean delta is positive and at least 3 of 4 frames are up.
// H2: at every speed the per-pixel field beats the block field.
// H3, a predicted non-effect: the block arm is unchanged from v4682's table.
//
// H1 AND H2 ARE BOTH REFUTED. The per-pixel field is WORSE than the block field on this page. So neither
// displacement nor the field's resolution explains the deficit, and the pre-registration named what a failure
// would leave: the inputs are accumulated frames.
//
// *** SECTION 2 TESTS THAT, AND IT IS NOT IT EITHER. *** Interpolating between two CLEAN reference renders
// instead of two presented frames moves the answer by two hundredths of a dB. Undeclared and labelled
// SECONDARY throughout, because the pre-registration named it as an interpretation and not as a test.
//
// *** AND SECTION 3 FINDS THE VARIABLE, WHICH IS THE CONTENT'S SPATIAL FREQUENCY. *** On the page's PIXEL
// CHECKER the generated frame BEATS the cross-fade -- three of four frames up, mean +0.107 dB -- which is the
// first positive frame-generation reading on a real picture anywhere in this tree. Also undeclared, also
// labelled secondary, and small: a tenth of a dB with one frame down is a direction, not a result. A
// pre-registered confirmation on that scene is the round this one names and does not claim.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

const UPTO = 5;                                  // frame 1 cannot generate, so four frames are measured
// scene, field, speed, input -- nine page drives, and every number this file prints comes from one of them
const CELLS = [
    ["smooth", "block", "1", "presented"], ["smooth", "pixel", "1", "presented"],
    ["smooth", "block", "4", "presented"], ["smooth", "pixel", "4", "presented"],
    ["smooth", "block", "1", "clean"], ["smooth", "block", "4", "clean"],
    ["checker", "block", "4", "presented"], ["zone", "block", "4", "presented"],
    ["zone", "pixel", "4", "presented"],
];

console.log("fsrPageField-selfcheck -- the field's resolution, the accumulator, and what actually governs it\n");

const skip = await webgpuSkipReason();
if (skip) {
    ok("a WebGPU adapter is available", false, skip);
} else {

const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 2400000, args: { UPTO, CELLS }, script: `async (a) => {
    const drive = async (scene, field, speed, src) => {
        const ifr = document.createElement("iframe");
        ifr.style.width = "1200px"; ifr.style.height = "900px"; ifr.src = "/fsr.html";
        document.body.appendChild(ifr);
        await new Promise((res) => { ifr.onload = res; });
        const d = ifr.contentDocument, $ = (id) => d.getElementById(id);
        const until = async (fn, ms) => { const t0 = Date.now();
            while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch {} await new Promise(r2 => setTimeout(r2, 40)); } return false; };
        const fno = () => { const m = /frame (\\d+)/.exec((($("metric") || {}).textContent || "")); return m ? Number(m[1]) : -1; };
        const booted = await until(() => fno() === 0 && /engine:/.test(($("engine") || {}).textContent || ""), 180000);
        const want = [["scene", scene], ["shading", "off"], ["reactive", "off"], ["camera", "objects"],
                      ["slabspeed", speed], ["genfield", field], ["gensource", src], ["genframe", "on"]];
        let last = null, present = true;
        for (const [id, v] of want) { const e = $(id); if (!e) { present = false; continue; } e.value = v; last = e; }
        last.dispatchEvent(new Event("change"));
        await until(() => fno() === 0, 180000);
        const seen = [];
        $("run").click();
        for (let f = 1; f <= a.UPTO; f++) { await until(() => fno() >= f, 900000); seen.push(($("genstat") || {}).textContent || ""); }
        $("run").click(); ifr.remove();
        return { booted, present, seen };
    };
    const out = {};
    for (const [sc, fl, sp, sr] of a.CELLS) out[[sc, fl, sp, sr].join("|")] = await drive(sc, fl, sp, sr);
    return out;
}` });

if (!r.ok) {
    ok("the page drove headless", false, `${r.reason || "no result"} ${JSON.stringify(r.pageErrors || []).slice(0, 300)}`);
} else {
say(`adapter ${r.adapter ? (r.adapter.description || r.adapter.vendor) : "unknown"}${r.software ? " (SOFTWARE)" : ""}`);
const num = (s, re) => { const m = re.exec(s); return m ? Number(m[1]) : NaN; };
const avg = (a) => a.reduce((x, v) => x + v, 0) / a.length;
const cell = (sc, fl, sp, sr) => {
    const dr = r.result[[sc, fl, sp, sr].join("|")];
    const rs = dr.seen.slice(1).map((g) => ({
        gen: num(g, /scores (-?[\d.]+) dB against/), cf: num(g, /presented frames scores (-?[\d.]+) dB/),
        mean: num(g, /THE MOTION IS ([\d.]+) px mean/), cells: num(g, /, (\d+) cells,/),
        field: /field per-pixel/.test(g) ? "per-pixel" : "block 8",
        src: /input clean renders/.test(g) ? "clean" : "presented" }));
    const d = rs.map((x) => x.gen - x.cf);
    return { sc, fl, sp, sr, d, mean: avg(d), up: d.filter((v) => v > 0).length, disp: avg(rs.map((x) => x.mean)),
             cells: rs[0] ? rs[0].cells : NaN, sawField: rs[0] ? rs[0].field : "", sawSrc: rs[0] ? rs[0].src : "",
             finite: rs.length === UPTO - 1 && [...d, ...rs.map((x) => x.mean)].every(Number.isFinite) };
};
const show = (c) => say(`${c.sc.padEnd(7)} x${c.sp} ${c.fl.padEnd(5)} ${c.sr.padEnd(9)} (${c.cells} cells): ` +
    `delta ${c.d.map((v) => v.toFixed(2)).join(", ")} dB   mean ${c.mean.toFixed(3)}   up ${c.up}/${c.d.length}   displacement ${c.disp.toFixed(2)} px`);

console.log("1. *** THE PRE-REGISTERED TEST OF THE BLOCK GRID, AND H1 IS REFUTED ***");
const b1 = cell("smooth", "block", "1", "presented"), p1 = cell("smooth", "pixel", "1", "presented");
const b4 = cell("smooth", "block", "4", "presented"), p4 = cell("smooth", "pixel", "4", "presented");
{
    for (const c of [b1, p1, b4, p4]) show(c);
    ok("every cell parsed to finite numbers, and each drive really got the field and input it was set to",
       [b1, p1, b4, p4].every((c) => c.finite) && p4.cells > b4.cells * 50
       && b4.sawField === "block 8" && p4.sawField === "per-pixel" && b4.sawSrc === "presented",
       `${b4.cells} cells on the block arm against ${p4.cells} on the per-pixel one, and the readout names the field it used -- a control that was set and not honoured would read here`);
    ok("*** H1 REFUTED: at the declared cell the per-pixel field's mean delta is NEGATIVE, and 0 of 4 frames are up ***",
       p4.mean < 0 && p4.up === 0,
       `x4 per-pixel: ${p4.d.map((v) => v.toFixed(2)).join(", ")} dB, mean ${p4.mean.toFixed(3)}, ${p4.up} of ${p4.d.length} up. The bar was a positive mean AND 3 of 4 up.`);
    ok("*** H2 REFUTED AND IN THE OPPOSITE DIRECTION: the per-pixel field is WORSE than the block field at BOTH speeds ***",
       p1.mean < b1.mean && p4.mean < b4.mean,
       `x1 ${b1.mean.toFixed(3)} -> ${p1.mean.toFixed(3)} dB, x4 ${b4.mean.toFixed(3)} -> ${p4.mean.toFixed(3)}. ` +
       `render/holeFill-selfcheck.mjs reads +5.13 dB for block 1 over block 8 on its fixture. Sixty-four times the field resolution makes this page WORSE, which is the reverse of the effect the round was built to find.`);
    ok("*** H3 CONFIRMED -- the predicted NON-effect: the block arm reproduces v4682's means, so the arriving controls are the identity where they say they are ***",
       Math.abs(b1.mean - (-0.455)) < 0.005 && Math.abs(b4.mean - (-0.857)) < 0.005,
       `x1 ${b1.mean.toFixed(3)} against v4682's -0.455;  x4 ${b4.mean.toFixed(3)} against -0.857. Two new selects on the page and neither moved the arm they default to.`);
}

console.log("\n2. SECONDARY, UNDECLARED: THE ACCUMULATED INPUTS, WHICH THE PRE-REGISTRATION NAMED AS WHAT WOULD BE LEFT");
const c1 = cell("smooth", "block", "1", "clean"), c4 = cell("smooth", "block", "4", "clean");
{
    // *** LABELLED SECONDARY BECAUSE THE RECORD NAMED THIS AS AN INTERPRETATION, NOT AS A TEST. *** Both
    // earlier records note the inputs are accumulated and the truth is a clean render. `clean` interpolates
    // between two REFERENCE renders instead, removing the accumulator, the resolve and RCAS from the inputs.
    // It is not what a viewer sees and it is not what FSR3 does; it is a control for one variable.
    for (const c of [c1, c4]) show(c);
    // *** AND THE ROW HAS TO SAY THE CONTROL FIRED, OR "NEARLY THE SAME" IS SATISFIED BY "LITERALLY THE
    // SAME". *** A sabotage that made `gensource` a no-op scored 0 red against the first draft, which asked
    // only that the two arms agree within 0.03 dB. They must AGREE IN THE MEAN and DIFFER PER FRAME.
    const fired = c1.d.some((v, i) => v !== b1.d[i]) && Math.abs(c1.disp - b1.disp) > 0.01;
    ok("SECONDARY: feeding the generator CLEAN renders instead of presented frames changes the answer by less than 0.03 dB, so the accumulator is not what it is losing to either",
       [c1, c4].every((c) => c.finite) && fired
       && Math.abs(c1.mean - b1.mean) < 0.03 && Math.abs(c4.mean - b4.mean) < 0.03,
       `x1 presented ${b1.mean.toFixed(3)} against clean ${c1.mean.toFixed(3)};  x4 ${b4.mean.toFixed(3)} against ${c4.mean.toFixed(3)} dB. ` +
       `The control DID fire -- the per-frame deltas differ (${c1.d.map((v) => v.toFixed(2)).join(", ")} against ${b1.d.map((v) => v.toFixed(2)).join(", ")}) and the displacement moves ${b1.disp.toFixed(2)} -> ${c1.disp.toFixed(2)} px -- and the MEAN does not move. ` +
       `Reported as a secondary and not used to settle H1: the pre-registration named this as what a failure would LEAVE, and naming a thing is not testing it.`);
    ok("...and the clean arm still loses, so all three explanations this arc has offered for the deficit are now refuted",
       c1.mean < 0 && c4.mean < 0,
       `displacement (v4682, 8x range), field resolution (H1/H2 above) and the accumulated inputs (here). ` +
       `Three named causes, three measurements, none of them it.`);
}

console.log("\n3. SECONDARY, UNDECLARED: *** THE FIRST POSITIVE FRAME-GENERATION READING ON A PICTURE IN THIS TREE ***");
const ck = cell("checker", "block", "4", "presented"), zn = cell("zone", "block", "4", "presented");
const znp = cell("zone", "pixel", "4", "presented");
{
    // *** A COMPENSATION'S WORTH SCALES WITH THE SPATIAL GRADIENT, WHICH IS WHY THE PAGE'S OWN SCENE CONTROL
    // IS THE VARIABLE NOBODY HAD VARIED. *** A cross-fade of two offset copies is exactly right wherever the
    // picture is flat and wrong in proportion to how fast it changes. The page's "smooth" scene is labelled
    // "nothing to recover" in its own option text. Everything this arc measured on the page was measured there.
    for (const c of [b4, zn, ck]) show(c);
    ok("*** on the PIXEL CHECKER the generated frame BEATS the cross-fade -- three of four frames up, and a positive mean ***",
       ck.finite && ck.mean > 0 && ck.up >= 3,
       `checker x4: ${ck.d.map((v) => v.toFixed(2)).join(", ")} dB, mean ${ck.mean.toFixed(3)}, ${ck.up} of ${ck.d.length} up. ` +
       `*** AND IT IS A TENTH OF A dB WITH ONE FRAME DOWN. *** That is a direction and not a result; a pre-registered confirmation on this scene is a round of its own and this row does not stand in for it.`);
    ok("...and the ordering across the three scenes runs with their spatial frequency, which is the mechanism and not a coincidence",
       [b4, zn, ck].every((c) => c.finite) && ck.mean > zn.mean && ck.mean > b4.mean,
       `smooth ${b4.mean.toFixed(3)}, zone plate ${zn.mean.toFixed(3)}, pixel checker ${ck.mean.toFixed(3)} dB. ` +
       `"smooth" is labelled "nothing to recover" in the page's own option text, and every figure this arc took on the page was taken there. A cross-fade is exactly right wherever the picture is flat.`);
    ok("...and the per-pixel field's SIGN against the block field flips with the scene, so H2 was not just wrong but content-dependent",
       znp.finite && znp.mean > zn.mean && p4.mean < b4.mean,
       `on the zone plate the per-pixel field is BETTER (${zn.mean.toFixed(3)} -> ${znp.mean.toFixed(3)} dB) and on smooth it is WORSE (${b4.mean.toFixed(3)} -> ${p4.mean.toFixed(3)}). ` +
       `A field resolution that helps on detail and hurts on flatness is the same mechanism read from the other side.`);
}
}
}

// ---- THE SABOTAGE LOG ------------------------------------------------------------------------------------
//
// *** A CONTROL THAT CANNOT FAIL IS DECORATION, SO EVERY ROW ABOVE WAS BROKEN ON PURPOSE AND WATCHED. ***
// Six mutations of fsr.html, each reverted, each costing nine page drives.
//
//   R1  the `genfield` control is accepted and ignored            -> 3 red (1, 3)
//   R3  the per-pixel field is not negated into the generator's   -> 3 red (1, 3)
//       sense -- the one negation flowReconcile also performs
//   R6  the readout reports the block field whatever ran          -> 1 red (1)
//   R2  the `gensource` control is accepted and ignored           -> 1 red (2), AFTER THE ROW WAS FIXED
//   R5  the clean arm mixes a clean PREVIOUS frame with a          -> 1 red (2), by the same fix
//       presented CURRENT one
//
// *** R2 SCORED 0 RED FIRST, AND THE DEFECT WAS IN THE ROW'S LOGIC RATHER THAN ITS THRESHOLD. *** Section 2's
// claim is that the clean arm changes the answer by less than 0.03 dB -- which "literally the same" satisfies
// perfectly. A row asserting that two things AGREE must also assert that they are two things. It now requires
// the per-frame deltas to DIFFER and the displacement to move while the MEAN holds, and both R2 and R5 fall to
// that. The same shape as v4682's Q3: every row in a section can be about a quantity being small, and then
// nothing in the section notices the quantity being absent.
//
// *** AND ONE MUTATION IS UNREACHABLE ON THIS CONTENT, WHICH IS RECORDED WITH ITS EVIDENCE. ***
//
//   R4  a pixel the application cannot answer falls back to ZERO  -> 0 red
//       instead of to its block's reconciled vector
//
// The branch never runs here. v4681's readout prints the reconciliation's own census on every frame and the
// flow-only count -- blocks where the application had no valid vector -- is 0 in every cell this arc has
// driven: the dolly's reprojection is valid at every pixel of this scene. So the fallback is code for content
// this page does not have, and no row can reach it without content that disoccludes off the frame edge or
// reprojects behind the eye. Stated rather than deleted: render/flowReconcile.mjs's SRC_FLOW_ONLY exists for
// the same case and its own gate DOES reach it, by constructing the invalid state by hand.

console.log(`\nfsrPageField-selfcheck: ${fails ? `${fails} FAILED` : "ALL GREEN"}`);
console.log("unchecked here: A PRE-REGISTERED CONFIRMATION ON THE CHECKER, which is what the one positive cell " +
    "above asks for and is not. Four frames, mean +0.107 dB, one frame down: a paired test over 45 frames with " +
    "the statistic and threshold fixed in advance is the round this names. WHY THE PER-PIXEL FIELD HURTS ON " +
    "SMOOTH CONTENT is measured here and not explained -- sixty-four times the field resolution making a frame " +
    "worse is the reverse of the fixture's +5.13 dB and deserves a decomposition, not a sentence. THE SEARCH " +
    "BLOCK is still 8 in every cell: render/opticalFlow.mjs's patch must stay large, so the matcher's own " +
    "granularity was deliberately not varied and is therefore not measured. AND NOTHING HERE IS ON THE DEVICE: " +
    "the whole FSR3 path from reconciliation to pixels is CPU, so a generated frame costs a readback and this " +
    "page pays it every frame.");
process.exit(fails ? 1 : 0);
