// WebGLEngine/ui/svgPath-selfcheck.mjs -- v4180
//
// GATES ui/svgPath.mjs (the pure measurer) and ui/svgDraw.js (the browser half).
//
// *** THIS IS GATEABLE AGAINST GROUND TRUTH, WHICH IS UNUSUAL FOR A DRAWING EFFECT AND IS THE REASON THE
// *** MEASUREMENT WAS BUILT IN PURE JS RATHER THAN ON getTotalLength. *** A straight line's length is exact
// arithmetic. A closed square's is exact. An arc of radius r through angle t is r*t to as many digits as you
// like. So the flattening error is MEASURED here, not asserted -- and its SIGN is checked, because flattening
// always understates (a chord is shorter than its arc) and an overstatement would mean something else is wrong.
//
// The quiet failure this whole family of libraries has is a length that comes out SHORT: the dasharray is
// short, so the stroke finishes drawing before the animation finishes, and the line just sits there complete
// while the clock runs on. Every check about dropped segments below is about that.
//
// Run: node ui/svgPath-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { fileURLToPath } from "node:url";
import { parsePath, flattenPath, pathLength, subpathLengths, isSupported, DEFAULT_TOLERANCE } from "./svgPath.mjs";
import { measureElement, primeDraw, setProgress, drawElement, clearDraw } from "./svgDraw.js";
import { readFileSync } from "node:fs";
import { codeOnly, noComments } from "../tools/ship/sourceScan.mjs";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// 1) EXACT CASES. Straight segments have no flattening error at all, so these are equalities.
{
    ok(pathLength("M 0 0 L 3 4") === 5, "a 3-4-5 line measures exactly 5");
    ok(pathLength("M 0 0 H 10 V 10 H 0 Z") === 40, "a closed 10x10 square measures exactly 40");
    ok(pathLength("M 0 0 H 10 V 10 H 0") === 30, "and the same square UNCLOSED measures 30");
    ok(pathLength("M 0 0 H 10 V 10 H 0 Z") - pathLength("M 0 0 H 10 V 10 H 0") === 10,
        "*** so Z contributes its closing segment -- dropping it is the commonest way a closed shape measures short ***");
    ok(pathLength("m 0 0 l 3 4") === 5, "relative commands agree with absolute");
    ok(pathLength("M 0 0 L 3 4") === pathLength("M0,0L3,4"), "commas and missing spaces parse the same");
    ok(pathLength("M 0 0 L 1e1 0") === 10, "exponent notation parses (a naive tokeniser splits 1e-5 at the minus)");
    ok(pathLength("M 0 0 L -3 -4") === 5, "negative coordinates");
}

// 2) *** THE IMPLICIT-REPEAT RULE. *** "M 0 0 10 0" is a moveto then a LINETO, not two movetos. Reading it as
//    two movetos breaks the path into pieces and drops every segment between them from the length.
{
    const p = parsePath("M 0 0 10 0");
    ok(p.length === 2 && p[0].cmd === "M" && p[1].cmd === "L", "a repeated M becomes L");
    ok(pathLength("M 0 0 10 0") === 10, "so the implied segment IS measured (10, not 0)");
    ok(parsePath("m 0 0 10 0")[1].cmd === "l", "and a repeated lowercase m becomes lowercase l");
    ok(pathLength("M 0 0 L 1 0 2 0 3 0") === 3, "a repeated L is three segments, not one");
    ok(parsePath("M 0 0 C 0 1 1 1 1 0 1 -1 2 -1 2 0").length === 3, "a repeated C is two curves after the moveto");
}

