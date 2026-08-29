// WebGLEngine/tools/ship/springMotion-selfcheck.mjs -- v4114
//
// Run: node tools/ship/springMotion-selfcheck.mjs   (~0.2s; no browser, no DOM)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ui/springMotion.js -- the damped-harmonic-oscillator behind both toast surfaces.
//
// *** A SPRING IS PHYSICS, SO IT IS GRADED LIKE THE REST OF THIS TREE'S PHYSICS RATHER THAN LOOKED AT. ***
// The thing an animation cannot tell you by being watched is whether it is CORRECT: whether the overshoot
// matches the damping ratio that predicts it, whether a stiff spring stays stable when a backgrounded tab
// hands it a four-second frame, whether every preset actually comes to rest. Section 3 is the one that
// matters -- the closed-form overshoot relation exp(-pi*z/sqrt(1-z^2)) is a REAL ANSWER KEY the integrator is
// never told, so agreeing with it is evidence rather than assertion.
//
// *** AND ONE CHECK HERE EXISTS BECAUSE THE FIRST TUNING FAILED IT IN SPIRIT. *** The opening presets sat at
// zeta ~= 0.81 and overshot 0.6-0.8% of travel -- on a 380px slide, under three pixels. Every property below
// would have passed: it was a correct spring that was VISUALLY INDISTINGUISHABLE FROM AN EASE, which is the
// whole feature failing quietly. So section 4 asserts the bouncy presets overshoot ENOUGH TO SEE.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeOnly, noComments } from "./sourceScan.mjs";
import { PRESETS, dampingRatio, makeSpring, step, atRest, settle } from "../../ui/springMotion.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("springMotion-selfcheck -- overshoot against the ratio that predicts it\n");

// ---- 1. THE PRESETS ARE WELL-FORMED ------------------------------------------------------------------------
{
    console.log("1. THE PRESET TABLE");
    ok("every preset has stiffness, damping and mass",
        Object.values(PRESETS).every((p) => p.stiffness > 0 && p.damping > 0 && p.mass > 0));
    ok("!! dampingRatio never divides by zero, even on a degenerate spring",
        Number.isFinite(dampingRatio({ stiffness: 0, damping: 0, mass: 0 })));
    for (const [n, p] of Object.entries(PRESETS)) {
        const z = dampingRatio(p);
        ok("   " + n.padEnd(7) + " zeta=" + z.toFixed(3), Number.isFinite(z) && z > 0);
    }
}

// ---- 2. EVERY PRESET COMES TO REST -------------------------------------------------------------------------
{
    console.log("\n2. *** EVERY PRESET SETTLES -- AN ANIMATION THAT NEVER ENDS IS A LIVE rAF FOREVER ***");
    for (const [n] of Object.entries(PRESETS)) {
        const r = settle(makeSpring(0, 1, n));
        ok("!! " + n + " reaches rest in " + r.steps + " frames (" + (r.steps / 60).toFixed(2) + "s)",
            r.settled && r.steps < 200,
            "a spring that never rests keeps requestAnimationFrame alive for the life of the page, which is a " +
            "battery cost with nothing on screen to show for it");
        ok("   ...and lands EXACTLY on the target, not a fraction off",
            r.final === 1,
            "step() snaps on rest deliberately: settling a thousandth of a pixel short keeps a composite " +
            "layer alive for a value nobody can see. Got " + r.final);
    }
    ok("!! atRest() is false while moving and true once done",
        !atRest(makeSpring(0, 1, "snappy")) && atRest(settleFinal("snappy")));
    function settleFinal(name) { let s = makeSpring(0, 1, name); for (let i = 0; i < 400 && !s.done; i++) s = step(s, 1 / 60); return s; }
}

// ---- 3. *** THE ANSWER KEY: OVERSHOOT MUST MATCH THE DAMPING RATIO *** -------------------------------------
{
    console.log("\n3. *** OVERSHOOT AGAINST exp(-pi*z/sqrt(1-z^2)) -- A CLOSED FORM THE INTEGRATOR IS NEVER TOLD ***");
    // The classical peak overshoot of a second-order step response. The integrator computes none of this; it
    // just adds forces. Agreement is therefore evidence that the physics is right, not a restatement of it.
    const predicted = (z) => (z >= 1 ? 0 : Math.exp((-Math.PI * z) / Math.sqrt(1 - z * z)));
    for (const [n, p] of Object.entries(PRESETS)) {
        const z = dampingRatio(p);
        const r = settle(makeSpring(0, 1, n));
        const want = predicted(z);
        if (z >= 1) {
            ok("!! *** " + n + " is critically damped (zeta=" + z.toFixed(3) + ") and MUST NOT overshoot ***",
                r.overshoot < 0.005,
                "an overshoot here would cross a screen edge on the surfaces that chose this preset for " +
                "exactly that reason. Measured " + (r.overshoot * 100).toFixed(2) + "%");
        } else {
            // A discrete integrator with a rest threshold will not hit the continuous peak exactly; agreeing
            // within a quarter is a real check, and a wrong sign or a factor of two would fail it.
            const err = Math.abs(r.overshoot - want) / want;
            ok("!! *** " + n + " overshoots " + (r.overshoot * 100).toFixed(1) + "%, closed form predicts " +
               (want * 100).toFixed(1) + "% ***",
                err < 0.25,
                "relative error " + (err * 100).toFixed(1) + "% -- the integrator is never given this formula, " +
                "so matching it is evidence the forces are right rather than a restatement of the constants");
        }
    }
    // Direction independence: a spring travelling DOWN must overshoot the same fraction as one travelling up.
    const up = settle(makeSpring(0, 100, "snappy")).overshoot;
    const down = settle(makeSpring(100, 0, "snappy")).overshoot;
    ok("!! overshoot is the same fraction in both directions",
        Math.abs(up - down) < 0.01,
        "measured as a fraction of TRAVEL and signed, so a sign error cannot hide as a smaller number. " +
        "up=" + (up * 100).toFixed(1) + "% down=" + (down * 100).toFixed(1) + "%");
}

