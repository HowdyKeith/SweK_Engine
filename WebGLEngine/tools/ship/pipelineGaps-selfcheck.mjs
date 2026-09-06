// WebGLEngine/tools/ship/pipelineGaps-selfcheck.mjs -- v4480
//
// Run: node tools/ship/pipelineGaps-selfcheck.mjs
//
// Grades gfx/pipelineGaps.mjs -- the TSL/WebGPU survey, INCLUDING the parts of it that were wrong.
//
// *** EVERY VERDICT IS HELD AGAINST THE TREE, NOT AGAINST ITS OWN PROSE. *** A survey is the easiest thing in
// this repository to write and the hardest to keep true: it is a list of claims about files that keep moving.
// So "fixed" must be visible in the file it claims to have fixed, "refused" must carry the number that refuses
// it, and "already-solved" must point at the bytes that solved it. A row whose evidence disappears goes red.
//
// The two "already-solved" rows are the ones that matter most, because they are the survey's own overclaims
// and the temptation is to quietly delete them. They are graded like the rest.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as P from "../../gfx/pipelineGaps.mjs";
import * as E from "./emitReproducibility.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const M = P.MEASURED_AT_V4480;
const read = (f) => fs.readFileSync(path.join(ENG, f), "utf8");
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

// ---- 1. THE SURVEY'S SHAPE, AND THE NUMBER IT SHOULD BE JUDGED BY ------------------------------------------
{
    for (const g of P.GAPS) say(`  ${g.id.padEnd(16)} ${g.verdict.padEnd(15)} ${g.at}`);
    ok("every row carries one of the four verdicts, and the counts are what the survey says they are",
        P.GAPS.length === M.gapsSurveyed && P.GAPS.every((g) => P.VERDICTS.includes(g.verdict)) &&
        P.byVerdict("fixed").length === M.fixed && P.byVerdict("already-solved").length === M.alreadySolved &&
        P.byVerdict("refused").length === M.refused,
        `${M.gapsSurveyed} surveyed: ${M.fixed} fixed, ${M.alreadySolved} already solved, ${M.refused} refused`);
    ok("!! *** THE SURVEY WAS WRONG ABOUT THREE OF ITS SIX, AND SAYS SO IN A FIELD A CHECK CAN READ ***",
        M.surveyWrongAbout === M.alreadySolved + 1 && M.surveyWrongAbout === 3 &&
        P.byVerdict("already-solved").every((g) => typeof g.was === "string" && g.was.length > 40),
        "two were already solved and one should not be built. A survey that only records what it got right is " +
        "a worse instrument than one that records what it got wrong, because only the second can be checked");
    // `was !== now` alone was not enough: sabotage J shortened a `was` to four words and still passed, because
    // two different strings differ. A claim has to be SUBSTANTIAL to be a claim.
    ok("every row states what it CLAIMED as well as what is true, at length, so the correction is data",
        P.GAPS.every((g) => g.was && g.now && g.was !== g.now && g.was.length > 40 && g.now.length > 40),
        "a one-line `was` would satisfy inequality and record nothing -- the point of the field is that a " +
        "reader can see what the survey believed before the tree corrected it");
}

