// WebGLEngine/tools/roundhouse/capsuleDepenetrateDevice-selfcheck.mjs
//
// Run: node tools/roundhouse/capsuleDepenetrateDevice-selfcheck.mjs
//
// Gates tools/roundhouse/capsuleDepenetrateBind.mjs (task board #88): registration, mode refusal, the flat
// observable contract every device in this lab carries, closed-form checks per mode, and the plant/sabotage
// story capsuleDepenetrateBind.mjs's own header states -- run here rather than only asserted there.
//
// SABOTAGE-VERIFIED, three tries and two of them are worth naming rather than hiding. (1) Flipping the sign of
// rampTriangles' rotation (uphill runs -Z instead of +Z) passed every check unchanged -- INVISIBLE BY
// CONSTRUCTION, not a gate gap: faceNormalTowardNode always orients the resolved normal toward the capsule, so
// grounded depends on |normal.y| only, and section 4's sweep never checks WHICH direction the slope tilts. (2)
// Scaling the wall mode's starting embedDepth by 0.3 also passed unchanged -- the closed-form check is the
// CONVERGED equilibrium (posX == -radius after enough iterations), which an iterative solver reaches from
// either starting depth, so this was never a meaningful target either. (3) Swapping posX/posZ in build()'s own
// return statement -- a real, plausible bug (the kind of transcription slip every other observable-mapping
// mistake in this lab has been) -- turned section 3's wall checks red by name (posX read 0.000000 instead of
// -radius), restored, gate re-confirmed all-green after.
"use strict";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";
import { CD_MODES, CD_OBSERVABLES } from "./capsuleDepenetrateBind.mjs";
import { GROUND_SUPPORT_NORMAL_Y } from "../../physics/character/capsuleCollide.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("capsuleDepenetrateDevice-selfcheck -- floor, wall, corner, a sweepable ramp, and empty space\n");

const dev = await getDevice("capsuledepenetrate");
const run = (mode, config = {}, planted = false) => dev.build({ mode, config, planted });

// ---------------------------------------------------------------------------
console.log("1. THE DEVICE IS REGISTERED AND ITS MODE LIST IS DECLARED ONCE");
{
    ok("!! it is in the registry", DEVICE_NAMES.includes("capsuledepenetrate"), DEVICE_NAMES.length + " devices");
    ok("!! `modes:` IS the exported list, asserted BY IDENTITY not equality", dev.modes === CD_MODES,
        "freeRotationBind's own precedent: a duplicated mode-list literal can silently drift from the one build() actually reads");
    ok("!! an undeclared mode is REFUSED rather than silently substituted",
        dev.defaults({ mode: "ceiling" }) === null && (() => {
            try { dev.build({ mode: "ceiling" }); return false; } catch { return true; } })(),
        "matches this lab's own ratchet against a device that accepts any string as a mode");
    ok("every mode returns the full flat observable set", CD_MODES.every((m) => {
        const r = run(m);
        return CD_OBSERVABLES.every((k) => k in r && typeof r[k] === "number")
            && !Object.values(r).some((v) => v && typeof v === "object");
    }), "FLAT and numeric in every mode -- this device never fails to compute an observable, so null is not needed here");
}

// ---------------------------------------------------------------------------
console.log("\n2. FLOOR AND RAMP-AT-ZERO: A RESTING CAPSULE'S FEET LAND ON THE SURFACE, NOT AT ITS RADIUS");
{
    const radius = 0.4;
    const r = run("floor", { radius, embedDepth: 0.1 });
    report("floor", `posY=${r.posY.toExponential(3)} grounded=${r.grounded} contacts=${r.contacts}`);
    ok("!! resting position's Y lands at the floor plane (y=0), within float noise", Math.abs(r.posY) < 1e-9,
        "the floor triangles sit at y=0 and the capsule's FEET, not its center, are what depenetrateCapsuleFixedTris resolves -- " +
        "a resting capsule's lowest point touches the surface, so posY -> 0, not posY -> radius");
    ok("!! and it grounds", r.grounded === 1);
    const flat = run("ramp", { slopeDeg: 0, embedDepth: 0.1 });
    ok("!! ramp at slopeDeg=0 reproduces the floor case exactly (posY)", Math.abs(flat.posY - r.posY) < 1e-9,
        "a zero-degree ramp IS a floor -- same triangles, up to a trivial rotation identity, and the CPU function does not know they came from two different constructors");
}

// ---------------------------------------------------------------------------
console.log("\n3. WALL AND CORNER: A CLOSED FORM, NOT A PLAUSIBLE NUMBER -- PUSHED OUT TO EXACTLY radius FROM THE PLANE");
{
    for (const radius of [0.3, 0.4, 0.7]) {
        const w = run("wall", { radius, embedDepth: radius * 0.5, iterations: 6 });
        ok(`!! wall, radius=${radius}: posX settles to exactly -radius`, Math.abs(w.posX - (-radius)) < 1e-9,
            `posX=${w.posX.toFixed(6)}`);
        ok(`   wall, radius=${radius}: never grounds (normal.y = 0)`, w.grounded === 0);
        const c = run("corner", { radius, embedDepth: radius * 0.5, iterations: 6 });
        ok(`!! corner, radius=${radius}: posX AND posZ both settle to exactly -radius`,
            Math.abs(c.posX - (-radius)) < 1e-9 && Math.abs(c.posZ - (-radius)) < 1e-9,
            `posX=${c.posX.toFixed(6)} posZ=${c.posZ.toFixed(6)}`);
        ok(`   corner, radius=${radius}: never grounds`, c.grounded === 0);
    }
}

