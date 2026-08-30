// WebGLEngine/tools/ship/textMorph-selfcheck.mjs -- v4158
//
// Run: node tools/ship/textMorph-selfcheck.mjs   (a second or two)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ui/textMorph.js and springToCssLinear/springPosition/springDuration in ui/springMotion.js.
//
// *** THE CENTREPIECE IS SECTION 1, AND IT IS A CHECK NEITHER SPRING COULD MAKE ALONE. *** springMotion now
// holds TWO solutions to the same differential equation: step() integrates it numerically, springPosition()
// solves it in closed form. Two independent answers to one question can be pointed at each other, and the
// agreement is asserted as CONVERGENCE rather than as a tolerance -- semi-implicit Euler is first order, so
// halving dt must halve the error. A tolerance would pass a WRONG closed form that happened to sit inside it;
// a wrong closed form cannot converge, because it is not approaching the same answer.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { springToCssLinear, springPosition, springDuration, dampingRatio, PRESETS, makeSpring, settle } from "../../ui/springMotion.js";
import { graphemes, lcsPairs, planMorph, MAX_SEGMENTS } from "../../ui/textMorph.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
console.log("textMorph-selfcheck -- two solutions to one spring, and a diff that keeps its emoji whole\n");

// ---- 1. *** THE ANALYTIC AND NUMERICAL SPRINGS ARE THE SAME ODE, BY CONVERGENCE *** ---------------------------
{
    console.log("1. *** CLOSED FORM vs INTEGRATOR: THE ERROR MUST HALVE WHEN dt HALVES ***");
    const p = PRESETS.snappy, w0 = Math.sqrt(p.stiffness / (p.mass || 1)), z = dampingRatio(p);
    const errAt = (dt) => {
        const tr = settle(makeSpring(0, 1, "snappy"), { dt, maxSteps: 200000 });
        let worst = 0;
        for (let i = 0; i < tr.xs.length; i++) worst = Math.max(worst, Math.abs(tr.xs[i] - springPosition(i * dt, w0, z)));
        return worst;
    };
    const fine = [1 / 480, 1 / 960, 1 / 1920].map(errAt);
    const r1 = fine[0] / fine[1], r2 = fine[1] / fine[2];
    ok("!! *** the error converges at FIRST ORDER, which is what semi-implicit Euler is ***",
        r1 > 1.8 && r1 < 2.2 && r2 > 1.8 && r2 < 2.2,
        "ratios " + r1.toFixed(2) + ", " + r2.toFixed(2) + " (want ~2.00) from errors " +
        fine.map((e) => e.toExponential(2)).join(", ") + " -- A WRONG CLOSED FORM CANNOT DO THIS: it would " +
        "plateau at whatever constant it disagrees by, however small, and a tolerance-based check would have " +
        "passed it");
    ok("...and the error genuinely goes to zero, not to a floor", fine[2] < fine[0] / 3.5,
        fine[0].toExponential(2) + " -> " + fine[2].toExponential(2));
    ok("!! both forms agree the SIGN of the overshoot: gentle/snappy ring, stiff does not", (() => {
        const g = settle(makeSpring(0, 1, "gentle"), { dt: 1 / 480, maxSteps: 200000 }).overshoot;
        const s = settle(makeSpring(0, 1, "stiff"), { dt: 1 / 480, maxSteps: 200000 }).overshoot;
        const gz = dampingRatio(PRESETS.gentle), sz = dampingRatio(PRESETS.stiff);
        return g > 0.05 && s < 0.005 && gz < 1 && sz >= 1;
    })(), "the numerical trace and the damping ratio have to tell the same story, or one of them is lying");
}