// 3) *** CURVES: THE ERROR IS MEASURED, AND ITS SIGN IS CHECKED. ***
{
    const R = 10, exact = R * Math.PI / 2;
    const got = pathLength(`M ${R} 0 A ${R} ${R} 0 0 1 0 ${R}`);
    ok(near(got, exact, exact * 1e-3), `a quarter arc of radius 10 measures ${got.toFixed(6)} against an exact ${exact.toFixed(6)}`);
    ok(got < exact, "*** and it is SHORT, not long -- flattening replaces an arc with chords, which can only understate ***");
    ok((exact - got) / exact < 1e-4, `the relative error is ${(((exact - got) / exact) * 100).toFixed(4)}%, comfortably under a hundredth of a percent`);

    const cExact = 2 * Math.PI * 50;
    const cGot = pathLength("M 0 0 A 50 50 0 1 0 100 0 A 50 50 0 1 0 0 0");
    ok(near(cGot, cExact, cExact * 1e-3), `a full circle drawn as two arcs measures ${cGot.toFixed(4)} against ${cExact.toFixed(4)}`);
    ok(cGot < cExact, "also short, as it must be");

    // TIGHTENING THE TOLERANCE MUST REDUCE THE ERROR. If it does not, the tolerance is not connected to
    // anything and the default is a decoration.
    const coarse = pathLength(`M ${R} 0 A ${R} ${R} 0 0 1 0 ${R}`, { tolerance: 5 });
    const fine = pathLength(`M ${R} 0 A ${R} ${R} 0 0 1 0 ${R}`, { tolerance: 0.001 });
    ok(Math.abs(exact - fine) < Math.abs(exact - coarse), `a tighter tolerance measures closer (coarse ${coarse.toFixed(4)}, fine ${fine.toFixed(6)}, exact ${exact.toFixed(6)})`);
    ok(coarse < exact && fine < exact, "both still understate, at every tolerance");
    ok(DEFAULT_TOLERANCE === 0.05, "and the default tolerance is a stated number");

    // a cubic that IS a straight line has no flattening error, which isolates the curve maths from the summing
    ok(near(pathLength("M 0 0 C 1 0 2 0 3 0"), 3, 1e-9), "a cubic whose control points are collinear measures its exact chord length");
    ok(near(pathLength("M 0 0 Q 1 0 2 0"), 2, 1e-9), "and so does a degenerate quadratic");
}

// 4) THE SMOOTH-CURVE REFLECTIONS. S and T reflect the PREVIOUS control point; getting the no-previous-curve
//    case wrong bends the curve and changes its length without failing.
{
    // S after C: the reflected control point makes a symmetric S-curve
    const sPath = "M 0 0 C 0 5 5 5 5 0 S 10 -5 10 0";
    ok(pathLength(sPath) > 0 && Number.isFinite(pathLength(sPath)), "an S after a C measures finitely");
    // S with NO previous cubic: the reflection is the current point, so it degenerates to a quadratic-ish curve
    const sAlone = pathLength("M 0 0 S 5 5 10 0");
    ok(sAlone > 10 && sAlone < 14, `an S with no previous cubic still measures sensibly (${sAlone.toFixed(3)}, longer than the 10-unit chord)`);
    const tAlone = pathLength("M 0 0 T 10 0");
    ok(near(tAlone, 10, 1e-6), "a T with no previous quadratic reflects to the current point, giving a straight line of exactly 10");
    // a T after a Q is NOT straight
    ok(pathLength("M 0 0 Q 5 5 10 0 T 20 0") > 20, "a T after a Q continues the curve rather than going straight");
}

// 5) SUBPATHS are measured together and reported separately.
{
    ok(pathLength("M 0 0 L 3 4 M 10 10 L 10 20") === 15, "two subpaths sum to 15");
    ok(subpathLengths("M 0 0 L 3 4 M 10 10 L 10 20").join(",") === "5,10", "and are reported individually, for drawing them in sequence");
    ok(flattenPath("M 0 0 L 3 4 M 10 10 L 10 20").length === 2, "flattening gives one polyline per subpath");
    ok(flattenPath("M 5 5").length === 0, "a moveto with nothing after it yields no polyline rather than a zero-length one");
    ok(pathLength("M 5 5") === 0, "and measures zero");
}

