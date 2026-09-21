#!/usr/bin/env node
// WebGLEngine/tools/ship/fsrPageClocks-selfcheck.mjs -- v4661
//
// Run: node tools/ship/fsrPageClocks-selfcheck.mjs
// RUNTIME: recorded at the foot of this file. NOT a quick-sweep gate -- see the note there.
//
// *** ONE VARIABLE WAS DOING TWO JOBS, AND reset() ZEROED BOTH. ***
//
// fsr.html's `frame` counted the accumulations AND fixed the scene: sxCur = frame * SLAB_DX,
// dollyVP(frame), dx = frame * PAN. So an EMPTY history could only ever be seen at the scene's start, and
// scene time 54 could only ever be reached carrying fifty-four frames of history. The two are perfectly
// confounded, and v4658's open question is exactly which of them the reactive mask's harm follows: the mask
// loses on 14 of 51 frames over 3-53 and on 3 of 45 over 54-98, and nothing this page could run would have
// said whether that is the AGE OF THE HISTORY or WHERE THE SLAB HAS GOT TO.
//
// v4661 splits them: `frame` keeps its old meaning and every scene site reads sceneT() = frame + startFrame.
// This gate holds the two properties that make the split worth anything, and they pull in opposite
// directions:
//
//   1. AT startFrame 0, NOTHING MOVED. The page reproduces the pre-change page exactly -- not approximately,
//      and not "the gates still pass". Section 1 drives BOTH and compares the strings.
//   2. AT startFrame K, THE SCENE REALLY IS AT TIME K WITH AN EMPTY HISTORY. Section 2 is a CROSSOVER: the
//      scene-determined counter must agree across the two configurations while the history-determined
//      number must not. A control that changed nothing and a control that changed everything would both
//      pass a row that only checked one of those.
//
// *** WHY A FOURTH PAGE GATE AND NOT A SECTION IN AN EXISTING ONE. *** fsrPageObjects-selfcheck is already
// 4,204 ms, over the quick sweep's 3,000 ms membership threshold and stated as such. These rows need TWO
// page drives, and bolting them onto that gate would roughly double it again. Fourth split in this tree for
// this reason and, like the other three, taken BEFORE the addition landed rather than after it hurt.
//
// SABOTAGES: see the log at the foot of this file.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

// The scene start the crossover uses. Small on purpose: every frame of it is a frame the gate has to drive,
// and the property being held is an identity that does not care how far along the scene is.
// *** THESE FOUR NUMBERS ARE A RUNTIME BUDGET AS MUCH AS AN EXPERIMENT, AND THAT WAS MEASURED. ***
// Three page drives is what a behavioural claim about two configurations costs. At K=8/AGES=4 with the
// control driven the full length the gate ran 14,544 ms MEDIAN -- against quickSweep's 20,000 ms SIGKILL
// ceiling, under eight parallel workers, which is a gate that gets killed on a busy box and reports
// nothing. Collapsing the per-control resets into one bought only ~1 s (the ticks dominate, not reset), so
// the frames themselves had to come down. AGES cannot go below 4: age 1 is excluded by construction, so
// AGES=3 leaves two comparable ages and every row wanting three fails -- measured, as four reds.
// PRE_UPTO is shorter than UPTO because the control does not have to reach the crossover; it has to show
// that nothing moved, and six frames of two numbers agreeing exactly does that.
const K = 6, AGES = 4, UPTO = K + AGES, PRE_UPTO = 6;

console.log("fsrPageClocks-selfcheck -- the scene's time and the history's age, and that they are now apart\n");

