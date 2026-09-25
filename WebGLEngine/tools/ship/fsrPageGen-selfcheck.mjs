#!/usr/bin/env node
// WebGLEngine/tools/ship/fsrPageGen-selfcheck.mjs -- v4681
//
// Run: node tools/ship/fsrPageGen-selfcheck.mjs
// RUNTIME: recorded at the foot of this file. NOT a quick-sweep gate -- see the note there.
//
// *** THE ROUND WHERE FSR3's FRAME GENERATION FINALLY RAN ON A PICTURE, AND LOST. ***
//
// v4673 estimated motion from colour; v4674 mirrored it on the device; v4675 made it sub-pixel; v4676
// reconciled it with the application's field; v4677 turned a field into a frame; v4678 and v4679 filled the
// holes; v4680 found that three of those rounds had the field's indexing backwards. Every one of those rounds
// measured on a synthetic fixture and every one of them closed by saying that fsr.html called none of it.
//
// It does now, and the answer is NEGATIVE: on this page's content the generated frame is WORSE than a plain
// cross-fade of the two presented frames it sits between, on every frame of the window.
//
// *** AND THE REASON IS A NUMBER AND NOT A STORY. *** The fixtures run at 3.2 px and 8.8 px of displacement.
// This page's objects camera moves the slab 0.055 world units a frame, which at the display resolution is
// 0.80 to 1.26 px MEAN. Under about a pixel of motion a cross-fade is very nearly exact, while a block field
// still pays for the block grid's quantisation everywhere -- so there is nothing to win and something to lose.
// That is a statement about the CONTENT this page has, not about frame generation, and it is why this gate
// prints the displacement beside every dB it prints.
//
// THE ROWS:
//   1. the control exists and OFF is byte-for-byte the page that shipped -- every figure in the five older
//      page gates was measured on that arm, and a feature that moved them could not be told from a break;
//   2. ON produces a real measurement: four dB figures and a displacement, on a frame nothing rendered;
//   3. the generated frame loses to the cross-fade on EVERY frame, which is the round's finding;
//   4. and the cross-fade beats HOLDING the previous frame by 2 dB or more, so the control that beat the
//      generator is not a trivial one. A negative result against a straw man is not a result.
//
// SABOTAGES: see the log at the foot of this file.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { FRAME_VERDICTS, FRAME_MEASURED } from "../../render/frameVerdicts.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

// Five frames per arm. Frame 1 cannot generate -- it has no previous presented frame -- so four are measured,
// which is enough for a sign claim that is 4 of 4 and is stated as four rather than dressed up as a trend.
const UPTO = 5;

console.log("fsrPageGen-selfcheck -- FSR3's frame generation on a real picture, and what it is worth there\n");

const skip = await webgpuSkipReason();
if (skip) {
    ok("a WebGPU adapter is available", false, skip);
} else {

const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 1800000, args: { UPTO }, script: `async (a) => {
    const drive = async (gen, speed = "1") => {
        const ifr = document.createElement("iframe");
        ifr.style.width = "1200px"; ifr.style.height = "900px"; ifr.src = "/fsr.html";
        document.body.appendChild(ifr);
        await new Promise((res) => { ifr.onload = res; });
        const d = ifr.contentDocument, $ = (id) => d.getElementById(id);
        const until = async (fn, ms) => { const t0 = Date.now();
            while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch {} await new Promise(r2 => setTimeout(r2, 40)); } return false; };
        const fno = () => { const m = /frame (\\d+)/.exec((($("metric") || {}).textContent || "")); return m ? Number(m[1]) : -1; };
        const booted = await until(() => fno() === 0 && /engine:/.test(($("engine") || {}).textContent || ""), 180000);
        // *** THE SAME ARM THE OTHER PAGE GATES USE, AND DILATION LEFT AT ITS SHIPPED DEFAULT. *** Both masks
        // off for the reason fsrPageClocks records; the objects camera because it is the only one with a
        // moving object, which is what a frame generator is for.
        const want = [["scene", "smooth"], ["shading", "off"], ["reactive", "off"], ["camera", "objects"],
                      ["slabspeed", speed], ["genframe", gen]];
        let last = null, present = true;
        for (const [id, v] of want) { const e = $(id); if (!e) { present = false; continue; } e.value = v; last = e; }
        last.dispatchEvent(new Event("change"));
        await until(() => fno() === 0, 180000);
        const seen = [];
        $("run").click();
        for (let f = 1; f <= a.UPTO; f++) {
            const got = await until(() => fno() >= f, 600000);
            seen.push({ f, got, gen: ($("genstat") || {}).textContent || "", psnr: ($("dTmp") || {}).textContent || "",
                        react: ($("reactstat") || {}).textContent || "", dil: ($("dilstat") || {}).textContent || "" });
        }
        $("run").click();
        ifr.remove();
        return { booted, present, readBack: ($ ? null : null), seen };
    };
    const out = { on: await drive("on"), off: await drive("off"), speeds: {} };
    for (const sp of ["2", "4", "8"]) out.speeds[sp] = await drive("on", sp);
    return out;
}` });

