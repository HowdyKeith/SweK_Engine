#!/usr/bin/env node
// WebGLEngine/tools/ship/fsrContent-selfcheck.mjs -- v4697
//
// *** SEVEN SCENES, AND WHAT EACH ONE ACTUALLY IS -- MEASURED, NOT ASSERTED. ***
//
// v4696 closed by saying a sound transfer test needs more than three scenes, because three folds were never a
// distribution. v4697 adds four. The danger in adding content to an experiment that has already produced
// results is obvious: a scene set chosen after seeing an answer is a way of choosing the answer. So the four
// were picked on stated grounds -- written into fsr.html's own header before any of them was measured -- and
// this gate measures whether they are what those grounds claim.
//
// *** NOTHING HERE MEASURES FRAME GENERATION. *** No learned pass, no gate, no PSNR. This round widens the
// population and says what the population is; using it is a later round's business and owes a fresh
// pre-registration. Measuring the content and testing a hypothesis on it in the same round would make the
// content's properties answerable to the hypothesis.
"use strict";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin } from "./webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);

const ORIGINAL = ["zone", "smooth", "checker"];
const ADDED = ["bars", "edges", "noise", "ramp"];
const ALL = [...ORIGINAL, ...ADDED];

console.log("fsrContent-selfcheck -- seven scenes, and what each one actually is\n");

console.log("1. THE PAGE OFFERS ALL SEVEN, AND THE SAMPLER NO LONGER GUESSES");
{
    const html = fs.readFileSync(path.join(ENG, "fsr.html"), "utf8");
    const opts = [...html.matchAll(/<option value="(\w+)">[^<]*<\/option>/g)].map((m) => m[1]);
    // *** THE TWO LISTS MUST BE EQUAL, NOT MERELY OVERLAPPING. *** The first draft asserted only that this
    // gate's scenes are selectable on the page, so adding a scene to the page and forgetting it here scored
    // 0 RED -- and an unmeasured scene is worse than a missing one in a leave-one-scene-out design, because
    // it sits outside every fold while looking like content the experiment covers.
    const sceneOpts = (() => {
        const m = /<select id="scene">([\s\S]*?)<\/select>/.exec(html);
        return m ? [...m[1].matchAll(/<option value="(\w+)">/g)].map((x) => x[1]) : [];
    })();
    const missing = ALL.filter((x) => !sceneOpts.includes(x));
    const unmeasured = sceneOpts.filter((x) => !ALL.includes(x));
    ok("*** the page's scene list and this gate's are THE SAME SET, in both directions ***",
       missing.length === 0 && unmeasured.length === 0 && sceneOpts.length === ALL.length,
       `page offers ${sceneOpts.length} (${sceneOpts.join(", ")}), this gate measures ${ALL.length}. ` +
       (missing.length ? `MISSING FROM THE PAGE: ${missing.join(", ")}. ` : "") +
       (unmeasured.length ? `ON THE PAGE AND UNMEASURED: ${unmeasured.join(", ")}. ` : "") +
       "A scene the page cannot select is dead code here; a scene this gate does not measure is content whose " +
       "properties nobody knows, and a later round would fold it in as if they did.");
    // *** THE FALLBACK IS THE POINT OF THIS ROW. *** scene() used to end in a bare `else` producing the zone
    // plate, so a misspelled kind silently BECAME zone. In a leave-one-scene-out design that merges two folds
    // into one and nothing says so.
    ok("*** an unknown scene kind THROWS rather than quietly becoming the zone plate ***",
       /unknown kind/.test(html) && /else throw new Error/.test(html),
       "the sampler names every kind and refuses the rest. The old bare `else` would have turned a typo in a " +
       "fold list into a silent merge of two scenes, which is the shape of defect this arc has spent four " +
       "rounds finding in other files.");
}