// 6) MALFORMED INPUT IS REFUSED BY NAME. An unrecognised command that contributed zero would make the path
//    measure SHORT, which is the failure this module exists to avoid -- so silence is not an option.
{
    const throws = (d) => { try { pathLength(d); return false; } catch { return true; } };
    ok(throws("M 0 0 K 5 5"), "an unknown command is refused rather than skipped");
    ok(throws("M 0 0 L 5"), "a command with too few arguments is refused rather than padded");
    ok(throws("5 5 L 10 10"), "numbers before any command are refused");
    ok(throws(null) && throws(42), "a non-string is refused");
    ok(isSupported("M 0 0 L 1 1") === true && isSupported("M 0 0 K 1 1") === false, "isSupported answers without throwing, for a caller that wants to ask first");
    ok(pathLength("M 0 0 A 0 0 0 0 1 10 0") === 10,
        "a degenerate arc with zero radius becomes a straight line, per the SVG spec -- NOT an error and NOT zero");
}

// 7) DETERMINISM.
{
    const d = "M 10 80 C 40 10 65 10 95 80 S 150 150 180 80 A 30 30 0 0 1 200 100 Z";
    ok(pathLength(d) === pathLength(d), "the same path measures the same twice");
    ok(JSON.stringify(flattenPath(d)) === JSON.stringify(flattenPath(d)), "and flattens identically");
    ok(pathLength(d) > 0 && Number.isFinite(pathLength(d)), `a path using every command type measures finitely (${pathLength(d).toFixed(3)})`);
}

// 8) THE BROWSER HALF, driven against element-shaped fakes.
{
    const mkEl = (d, total) => ({
        style: {},
        getAttribute: (n) => (n === "d" ? d : null),
        ...(total === undefined ? {} : { getTotalLength: () => total }),
    });

    // it PREFERS the browser's own number when there is one
    const live = mkEl("M 0 0 L 3 4", 5.0001);
    ok(measureElement(live).via === "getTotalLength" && measureElement(live).length === 5.0001,
        "a live element's getTotalLength is preferred -- it is the number the renderer itself uses for the dash pattern");
    ok(measureElement(live, { forceParse: true }).via === "parsed", "and can be overridden for a caller that wants the parsed value");

    // *** AND THE TWO AGREE, which is the cross-check that makes having both worth it ***
    const d = "M 10 80 C 40 10 65 10 95 80 Z";
    ok(near(measureElement(mkEl(d, pathLength(d))).length, pathLength(d), 1e-9),
        "the two measurements agree on the same path");

    // a detached element returning 0 must NOT be believed
    const detached = mkEl("M 0 0 L 3 4", 0);
    ok(detached.getTotalLength() === 0, "the fake really does return 0");
    ok(measureElement(detached).via === "parsed" && measureElement(detached).length === 5,
        "*** a getTotalLength of 0 falls through to the parser -- believing it would set a dasharray of 0, which renders a SOLID line and reads as the effect never running ***");
    const noD = { style: {}, getAttribute: () => null, getTotalLength: () => 0 };
    ok(measureElement(noD).via === "unmeasurable" && measureElement(noD).length === 0, "an element with nothing to measure says so");
    ok(measureElement(null).via === "none", "and a null element does not throw");

    // priming renders nothing
    const el = mkEl("M 0 0 L 3 4", 5);
    primeDraw(el);
    ok(el.style.strokeDasharray === "5" && el.style.strokeDashoffset === "5", "priming sets dasharray and dashoffset to the length, so nothing is drawn");
    ok(setProgress(el, 0.5) === 0.5 && el.style.strokeDashoffset === "2.5", "half progress leaves half the offset");
    ok(setProgress(el, 1) === 1 && el.style.strokeDashoffset === "0", "full progress leaves zero offset");
    ok(setProgress(el, 2) === 1 && setProgress(el, -1) === 0, "progress is clamped at both ends");
    clearDraw(el);
    ok(el.style.strokeDasharray === "" && el.style.strokeDashoffset === "", "clearing restores a solid stroke");
}