if (!r.ok) {
    ok("the page drove headless", false, `${r.reason || "no result"} ${JSON.stringify(r.pageErrors || []).slice(0, 300)}`);
} else {
const { on, off, speeds } = r.result;
say(`adapter ${r.adapter ? (r.adapter.description || r.adapter.vendor) : "unknown"}${r.software ? " (SOFTWARE)" : ""}`);

console.log("1. THE CONTROL EXISTS, AND OFF IS THE PAGE THAT SHIPPED");
{
    ok("the page has a `genframe` control and both arms booted",
       on.present && off.present && on.booted && off.booted,
       `on: present ${on.present} booted ${on.booted};  off: present ${off.present} booted ${off.booted}`);
    // *** THE OFF ARM MUST REPRODUCE THE PAGE'S OTHER NUMBERS EXACTLY. *** Five older page gates pin figures
    // taken before this feature existed. A generator that perturbed the accumulator, the reactive split or
    // the dilation counters would move them, and a round that moved them while adding a feature could not be
    // told from a round that broke them -- v4649's discipline and v4667's, applied to the arriving control.
    const same = on.seen.every((s, i) => s.psnr === off.seen[i].psnr && s.react === off.seen[i].react && s.dil === off.seen[i].dil);
    ok("*** with the generator OFF, every other readout is IDENTICAL to the ON arm's -- the feature reads the frames and writes nothing back ***",
       same,
       `${UPTO} frames of dTmp, reactstat and dilstat compared as strings: ${same ? "identical" : "DIFFER"}. ` +
       `The generator consumes prevShown and depth and produces one readout; if it had touched the accumulator's inputs this row would say so.`);
    ok("...and the OFF readout says it is the control rather than saying nothing, so a reader cannot mistake an absent feature for an absent effect",
       /OFF -- the control/.test(off.seen[UPTO - 1].gen) && /cross-fade/.test(off.seen[UPTO - 1].gen),
       off.seen[UPTO - 1].gen.slice(0, 160));
}

console.log("\n2. A FRAME NOTHING RENDERED, MEASURED AGAINST ONE THAT WAS");
const rows = [];
{
    ok("frame 1 declines rather than inventing a previous frame, and says which input it lacks",
       /not computed on this frame/.test(on.seen[0].gen) && /previous presented frame/.test(on.seen[0].gen),
       on.seen[0].gen.slice(0, 140));
    const num = (s, re) => { const m = re.exec(s); return m ? Number(m[1]) : NaN; };
    for (let i = 1; i < UPTO; i++) {
        const g = on.seen[i].gen;
        rows.push({ f: on.seen[i].f,
                    t: num(g, /scene time ([\d.]+)/),
                    gen: num(g, /scores (-?[\d.]+) dB against/),
                    cf: num(g, /cross-fade of the same two presented frames scores (-?[\d.]+) dB/),
                    hold: num(g, /holding the previous frame scores (-?[\d.]+) dB/),
                    mean: num(g, /THE MOTION IS ([\d.]+) px mean/),
                    max: num(g, /and ([\d.]+) px worst/),
                    app: num(g, /(\d+) of \d+ blocks took the application/),
                    flow: num(g, /(\d+) the colour flow's on merit/),
                    abst: num(g, /\((\d+) of them abstaining/) });
    }
    for (const x of rows)
        say(`frame ${x.f}: scene time ${x.t} -- generated ${x.gen.toFixed(2)}, cross-fade ${x.cf.toFixed(2)}, hold-previous ${x.hold.toFixed(2)} dB;  motion ${x.mean.toFixed(2)} px mean, ${x.max.toFixed(2)} worst;  ${x.app} application blocks, ${x.flow} flow`);
    ok("every generated frame reports all five of its numbers, so none of the rows below is reading a blank",
       rows.length === UPTO - 1 && rows.every((x) => [x.t, x.gen, x.cf, x.hold, x.mean, x.max].every(Number.isFinite)),
       `${rows.length} frames parsed, every field finite`);
    ok("*** the generated frames sit at HALF-INTEGER scene times, which is the whole claim: nothing rendered them ***",
       rows.every((x) => Math.abs(x.t - Math.floor(x.t) - 0.5) < 1e-9),
       `scene times ${rows.map((x) => x.t).join(", ")} -- the page's renders are at integers, and the reference these are graded against is drawn at the half`);
}

console.log("\n3. *** AND IT LOSES TO THE CROSS-FADE, ON EVERY FRAME ***");
{
    const deltas = rows.map((x) => x.gen - x.cf);
    say(`generated minus cross-fade: ${deltas.map((d) => d.toFixed(2)).join(", ")} dB`);
    ok("*** motion compensation is WORSE than a cross-fade on every frame of the window, and this gate says so rather than quoting the fixtures ***",
       deltas.every((d) => d < 0),
       `${deltas.filter((d) => d < 0).length} of ${deltas.length} frames down, worst ${Math.min(...deltas).toFixed(2)} dB, best ${Math.max(...deltas).toFixed(2)}. ` +
       `The fixtures said +9.91 and +7.80 dB. Four frames is four frames and is not a trend; the sign being unanimous on all of them is the result.`);
    // *** AND THE LOSS IS SMALL, WHICH IS A SEPARATE CLAIM FROM ITS SIGN AND IS THE ONE A SABOTAGE CAN REACH. ***
    // A row that only says "it loses" cannot tell a generator that loses by a third of a dB from one that
    // loses by six -- and v4680 measured that feeding this page's non-uniform motion to the wrong field
    // indexing costs 7.35 dB. Pinning the magnitude is what makes the wrong indexing a failing row here
    // rather than a slightly different negative number nobody looks at.
    ok("*** and it loses by less than a dB on every frame, so it is CLOSE to the cross-fade rather than broken -- the claim a bare sign row cannot make ***",
       deltas.every((d) => d > -1),
       `worst ${Math.min(...deltas).toFixed(2)} dB. Feeding this page's field to v4677's indexing assumption costs 7.35 dB on a silhouette, so a generator that were merely MISWIRED would read far below this and this row would say so.`);
    // *** AND THE REASON IS THE DISPLACEMENT, WHICH IS MEASURED AND NOT INFERRED. ***
    ok("*** the page's motion is under 1.5 px mean, against the 3.2 and 8.8 px the fixtures run at -- which is where a cross-fade is nearly exact and a block grid still costs ***",
       rows.every((x) => x.mean < 1.5) && rows.some((x) => x.max > 3),
       `mean ${rows.map((x) => x.mean.toFixed(2)).join(", ")} px; worst-block ${rows.map((x) => x.max.toFixed(2)).join(", ")} px. ` +
       `The slab moves 0.055 world units a frame. A frame generator's worth is a function of how far things went, and this page was built to measure UPSCALING.`);
    // *** A NEGATIVE RESULT AGAINST A STRAW MAN IS NOT A RESULT. ***
    ok("*** and the cross-fade that beat it beats HOLDING the previous frame by more than 2 dB, so the control is not trivial ***",
       rows.every((x) => x.cf - x.hold > 2),
       `cross-fade minus hold-previous: ${rows.map((x) => (x.cf - x.hold).toFixed(2)).join(", ")} dB. ` +
       `A cross-fade is four instructions per pixel and is exactly right wherever nothing moved, which at 0.8 px of motion is nearly everywhere.`);
    ok("...and the reconciliation still fires: the application's field takes most blocks and the colour flow takes some on merit, so the field is not one arm wearing the other's name",
       rows.every((x) => x.app > 0 && x.flow > 0),
       `application ${rows.map((x) => x.app).join(", ")} blocks; colour flow ${rows.map((x) => x.flow).join(", ")}. ` +
       `v4676's census on live content for the first time.`);
    ok("...and the disocclusion side test ABSTAINS on nearly every pixel it fills here, which v4679 measured as the signature of a vector the search could not place",
       rows.every((x) => Number.isFinite(x.abst)) && rows.some((x) => x.abst > 100),
       `abstentions ${rows.map((x) => x.abst).join(", ")} of the filled pixels. v4679: an abstaining pixel holds the occluder's vector rather than the background's, so the search did not reach across. Reported, not fixed here.`);

console.log("\n4. v4682 -- *** THE PRE-REGISTERED SPEED CURVE, AND ITS PRIMARY HYPOTHESIS IS REFUTED ***");
{
    // *** DECLARED IN render/genspeed-preregistration.md BEFORE THE CONTROL EXISTED. *** H1: there is a speed
    // among x1, x2, x4, x8 at which the generated frame beats the cross-fade on at least 3 of the 4 measured
    // frames. H2: the mean delta is monotonically non-decreasing in speed. H3: the crossover sits at a mean
    // displacement between 1.3 and 4.0 px. H4, a predicted non-effect: x1 is unchanged.
    const num2 = (str, re) => { const m = re.exec(str); return m ? Number(m[1]) : NaN; };
    // the drive records one object per frame and the readout text is its `gen` field -- reading the object
    // itself gave NaN in every cell, and the H2 row PASSED on it, which is recorded in the log below
    const parse = (seen) => seen.slice(1).map((o) => { const g = o.gen; return {
        gen: num2(g, /scores (-?[\d.]+) dB against/),
        cf: num2(g, /presented frames scores (-?[\d.]+) dB/),
        mean: num2(g, /THE MOTION IS ([\d.]+) px mean/),
        left: num2(g, /and (\d+) were still unreachable/) }; });
    const avg = (a) => a.reduce((x, v) => x + v, 0) / a.length;
    const curve = [["1", parse(on.seen)], ["2", parse(speeds["2"].seen)], ["4", parse(speeds["4"].seen)], ["8", parse(speeds["8"].seen)]]
        .map(([sp, rs]) => ({ sp, d: rs.map((x) => x.gen - x.cf), disp: avg(rs.map((x) => x.mean)),
                              left: rs.map((x) => x.left) }));
    for (const c of curve)
        say(`speed x${c.sp}: delta ${c.d.map((v) => v.toFixed(2)).join(", ")} dB  (mean ${avg(c.d).toFixed(3)}, ${c.d.filter((v) => v > 0).length} of ${c.d.length} up);  displacement ${c.disp.toFixed(2)} px mean;  unreachable ${c.left.join(",")}`);
    const last = curve[curve.length - 1];
    ok("*** H1 REFUTED: there is NO speed among the four at which the generated frame beats the cross-fade -- 0 of 4 frames up at EVERY setting ***",
       curve.every((c) => c.d.every((v) => v < 0)),
       `up-counts ${curve.map((c) => "x" + c.sp + ": " + c.d.filter((v) => v > 0).length + "/4").join(", ")}; mean deltas ${curve.map((c) => avg(c.d).toFixed(3)).join(", ")} dB. Sixteen frames across an 8x range of speed and not one of them positive.`);
    ok("*** and the displacement passes the fixtures' 3.2 px and keeps losing, so DISPLACEMENT IS NOT WHAT SEPARATES THIS PAGE FROM THE FIXTURES ***",
       last.disp > 3.2 && avg(last.d) < 0,
       `x8 runs at ${last.disp.toFixed(2)} px mean -- more than double the 3.2 px at which render/frameInterp-selfcheck.mjs reads +9.91 dB -- and still reads ${avg(last.d).toFixed(3)} dB. v4681's diagnosis was that the page was simply too slow. It was wrong, and this is the row that says so.`);
    // *** EVERY CELL MUST BE FINITE BEFORE ANY OF THESE ROWS MEANS ANYTHING, AND THIS ROW IS WHY. *** The
    // first draft of this section read the drive's per-frame OBJECT instead of its readout text, so every
    // number was NaN -- and the H2 row PASSED on it, because `NaN >= NaN` is false, so `every` was false and
    // the negation was true. A refutation that a total absence of data satisfies is not a refutation.
    const allFinite = curve.every((c) => [...c.d, c.disp, ...c.left].every(Number.isFinite));
    ok("*** every cell of the curve parsed to a finite number, which the refutations below are worthless without ***",
       allFinite, `${curve.length} speeds x ${curve[0].d.length} frames, plus a displacement and an unreachable count each: ${allFinite ? "all finite" : "SOME NaN"}`);
    ok("H2 REFUTED as well: the curve is not monotone, so speed is not even the axis this varies along",
       allFinite && !curve.every((c, i) => i === 0 || avg(c.d) >= avg(curve[i - 1].d)),
       `mean delta ${curve.map((c) => "x" + c.sp + " " + avg(c.d).toFixed(3)).join(", ")}. H3 is not evaluable: there is no crossover to locate.`);
    // *** AND THE AXIS MUST DO WHAT IT SAYS, WHICH IS A DERIVATION AND NOT A SETTING. *** A control that
    // doubled the slab's offset in the CURRENT frame and not the previous one would leave the rendered picture
    // moving at the right rate while the motion field described a different rate entirely -- and every row
    // above would still pass, because they only assert that the delta is negative. The measured displacement
    // is what forces the two to agree: it comes off the RECONCILED field, so it is the field's own answer.
    const ratios = curve.slice(1).map((c, i) => c.disp / curve[i].disp);
    ok("*** the measured displacement DOUBLES with each doubling of the control, so the field the generator reads agrees with the picture it was rendered from ***",
       allFinite && ratios.every((r) => r > 1.8 && r < 2.1),
       `displacements ${curve.map((c) => c.disp.toFixed(2)).join(", ")} px; ratios ${ratios.map((r) => r.toFixed(3)).join(", ")}. ` +
       `Taken off the reconciled field and not off the control's value, so a speed that scaled the render and not the motion -- or the current frame and not the previous one -- reads here.`);
    ok("*** H4 CONFIRMED -- the predicted NON-effect: x1 reproduces v4681's four deltas to the printed digit, so the control is the identity where it says it is ***",
       ["-0.38", "-0.82", "-0.25", "-0.37"].every((v, i) => curve[0].d[i].toFixed(2) === v),
       `x1: ${curve[0].d.map((v) => v.toFixed(2)).join(", ")} against v4681's -0.38, -0.82, -0.25, -0.37. Declared in advance so that a control which had quietly changed the scene could not pass as a measurement.`);
    ok("...and the fill starts running out of reach at x8, which is v4678's radius finding arriving on a picture",
       last.left.some((v) => v > 0) && curve[0].left.every((v) => v === 0),
       `unreachable pixels x1: ${curve[0].left.join(",")};  x8: ${last.left.join(",")}. render/holeFill-selfcheck.mjs section 4 measured that the radius must grow with the displacement and that the pass does not work it out for the caller. The page passes 8 and at x8 that is no longer enough.`);
    say("*** THE SUSPECT THE PRE-REGISTRATION NAMED FIRST IS THE BLOCK SIZE, AND IT IS ALREADY MEASURED ON A FIXTURE. ***");
    say("render/holeFill-selfcheck.mjs's slab scene, exact field: block 1 reads 36.79 dB, block 2 36.79, block 4 35.58, " +
        "block 8 31.48, block 16 29.18 -- against a cross-fade of 31.66. AT BLOCK 8 THE WARP ALREADY LOSES ON THE FIXTURE, " +
        "by 0.18 dB. The +9.91 dB result is the WALL scene, which has no silhouette: uniform motion, where the block grid " +
        "costs nothing. This page has a silhouette and uses block 8. That is a hypothesis with fixture evidence and NO page " +
        "measurement, so it is printed and not asserted -- the page has no block-size control, and adding one is the next round.");
}

}
}
}

// ---- THE SABOTAGE LOG ------------------------------------------------------------------------------------
//
// *** A CONTROL THAT CANNOT FAIL IS DECORATION, SO EVERY ROW ABOVE WAS BROKEN ON PURPOSE AND WATCHED. ***
// Five mutations of fsr.html, each reverted, each costing a full two-arm page drive.
//
//   P2  the `genframe` control is ignored and the generator always runs   -> 1 red (1)
//   P4  the reference camera is at the integer frame, not the half        -> 2 red (3)
//   P5  the reference omits the slab's offset -- the v4649 mistake         -> 1 red (3)
//
// *** AND TWO SCORED 0 RED, FOR ONE REASON, AND IT IS THE MOST IMPORTANT THING THIS FILE FOUND. ***
//
//   P1  the page feeds the field as PREV-indexed -- v4677's assumption,   -> 0 red
//       which v4680 measured as a 7.35 dB defect on a silhouette
//   P3  the generator's history is the pre-RCAS accumulator rather than   -> 0 red
//       what was actually presented
//
// P1 was MEASURED rather than left as a zero. With the indexing wrong the per-frame deltas read
// -0.38, -0.81, -0.58, -0.44 dB against the correct -0.38, -0.82, -0.25, -0.37: the defect is worth between
// 0.00 and 0.33 dB HERE, where render/holeFill-selfcheck.mjs measures it at 7.35 dB on a slab crossing a wall.
//
// *** SO THIS PAGE CANNOT DETECT ITS OWN ARC'S LARGEST CORRECTNESS DEFECT, AND THAT IS A PROPERTY OF THE
// CONTENT. *** Under 1.3 px of mean displacement the two indexings put a block within a pixel of the same
// place, exactly as render/frameInterp-selfcheck.mjs section 8 measures on a rigid translation (0.0038 and
// 0.6202 dB). The same gentleness explains P3: RCAS is a mild sharpen, so the presented frame and the
// accumulator's output are close enough that swapping them moves nothing a threshold here could see.
//
// ---- v4682's SABOTAGES, OVER SECTION 4 ---------------------------------------------------------------------
//
//   Q1  the `slabspeed` control is accepted and ignored              -> 3 red
//   Q4  the mid reference does not take the speed, so the truth holds -> 1 red
//       the slab at its x1 position
//   Q3  only the CURRENT slab offset is scaled, not the previous one  -> 1 red, AFTER A ROW WAS ADDED
//   Q2  the x1 option is not FIRST, so the page loads at x2           -> 1 red in fsrPage-selfcheck, AFTER
//       THAT ROW WAS FIXED
//
// *** Q3 SCORED 0 RED FIRST, AND THE REASON IS THE SHAPE OF EVERY ROW ABOVE IT. *** Scaling sxCur without
// sxPrev leaves the rendered picture moving at the right rate while the motion field describes a different
// one -- and every delta row still passed, because they assert only that the delta is NEGATIVE, which a worse
// field satisfies more comfortably. The displacement-RATIO row closes it: the figure is taken off the
// RECONCILED field, so it is the field's own answer about how far things went, and it must double when the
// control doubles. That row is a derivation and the others are a sign test.
//
// *** AND Q2 EXPOSED A DEFECT IN A ROW WRITTEN THIS SAME ROUND. *** tools/ship/fsrPage-selfcheck.mjs's new
// row asserted the default by comparing the select tag's index against the x2 option's -- true however the
// options are ORDERED. Swapping x1 and x2 scored 0 red against it. What makes a value the default is being
// FIRST, so the row now matches the select tag immediately followed by the x1 option. A row written in the
// same commit as the feature it guards is not exempt from being broken on purpose.

// The honest reading is not that these rows are weak but that this PAGE is not a discriminating instrument
// for frame generation -- it was built to measure upscaling, and its motion is an order of magnitude below
// what a frame generator is judged on. A slab-speed control would change that and does not exist; the closing
// line names it.

console.log(`\nfsrPageGen-selfcheck: ${fails ? `${fails} FAILED` : "ALL GREEN"}`);
// v4713 -- THIS NOTE SAID A SLAB-SPEED CONTROL "DOES NOT EXIST" FOR THIRTY-ONE ROUNDS WHILE SECTION 3 DROVE IT. It was
// written at v4681; v4682 added the control and the curve above and left the note alone, and "a paired test ... is a
// pre-registered round of its own" outlived four such rounds. What those rounds found is counted from
// render/frameVerdicts.mjs, not typed here, and is graded by tools/ship/frameVerdicts-selfcheck.mjs.
{
    const n = Object.values(FRAME_MEASURED).reduce((a, b) => a + b, 0);
    console.log("unchecked here: WHETHER FRAME GENERATION IS WORTH ANYTHING BEYOND THIS WINDOW. The window is five frames " +
        "per arm, and at the page's default speed it runs under 1.3 px of mean displacement -- the regime where a " +
        "cross-fade wins by construction; section 3 drives the `slabspeed` control v4682 added and finds no speed that " +
        `changes the sign. WHICH frames generation wins, and whether anything predicts them, is ${FRAME_VERDICTS.map((v) => v.id).join(", ")} -- ` +
        `${n} harvested frames, ${FRAME_VERDICTS.map((v) => `${v.id} ${v.verdict}`).join(", ")} -- and none of it is checked ` +
        "here. THE INPUTS ARE ACCUMULATED: both frames the generator reads have been through temporal accumulation " +
        "and RCAS, so they are not clean samples of scene time, and the truth is a clean render -- the cross-fade " +
        "carries the same handicap, which is what makes the DIFFERENCE fair and the absolute dB not. FOUR FRAMES A " +
        "SPEED: enough for a unanimous sign and not for a paired test; the paired tests are the frame arc's gates'. " +
        "AND THE BLOCK SIZE IS 8 AND UNMEASURED HERE: v4678 measured that block size dominates on a silhouette, and " +
        "the page offers a block-8 field or a per-pixel one, never another size.");
}
// RUNTIME: 19,197 ms measured at v4682, on FIVE page drives -- the ON arm, the OFF control, and the three
// extra speeds. *** THAT IS OVER quickSweep's 3,000 ms MEMBERSHIP THRESHOLD AND WELL INSIDE ITS 20,000 ms
// SIGKILL CAP, WHICH IS TOO CLOSE TO THE CAP TO BE COMFORTABLE. *** The gate is excluded from the sweep by the
// threshold, so the cap does not apply to it -- but a sixth drive would put it past 20 s, and the next round
// that wants one should split the file rather than add to it, which is the reason fsrPageClocks-selfcheck
// exists as a fourth page gate instead of a fifth section in a third.
process.exit(fails ? 1 : 0);