// ---- 2. *** THE CRITICAL BAND, WHICH THE OBVIOUS IMPLEMENTATION DIVIDES BY ZERO IN *** ------------------------
{
    console.log("\n2. *** zeta == 1 IS A SPECIAL CASE, AND THIS TREE'S `stiff` PRESET LIVES THERE ***");
    ok("!! at exactly critical damping the position is finite", Number.isFinite(springPosition(0.1, 14.5, 1)),
        "the general overdamped form divides by (r2 - r1) and those roots COINCIDE at zeta 1 -- so the tempting " +
        "single-branch implementation is a division by zero exactly here");
    ok("!! ...and it is continuous ACROSS the band, not just defined at the point", (() => {
        const w = 14.5, t = 0.15;
        const below = springPosition(t, w, 0.995), at = springPosition(t, w, 1), above = springPosition(t, w, 1.005);
        return Math.abs(below - at) < 5e-3 && Math.abs(above - at) < 5e-3;
    })(), "a branch that only special-cased the exact value would still lose precision to catastrophic " +
          "cancellation on either side of it");
    ok("!! `stiff` really is inside the band this protects", Math.abs(dampingRatio(PRESETS.stiff) - 1) < 0.01,
        "zeta " + dampingRatio(PRESETS.stiff).toFixed(4) + " -- not a hypothetical edge case, it is the preset " +
        "meant for surfaces where overshoot would look like a bug");
    ok("critically damped never overshoots", (() => {
        for (let t = 0; t < 3; t += 0.01) if (springPosition(t, 14.5, 1) > 1 + 1e-9) return false;
        return true;
    })());
    ok("underdamped DOES overshoot, so the branch is not silently flattening everything", (() => {
        let max = 0; for (let t = 0; t < 3; t += 0.005) max = Math.max(max, springPosition(t, 16, 0.59));
        return max > 1.05;
    })());
}

// ---- 3. THE EASING STRING ITSELF -------------------------------------------------------------------------------
{
    console.log("\n3. THE CSS linear() OUTPUT");
    for (const name of Object.keys(PRESETS)) {
        const r = springToCssLinear(name);
        ok(name + ": a well-formed linear() with a real duration",
            /^linear\(0, [\d.,\s]+1\)$/.test(r.easing) && r.durationMs > 100 && r.durationMs < 5000,
            r.durationMs + "ms, " + r.points.length + " points, zeta " + r.zeta.toFixed(3));
    }
    const s = springToCssLinear("snappy");
    ok("!! *** the last point is EXACTLY 1, not a sampled approximation ***", s.points[s.points.length - 1] === 1,
        "a curve ending at 0.9997 makes CSS animate to 0.9997 AND STOP -- an element resting a hair off its " +
        "target, which is the same defect step()'s snap-on-rest exists to prevent, in the other engine");
    ok("it starts at 0", s.points[0] === 0);
    ok("!! the parameters come from the SHARED PRESETS, so a CSS transition and a JS toast cannot disagree",
        springToCssLinear("snappy").zeta === dampingRatio(PRESETS.snappy),
        "zeta is read through dampingRatio() rather than recomputed, which is the second-declaration defect " +
        "this module was created to end arriving by a new door");
    ok("...and repeated calls are cached rather than re-solved", springToCssLinear("snappy") === springToCssLinear("snappy"));
    ok("!! settling requires STAYING inside the tolerance, not touching it once", (() => {
        // an underdamped spring crosses its target on every oscillation; a first-crossing test would report a
        // ringing spring as finished. Ask for a very tight precision and the duration must GROW.
        return springDuration(16, 0.3, 1e-5) > springDuration(16, 0.3, 1e-2);
    })(), "step() does not need this rule because it has a VELOCITY to consult; a closed-form position has none");
}