// ---- 4. *** A SPRING NOBODY CAN SEE IS AN EASE WITH EXTRA ARITHMETIC *** -----------------------------------
{
    console.log("\n4. *** THE OVERSHOOT MUST BE VISIBLE IN REAL PIXELS, ON EACH SURFACE'S OWN TRAVEL ***");
    // This is the check the FIRST tuning would have failed. It was a correct spring at zeta 0.81, overshooting
    // 0.6-0.8% -- under three pixels on toaster.js's 380px slide. Every other property in this file passed.
    //
    // *** AND THE FIRST VERSION OF THIS SECTION WAS ITSELF TOO WEAK, WHICH A BROWSER HAD TO TELL ME. *** It
    // hardcoded 380 -- toaster.js's travel -- so it graded BOTH presets against the LONGER of the two
    // surfaces and passed. ui/toast.js rises a fraction of that, and a fraction of a small number is a smaller
    // number: at the 14px rise it shipped with, the same 9.2% spring overshot 1.27px in Chromium. Invisible.
    // The check now reads each surface's travel constant OUT OF ITS SOURCE, so a later edit shortening a rise
    // silently back into ease territory fails here instead of looking fine.
    const travels = [
        ["ui/toast.js", "RISE_PX", 2.5],
        ["ui/toaster.js", "SLIDE_PX", 2.5],
    ].map(([f, name, minPx]) => {
        const src = codeOnly(fs.readFileSync(path.join(ENG, f), "utf8"));
        const m = new RegExp("(?:const|let)\\s+" + name + "\\s*=\\s*([0-9.]+)").exec(src);
        return { f, name, minPx, px: m ? parseFloat(m[1]) : NaN };
    });
    for (const t of travels) {
        ok("   read " + t.name + " = " + t.px + "px out of " + t.f, Number.isFinite(t.px) && t.px > 0,
            "if this cannot be parsed the whole section is vacuous, so it fails loudly rather than skipping");
    }
    for (const n of ["gentle", "snappy"]) {
        const frac = settle(makeSpring(0, 1, n)).overshoot;
        ok("   " + n + " overshoots " + (frac * 100).toFixed(1) + "% of travel", frac >= 0.05,
            "below ~5% the bounce is lost in the settle regardless of how long the travel is");
        for (const t of travels) {
            const px = frac * t.px;
            ok("!! *** " + n + " overshoots " + px.toFixed(2) + "px on " + t.f + "'s real " + t.px + "px travel ***",
                px >= t.minPx,
                "the point of the round was PHYSICAL motion. A sub-pixel overshoot is an ease wearing a " +
                "spring's arithmetic and would ship with every correctness check green -- which is exactly " +
                "what happened at RISE_PX=14 until a browser measured 1.27px");
        }
    }
    ok("!! ...and the CRITICAL preset is exempt, because zero overshoot is what it is for",
        settle(makeSpring(0, 1, "stiff")).overshoot * 380 < 2,
        "a blanket 'must be visible' rule would have forced a bounce onto the one preset chosen to avoid it");
}

// ---- 5. *** STABILITY: A BACKGROUNDED TAB MUST NOT LAUNCH A TOAST OFF SCREEN *** ---------------------------
{
    console.log("\n5. *** A STIFF SPRING WITH A HUGE dt DOES NOT MERELY JUMP -- IT DIVERGES ***");
    // Semi-implicit Euler is stable only for dt < ~2/sqrt(k/m). At k=260 that is ~0.124s; a 4s frame is 32x
    // past it, and an unclamped, unsubstepped integrator would grow the velocity every step without bound.
    for (const n of Object.keys(PRESETS)) {
        let s = makeSpring(0, 1, n);
        for (let i = 0; i < 30; i++) s = step(s, 4.0);          // thirty four-second frames
        ok("!! " + n + " survives thirty 4-second frames without diverging",
            Number.isFinite(s.x) && Math.abs(s.x) < 10,
            "unclamped this is where the toast flies off screen instead of settling. x=" + s.x);
    }
    let s = makeSpring(0, 1, "snappy");
    for (let i = 0; i < 200; i++) s = step(s, 4.0);
    ok("!! ...and still converges to the target rather than orbiting it",
        Math.abs(s.x - 1) < 0.01, "x=" + s.x);
    ok("!! a zero or negative dt is a no-op rather than a step backwards",
        step(makeSpring(5, 9, "snappy"), 0).x === 5 && step(makeSpring(5, 9, "snappy"), -1).x === 5);
    ok("!! NaN/undefined dt cannot poison the state",
        Number.isFinite(step(makeSpring(0, 1, "snappy"), NaN).x) &&
        Number.isFinite(step(makeSpring(0, 1, "snappy"), undefined).x));
    ok("!! step() does not mutate its input -- a caller keeping the old state is not corrupted",
        (() => { const a = makeSpring(0, 1, "snappy"); const before = a.x; step(a, 1 / 60); return a.x === before; })());
    ok("step(null) is safe", step(null, 0.016) === null);
}