const skip = await webgpuSkipReason();
if (skip) {
    ok("a WebGPU adapter is available", false, skip);
} else {

// *** THE PRE-CHANGE PAGE IS RECONSTRUCTED FROM GIT, NOT KEPT AS A COPY. *** A second fsr.html on disk is a
// second fsr.html to maintain, and it would go stale the first time anybody edited the real one and drift
// into being a different control than the one this row claims. `git show` gets the exact bytes that shipped.
const PRE_REF = "3d2899c:WebGLEngine/fsr.html";   // v4659's page: the last commit before the two clocks
let preSrc = null, preWhy = "";
try {
    preSrc = (await import("node:child_process")).execFileSync(
        "git", ["show", PRE_REF], { cwd: ENG, encoding: "utf8", maxBuffer: 64 << 20 });
} catch (e) { preWhy = String(e.message).slice(0, 160); }

const TMP = path.join(ENG, ".fsrclocks-pre.html");
if (preSrc) fs.writeFileSync(TMP, preSrc);
try {

const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 1800000,
  args: { K, AGES, UPTO, PRE_UPTO, hasPre: !!preSrc }, script: `async (a) => {
    const drive = async (page, startFrame, upto) => {
        const ifr = document.createElement("iframe");
        ifr.style.width = "1200px"; ifr.style.height = "900px"; ifr.src = page;
        document.body.appendChild(ifr);
        await new Promise((res) => { ifr.onload = res; });
        const d = ifr.contentDocument, w = ifr.contentWindow, $ = (id) => d.getElementById(id);
        const until = async (fn, ms) => { const t0 = Date.now();
            while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch {} await new Promise(r2 => setTimeout(r2, 40)); } return false; };
        const fno = () => { const m = /frame (\\d+)/.exec((($("metric") || {}).textContent || "")); return m ? Number(m[1]) : -1; };
        await until(() => fno() === 0 && /engine:/.test(($("engine") || {}).textContent || ""), 60000);
        // BOTH masks off: the shading ring is 2 x jitterPhaseCount slots and fills on the HISTORY's clock,
        // so a run that starts the scene late has an empty ring where the original had a filling one. That
        // is a real difference between the two configurations and it is not the one being measured here.
        // *** EVERY CONTROL SET FIRST, THEN ONE EVENT, BECAUSE reset() IS NOT CHEAP AND IT READS THEM ALL. ***
        // Dispatching a change per control ran reset() four or five times per drive -- reference render, one
        // unjittered frame and an fsr1 pass each -- for twelve resets across three drives and about five
        // seconds of the gate's runtime, none of it measuring anything. reset() reads scene, ratio, camera
        // and startframe when it runs, and shading/reactive are read per tick, so ONE reset after all of
        // them are set is the same state by construction. The control is still read BACK off the element
        // afterwards; that row is about whether the page honoured the value, not about how it was delivered.
        const want = [["scene","smooth"], ["shading","off"], ["reactive","off"], ["camera","objects"]];
        if (startFrame !== null) want.push(["startframe", String(startFrame)]);
        let last = null;
        for (const [id, v] of want) { const e = $(id); if (!e) continue; e.value = v; last = e; }
        if (startFrame !== null && !$("startframe")) { ifr.remove(); return { missing: true }; }
        if (last) { last.dispatchEvent(new w.Event("change")); await until(() => fno() === 0, 30000); }
        const startSeen = startFrame === null ? null : $("startframe").value;
        $("run").click();
        const rows = [];
        for (let f = 1; f <= upto; f++) {
            await until(() => fno() >= f, 120000);
            let x, y, dis, tmp, tries = 0;
            do { x = fno(); dis = ($("disstat") || {}).textContent || ""; tmp = ($("dTmp") || {}).textContent || ""; y = fno(); tries++; } while (x !== y && tries < 20);
            const g = /disocclusion: (\\d+) genuine/.exec(dis);
            const db = /(\\d+\\.\\d+) dB/.exec(tmp);
            const j = /jitter (-?\\d+\\.\\d+), (-?\\d+\\.\\d+)/.exec(($("metric") || {}).textContent || "");
            rows.push({ f: x, gen: g ? +g[1] : null, db: db ? +db[1] : null, j: j ? [+j[1], +j[2]] : null });
        }
        try { $("run").click(); } catch {}
        ifr.remove();
        return { rows, startSeen };
    };
    const A = await drive("/fsr.html", 0, a.UPTO);
    const B = a.hasPre ? await drive("/.fsrclocks-pre.html", null, a.PRE_UPTO) : null;
    const C = await drive("/fsr.html", a.K, a.AGES);
    return { A, B, C };
}` });