// ---- 4. *** GRAPHEMES: THE EMOJI IN THIS TREE'S OWN HEADER *** ------------------------------------------------
{
    console.log("\n4. *** A VARIATION SELECTOR IS NOT A CHARACTER YOU CAN ANIMATE SEPARATELY ***");
    ok("!! the gear from server.html's header is ONE grapheme", graphemes("⚙️").length === 1,
        "U+2699 + U+FE0F. [...str] gives TWO, the second an invisible modifier that renders as a stray box on " +
        "its own -- so a naive morph does not animate badly, IT CORRUPTS THE TEXT");
    ok("...and so is a flag, which is two regional indicators", graphemes("🇬🇧").length === 1);
    ok("...and a ZWJ family stays whole", graphemes("👩‍💻").length === 1);
    ok("a surrogate pair is never split", graphemes("🎮").length === 1, "the gamepad in the Steam Deck button");
    ok("ordinary text segments one per character", graphemes("v4158").length === 5);
    ok("empty in, empty out", graphemes("").length === 0 && graphemes(null).length === 0);
}

// ---- 5. *** THE DIFF, AND THE SHORTCUT IT REFUSES *** ----------------------------------------------------------
{
    console.log("\n5. *** LCS, NOT A PREFIX/SUFFIX TRIM ***");
    const plan = (a, b) => planMorph(graphemes(a), graphemes(b));
    const v = plan("v4157", "v4158");
    ok("!! a version bump keeps everything but the digit that changed",
        v.moves.length === 4 && v.removes.length === 1 && v.inserts.length === 1,
        "kept 4, removed 1, inserted 1");
    const p = plan("3 peers", "13 peers");
    ok("!! *** a leading insertion keeps ALL seven survivors -- the case a trim gets wrong ***",
        p.moves.length === 7 && p.removes.length === 0 && p.inserts.length === 1,
        "kept " + p.moves.length + ", inserted " + p.inserts.length + ". A shared-head/shared-tail trim sees a " +
        "changed first character and rewrites the whole string, so the animation would say 'different value' " +
        "when the truth is 'one digit arrived'");
    const e = plan("⚙️ v4157", "⚙️ v4158");
    ok("...and the emoji survives the diff as a single unit", e.moves.some((m) => m.seg === "⚙️"));
    const none = plan("abc", "xyz");
    ok("nothing shared means nothing kept", none.moves.length === 0 && none.removes.length === 3 && none.inserts.length === 3);
    ok("!! an identical string reports `unchanged`, so a caller can skip a no-op animation",
        plan("same", "same").unchanged === true,
        "otherwise a readout polled every second flickers every second");
    ok("!! every plan accounts for EVERY grapheme on both sides", (() => {
        for (const [a, b] of [["v4157", "v4158"], ["3 peers", "13 peers"], ["", "new"], ["old", ""], ["abc", "abc"]]) {
            const A = graphemes(a), B = graphemes(b), q = planMorph(A, B);
            if (q.moves.length + q.removes.length !== A.length) return false;
            if (q.moves.length + q.inserts.length !== B.length) return false;
        }
        return true;
    })(), "a grapheme in neither the moves nor the removes is one that would silently vanish");
    ok("lcsPairs is monotone in both indices, so survivors never cross", (() => {
        const pr = lcsPairs(graphemes("abcdef"), graphemes("azbycxdwe"));
        for (let i = 1; i < pr.length; i++) if (pr[i][0] <= pr[i - 1][0] || pr[i][1] <= pr[i - 1][1]) return false;
        return true;
    })(), "crossing pairs would animate two glyphs through each other");
    ok("empty sides are handled", lcsPairs([], graphemes("x")).length === 0 && lcsPairs(graphemes("x"), []).length === 0);
}

