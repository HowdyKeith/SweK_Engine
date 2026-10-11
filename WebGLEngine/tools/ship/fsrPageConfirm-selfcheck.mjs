#!/usr/bin/env node
// WebGLEngine/tools/ship/fsrPageConfirm-selfcheck.mjs -- v4684
//
// Run: node tools/ship/fsrPageConfirm-selfcheck.mjs
// RUNTIME: 74,234 ms on three long page drives (33 + 45 + 33 frames), measured at v4684. NOT a
// quick-sweep gate -- far past its 3,000 ms membership threshold. SIXTH page gate, split for the reason
// tools/ship/fsrPageGen-selfcheck.mjs's foot note gives: three long drives do not belong in a fifth section.
//
// *** THE PRE-REGISTERED CONFIRMATION FAILED, AND IT FAILED IN A WAY THAT MAKES IT UNINTERPRETABLE RATHER
// THAN NULL. ***
//
// render/checker-preregistration.md declared one primary -- `checker` at slab speed x2, scene frames 6-38,
// both a paired t-test and an exact sign test clearing p < 0.05 -- and three secondaries, one of which was a
// predicted NON-effect:
//
//   S3: the slab's pixel count is constant to within one step across the primary window, so the window does
//       not silently become a no-slab scene partway through. *** If it moves, the window is measuring the
//       slab leaving. ***
//
// IT MOVES. The slab goes from 11,130 pixels at frame 6 to 212 at frame 38 -- a 98% collapse. So by the
// record's own terms the primary window was measuring the slab leaving, and its null result says nothing
// about frame generation.
//
// *** AND S3 WAS NEVER SATISFIABLE, WHICH IS A DEFECT IN THE PRE-REGISTRATION AND NOT IN THE PAGE. *** The
// objects camera DOLLIES, so the slab's projected size changes every frame by construction -- there is no
// window on this camera where its pixel count is constant. The record declared a control the rig cannot
// produce. The reason it was declared: the residency probe that set the window printed frames 1-12 and the
// last non-zero frame, and at x2 frames 1-12 really are 11,236 and 11,130. The shrinking starts at 13. A
// window derived from a measurement that stopped before the interesting part is a chosen window wearing a
// derived window's clothes, and this gate prints the full residency so the next round cannot repeat it.
//
// WHAT THE ROUND DID ESTABLISH: S2, the content-specificity control, is decisive -- `smooth` reads
// -1.0476 dB with 0 of 33 frames up. And S1, the x1 window, CLEARS BOTH TESTS. S1 is a SECONDARY, declared as
// such in advance, and the record says no p-value from it is to be quoted as the result. This gate therefore
// reports it and refuses to promote it, which is v4671's rule and is the whole reason secondaries are named
// before the data exists.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { pairedBoth } from "./pairedStats.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (l) => console.log(`  ----  ${l}`);

// scene, speed, last frame -- exactly the three cells render/checker-preregistration.md declares
const CELLS = [["checker", "2", 38], ["checker", "1", 50], ["smooth", "2", 38]];
const FROM = 6;                                   // disjoint from the 2-5 first look, as declared

console.log("fsrPageConfirm-selfcheck -- the pre-registered confirmation, and why its primary is uninterpretable\n");

const skip = await webgpuSkipReason();
if (skip) {
    ok("a WebGPU adapter is available", false, skip);
} else {

const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 3000000, args: { CELLS }, script: `async (a) => {
    const drive = async (scene, speed, upto) => {
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
                      ["slabspeed", speed], ["genfield", "block"], ["gensource", "presented"], ["genframe", "on"]];
        let last = null;
        for (const [id, v] of want) { const e = $(id); if (!e) continue; e.value = v; last = e; }
        last.dispatchEvent(new Event("change"));
        await until(() => fno() === 0, 180000);
        const seen = [];
        $("run").click();
        for (let f = 1; f <= upto; f++) { await until(() => fno() >= f, 900000);
            seen.push({ f, gen: ($("genstat") || {}).textContent || "", obj: ($("objstat") || {}).textContent || "" }); }
        $("run").click(); ifr.remove();
        return { booted, seen };
    };
    const out = {};
    for (const [sc, sp, up] of a.CELLS) out[sc + "@" + sp] = await drive(sc, sp, up);
    return out;
}` });

