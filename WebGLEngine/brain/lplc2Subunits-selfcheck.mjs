// WebGLEngine/brain/lplc2Subunits-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). Run: node brain/lplc2Subunits-selfcheck.mjs
//
// THE GATE OF brain/lplc2Subunits.mjs (brain/FLY_RETINOTOPY_RF_WIP.md Part 5, registered before the module): the constants as registered, the stimuli's geometry as Part 4 reads the text (and Part 5 assumes
// where only the figure gives it), the subunit rule on HAND-MADE motion maps, the peak window and the predictions on fixtures. It runs NO registered stimulus through the model: the round is run once, by
// tools/ship/takeLplc2Subunits.mjs, after this gate is green and committed.
// SABOTAGED -- 16 mutants of brain/lplc2Subunits.mjs, each alone in place and restored, EVERY ONE RED BY NAME: U01 the offset 12 | U02 the -x drive's sign | U03 R not squared | U04 one rectification per arm |
//   U05 40 degrees/s | U06 the reach 40 | U07 S2 outward | U08 S3l on +x | U09 S5's y arms outward | U10 S9 on the x axis | U11 a 100 ms window | U12 P3 against one arm | U13 P5 at 20 % | U14 S8 looming |
//   U15 edges without coverage | U16 no hold before the motion. FIRST PASS: four rows of mine were wrong, not the module -- the grating's dark fraction (90 px is 4.5 periods), the overlapping disks (the
//   registered geometry shares |x| < 5 between +x and -x), a spike placed within a window of the plateau, and a P3 fixture that also crossed P4; each row was corrected to what the registration says.
"use strict";
import * as L from "./lplc2Subunits.mjs";