// 9) *** THE LAST FRAME IS EXACT. *** A loop that stops at elapsed >= duration leaves the offset at whatever
//    the final tick computed, a hair above zero -- so a "finished" line keeps a permanent gap at its end.
{
    const el = { style: {}, getAttribute: () => "M 0 0 L 100 0", getTotalLength: () => 100 };
    let t = 0;
    const frames = [];
    // a clock that lands just SHORT of the duration on its last tick, which is the realistic case
    const raf = (cb) => { t += 97; frames.push(t); if (frames.length < 40) setTimeout(() => cb(t), 0); else setTimeout(() => cb(t + 10000), 0); };
    const h = drawElement(el, { duration: 1000, raf, now: () => t, ease: (u) => u });
    ok(h.ok === true && h.via === "getTotalLength", "the draw starts and reports which measurement it used");
    const res = await h.done;
    ok(res.ok === true, "and completes");
    ok(el.style.strokeDashoffset === "0", "*** the final offset is EXACTLY 0, not a hair above it -- otherwise a finished line keeps a one-pixel gap forever ***");

    // cancellation
    const el2 = { style: {}, getAttribute: () => "M 0 0 L 100 0", getTotalLength: () => 100 };
    let t2 = 0;
    const h2 = drawElement(el2, { duration: 100000, raf: (cb) => { t2 += 16; setTimeout(() => cb(t2), 0); }, now: () => t2 });
    h2.cancel();
    const r2 = await h2.done;
    ok(r2.cancelled === true && r2.ok === false, "cancel() resolves the promise rather than leaving it pending forever");

    // an unmeasurable element does not start a loop that never ends
    const bad = { style: {}, getAttribute: () => null };
    const h3 = drawElement(bad, { duration: 10 });
    ok(h3.ok === false && (await h3.done).ok === false, "an unmeasurable element returns a resolved handle instead of spinning");
}

// 10) THE WIRING. ui/brainTrail.js draws its edges as CUBIC BEZIERS, which is the shape that could not be
//     dash-animated before this -- so it is the consumer, not a demo page.
{
    const src = readFileSync(fileURLToPath(new URL("./brainTrail.js", import.meta.url)), "utf8");
    const code = codeOnly(src);        // strings AND comments blanked -- for code shapes
    const nc   = noComments(src);      // comments stripped, strings KEPT -- an import PATH is a string literal
    // Which instrument to read with, again: codeOnly blanks "./svgDraw.js" to "", so an import-path check
    // against it goes red on a correctly wired file. Same lesson as the v4174 frameDirty gate.
    ok(/import \{[^}]*drawElement[^}]*\} from "\.\/svgDraw\.js"/.test(nc), "brainTrail imports the draw helper");
    ok(/^import /m.test(nc.split("\n").slice(0, 60).join("\n")), "and the import is at the top of the module rather than buried mid-file");
    ok(/opts\.draw &&/.test(code), "the draw-in is OPT-IN -- this panel refreshes, and one that re-animates every refresh is worse than one that updates");

    // *** THE DASHED EDGES MUST BE SKIPPED, AND THIS IS THE REAL BUG THE WIRING COULD HAVE HAD. *** A dashed
    // edge's "3 3" pattern IS its meaning (a provisional link). Priming it would overwrite stroke-dasharray
    // with the path length and silently turn every provisional edge solid -- two features writing one
    // attribute, later one wins, and the loss is invisible.
    ok(/opts\.draw && !e\.dashed/.test(code),
        "*** a DASHED edge is skipped: its 3 3 pattern is its meaning, and priming would overwrite stroke-dasharray and turn every provisional edge solid ***");

    // and the stagger the comment claims is actually implemented
    ok(/drawStaggerMs/.test(code), "the stagger is a real, named knob");
    ok(/_drawn\+\+/.test(code), "with a per-render counter, so the delay grows edge by edge");
    ok(/primeDraw\(p\)/.test(code) && /setTimeout/.test(code),
        "and each edge is PRIMED immediately with its clock deferred -- otherwise an edge waiting its turn would sit there solid until it started");
}

console.log(`svgPath-selfcheck: ${pass} passed, ${fail} failed`);
console.log("unchecked here: agreement with a REAL browser's getTotalLength. The parsed measurement is checked\n" +
            "against analytic ground truth -- exact on straight segments, within 0.008% on arcs and always short\n" +
            "-- and against a fake element; whether Chromium's own number matches to the same tolerance wants a\n" +
            "browser this environment could not install playwright into.");
process.exit(fail ? 1 : 0);