console.log("\n2. *** WHAT THE SEVEN ARE, BY MEASUREMENT ON THE PAGE'S OWN SAMPLER ***");
const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 900000, args: { ALL }, script: `async (a) => {
    const ifr = document.createElement("iframe");
    ifr.style.width = "1200px"; ifr.style.height = "900px"; ifr.src = "/fsr.html";
    document.body.appendChild(ifr);
    await new Promise((res) => { ifr.onload = res; });
    const d = ifr.contentDocument, $ = (id) => d.getElementById(id);
    const until = async (fn, ms) => { const t0 = Date.now();
        while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch {} await new Promise(r2 => setTimeout(r2, 40)); } return false; };
    await until(() => /engine:/.test(($("engine") || {}).textContent || ""), 180000);
    // The sampler is a function of (u, v, kind) on the page's own window, so it is measured where it lives
    // rather than reimplemented here -- a copy would be a second definition that can drift from the one the
    // generator samples.
    const W = ifr.contentWindow;
    const out = {};
    const N = 128;
    for (const kind of a.ALL) {
        let thrown = null;
        try {
            const lum = new Float64Array(N * N);
            for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
                const c = W.__fsrScene((i + 0.5) / N, (j + 0.5) / N, kind);
                lum[j * N + i] = 0.25 * c[0] + 0.5 * c[1] + 0.25 * c[2];
            }
            let mean = 0; for (const v of lum) mean += v; mean /= lum.length;
            let vari = 0; for (const v of lum) vari += (v - mean) * (v - mean); vari /= lum.length;
            // |Laplacian| per pixel: total high-frequency energy
            let lap = 0, gx = 0, gy = 0, edgy = 0;
            for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
                const c = lum[j * N + i];
                const l = lum[j * N + i - 1], rr = lum[j * N + i + 1], u = lum[(j - 1) * N + i], dn = lum[(j + 1) * N + i];
                const L = Math.abs(4 * c - l - rr - u - dn);
                lap += L; if (L > 0.05) edgy++;
                gx += Math.abs(rr - l); gy += Math.abs(dn - u);
            }
            const n = (N - 2) * (N - 2);
            out[kind] = { mean, vari, lap: lap / n, edgeFrac: edgy / n,
                          aniso: Math.abs(gx - gy) / (gx + gy + 1e-9) };
        } catch (e) { thrown = String(e.message).slice(0, 160); out[kind] = { thrown }; }
    }
    let unknown = null;
    try { W.__fsrScene(0.5, 0.5, "definitely-not-a-scene"); } catch (e) { unknown = String(e.message).slice(0, 160); }
    ifr.remove();
    return { out, unknown };
}` });

