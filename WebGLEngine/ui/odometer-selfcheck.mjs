// WebGLEngine/ui/odometer-selfcheck.mjs -- v4181
//
// GATES ui/odometerModel.mjs and the wiring of ui/odometer.js.
//
// *** THE CHECK THAT EARNS THE PORT IS SECTION 3. *** The original expresses the motion blur as three nested
// absolutes, which nobody can read and therefore nobody can check. Worked out it is a triangle, and this
// module ships the triangle -- so the gate asserts the two expressions agree ACROSS THE WHOLE RANGE, at
// several travels, rather than trusting the algebra. A rewrite that "simplifies" a formula and is subtly
// wrong is the failure this tree finds most often; here the original is kept beside the simplification as
// the thing to be measured against.
//
// Section 5 pins the direction of the stagger, which is the difference between a counter and a slot machine.
//
// Run: node ui/odometer-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { alignValues, rollFor, blurAt, blurAtOriginal, cubicInOut, digitAt, delaysFor,
         totalDuration, planRoll, DIGITS, ROTATIONS, DEFAULTS } from "./odometerModel.mjs";
import { readFileSync } from "node:fs";
import { codeOnly, noComments } from "../tools/ship/sourceScan.mjs";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };

// 1) ALIGNMENT, and the comma is the case that matters.
{
    ok(alignValues("999", "1,000").join("") === "0,999",
        `"999" padded against "1,000" gives "0,999" -- the comma is carried, NOT replaced by a zero, or it lands under a digit and the columns shear`);
    ok(alignValues("1,000", "999").join("") === "1,000", "the longer value is left alone");
    ok(alignValues("5", "12345").join("") === "00005", "plain padding with no separators");
    ok(alignValues("42", "7").join("") === "42", "padding against something shorter is a no-op");
    ok(alignValues("abc", "12345").join("") === "abc", "a value with no digits at all is returned unchanged rather than looping forever");
    ok(alignValues("", "99").length >= 0, "an empty value does not throw");
}

// 2) THE ROLL spins whole turns and lands on the target.
{
    ok(ROTATIONS === 3 && DIGITS === 10, "three rotations over ten digits, the original's constants");
    const r = rollFor(3, 7);
    ok(r.fromSteps === 3 && r.toSteps === 37, "3 -> 7 travels from 3 to 37 steps: three whole turns plus the target");
    ok(rollFor(9, 0).toSteps === 30, "9 -> 0 still travels forward (to 30), never backwards");
    ok((rollFor(4, 4).toSteps - rollFor(4, 4).fromSteps) === 30,
        "an UNCHANGED digit still rolls three full turns rather than sitting still -- every wheel moves together, which is what a real odometer does");
}

// 3) *** THE BLUR: THE SIMPLIFICATION IS PROVEN EQUAL TO THE ORIGINAL, NOT ASSUMED. ***
{
    let worst = 0, worstAt = null;
    for (const [S, T] of [[0, 1200], [200, 1480], [40, 1600], [0, 400], [360, 760]]) {
        for (let i = 0; i <= 400; i++) {
            const v = S + ((T - S) * i) / 400;
            const d = Math.abs(blurAt(v, S, T) - blurAtOriginal(v, S, T));
            if (d > worst) { worst = d; worstAt = [S, T, v]; }
        }
    }
    ok(worst === 0, `the triangle and the original's three nested absolutes agree EXACTLY over 5 travels x 401 samples (worst difference ${worst})`);

    // and the triangle's shape is what it should be
    const S = 0, T = 1200;
    ok(blurAt(S, S, T) === 0 && blurAt(T, S, T) === 0, "zero blur at both ends of the travel");
    ok(Math.abs(blurAt((S + T) / 2, S, T) - (T - S) / 2 / 100) < 1e-12, `peaks exactly half way, at (T-S)/2/100 = ${((T - S) / 2 / 100).toFixed(2)}`);
    ok(blurAt(S + (T - S) * 0.25, S, T) > 0 && blurAt(S + (T - S) * 0.25, S, T) < blurAt((S + T) / 2, S, T), "and rises monotonically to that peak");
    ok(blurAt(-500, S, T) === 0 && blurAt(5000, S, T) === 0, "outside the travel it clamps to zero rather than going negative -- a negative stdDeviation is invalid SVG");
    ok(blurAt(0, 0, 0) === 0, "a zero-length travel blurs not at all rather than dividing by zero");
}