if (!r.ok) {
    ok("the page drove on a real adapter", false, (r.reason || (r.pageErrors || []).join("; ") || "").slice(0, 300));
} else {
    const { A, B, C } = r.result;
    const fmt = (rows) => rows.map((q) => `${q.f}:${q.gen}/${q.db}`).join(" ");

    console.log("1. AT startFrame 0, NOTHING MOVED");
    say("current  @0", fmt(A.rows));
    say("v4659    (git)", B && B.rows ? fmt(B.rows) : `NOT DRIVEN -- ${preWhy || "no pre-change source"}`);
    ok("!! *** the page at startFrame 0 reproduces the pre-change page EXACTLY, frame for frame ***",
       !!B && !!B.rows && B.rows.length === PRE_UPTO &&
       JSON.stringify(A.rows.slice(0, PRE_UPTO)) === JSON.stringify(B.rows),
       `${PRE_UPTO} frames, disocclusion count and PSNR to the printed precision, against ${PRE_REF} fetched from ` +
       "git rather than kept as a second copy on disk -- a copy would go stale the first time anybody edited " +
       "the real page and quietly become a different control. sceneT() is `frame + 0` and sceneTPrev() is " +
       "`Math.max(0, frame - 1)`: the two expressions they replaced, which is why this holds and not merely " +
       "that the other gates still pass.");

    console.log("\n2. AT startFrame " + K + ", THE SCENE IS AT TIME " + K + " AND THE HISTORY IS EMPTY");
    say("current  @" + K, fmt(C.rows));
    say("control input read back", JSON.stringify(C.startSeen));
    // *** THE ROW THE FIRST DRAFT OF THIS CONTROL WOULD HAVE FAILED. *** It was a <select> with four
    // options, and assigning a value a select has no option for leaves its value EMPTY -- so the page fell
    // back to 0 and a crossover asking for scene time 8 produced the scene's FIRST FOUR FRAMES to the last
    // decimal place. That reads exactly like "starting later changes nothing", which is a conclusion, and it
    // would have been wrong. The value is read back off the element here for that reason.
    ok("!! the control actually took the value it was given, rather than falling back to zero",
       C.startSeen === String(K),
       `asked for ${K}, the element reads ${JSON.stringify(C.startSeen)}. A control that accepts a value it ` +
       "cannot honour and says so nowhere is worse than no control: it turns a broken experiment into a " +
       "confident null result.");

    // *** THE CROSSOVER. *** At history age k the scene is at time K + k - 1, and the disocclusion test
    // compares THAT time's depth against the one before it -- a pair the colour history plays no part in.
    // The same pair occurs in the startFrame-0 run at frame K + k. So the scene-determined counter must
    // agree across the two configurations. Age 1 is excluded and NOT quietly dropped: there is no previous
    // depth on the first accumulated frame, so the count is null by construction on one side and a real
    // number on the other, and that is the boundary rather than a disagreement.
    const pairs = C.rows.filter((c) => c.f >= 2).map((c) => ({ age: c.f, scene: c.f + K - 1, c,
                                                               a: A.rows.find((x) => x.f === c.f + K) }));
    for (const p of pairs)
        say(`  age ${p.age} (scene time ${p.scene})`, `genuine ${p.c.gen} vs ${p.a ? p.a.gen : "?"}` +
            `   |   PSNR ${p.c.db} vs ${p.a ? p.a.db : "?"}`);
    ok("!! *** the SCENE-determined counter agrees across the two configurations, to the pixel ***",
       pairs.length >= 3 && pairs.every((p) => p.a && p.c.gen !== null && p.c.gen === p.a.gen),
       `${pairs.length} ages compared. The disocclusion count is fixed by two consecutive scene times and ` +
       "the colour history plays no part in it, so a scene clock that landed anywhere but where it claims " +
       "would move this. Age 1 is excluded by construction -- no previous depth on the first accumulated " +
       "frame -- and that exclusion is stated rather than taken.");
    // *** THIS ROW WAS RED ON ARRIVAL, ON AN INVENTED BOUND. *** It first read `> 0.5` dB, a number chosen
    // because the first two ages happened to clear it; age 4 reads 0.34 and the gate failed on its own
    // threshold rather than on the page. Both replacements are DERIVED. The floor is 0.01 dB, which is the
    // readout's own printed precision -- below it the instrument cannot tell the two apart at all, so it is
    // the smallest difference that means anything and not a level anybody picked. The direction is the part
    // with content: a history four frames old should reconstruct WORSE than one twelve frames old, and if
    // the younger one ever won, the control would be doing something other than what it says.
    const EPS = 0.01;                                     // the precision dTmp prints, not a chosen bound
    ok("!! *** ...and the HISTORY-determined number does NOT, which is the entire point of the control ***",
       pairs.length >= 3 && pairs.every((p) => p.a && Math.abs(p.c.db - p.a.db) > EPS),
       pairs.map((p) => `${p.c.db} vs ${p.a.db} (${(p.c.db - p.a.db).toFixed(2)})`).join(", ") +
       `. Floor ${EPS} dB, which is what the readout PRINTS -- below it these are the same number as far as ` +
       "this instrument is concerned. Same scene, same jitter phase, DIFFERENT history age. A control that " +
       "silently did nothing would pass the row above and fail this one; a control that moved the scene to " +
       "the wrong place would pass this one and fail that. Neither is worth having without the other.");
    ok("!! ...and the YOUNGER history is the worse one at every age, which a magnitude alone would not say",
       pairs.length >= 3 && pairs.every((p) => p.a && p.c.db < p.a.db),
       `ages ${pairs.map((p) => p.age).join("/")}: the ${K}-frames-younger accumulator loses by ` +
       pairs.map((p) => (p.a.db - p.c.db).toFixed(2)).join(", ") + " dB. A difference with no direction is " +
       "consistent with the control scrambling something; this says the accumulator is simply less converged, " +
       "which is what starting it later is supposed to mean.");
    // *** THE JITTER PHASE NEEDS ITS OWN ROW, AND THE FIRST DRAFT OF THIS GATE SAID IT DID NOT. ***
    // There was a note here claiming the crossover row above already held the phase, "since the depths it
    // counts are rendered through the offset". IT IS NOT TRUE AND A SABOTAGE PROVED IT: setting
    // jit.index = 0 instead of startFrame % phaseCount scored ZERO failing rows. renderDepth takes vpCur --
    // the UNJITTERED matrix -- because render/jitter.mjs's whole convention is that motion vectors and the
    // depths they are checked against are jitter-free. So the disocclusion count cannot depend on the phase
    // and never could, and the note was a plausible paragraph standing in for a measurement.
    //
    // The phase IS observable: the page prints the offset it rendered each frame. At history age k the scene
    // is at time K + k - 1 and must be rendered through the same offset the startFrame-0 run used at that
    // same scene time, or the two configurations differ by a sub-pixel shift on top of everything else.
    const jp = pairs.filter((p) => p.a && p.c.j && p.a.j);
    say("  jitter", jp.map((p) => `age ${p.age}: [${p.c.j}] vs [${p.a.j}]`).join("   |   ") || "(none read)");
    ok("!! *** ...and the same SCENE TIME is rendered through the same jitter offset in both configurations ***",
       jp.length >= 3 && jp.every((p) => p.c.j[0] === p.a.j[0] && p.c.j[1] === p.a.j[1]),
       `${jp.length} ages compared. The sequence is cyclic with period jitterPhaseCount(ratio) -- 32 at ` +
       "ratio 2 -- and the page advances it once per ACCUMULATED frame, so a fresh jitter state would render " +
       "scene time 8 through phase 0 where the original used 8. Set from the scene clock instead. This row " +
       "exists because the paragraph that used to stand here claimed the crossover already covered it, and " +
       "the depths the crossover counts are jitter-free by design.");
}

} finally { try { fs.unlinkSync(TMP); } catch {} }
}