if (!r.ok) { ok("the page ran", false, `${r.reason || "no result"} ${JSON.stringify(r.pageErrors || []).slice(0, 400)}`); }
else {
const S = r.result.out;
for (const k of ALL) {
    const m = S[k];
    say(`${k.padEnd(8)} ${m.thrown ? "THREW: " + m.thrown : `var ${m.vari.toFixed(4)}  |lap| ${m.lap.toFixed(4)}  ` +
        `edge-pixels ${(m.edgeFrac * 100).toFixed(1)}%  anisotropy ${m.aniso.toFixed(3)}`}`);
}
ok("*** all seven sample without throwing, so every one is real content and not a name ***",
   ALL.every((k) => !S[k].thrown), ALL.filter((k) => S[k].thrown).map((k) => `${k}: ${S[k].thrown}`).join("; ") || "seven of seven");
ok("...and the unknown kind really does throw, in the page",
   /unknown kind/.test(r.result.unknown || ""), r.result.unknown);

console.log("\n3. *** THE FOUR ADDITIONS OPEN AXES THE THREE ORIGINALS DO NOT SPAN ***");
// *** A SCENE THAT THREW HAS NO STATISTICS, AND THE FIRST DRAFT OF THIS SECTION DEREFERENCED THEM ANYWAY. ***
// It died on a TypeError -- 3 FAIL rows and then a crash, which is a process that never reached a verdict on
// the remaining rows. A crash is not a verdict. The rows below run only when every scene sampled.
if (!ALL.every((k) => !S[k].thrown)) { say("every row below is SKIPPED: a scene threw, so there are no statistics to compare"); }
else {
    // (a) SPARSE vs DENSE high frequency. The checker's every pixel is an edge; `edges` has flat interiors.
    ok("*** `edges` is SPARSE high frequency where `checker` is dense -- a regime no original covers ***",
       S.edges.edgeFrac < 0.25 && S.checker.edgeFrac > 0.9 && S.edges.lap > S.smooth.lap,
       `edge-pixel fraction: edges ${(S.edges.edgeFrac * 100).toFixed(1)}%, checker ${(S.checker.edgeFrac * 100).toFixed(1)}%, ` +
       `smooth ${(S.smooth.edgeFrac * 100).toFixed(1)}%. Most real content is sparse-edged and all three originals ` +
       "are either flat, swept or dense, so this is the shape the set was missing.");
    // (b) ORIENTATION. Every original is isotropic or symmetric in x and y.
    ok("*** `bars` is ORIENTED where every original is not -- the first anisotropic content on this page ***",
       S.bars.aniso > 0.1 && ORIGINAL.every((k) => S[k].aniso < 0.1),
       `anisotropy: bars ${S.bars.aniso.toFixed(3)} against ${ORIGINAL.map((k) => `${k} ${S[k].aniso.toFixed(3)}`).join(", ")}. ` +
       "A block-matching flow field has no reason to behave the same on a grating as on a zone plate, and " +
       "until now nothing here could tell.");
    // *** AND `ramp` READS HIGHER STILL, WHICH THE ROW ABOVE DOES NOT CLAIM OTHERWISE AND IS WORTH SAYING. ***
    say(`for completeness: ramp's anisotropy is ${S.ramp.aniso.toFixed(3)}, ABOVE bars' ${S.bars.aniso.toFixed(3)} -- ` +
        "a pure x-gradient is maximally oriented by this measure. The row above claims bars is oriented where " +
        "the ORIGINALS are not, and does not claim it is the only oriented addition; ramp is oriented with no " +
        "high-frequency content and bars is oriented with some, which is why both are in the set.");
    // (c) THE DEGENERATE LOW END. `smooth` oscillates; `ramp` does not.
    ok("*** `ramp` is smooth WITHOUT oscillation, which `smooth` is not ***",
       S.ramp.lap < S.smooth.lap && S.ramp.vari > 0.01,
       `|lap| ramp ${S.ramp.lap.toFixed(5)} against smooth ${S.smooth.lap.toFixed(5)}, with variance ` +
       `${S.ramp.vari.toFixed(4)} so it is not a blank frame. A cross-fade should be near-exact here, which ` +
       "makes it the low end of the axis the whole arc is drawn against.");
    // (d) BROADBAND WITHOUT STRUCTURE.
    ok("*** `noise` carries high frequency without repeating structure, separating the two ***",
       S.noise.lap > S.ramp.lap && S.noise.edgeFrac < S.checker.edgeFrac && S.noise.aniso < 0.2,
       `|lap| ${S.noise.lap.toFixed(4)}, edge-pixels ${(S.noise.edgeFrac * 100).toFixed(1)}%, anisotropy ${S.noise.aniso.toFixed(3)}. ` +
       "checker and bars both have high frequency AND structure a matcher can lock onto; this has the first " +
       "without the second, which is the confound the originals could not separate.");
    // AND THE SPREAD ITSELF, which is the reason the round exists
    const laps = ALL.map((k) => S[k].lap);
    ok("*** and the seven span an order of magnitude in high-frequency energy, where three spanned less ***",
       Math.max(...laps) / Math.max(1e-9, Math.min(...laps)) > 10,
       `|lap| from ${Math.min(...laps).toFixed(5)} (${ALL[laps.indexOf(Math.min(...laps))]}) to ` +
       `${Math.max(...laps).toFixed(4)} (${ALL[laps.indexOf(Math.max(...laps))]}). The axis this arc measured its ` +
       "central finding against is now sampled at seven points instead of three.");
}

console.log("\n4. *** THE ORIGINAL THREE ARE UNTOUCHED, BIT FOR BIT, AGAINST THEIR PRIOR FORMULAS ***");
{
    // *** THE SAMPLER WAS REWRITTEN -- A BARE `else` BECAME A NAMED BRANCH -- AND THE THREE ORIGINALS CARRY
    // EVERY FIGURE THIS ARC HAS PUBLISHED. *** A rewrite that moved `zone` by a bit would move 106 genuine
    // disocclusions, the +0.107 dB checker reading and six page gates' pinned numbers, and it would do it
    // quietly. So the prior formulas are transcribed here ONCE and compared bit for bit.
    //
    // Transcribing is the thing this file warns against elsewhere, and the justification is narrow: this is a
    // one-time equivalence check against a KNOWN PRIOR FORM, run to prove a rewrite inert. It is not a
    // parallel implementation that ships, and it has no second caller.
    //
    // The first draft of this row was a placeholder that never got finished: it asserted
    // Math.abs(S.zone.lap - S.zone.lap) === 0, which is zero for every input, beside a variance threshold that
    // was simply wrong for the scene. It printed FAIL for the wrong reason, which is the only reason it was
    // caught -- a tautology that PASSED would have sat here as a row nobody could fail.
    // *** AND THE COMPARISON HAPPENS INSIDE THE PAGE, ON ONE ENGINE. *** The first draft transcribed the
    // prior formulas HERE and compared node's answers against the browser's: it read 1.11e-16 on `smooth`,
    // one ULP. Math.cos and Math.exp are implementation-defined in ECMAScript and Chromium's V8 is not
    // node's, so bit equality was never achievable across that boundary and the row could not have passed
    // however inert the rewrite was. The prior formulas go into the page script instead, where both sides
    // are evaluated by the same interpreter and `bit for bit` means what it says.
    const r2 = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 600000, args: {}, script: `async () => {
        const ifr = document.createElement("iframe");
        ifr.style.width = "800px"; ifr.style.height = "600px"; ifr.src = "/fsr.html";
        document.body.appendChild(ifr);
        await new Promise((res) => { ifr.onload = res; });
        const until = async (fn, ms) => { const t0 = Date.now();
            while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch {} await new Promise(r3 => setTimeout(r3, 40)); } return false; };
        await until(() => typeof ifr.contentWindow.__fsrScene === "function", 180000);
        const W = ifr.contentWindow;
        // the three branches EXACTLY as they stood before v4697 renamed the bare else
        const prior = {
            smooth: (u, v) => { const x = (u - 0.5) * 2, y = (v - 0.5) * 2;
                return 0.5 + 0.35 * Math.cos(2.5 * (x + y)) * Math.exp(-0.6 * (x * x + y * y)); },
            checker: (u, v) => ((Math.floor(u * 192) + Math.floor(v * 192)) & 1) ? 0.9 : 0.1,
            zone: (u, v) => { const x = (u - 0.5) * 2, y = (v - 0.5) * 2;
                return 0.5 + 0.5 * Math.cos(90 * (x * x + y * y)); },
        };
        let worst = 0, worstKind = null, n = 0, exact = 0;
        for (const kind of ["smooth", "checker", "zone"]) {
            for (let j = 0; j < 40; j++) for (let i = 0; i < 40; i++) {
                const u = (i + 0.5) / 40, v = (j + 0.5) / 40;
                const got = W.__fsrScene(u, v, kind)[0], want = prior[kind](u, v);
                const d = Math.abs(got - want);
                if (got === want) exact++;
                if (d > worst) { worst = d; worstKind = kind; }
                n++;
            }
        }
        ifr.remove();
        return { worst, worstKind, n, exact };
    }` });
    if (!r2.ok) { ok("the page ran for the invariance check", false, r2.reason || "no result"); }
    else {
        const { worst, worstKind, n, exact } = r2.result;
        ok("*** the rewrite is INERT on all three originals -- bit for bit over 4800 samples, ON ONE ENGINE ***",
           worst === 0 && exact === n && n === 4800,
           `${exact} of ${n} samples bit-identical; worst |now - prior| ${worst.toExponential(2)}` +
           `${worstKind ? ` on ${worstKind}` : ""}. ` +
           "Bit equality and not a tolerance, because `inert` has no epsilon -- the same standard " +
           "render/frameInterpGPU-selfcheck.mjs holds its frame form to.");
    }
}
}