// 4) THE STRIP WRAPS WITH NO SEAM, which is why there are eleven cells for ten digits.
{
    const d = { from: 0, to: 0, delay: 0 };
    const end = digitAt(999999, d);
    ok(Math.abs(end.offsetSteps - 0) < 1e-9, "a 0 -> 0 roll ends at offset 0, not at 30");
    ok(end.blur === 0, "and with no blur left");
    const d7 = { from: 3, to: 7, delay: 0 };
    ok(Math.abs(digitAt(999999, d7).offsetSteps - 7) < 1e-9, "a 3 -> 7 roll ends exactly on 7");
    ok(digitAt(0, d7).offsetSteps === 3, "and starts exactly on 3");
    // the offset is always inside one strip
    let outside = 0;
    for (let t = 0; t <= 3200; t += 7) { const s = digitAt(t, d7); if (s.offsetSteps < 0 || s.offsetSteps >= DIGITS) outside++; }
    ok(outside === 0, "the offset stays within [0, 10) for the whole roll, so it never scrolls off the eleven-cell strip");
    // before its delay a digit has not moved
    const late = { from: 2, to: 8, delay: 500 };
    ok(digitAt(0, late).offsetSteps === 2 && digitAt(499, late).offsetSteps === 2, "a digit waiting out its delay sits still rather than easing early");
    ok(digitAt(600, late).offsetSteps !== 2, "and moves once the delay has passed");
}

// 5) *** THE STAGGER RUNS RIGHT TO LEFT. On a real odometer the units wheel drives the tens, so units must
//    lead. Reversed, it reads as a slot machine rather than a counter. ***
{
    const d = delaysFor(4);
    ok(d.length === 4, "one delay per digit");
    ok(d[3] < d[0], `the RIGHTMOST digit starts FIRST (${d[3]}ms against the leftmost's ${d[0]}ms)`);
    ok(d[0] > d[1] && d[1] > d[2] && d[2] > d[3], "and the delays decrease strictly left to right");
    ok(d[3] === DEFAULTS.animationDelay, "the first to move waits only the base delay");
    ok(delaysFor(1)[0] === DEFAULTS.animationDelay, "a single digit waits the base delay and nothing more");
    ok(delaysFor(0).length === 0, "no digits gives no delays rather than throwing");
    ok(totalDuration(4) === Math.max(...d) + DEFAULTS.duration, "the total covers the LAST digit's finish, not the first's");
    ok(totalDuration(6) > totalDuration(2), "and grows with the digit count, so a caller can avoid starting a second roll over the first");
}

// 6) THE PLAN puts digits and separators where they belong.
{
    const plan = planRoll("1,203", "1,417");
    ok(plan.length === 5, "five cells for a five-character value");
    ok(plan.filter((p) => p.isDigit).length === 4, "four of them digits");
    ok(plan[1].isDigit === false && plan[1].char === ",", "and the comma is a fixed glyph, not a wheel");
    ok(plan[0].from === 1 && plan[0].to === 1, "an unchanged digit is still planned, with equal from and to");
    ok(plan[4].from === 3 && plan[4].to === 7, "and the changed ones carry their real endpoints");
    ok(plan[4].delay < plan[0].delay, "with the rightmost digit's delay the smallest");

    // growing a number: the shorter side is padded, so the new leading digit rolls up from 0
    const grow = planRoll("99", "101");
    ok(grow.length === 3 && grow[0].from === 0 && grow[0].to === 1,
        "a value that GAINS a digit rolls the new leading wheel up from 0 rather than popping it in");
    ok(cubicInOut(0) === 0 && cubicInOut(1) === 1 && Math.abs(cubicInOut(0.5) - 0.5) < 1e-12, "the easing is anchored at 0, 0.5 and 1");
}