// ---- 2. *** "FIXED" MUST BE VISIBLE IN THE FILE IT CLAIMS TO HAVE FIXED *** ---------------------------------
{
    say("");
    // *** CALLED, NOT GREPPED. *** The first draft of this section tested for the TEXT `gpu.lost` in the
    // comment-stripped source, and sabotages A and C wrapped the wiring in `if (false && ...)` -- which leaves
    // every token intact and cost ZERO RED. v4450 wrote that finding down in this tree's own words: "an
    // assertion about where text sits is satisfied by a branch that is present and dead." So the wiring is an
    // exported function now and this CALLS it with a stub device and watches the callbacks fire.
    const { _wireDeviceLoss } = await import("../../gfx/device.js");
    const seen = [];
    const stubLost = { lost: Promise.resolve({ reason: "device-reset", message: "boom" }), addEventListener: (t, f) => seen.push([t, f]) };
    const st = _wireDeviceLoss(stubLost, { onDeviceLost: (l) => seen.push(["lost", l]), onDeviceError: (m) => seen.push(["err", m]) });
    await new Promise((r) => setTimeout(r, 30));
    const errHandler = (seen.find((x) => x[0] === "uncapturederror") || [])[1];
    if (errHandler) errHandler({ error: { message: "validation failed" } });
    say(`  stub device: lost fired ${!!st.lost} (${st.lost && st.lost.reason}), uncaptured errors seen ${st.errors}`);
    ok("!! *** DEVICE LOSS AND UNCAPTURED ERRORS ACTUALLY FIRE, PROVEN BY CALLING THE WIRING ***",
        !!st.lost && st.lost.reason === "device-reset" && st.errors === 1 &&
        seen.some((x) => x[0] === "lost") && seen.some((x) => x[0] === "err"),
        "dead code cannot survive this: `if (false && ...)` keeps every token a grep looks for, and passes " +
        "nothing to the callback. Before this round the shared layer had neither and three one-off pages had both");
    // and the teardown exclusion, also by CALLING
    const stubDestroyed = { lost: Promise.resolve({ reason: "destroyed", message: "" }), addEventListener: () => {} };
    const st2 = _wireDeviceLoss(stubDestroyed, {});
    await new Promise((r) => setTimeout(r, 30));
    ok("...and a device the caller DESTROYED is not reported as lost",
        st2.lost === null,
        "the three pages all make that exclusion; treating a deliberate teardown as a fault would cry wolf " +
        "on every close, which is how a warning stops being read");
    const pages = ["blackhole.html", "fluid-webgpu.html", "mpm-gpu.html"].filter((f) => {
        try { return /\.lost/.test(read(f)); } catch { return false; }
    });
    say(`  pages that had loss handling before the shared layer did: ${pages.length} -- ${pages.join(", ")}`);
    ok("!! the inversion the row describes is real and still visible in those pages",
        pages.length === M.pagesWithLossHandling && M.sharedLayerHadIt === false,
        "they are left alone rather than refactored: they prove the code is needed, and the abstraction is " +
        "where it belongs. The claim is the INVERSION, and the pages are the evidence for it");
    // the other two "fixed" rows point at their own modules
    ok("the other two fixed rows point at modules that exist and export what they claim",
        fs.existsSync(path.join(ENG, "gfx/gpuTimer.mjs")) && fs.existsSync(path.join(ENG, "gfx/blendModes.mjs")) &&
        /calibrateFloor/.test(read("gfx/gpuTimer.mjs")) && /premultiplied/.test(read("gfx/blendModes.mjs")));
}