// ---- THE SABOTAGE LOG ------------------------------------------------------------------------------------
//
//   U1  the silent zone-plate fallback comes back                        -> 2 red
//   U5  `ramp` is given oscillation                                      -> 2 red
//   U2  the rewrite MOVES the zone plate by one coefficient              -> 1 red
//   U3  `edges` is made dense                                            -> 1 red
//   U4  `bars` is made isotropic                                         -> 1 red
//   U6  a scene is added to the page and not to this gate                -> 1 red, AFTER THE LISTS HAD TO MATCH
//   U6b a scene is removed from the page while this gate measures it     -> 1 red, the other direction
//   U7  bit equality is loosened to a 1e-9 tolerance                     -> 0 RED, population empty
//
// *** U2 IS THE ONE THE ROUND EXISTS TO SURVIVE. *** Moving the zone plate's coefficient from 90 to 91 is
// invisible to a human and would move 106 genuine disocclusions, the checker's +0.107 dB and six page gates'
// pinned figures. The invariance row catches it because it compares against the PRIOR FORMULAS bit for bit,
// inside the page, and a rewrite that touched the originals could not pass.
//
// *** U6 SCORED 0 RED BECAUSE THE ROW ONLY CHECKED ONE DIRECTION. *** It asserted that this gate's scenes are
// selectable on the page, so a scene added to the PAGE and forgotten HERE was invisible. In a
// leave-one-scene-out design an unmeasured scene is worse than a missing one: it sits outside every fold
// while looking like content the experiment covers. The lists are held equal as SETS now and both directions
// redden. Same shape as v4696's one-sided collapse detector, one round later -- a check aimed at one end of a
// relation is not a check on the relation.
//
// *** U7 IS A 0-RED WHOSE ADVERSARIAL POPULATION IS EMPTY, AND IT IS THE SEVENTH IN THIS ARC. *** The worst
// difference is exactly 0, so any tolerance passes and loosening the comparison changes no live answer. A
// fixture for it would have to manufacture a near-miss, which would test the comparison operator rather than
// the rewrite. Recorded rather than chased, as v4686's nearerIsLess, v4687's two, v4688's two, v4693's tie
// handling, v4695's non-vacuity clause and v4696's threshold were.
//
// *** AND THIS GATE'S OWN FIRST DRAFT FAILED FOR A REASON WORTH KEEPING: IT COMPARED ACROSS TWO ENGINES. ***
// The prior formulas were transcribed into this file and evaluated in node, against the page's values from
// Chromium. It read 1.11e-16 on `smooth` -- one ULP. Math.cos and Math.exp are implementation-defined in
// ECMAScript and the two V8s need not agree on the last bit, so "bit for bit" was unachievable across that
// boundary however inert the rewrite was. Both sides are evaluated by the same interpreter now. The claim
// did not change; the place it is measured did.

console.log(`\nfsrContent-selfcheck: ${fails ? `${fails} FAILED` : "ALL GREEN"}`);
console.log("unchecked here: ANYTHING ABOUT FRAME GENERATION. No learned pass, no gate, no PSNR -- this round " +
    "widens the population and says what the population is, and using it owes a fresh pre-registration. " +
    "Measuring the content and testing a hypothesis on it in the same round would make the content's " +
    "properties answerable to the hypothesis. AND SEVEN SYNTHETIC SCENES ARE STILL NOT A DISTRIBUTION: they " +
    "are seven points chosen to span an axis, which is better than three and is not a sample of anything.");
process.exit(fails ? 1 : 0);
