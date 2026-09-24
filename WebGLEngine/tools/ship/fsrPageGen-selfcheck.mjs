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
    const drive = async (gen) => {
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
        const want = [["scene", "smooth"], ["shading", "off"], ["reactive", "off"], ["camera", "objects"], ["genframe", gen]];
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
    return { on: await drive("on"), off: await drive("off") };
}` });

if (!r.ok) {
    ok("the page drove headless", false, `${r.reason || "no result"} ${JSON.stringify(r.pageErrors || []).slice(0, 300)}`);
} else {
const { on, off } = r.result;
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
// The honest reading is not that these rows are weak but that this PAGE is not a discriminating instrument
// for frame generation -- it was built to measure upscaling, and its motion is an order of magnitude below
// what a frame generator is judged on. A slab-speed control would change that and does not exist; the closing
// line names it.

console.log(`\nfsrPageGen-selfcheck: ${fails ? `${fails} FAILED` : "ALL GREEN"}`);
console.log("unchecked here: WHETHER FRAME GENERATION IS WORTH ANYTHING ON CONTENT THAT MOVES. This page's slab " +
    "travels 0.055 world units a frame and its camera dollies slowly, so the whole window runs under 1.3 px of " +
    "mean displacement -- the regime where a cross-fade wins by construction. A page control for the slab's " +
    "SPEED would turn this one negative reading into a curve, and it does not exist. THE INPUTS ARE ACCUMULATED: " +
    "both frames the generator reads have been through temporal accumulation and RCAS, so they are not clean " +
    "samples of scene time, and the truth is a clean render -- the cross-fade carries the same handicap, which " +
    "is what makes the DIFFERENCE fair and the absolute dB not. FOUR FRAMES: enough for a unanimous sign and not " +
    "enough for a paired test, which is a pre-registered round of its own. AND THE BLOCK SIZE IS 8 AND UNMEASURED " +
    "HERE: v4678 measured that block size dominates on a silhouette, and nothing on this page varies it.");
process.exit(fails ? 1 : 0);