// ---------------------------------------------------------------------------
console.log("\n4. THE RAMP MODE'S CROSSING IS A PREDICTED ANGLE: arccos(GROUND_SUPPORT_NORMAL_Y) = 60 degrees");
{
    const predictedDeg = Math.acos(GROUND_SUPPORT_NORMAL_Y) * 180 / Math.PI;
    report("predicted crossing", predictedDeg.toFixed(4) + " degrees");
    ok("!! walkable comfortably below the crossing (30 degrees) grounds", run("ramp", { slopeDeg: 30 }).grounded === 1);
    ok("!! walkable close to the crossing from below (55 degrees) still grounds", run("ramp", { slopeDeg: 55 }).grounded === 1);
    ok("!! too steep close to the crossing from above (65 degrees) does not ground", run("ramp", { slopeDeg: 65 }).grounded === 0);
    ok("!! and clearly too steep (80 degrees) does not ground", run("ramp", { slopeDeg: 80 }).grounded === 0);
    // A sweep in 1-degree steps finds where the flag actually flips and checks it lands within the float-noise
    // band around the predicted 60 -- not a fixed pass/fail bracket, a MEASURED crossing compared to the closed form.
    let crossing = null;
    for (let d = 40; d < 80; d++) {
        if (run("ramp", { slopeDeg: d }).grounded === 1 && run("ramp", { slopeDeg: d + 1 }).grounded === 0) { crossing = d + 0.5; break; }
    }
    ok("!! *** the SWEPT crossing lands within 1 degree of the PREDICTED one ***",
        crossing !== null && Math.abs(crossing - predictedDeg) < 1,
        `swept ${crossing}, predicted ${predictedDeg.toFixed(2)}`);
}

// ---------------------------------------------------------------------------
console.log("\n5. EMPTY SPACE: A GENUINE NO-OP, NOT A DEGENERATE ANSWER THAT HAPPENS TO LOOK LIKE ONE");
{
    const r = run("empty", { radius: 0.5 });
    ok("!! zero contacts", r.contacts === 0);
    ok("!! never grounds", r.grounded === 0);
    ok("!! position is unmoved (pushDist is exactly zero)", r.pushDist === 0,
        "no candidate triangle means every iteration's deepestNormal stays null, so the loop never touches cx/cy/cz");
}

// ---------------------------------------------------------------------------
console.log("\n6. *** THE PLANT: THE EXACT SABOTAGE capsuleCollideTsl-selfcheck.mjs's OWN HEADER RECORDS BY HAND ***");
{
    ok("!! plantKind is declared as a knob, not a mode", dev.plantKind === "knob");
    for (const mode of ["floor", "wall", "corner", "ramp"]) {
        const t = run(mode, {}), p = run(mode, {}, true);
        const same = Math.abs(t.posX - p.posX) < 1e-12 && Math.abs(t.posY - p.posY) < 1e-12
                  && Math.abs(t.posZ - p.posZ) < 1e-12 && t.contacts === p.contacts;
        ok(`!! ${mode}: position and contacts are IDENTICAL between true and planted`, same,
            "the push itself never reads the grounded comparison -- only whether the flag gets set afterward");
    }
    // MEASURED, not assumed from the sign of groundNormalY alone: the plant flips grounded on every mode that
    // finds any contact at all, in BOTH directions -- floor/ramp (true physics grounds) flip true to false,
    // wall/corner (true physics never grounds -- normal.y=0 is comfortably below groundNormalY=0.5 either way
    // the inequality points) flip false to true. Only empty is unaffected, structurally: zero contacts means
    // the comparison never runs.
    const expect = { floor: [1, 0], wall: [0, 1], corner: [0, 1], ramp: [1, 0] };
    for (const [mode, [trueG, plantG]] of Object.entries(expect)) {
        const config = mode === "ramp" ? { slopeDeg: 30 } : {};
        const t = run(mode, config), p = run(mode, config, true);
        report(`${mode} grounded`, `true=${t.grounded} planted=${p.grounded}`);
        ok(`!! *** ${mode}: grounded flips exactly as predicted under the plant ***`,
            t.grounded === trueG && p.grounded === plantG,
            `expected true=${trueG}, planted=${plantG}`);
    }
    const tEmpty = run("empty", {}), pEmpty = run("empty", {}, true);
    ok("!! empty: the plant is invisible here, and for a structural reason -- zero contacts",
        tEmpty.grounded === 0 && pEmpty.grounded === 0 && tEmpty.contacts === 0 && pEmpty.contacts === 0,
        "the comparison the plant flips never runs when nothing is found in range, not merely untested");
}

console.log(fails ? `\ncapsuleDepenetrateDevice-selfcheck: ${fails} FAILED` : "\ncapsuleDepenetrateDevice-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