// ---- 3. *** "ALREADY SOLVED" MUST POINT AT THE BYTES THAT SOLVED IT *** -------------------------------------
{
    say("");
    // *** v4484: BOTH OF THESE LISTS WERE HARD-CODED AND BOTH WERE WRONG, AND THE READER COUNT WAS RIGHT BY
    // TWO ERRORS CANCELLING. *** The artifact list named three files and there are FOUR -- tsl-emitted.json,
    // with no suffix, is the largest of the set. The reader list counted render/backendParity.mjs, which only
    // NAMES the files in a comment and loads nothing, and omitted this very gate, which reads them. Four real
    // readers plus one false one came to the same 5 as five real ones. A count that is right while its members
    // are wrong is only found by listing the members, which is why both now come from the register in
    // tools/ship/emitReproducibility.mjs and are checked file by file.
    const arts = E.ARTIFACTS.map((a) => a.file).filter((f) => fs.existsSync(path.join(ENG, f)));
    const readers = E.CONTENT_READERS.filter((f) => {
        try { return /tsl-emitted/.test(noComments(read(f))); } catch { return false; }
    });
    // *** AND EVERY ARTIFACT IS GRADED, NOT arts[0]. *** The old line stamped the first file and asserted
    // top-level `wgsl` and `glsl` keys, which is true of tsl-emitted-race.json and of no other one: the four
    // do NOT share a schema -- race nests at the top, tsl-emitted.json under badTv/blackbody, physics under
    // lyapunov/heidler, compute under emitted/transplanted. Correcting the list to four put a differently
    // shaped file first and the row went red on a fact about itself. What is common is the stamp and both
    // languages being present somewhere, checked per file.
    const stamped = arts.map((f) => ({ f, j: JSON.parse(read(f)) }))
                        .map((x) => ({ ...x, lang: E.carriesBothLanguages(x.j) }));
    for (const x of stamped) say(`    ${x.f.padEnd(34)} three ${x.j.three}, written ${x.j.at}, wgsl ${x.lang.wgsl}, glsl ${x.lang.glsl}`);
    say(`  ${arts.length} emitted artifacts, ${readers.length} readers`);
    ok("!! *** THE 'BUILD-TIME TSL' ARCHITECTURE THE SURVEY PROPOSED ALREADY EXISTED ***",
        arts.length === M.emittedArtifacts && readers.length === M.emittedReaders &&
        stamped.every((x) => x.j.three === M.emittedPinnedThree && x.j.at) &&
        stamped.every((x) => {
            const want = E.ARTIFACTS.find((a) => a.file === x.f).languages;
            return want === 2 ? x.lang.both : (x.lang.wgsl && !x.lang.glsl);
        }),
        "the graphs are compiled and their text written to disk, stamped with the round that wrote them and " +
        "the three version that emitted them -- all four, each checked, rather than the first one standing " +
        "for the set. The survey proposed it as new work; it is the tree's practice");
    ok("!! ...and THREE carry both languages while the compute one carries WGSL ALONE, which is the API not a gap",
        stamped.filter((x) => x.lang.both).length === E.MEASURED_AT_V4484.dualLanguageArtifacts &&
        stamped.filter((x) => x.lang.wgsl && !x.lang.glsl).length === E.MEASURED_AT_V4484.wgslOnlyArtifacts &&
        E.ARTIFACTS.find((a) => /compute/.test(a.file)).languages === 1,
        "*** WebGL2 HAS NO COMPUTE STAGE, *** so there is no GLSL counterpart for tsl-emitted-compute.json to " +
        "hold. The survey's blanket 'BOTH texts' is true of three and structurally impossible for the fourth, " +
        "and an exception nobody states is indistinguishable from an omission");
    // *** AND THE THING THAT IS GENUINELY MISSING, WHICH IS NOT A COMPILER ***
    const gates = ["tools/ship/tslSource-selfcheck.mjs", "tools/ship/tslPhysics-selfcheck.mjs",
                   "tools/ship/tslRace-selfcheck.mjs"].map((f) => read(f));
    const reEmits = gates.filter((g) => /emitShaders\(/.test(g)).length;
    // *** v4484 CLOSED THIS. *** The row used to assert comparesToStored === false and say the property was
    // what the next round owed. It is owed no longer: all EIGHT writes across the three gates now compare the
    // fresh emit against a pre-run baseline and grade the answer, at no extra runtime, because the emit has
    // already happened by the time a write is reached. The row is inverted rather than deleted, so the day
    // somebody drops the comparison it goes red instead of quietly returning to the old state.
    const writes = gates.reduce((n, g) => n + (noComments(g).match(/writeIfReproducible\(/g) || []).length, 0);
    const allCompare = gates.every((g) => /writeIfReproducible\(/.test(noComments(g)));
    say(`  ${reEmits} of 3 gates RE-EMIT on every run; ${writes} writes compare against the stored artifact first`);
    ok("!! ...AND REPRODUCIBILITY, WHICH WAS WHAT WAS MISSING, IS NOW CHECKED AT EVERY WRITE",
        reEmits === 3 && allCompare && writes === E.MEASURED_AT_V4484.writes &&
        M.freshEmitComparedToStored === true,
        `${writes} writes, all three gates. They used to write and then assert the file EXISTS and is over a ` +
        "thousand characters -- nothing asserted the emitted text was the SAME text, and a codegen step whose " +
        "output changes when nothing changed is a diff nobody can review. Measured: all four artifacts " +
        "re-emit byte-identical");
    // MSAA, the other already-solved row
    // UNWRAPPED BEFORE MATCHING. The first draft of this line used /parity is the promise/i against the raw
    // file and went red: device.js wraps it as "Parity is\n        the promise". That is the SAME defect
    // v4463 fixed in its own gate and that tools/ship/gateQuality-selfcheck.mjs flags by name -- a prose regex
    // pointed at source without unwrapping -- and this is the third instance in three rounds. Made again by
    // the same hands that wrote the rule down, which is why the rule is a gate and not a habit.
    const dev = read("gfx/device.js");
    const devFlat = dev.replace(/\n\s*\/\/\s?/g, " ").replace(/\s+/g, " ");
    ok("!! and MSAA is absent ON PURPOSE, with the pixel count still in the file that decided it",
        /antialias: false/.test(dev) && /3,417/.test(dev) && /Parity\s+is\s+the\s+promise/i.test(devFlat),
        "3,417 of 65,536 pixels differed and Level 11 chose one sample per pixel because it is the setting " +
        "both backends can keep. Recorded so the question is not asked a third time");
}

// ---- 4. *** "REFUSED" MUST CARRY THE NUMBER THAT REFUSES IT *** --------------------------------------------
{
    say("");
    const gd = read("render/gpuDriven.mjs");
    const noC = noComments(gd);
    const races = (await import("../../render/fleets.mjs")).RACES.length;
    const maxLods = (await import("../../render/gpuDriven.mjs")).MAX_LODS;
    say(`  ${races} races x ${maxLods} LODs = ${races * maxLods} indirect draws at the ceiling`);
    ok("!! *** RENDER BUNDLES ARE REFUSED BY ARITHMETIC, NOT BY TASTE ***",
        races === M.races && maxLods === M.maxLods && races * maxLods === M.indirectDrawCeiling &&
        /drawIndexedIndirect/.test(noC),
        `a bundle amortises CPU-side draw recording, and there are at most ${M.indirectDrawCeiling} indirect ` +
        "draws here -- one per (fleet, LOD) region, each covering many instances with the GPU choosing the " +
        "count. #133: find the consumer BEFORE taking the solver. There is not one");
    ok("...and createRenderBundle really is absent, so the refusal is about a real absence",
        !/createRenderBundle/.test(noComments(read("gfx/device.js"))),
        "refusing something already present would be a different and much sillier claim");
}

// ---- 5. *** THE THREE NAMES THAT MEAN TWO THINGS, WHICH IS HOW THE SURVEY WENT WRONG *** -------------------
{
    say("");
    for (const c of P.NAME_COLLISIONS) say(`  "${c.token}" -- ${c.actuallyIs.slice(0, 92)}`);
    ok("every collision names a token, what it looks like, what it is, and what it cost",
        P.NAME_COLLISIONS.length === M.nameCollisions &&
        P.NAME_COLLISIONS.every((c) => c.token && c.looksLike && c.actuallyIs && c.cost));
    // and each is still true of the tree, or the row is stale
    // DRIVEN FROM THE ROWS THEMSELVES. The first draft grepped three HARD-CODED strings, so renaming a row's
    // token to "notARealToken" cost ZERO RED -- the check never read the data it was checking. Second copy of
    // a fact cannot disagree with the first; this reads `c.token` out of the row and looks for THAT.
    const stale = P.NAME_COLLISIONS.filter((c) => {
        try { return !read(c.evidenceFile).includes(c.token); } catch { return true; }
    });
    ok("!! and each row's OWN token is still in its OWN named file -- a stale collision row is worse than none",
        stale.length === 0 && P.NAME_COLLISIONS.every((c) => c.evidenceFile),
        stale.length ? "STALE: " + stale.map((c) => c.token + " not in " + c.evidenceFile).join("; ")
                     : P.NAME_COLLISIONS.map((c) => c.token + " in " + c.evidenceFile).join("; "));
    ok("...and MtoRenderer's sampleCount really is unrelated to multisampling",
        !/multisample|MSAA/i.test(noComments(read("engine/MtoRenderer.js"))),
        "which is what makes it a collision rather than a coincidence of spelling");
}

console.log("pipelineGaps-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