console.log(fails ? `\nfsrPageClocks-selfcheck: ${fails} FAILED` : "\nfsrPageClocks-selfcheck: ALL GREEN");
console.log("unchecked here: whether the HARM follows the history's age or the scene's position, which is " +
            "what the control was built for and is the next round's -- this gate holds that the control " +
            "WORKS, which is a different claim and has to come first; the three older cameras, whose scene " +
            "clocks are threaded the same way but whose numbers are held by fsrPage-selfcheck; and the " +
            "shading ring, switched OFF in both arms here because it fills on the HISTORY's clock and would " +
            "be a real difference between the configurations that is not the one being measured.");
//
// SABOTAGE LOG -- each applied to the live tree, run, and restored.
//   C1  sceneT() reverts to `frame`, ignoring startFrame       1 RED, the crossover.
//   C2  the jitter phase follows the HISTORY clock (index 0)   *** 0 RED AT FIRST *** -- see below.
//   C3  startFrame leaks into the history age as well          1 RED, the crossover.
//   C4  sceneTPrev() floors at 0 instead of startFrame         0 RED HERE, 1 RED in fsrPage-selfcheck.
//       Not a hole: it changes the PREVIOUS scene time on the first tick only, and on that tick there is no
//       history and no previous depth, so nothing consumes it. The difference is genuinely unobservable
//       here and the expression is held on the source instead.
//   C5  reset()'s still panes revert to scene time zero        0 RED HERE, 1 RED in fsrPage-selfcheck.
//       This gate reads dTmp and disstat, which the temporal pane writes; the still panes it would break
//       are dBil and dFsr. Complementary coverage, stated rather than papered over.
//
// *** C2 IS THE ONE THAT MATTERED, BECAUSE IT CAUGHT A FALSE SENTENCE OF MINE. *** Where the jitter row now
// stands there was a NOTE claiming the crossover already held the phase, "since the depths it counts are
// rendered through the offset". Setting jit.index = 0 scored ZERO failing rows, which is how the claim got
// checked. It is false: renderDepth takes vpCur, the UNJITTERED matrix, because render/jitter.mjs's whole
// convention is that motion vectors and the depths they are tested against are jitter-free. So the
// disocclusion count cannot depend on the phase and never could. A plausible paragraph was standing where a
// row belonged; the row reads the offsets the page prints and compares them across the two configurations,
// and C2 reds it.
//
// *** RUNTIME: 11,830 ms -- far over the quick sweep's 3,000 ms membership threshold, and that is stated
// rather than tuned away. Three page drives is what a behavioural claim about two configurations costs. ***
// It is NOT, however, left near the SIGKILL ceiling: at K=8/AGES=4 with the control driven the full length
// this gate ran 14,544 ms against quickSweep's 20,000 ms cap, under eight parallel workers -- a gate that
// gets killed on a busy box and reports nothing, which is a defect and not a note. What was measured while
// bringing it down, because two of the three guesses were wrong:
//
//     28 frames, per-control resets       15,527 ms   (median of three: 15,337 / 15,527 / 15,881)
//     28 frames, one reset per drive      14,544 ms   -- the resets were NOT the cost; the ticks are
//      7 frames, one reset per drive       7,823 ms   -- so the fixed floor is ~4 s and ~370 ms a frame
//     20 frames, one reset per drive      11,830 ms   -- shipped
//
// AGES cannot go below 4 (age 1 is excluded by construction, so AGES=3 leaves two comparable ages and four
// rows fail), and PRE_UPTO is shorter than UPTO because the control has to show nothing moved, not reach
// the crossover.
//
process.exitCode = fails ? 1 : 0;