// ---- 6. *** THE TICKER DECISION, RECORDED AS THE MEASUREMENT THAT MADE IT *** ---------------------------------
{
    console.log("\n6. *** WHY THIS IS NOT ON THE TICKER, ASSERTED SO THE DECISION IS REVISITED IF IT MOVES ***");
    const sh = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
    const m = /_tickX -= ([\d.]+);/.exec(sh);
    ok("the ticker's scroll rate is still what this decision was based on", !!m && Math.abs(parseFloat(m[1]) - 0.9) < 1e-9,
        m ? m[1] + "px/frame = " + (parseFloat(m[1]) * 60) + "px/s. At a 220px clip that is 6.0s on screen for " +
            "an 80px message and 17.5s for a 700px one, against a 40-message queue -- about five and a half " +
            "minutes of backlog. THE TICKER'S PROBLEM IS THROUGHPUT, WHICH NO TRANSITION FIXES. If this line " +
            "ever goes red the ticker was retimed and the question is worth asking again."
          : "scroll rate not found");
    ok("!! ...and morphing is NOT wired into the ticker", !/textMorph/.test(sh.slice(0, sh.indexOf("function _tickScroll") + 2000)) ||
        !/_tickQ[\s\S]{0,400}morph\(/.test(sh),
        "consecutive log lines share almost no characters, so a morph would fade every glyph out and every " +
        "glyph in -- a crossfade with extra machinery, and slower to read than the scroll");
    report("NOT RUN HERE: the animation. morph() needs a DOM and getBoundingClientRect, so what is settled " +
           "headlessly is every number it depends on -- the spring, the segmentation and the plan. The FLIP " +
           "itself wants a browser and is what render-QA sees.");
}

// ---- 7. THE MODULE'S OWN SHAPE ---------------------------------------------------------------------------------
{
    console.log("\n7. PURE CORE, DOM ONLY AT THE EDGE");
    const src = fs.readFileSync(path.join(ENG, "ui", "textMorph.js"), "utf8");
    const pureHalf = src.slice(0, src.indexOf("export function morph("));
    ok("!! segmentation, the diff and the plan touch no DOM",
        !/document\.|getBoundingClientRect|window\./.test(pureHalf),
        "which is the only reason sections 4 and 5 can run at all");
    ok("!! it imports the spring rather than carrying its own easing", /from "\.\/springMotion\.js"/.test(src));
    ok("!! a very long string is SWAPPED and says so, rather than making hundreds of nodes",
        /MAX_SEGMENTS/.test(src) && MAX_SEGMENTS > 0 && MAX_SEGMENTS < 1000, "cap " + MAX_SEGMENTS);
    ok("!! prefers-reduced-motion is honoured", /prefers-reduced-motion/.test(src),
        "an animation somebody has asked their system not to play is not a nicety to override");
    ok("!! spans set white-space:pre, or every space in the string disappears", /whiteSpace = "pre"/.test(src),
        "a space inside an inline-block collapses -- so \"3 peers\" would morph into \"3peers\"");
}

// ---- 8. WIRED INTO A READOUT, AND DEGRADING WHEN IT CANNOT BE ------------------------------------------------
{
    console.log("\n8. THE READOUT IT IS ACTUALLY POINTED AT");
    const sh = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
    ok("!! server.html routes the engine version through morphText", /function morphText\(el, txt\)/.test(sh) &&
        (sh.match(/morphText\(/g) || []).length >= 3, ((sh.match(/morphText\(/g) || []).length - 1) + " call site(s)");
    ok("!! ...and BOTH write sites go through it, not just the one that was easy to find",
        !/hdrEngineVer"\);[\s\S]{0,120}\.textContent = " v"/.test(sh),
        "the version is written on boot AND again by the update check; morphing one and not the other would " +
        "make the animation depend on which code path last touched it");
    ok("!! *** the module is loaded LAZILY and every failure falls back to textContent ***",
        /import\("\.\/ui\/textMorph\.js"\)[\s\S]{0,160}catch/.test(sh) && /el\.textContent = txt;/.test(sh),
        "a readout that stopped updating because an animation module 404'd would be a strictly worse page than " +
        "one that never animated -- and this page is the front door");
    ok("...and the first paint falls through on purpose", /nothing to morph FROM/.test(sh),
        "there is no previous value to animate from, so the first assignment is plain and that is correct");
}

console.log("\n" + (fails ? fails + " FAILED" : "textMorph-selfcheck: all checks pass"));
process.exit(fails ? 1 : 0);