// ---- 6. RETARGETING MID-FLIGHT CARRIES VELOCITY ------------------------------------------------------------
{
    console.log("\n6. *** RETARGETING IS WHY BOTH SURFACES USE ONE SPRING INSTEAD OF TWO ANIMATIONS ***");
    let s = makeSpring(0, 100, "snappy");
    for (let i = 0; i < 8; i++) s = step(s, 1 / 60);            // mid-flight, moving
    const midX = s.x, midV = s.v;
    ok("mid-flight it is genuinely moving", midX > 0 && midX < 100 && midV > 0, "x=" + midX.toFixed(1) + " v=" + midV.toFixed(1));
    const reversed = { ...s, target: 0 };
    ok("!! *** reversing the target keeps position AND velocity -- it does not restart from the committed style ***",
        reversed.x === midX && reversed.v === midV,
        "this is the behaviour a CSS transition cannot do: the old toaster.js restarted its slide from the " +
        "element's committed style rather than its rendered position, so a click during the 0.28s entrance " +
        "made the toast jump");
    let r = reversed;
    for (let i = 0; i < 300 && !r.done; i++) r = step(r, 1 / 60);
    ok("...and it settles back at the new target", r.done && Math.abs(r.x) < 0.01, "x=" + r.x);
}

// ---- 7. BOTH SURFACES USE THIS ONE INTEGRATOR --------------------------------------------------------------
{
    console.log("\n7. ONE INTEGRATOR, TWO SURFACES, NO SECOND COPY");
    const spring = codeOnly(fs.readFileSync(path.join(ENG, "ui", "springMotion.js"), "utf8"));
    ok("!! the module is PURE -- no DOM, no rAF, no timers",
        !/document\.|window\.|requestAnimationFrame|setTimeout|setInterval/.test(spring),
        "purity is what lets sections 2-6 settle thousands of frames headlessly");
    for (const f of ["toast.js", "toaster.js"]) {
        const raw = fs.readFileSync(path.join(ENG, "ui", f), "utf8");
        const text = noComments(raw), code = codeOnly(raw);
        ok("!! ui/" + f + " imports the shared spring", /springMotion\.js/.test(text));
        ok("!! ...and no longer animates with a CSS transition",
            !/transition:/.test(code),
            "a `transition` cannot overshoot AND would interpolate between the spring's own frames, smearing " +
            "the overshoot back out -- so keeping one would silently undo the round");
        ok("   ...and drives the transform from the spring each frame",
            /springStep\(/.test(code) && /requestAnimationFrame/.test(code));
        // *** BOTH LOOPS MUST BAIL WHEN THE ELEMENT IS GONE, AND ONE OF THEM DID NOT. *** toast.js caps its
        // stack at 4 and evicts with a bare .remove(), which does not touch the running rAF. Chromium counted
        // NINE live loops for four visible toasts, each still writing transform and opacity to a detached
        // node until its duration ran out. toaster.js had the guard from the start; this makes it a rule.
        ok("!! ui/" + f + "'s frame loop stops when its element leaves the DOM",
            /if\s*\(\s*!\s*el\.parentNode\s*\)/.test(code),
            "without it any removal that bypasses the spring -- a stack-cap eviction, a container teardown -- " +
            "leaks a requestAnimationFrame animating something nobody can see");
    }
    // *** OPACITY MUST NOT BE DERIVED FROM DISTANCE-TO-TARGET. *** `1 - abs(x)/TRAVEL` is the obvious form and
    // it is wrong for a spring: past the target abs(x) grows again, so the toast dims at the peak of its own
    // bounce. Chromium measured 0.909 at the peak before this was fixed. The bug is only reachable BECAUSE the
    // motion overshoots, so nothing else in this file could have caught it.
    for (const f of ["toast.js", "toaster.js"]) {
        const code = codeOnly(fs.readFileSync(path.join(ENG, "ui", f), "utf8"));
        ok("!! ui/" + f + " does not fade by absolute distance to the target",
            !/1\s*-\s*Math\.abs\([^)]*\)\s*\/\s*(RISE_PX|SLIDE_PX)/.test(code),
            "that form reverses the fade during the overshoot, dimming the toast exactly when it is most " +
            "prominent -- measured at opacity 0.909 in Chromium");
    }
}

console.log("\n" + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