let fails = 0, finished = false;
const J = JSON.stringify;
const ok = (n, c, d = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const sec = (t) => console.log("\n" + t);
const guarded = (name, f) => { try { f(); } catch (e) { ok(`${name} ran to the end`, false, "THREW " + String((e && e.stack) || e).split("\n").slice(0, 2).join(" | ").slice(0, 300)); } };
process.on("exit", () => { if (!finished) { console.log("\nlplc2Subunits-selfcheck: DID NOT FINISH"); process.exitCode = 1; } });

sec("1. the constants as registered (Part 5) and read (Part 4)");
guarded("section 1", () => {
    ok("a 90 x 90 frame at 1 degree a pixel, 10 ms steps (the paper's 90 degree coverage)", L.FRAME.w === 90 && L.FRAME.h === 90 && L.FRAME.degPerPx === 1 && L.FRAME.step === 0.01 && Object.isFrozen(L.FRAME));
    ok("four subunits: disks of radius 15 at 10 degrees from the centre", L.SUBUNITS.offset === 10 && L.SUBUNITS.radius === 15 && Object.isFrozen(L.SUBUNITS));
    ok("the text's stimulus values: 10 degree bars at 20 degrees/s, dark 0 on 0.5, 2 s holds, the 10 degree centre square, the disc 5 to 60 degrees at 10 degrees/s, the wide bar 60; the assumed reach 30",
        J(L.STIM) === J({ background: 0.5, dark: 0, holdS: 2, barWidth: 10, edgeSpeed: 20, centreSquare: 10, reach: 30, discFrom: 5, discTo: 60, discSpeed: 10, gratingPeriod: 20, wideBar: 60 }) && Object.isFrozen(L.STIM));
    ok("the 300 ms peak window; the eleven stimuli of Part 5", L.PEAK_WINDOW_S === 0.3 && J(L.STIMULI) === J(["S1", "S2", "S3r", "S3l", "S4", "S5", "S6", "S7", "S8", "S9", "S10"]));
});

sec("2. the stimuli's geometry (drawn, never run through the model here)");
guarded("section 2", () => {
    const darkPx = (f) => f.data.reduce((a, v) => a + (0.5 - v) / 0.5, 0), ends = (n) => { const s = L.stimulus(n); return { s, a: darkPx(s.frames[0]), b: darkPx(s.frames[s.frames.length - 1]) }; };
    const near = (x, y, tol = 1) => Math.abs(x - y) <= tol;
    const s1 = ends("S1"), s2 = ends("S2");
    ok("S1: 2 s still (200 frames), 1.25 s of motion, 2 s still; it starts as the 10 x 10 square (100 px) and ends with four 10 x 25 arms (1,100 px)",
        s1.s.frames.length === 200 + 124 + 200 && near(s1.a, 100) && near(s1.b, 1100) && s1.s.motionS === 1.25, J({ n: s1.s.frames.length, a: s1.a, b: s1.b }));
    ok("S2 is S1 in reverse (1,100 px to 100)", near(s2.a, 1100) && near(s2.b, 100));
    const s3 = ends("S3r"), s3l = ends("S3l"), s4 = ends("S4"), s5 = ends("S5");
    ok("S3r and S3l end with one arm (350 px), S4 with two (600); S5 starts with the y arms full (600) and ends with the x arms full (600)", near(s3.b, 350) && near(s3l.b, 350) && near(s4.b, 600) && near(s5.a, 600) && near(s5.b, 600), J([s3.b, s3l.b, s4.b, s5.a, s5.b]));
    const r3 = L.stimulus("S3r").frames.at(-1), r3l = L.stimulus("S3l").frames.at(-1), at = (f, x, y) => f.data[(44.5 + y - 0.5) * 90 + (44.5 + x - 0.5)];
    ok("...S3r's arm is on +x and S3l's on -x (a pixel 20 degrees right is dark in S3r and grey in S3l)", at(r3, 20, 0) === 0 && at(r3l, 20, 0) === 0.5 && at(r3l, -20, 0) === 0, J([at(r3, 20, 0), at(r3l, 20, 0), at(r3l, -20, 0)]));
    const s6 = ends("S6");
    // 90 px is 4.5 periods of 20, so the dark fraction moves between 0.44 and 0.56 with the bars' phase (first fixture claimed 0.5 +- 0.02 at the end: wrong, the grating had moved 25 degrees)
    ok("S6: 10 degree bars every 20 over the whole frame, about half of it dark at the start and at the end (0.44 to 0.56: 90 is 4.5 periods)", s6.a / 8100 >= 0.44 && s6.a / 8100 <= 0.56 && s6.b / 8100 >= 0.44 && s6.b / 8100 <= 0.56, J([s6.a, s6.b]));
    const s7 = ends("S7"), s8 = ends("S8");
    ok("S7: a disc from 5 to 60 degrees across (pi 2.5^2 to pi 30^2 px) in 2.75 s; S8 the reverse",
        near(s7.a, Math.PI * 6.25, 2) && near(s7.b, Math.PI * 900, 8) && L.stimulus("S7").motionS === 2.75 && near(s8.a, s7.b, 1) && near(s8.b, s7.a, 1), J([s7.a, s7.b, s8.a, s8.b]));
    const s9 = ends("S9"), s10 = ends("S10");
    ok("S9 ends as a 10 x 60 bar on the diagonal (600 px), S10 as 60 x 60 (3,600)", near(s9.b, 600, 6) && near(s10.b, 3600, 20), J([s9.b, s10.b]));
    const f9 = L.stimulus("S9").frames.at(-1);
    ok("...on the DIAGONAL: 20 degrees along +x+y is dark, 20 degrees along +x is grey", at(f9, 14, 14) === 0 && at(f9, 20, 0) === 0.5, J([at(f9, 14, 14), at(f9, 20, 0)]));
    let threw = null; try { L.stimulus("S11"); } catch (e) { threw = e.message; }
    ok("an unknown stimulus is refused by name", /no stimulus named "S11"/.test(threw || ""), threw);
});

sec("3. the subunit rule on hand-made motion maps");
guarded("section 3", () => {
    const M = L.masks(), n = 8100, X0 = 44.5, field = (f) => { const a = new Float64Array(n); for (let py = 0; py < 90; py++) for (let px = 0; px < 90; px++) a[py * 90 + px] = f(px - X0, py - X0); return a; };
    const zero = new Float64Array(n), ones = field(() => 1);
    ok("four disks of equal size, each centred 10 degrees out on its own axis", Object.values(M).every((a) => a.length === M["+x"].length && a.length > 600),
        J(Object.fromEntries(Object.entries(M).map(([k, a]) => [k, a.length]))));
    const t = L.cellFromMaps(ones, zero, M);
    ok("!! UNIFORM MOTION CANCELS: motion toward +x everywhere drives +x as much as it drives -x against, and the cell is 0", t.drives["+x"] === -t.drives["-x"] && t.drives["+x"] > 0 && t.R === 0, J(t.drives));
    const onlyX = new Float64Array(n); for (const i of M["+x"]) onlyX[i] = 1;
    const one = L.cellFromMaps(onlyX, zero, M), len = M["+x"].length, shared = M["+x"].filter((i) => M["-x"].includes(i)).length;
    // the registered disks OVERLAP (radius 15 at +-10: the band |x| < 5 is in both), so motion there feeds the opposite subunit too, with the opposite sign
    ok("one arm's outward motion alone: R is the summed drives squared, not zero; the opposite disk shares the |x| < 5 band and takes it with the opposite sign",
        one.drives["+x"] === len && one.drives["-x"] === -shared && shared > 0 && one.R === (len - shared) ** 2 && one.R > 0, J({ drives: one.drives, shared }));
    const radial = (s) => [field((x) => s * Math.sign(x)), field((x, y) => s * Math.sign(y))];
    const [ho, vo] = radial(1), [hi, vi] = radial(-1), out = L.cellFromMaps(ho, vo, M), inw = L.cellFromMaps(hi, vi, M);
    ok("radial OUTWARD motion drives all four positive; radial INWARD drives all four negative and the cell is 0", Object.values(out.drives).every((d) => d > 0) && out.R > 0 && Object.values(inw.drives).every((d) => d < 0) && inw.R === 0,
        J({ out: out.drives, inw: inw.drives }));
    const xOut = L.cellFromMaps(field((x) => Math.sign(x)), zero, M), xOutYIn = L.cellFromMaps(field((x) => Math.sign(x)), field((x, y) => -Math.sign(y)), M);
    ok("!! THE SUM COMES BEFORE THE RECTIFICATION: inward motion on the y axis cuts what outward motion on the x axis gives (one rectification per arm could not)", xOutYIn.R < xOut.R && xOut.R > 0, J({ xOut: xOut.R, xOutYIn: xOutYIn.R }));
    const twoArms = new Float64Array(n); for (const i of M["+x"]) twoArms[i] = 1; for (const i of M["-x"]) twoArms[i] = -1;
    ok("two arms' outward motion is MORE than the sum of each alone (the square): (2a)^2 > a^2 + a^2", L.cellFromMaps(twoArms, zero, M).R > 2 * one.R, J({ two: L.cellFromMaps(twoArms, zero, M).R, oneEach: one.R }));
});

sec("4. the peak window and the predictions, on fixtures");
guarded("section 4", () => {
    const tr = new Array(100).fill(0); for (let i = 40; i < 70; i++) tr[i] = 3; tr[99] = 100;   // the spike 30 samples past the plateau's end, so no window holds both
    ok("the peak is the largest 300 ms (30-sample) mean, so one spike of 100 counts as 100/30 against a 30-sample plateau of 3", L.peakWindow(tr) === 100 / 30 && L.peakWindow([1, 2]) === 1.5, String(L.peakWindow(tr)));
    const good = { S1: 100, S2: 1, S3r: 10, S3l: 10, S4: 40, S5: 20, S6: 2, S7: 80, S8: 3, S9: 30, S10: 10 };
    const v = L.predictions(good);
    ok("a fixture meeting every prediction is SUPPORTED, with seven predictions named P1 to P7", v.verdict === "SUPPORTED" && v.predictions.map((p) => p.id).join() === "P1,P2,P3,P4,P5,P6,P7");
    const cases = [["P1", { S2: 11 }], ["P2", { S3l: 0 }], ["P3", { S4: 19, S5: 10 }], ["P4", { S5: 40 }], ["P5", { S6: 10 }], ["P6", { S8: 8 }], ["P7", { S10: 30 }]];
    const named = cases.map(([id, ch]) => { const r = L.predictions({ ...good, ...ch }); return r.verdict === `NOT SUPPORTED (${id})` ? null : `${id}: ${r.verdict}`; }).filter(Boolean);
    ok("!! each prediction fails ALONE when its own line is crossed, and the verdict names it (S2 at 11 % of S1; a silent arm; S4 at the arms' sum minus 1 (S5 below it); S5 = S4; S6 at 10 %; S8 at 10 %; S10 = S9)", named.length === 0, named.join(" | "));
    let threw = null; try { L.predictions({ ...good, S7: NaN }); } catch (e) { threw = e.message; }
    ok("a missing or non-finite response is refused by name", /no finite response for S7/.test(threw || ""), threw);
});

finished = true;
console.log(fails ? `\nlplc2Subunits-selfcheck: ${fails} FAILED` : "\nlplc2Subunits-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