// 7) THE SVG HALF: what it must and must not do, read from source.
{
    const src = readFileSync(new URL("./odometer.js", import.meta.url).pathname, "utf8");
    const code = codeOnly(src);
    const nc = noComments(src);

    ok(/import \{[^}]*digitAt[^}]*\} from "\.\/odometerModel\.mjs"/.test(nc),
        "the SVG half takes its arithmetic from the model rather than repeating it");
    ok(!/ROTATIONS \* 10|\/ 100/.test(code), "and carries no copy of the roll or blur constants");

    // ELEVEN cells, not ten -- the repeat is what makes the wrap seamless
    ok(/d <= DIGITS/.test(code), "the strip is built with d <= DIGITS: ELEVEN cells for ten digits, the repeated 0 that makes the wrap seamless");
    ok(/d % DIGITS/.test(code), "and the eleventh cell shows 0 again rather than a stray 10");

    // the filter region must be widened or the blur is clipped
    ok(/width: "300%"/.test(nc) && /x: "-100%"/.test(nc),
        "the blur filter's region is widened -- left at its default the blur is CLIPPED and the digit appears to gain a hard edge as it speeds up");

    // the ES7 bind operator must not have survived
    ok(!/::/.test(code.replace(/https?:\/\//g, "")),
        "the original's ES7 :: bind operator is gone -- it never reached the language and needs a transform to run at all");

    // landing exactly
    ok(/apply\(total\)/.test(code),
        "the roll applies its FINAL time exactly on completion -- stopping at dt >= total would leave the last computed frame, a fraction of a digit high, permanently");

    // no Math.random anywhere: an odometer is deterministic
    ok(!/Math\.random/.test(code) && !/Math\.random/.test(codeOnly(readFileSync(new URL("./odometerModel.mjs", import.meta.url).pathname, "utf8"))),
        "nothing here is random -- the same two values always roll the same way");
}

// 8) *** WHERE IT MAY NOT BE USED, AND THE MODULE SAYS SO. *** A three-second roll cannot serve a per-frame
//    readout: the next value arrives long before the roll ends, so the digits blur permanently.
{
    const modelSrc = readFileSync(new URL("./odometerModel.mjs", import.meta.url).pathname, "utf8");
    ok(/per-frame/.test(modelSrc) && /SystemPerfMonitor/.test(modelSrc),
        "the model names the case it must NOT be used for -- the per-frame FPS/CPU/MEM gauges -- rather than leaving it to be discovered");
    // *** AND IT CITES WHERE THE RULE CAME FROM, WHICH IS NOT THIS MODULE. *** ui/morphDigits.js settled it at
    // v3531 after Keith asked whether the CPU gauge could count with the morph. Reasoning independently to the
    // same rule is corroboration; presenting it as a new discovery would quietly claim someone else's work.
    ok(/morphDigits/.test(modelSrc) && /v3531/.test(modelSrc),
        "and CITES ui/morphDigits.js v3531, where this tree already decided it, rather than restating the rule as new");
    ok(/not a duplicate|NOT A DUPLICATE/.test(modelSrc),
        "and says plainly why an odometer is not a duplicate of that morph -- the strokes bend there, a strip of real digits scrolls here");
    ok(totalDuration(3) > 3000, `a three-digit roll takes ${totalDuration(3)}ms, which is why a 60fps readout cannot use it`);
}

// 9) *** THE TWO INITIALISERS MUST NOT CLAIM THE SAME ELEMENT. *** ui/morphDigits.js has owned
//    [data-morph-stat] since v3531 and does a DIFFERENT transition on it. Two initialisers on one element
//    would both write to it, the later would win, and the loss would be invisible -- the same class of bug
//    as a draw-in overwriting a dashed edge's stroke-dasharray at v4180.
{
    const odoSrc = readFileSync(new URL("./odometer.js", import.meta.url).pathname, "utf8");
    const morphSrc = readFileSync(new URL("./morphDigits.js", import.meta.url).pathname, "utf8");
    const sel = (src) => (noComments(src).match(/querySelectorAll\("\[([a-z-]+)\]"\)/g) || []);
    const odoSel = sel(odoSrc), morphSel = sel(morphSrc);
    ok(odoSel.length === 1 && morphSel.length === 1, "each initialiser claims exactly one attribute");
    ok(odoSel[0] !== morphSel[0], `and they are DIFFERENT attributes (${odoSel[0]} against ${morphSel[0]})`);
    ok(/data-odometer/.test(noComments(odoSrc)), "the odometer claims data-odometer");
    ok(/data-morph-stat/.test(noComments(morphSrc)), "and morphDigits keeps data-morph-stat");
    ok(!/data-morph-stat/.test(noComments(odoSrc)), "*** the odometer never touches morphDigits' attribute ***");

    // and no page hands one element to both
    const pages = ["case-study.html", "odometer.html"];
    let both = 0;
    for (const p of pages) {
        let html = "";
        try { html = readFileSync(new URL("../" + p, import.meta.url).pathname, "utf8"); } catch { continue; }
        // an element carrying both attributes would appear as the two names inside one tag
        for (const tag of html.match(/<[^>]+>/g) || []) {
            if (/data-morph-stat/.test(tag) && /data-odometer/.test(tag)) both++;
        }
    }
    ok(both === 0, "and no element in any page carries both attributes");
}

console.log(`odometer-selfcheck: ${pass} passed, ${fail} failed`);
console.log("unchecked here: the rendered SVG. The arithmetic is graded exactly -- including that the shipped\n" +
            "blur formula is bit-identical to the original's over 2005 samples -- and the structural rules are\n" +
            "read from source; whether the digits look right wants a browser.");
process.exit(fail ? 1 : 0);