if (!r.ok) {
    ok("the page drove headless", false, `${r.reason || "no result"} ${JSON.stringify(r.pageErrors || []).slice(0, 300)}`);
} else {
say(`adapter ${r.adapter ? (r.adapter.description || r.adapter.vendor) : "unknown"}${r.software ? " (SOFTWARE)" : ""}`);
const num = (s, re) => { const m = re.exec(s); return m ? Number(m[1]) : NaN; };
const cell = (sc, sp) => {
    const rows = r.result[sc + "@" + sp].seen.filter((o) => o.f >= FROM).map((o) => ({ f: o.f,
        d: num(o.gen, /scores (-?[\d.]+) dB against/) - num(o.gen, /presented frames scores (-?[\d.]+) dB/),
        nSlab: num(o.obj, /on the slab's (\d+) pixels/) }));
    const d = rows.map((x) => x.d);
    return { sc, sp, rows, d, stat: pairedBoth(d), first: rows[0], last: rows[rows.length - 1] };
};
const C2 = cell("checker", "2"), C1 = cell("checker", "1"), S2 = cell("smooth", "2");
const line = (c) => `${c.sc.padEnd(7)} x${c.sp}  frames ${c.first.f}-${c.last.f} (n=${c.d.length}): ` +
    `mean ${c.stat.t.mean.toFixed(4)} dB, sd ${c.stat.t.sd.toFixed(4)}, t ${c.stat.t.t === null ? "null" : c.stat.t.t.toFixed(3)} ` +
    `p ${c.stat.t.p === null ? "null" : c.stat.t.p.toExponential(3)};  sign ${c.stat.sign.up}/${c.stat.sign.n} ` +
    `p ${c.stat.sign.p === null ? "null" : c.stat.sign.p.toExponential(3)};  CLEARED BOTH ${c.stat.cleared}`;

console.log("1. THE WINDOWS ARE THE DECLARED ONES, AND EVERY CELL PARSED");
{
    ok("the three declared cells each ran the declared window, starting at frame 6 and ending where the record says",
       C2.first.f === 6 && C2.last.f === 38 && C1.first.f === 6 && C1.last.f === 50 && S2.first.f === 6 && S2.last.f === 38
       && C2.d.length === 33 && C1.d.length === 45 && S2.d.length === 33,
       `checker x2 frames ${C2.first.f}-${C2.last.f} n=${C2.d.length};  checker x1 ${C1.first.f}-${C1.last.f} n=${C1.d.length};  smooth x2 ${S2.first.f}-${S2.last.f} n=${S2.d.length}`);
    ok("*** and every paired difference is finite, without which none of the statistics below means anything ***",
       [C2, C1, S2].every((c) => c.d.length > 0 && c.d.every(Number.isFinite)),
       `${C2.d.length + C1.d.length + S2.d.length} paired differences across three cells, all finite. ` +
       `tools/ship/pairedStats.mjs refuses a NaN outright, so this row is what keeps the refusal from being how the gate fails.`);
}

console.log("\n2. *** S3, THE PREDICTED NON-EFFECT, IS VIOLATED -- AND WAS NEVER SATISFIABLE ***");
{
    const span = (c) => `${c.first.nSlab} -> ${c.last.nSlab} (${(100 * c.last.nSlab / c.first.nSlab).toFixed(0)}% of the start)`;
    say(`slab pixels across the window:  checker x2 ${span(C2)};  checker x1 ${span(C1)};  smooth x2 ${span(S2)}`);
    say(`checker x2, every frame: ${C2.rows.map((x) => x.nSlab).join(", ")}`);
    ok("*** the slab's pixel count COLLAPSES across the primary window -- 11,130 to 212, 2% of where it started ***",
       C2.last.nSlab < 0.05 * C2.first.nSlab,
       `${span(C2)}. render/checker-preregistration.md declared this constant to within one step and said that if it moved, ` +
       `the window is measuring the slab leaving. It moves, so it is.`);
    // *** AND THE CAUSE IS THE SLAB TRANSLATING OUT OF FRAME, WHICH A SABOTAGE HAD TO CORRECT. *** The first
    // draft of this row blamed the DOLLY -- the camera changing the slab's projected size every frame. Freezing
    // the dolly was then measured: the count still collapses, 11,236 -> 0 at x2, and on x1 it falls FASTER
    // (28% of the start rather than 70%). So the dolly modulates the rate and is not the cause; the slab simply
    // leaves, and stopping the slab is what makes the count constant (measured: 100% of the start, every frame).
    // Which makes the finding more fundamental than a camera quirk: on a rig whose moving subject crosses the
    // frame, A LONG WINDOW AND A RESIDENT SUBJECT ARE IN TENSION BY CONSTRUCTION, and any paired test long
    // enough to have power is partly watching its subject go.
    ok("*** and S3 was UNSATISFIABLE BY CONSTRUCTION -- the slab TRANSLATES out of frame, so no window on this camera holds it still ***",
       C1.last.nSlab < C1.first.nSlab && S2.last.nSlab < S2.first.nSlab
       && C2.rows.every((x, i) => i === 0 || x.nSlab <= C2.rows[i - 1].nSlab),
       `the count falls monotonically in EVERY cell, including the x1 one (${span(C1)}). Stopping the SLAB is the only thing that stops it -- ` +
       `measured, the count then holds at 100% of its start on every frame. Freezing the DOLLY does not: the count still collapses ` +
       `(11,236 -> 0 at x2, and x1 falls faster, to 28%), so the camera modulates the rate and is not the cause. ` +
       `The residency probe that set the window printed frames 1-12 and the last non-zero frame; at x2 frames 1-12 really are ` +
       `11,236 and 11,130, and the shrinking starts at 13. A window derived from a measurement that stopped before the ` +
       `interesting part is a chosen window in a derived window's clothes.`);
}

console.log("\n3. *** THE PRIMARY DID NOT CLEAR, AND IT IS UNINTERPRETABLE RATHER THAN NULL ***");
{
    say(line(C2));
    ok("*** the primary clears NEITHER test: the mean is +0.02 dB and 19 of 33 frames are up, which is a coin flip ***",
       C2.stat.cleared === false && C2.stat.t.p > 0.05 && C2.stat.sign.p > 0.05,
       `mean ${C2.stat.t.mean.toFixed(4)} dB, t p ${C2.stat.t.p.toExponential(3)}, sign ${C2.stat.sign.up}/${C2.stat.sign.n} p ${C2.stat.sign.p.toExponential(3)}. ` +
       `Both had to clear 0.05 and neither did.`);
    ok("*** and because S3 failed, this null is NOT evidence against H1 -- the window was measuring the slab leave the frame ***",
       C2.last.nSlab < 0.05 * C2.first.nSlab && C2.stat.cleared === false,
       `A window whose subject disappears from it cannot support either verdict. The honest reading is that the confirmation ` +
       `DID NOT HAPPEN, not that frame generation was tested and failed -- and the arc therefore still has no confirmed case ` +
       `anywhere of a generated frame beating a cross-fade on this page.`);
}

console.log("\n4. WHAT THE ROUND DID ESTABLISH -- THE SECONDARIES, WHICH ARE NOT PROMOTED");
{
    say(line(S2));
    ok("*** S2 CONFIRMED and decisively: on `smooth` the generated frame loses on EVERY ONE of 33 frames ***",
       S2.stat.t.mean < -0.5 && S2.stat.sign.up === 0,
       `mean ${S2.stat.t.mean.toFixed(4)} dB, ${S2.stat.sign.up} of ${S2.stat.sign.n} up. The content-specificity control fires: ` +
       `whatever is happening on the checker is not happening on flat content, so a positive checker reading would not have been a fluke of the rig.`);
    say(line(C1));
    ok("*** S1 CLEARS BOTH TESTS -- and it is a SECONDARY, so this gate reports it and refuses to call it the result ***",
       C1.stat.cleared === true && C1.stat.t.p < 0.05 && C1.stat.sign.p < 0.05,
       `mean ${C1.stat.t.mean.toFixed(4)} dB, t ${C1.stat.t.t.toFixed(3)} p ${C1.stat.t.p.toExponential(3)}, sign ${C1.stat.sign.up}/${C1.stat.sign.n} p ${C1.stat.sign.p.toExponential(3)}. ` +
       `render/checker-preregistration.md declared S1 in advance as "reported beside the primary, NOT used to decide H1, and no p-value from it quoted as the result". ` +
       `That is why it was named before the data existed. Promoting a secondary that cleared after a primary that did not is the exact move pre-registration exists to prevent, ` +
       `and its own window violates S3 too (${C1.first.nSlab} -> ${C1.last.nSlab} slab pixels).`);
    ok("...and the x1 window holds its subject far better than the x2 one, which is what the NEXT round's window has to be derived from",
       C1.last.nSlab > 0.6 * C1.first.nSlab && C2.last.nSlab < 0.05 * C2.first.nSlab,
       `x1 keeps ${(100 * C1.last.nSlab / C1.first.nSlab).toFixed(0)}% of the slab across 45 frames where x2 keeps ${(100 * C2.last.nSlab / C2.first.nSlab).toFixed(0)}% across 33. ` +
       `A defensible control is "the subject is still substantially present", with a threshold -- not "the count is constant", which this camera cannot give.`);
}
}
}

// ---- THE SABOTAGE LOG ------------------------------------------------------------------------------------
//
// *** A CONTROL THAT CANNOT FAIL IS DECORATION, SO EVERY ROW ABOVE WAS BROKEN ON PURPOSE AND WATCHED. ***
// Five mutations, each reverted, each costing three long page drives.
//
//   T1  the gate uses the 2-5 first-look window instead of the declared    -> 1 red (1)
//       disjoint one
//   T2  the gate SWAPS the primary and the secondary, reporting the cell    -> 7 red (1, 2, 3, 4)
//       that cleared as the primary
//   T3  the objects camera stops dollying                                  -> 3 red (4)
//   T4  the slab pixel count is hardwired rather than read off the page     -> 4 red (2, 3, 4)
//   T5  the slab stops moving (slabSpeed forced to 0)                      -> 6 red (2, 3, 4)
//
// T2 is the one worth dwelling on. Seven rows fail when the primary and the secondary trade places, which is
// what a gate holding a pre-registration has to do: the whole value of naming a primary in advance is that
// swapping it for whichever cell came out well is a detectable act, not a judgement call.
//
// *** AND T3 CORRECTED A CLAIM IN THIS FILE RATHER THAN CONFIRMING ONE. *** Section 2's first draft blamed the
// DOLLY for the slab's shrinking pixel count. Freezing the dolly was measured, and the count still collapses --
// 11,236 to 0 at x2, and x1 falls FASTER, to 28% of its start rather than 70%. So the camera modulates the rate
// and is not the cause. T5 then established what is: with the slab stopped the count holds at 100% of its start
// on every frame. The row now names the translation, and the finding is more fundamental for it -- on a rig
// whose subject crosses the frame, a long window and a resident subject are in tension by construction.
//
// *** TWO SABOTAGES ALSO FAILED TO APPLY BEFORE THEY FAILED TO FIRE, AND THAT IS RECORDED BECAUSE A MUTATION
// THAT DID NOT LAND IS NOT A 0-RED. *** T4's first attempt wrote a pattern with a literal dot where the source
// has an apostrophe, so nothing was replaced and the run came back green; the same restore also reverted the
// section-2 text fix, which then had to be re-applied. A sabotage script that reports "0 red" without checking
// that its edit landed is measuring nothing, and both of these looked exactly like findings.

console.log(`\nfsrPageConfirm-selfcheck: ${fails ? `${fails} FAILED` : "ALL GREEN"}`);
console.log("unchecked here: A CONFIRMATION. That is the point -- the primary's window was measuring its own " +
    "subject leaving the frame, so this round ends with the arc still having NO confirmed case of frame " +
    "generation beating a cross-fade on this page. What it has is a cleared secondary it is not allowed to " +
    "quote, a decisive content-specificity control, and a correctly derived window for a future round: x1 on " +
    "`checker`, over frames where the slab retains most of its pixels, with the control stated as presence " +
    "rather than constancy. THAT ROUND MUST USE A FRESH DISJOINT WINDOW, because frames 6-50 at x1 are now " +
    "collected data and pre-registering them would be pre-registering a known result. AND THE SHRINKING SLAB " +
    "IS ITSELF UNSEPARATED: the dolly changes the slab's projected size every frame in every cell, so every " +
    "figure this arc has taken on the objects camera includes it, and nothing has measured what it contributes.");
process.exit(fails ? 1 : 0);
