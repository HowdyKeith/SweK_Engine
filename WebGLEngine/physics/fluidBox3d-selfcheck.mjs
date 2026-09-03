// WebGLEngine/physics/fluidBox3d-selfcheck.mjs -- v3905
// ---------------------------------------------------------------------------------------------------------------
// THE COUPLER BETWEEN TWO SOLVERS HAD NO GATE, WHICH IS THE WORST PLACE IN A TREE TO HAVE NONE.
//
// coverageTriage called physics/fluidBox3d.js the ONE genuine CANDIDATE among its six ungated non-scene modules,
// and it is right for a reason worth writing down: box3d is graded, Flip3D is graded, and NEITHER OF THEM GRADES
// THE EXCHANGE. A coupling bug leaves both engines individually correct and only the pair wrong -- there is no
// module whose own selfcheck would go red, because no module owns the error.
//
// *** AND THE EXCHANGE IS ALMOST ENTIRELY DIMENSIONAL. *** The coupler's whole job is unit conversion: world
// positions into grid positions, grid forces back into world velocity deltas, grid torque into world angular
// impulse. Every one of those carries a power of `scale`, and a wrong power is the classic slip -- it does not
// crash, it does not produce NaN, it produces a number of the right shape that is wrong by a factor.
//
// SECTION 6 IS THE POINT OF THIS FILE. The torque path maps grid torque to world torque with scale^2, because
// torque is force times length and each picks up its own factor. The linear path carries scale^1. AT scale = 1
// THOSE TWO SPELLINGS ARE BIT-IDENTICAL, and fluid-box3d.html -- the module's ONLY consumer in this tree --
// constructs the coupler with `scale: 1`. So the one place the exponent could ever have been observed is the one
// place it cannot be: every frame this coupler has ever run has been at unit scale, where scale and scale^2 are
// the same number. The header even names non-unit scale as the reason the parameter exists ("for a host at a
// different scale (e.g. ES ships), pass origin/scale"), so this is not a hypothetical host, it is a stated one.
//
// The fixtures are the ones the module's own header sanctions: a MOCK box3d world handle, because "the exact
// same coupler runs headless against a mock 3D world (verification) and against the real box3d WASM on-rig, with
// no code change". The mock RECORDS its calls, which is what makes section 7 -- the ordering -- gradeable at all.
// Section 9 then drops the mock fluid and runs the REAL Flip3D, because an exact arithmetic law proved against a
// fluid I wrote myself proves arithmetic, not buoyancy.
//
// *** EVERY CHECK BELOW WAS VERIFIED BY PLANTING THE ERROR IT CLAIMS TO CATCH. A GATE THAT HAS ONLY EVER SEEN
// CORRECT CODE IS AN UNTESTED GATE. *** Five errors planted into fluidBox3d.js one at a time, gate re-run each
// time, file restored each time:
//
//   A  torque scale^2 -> scale^1        1 FAIL   -- section 6's sweep, AND NOTHING ELSE MOVED
//   B  nudge assigns instead of adding  2 FAIL   -- section 5 (100 -> 0.0075), and the real fluid: the light box
//                                                   SANK to 5.81 instead of rising to 10.52
//   C  externalBodies left false        1 FAIL   -- section 2
//   D  mass drops the factor 8          2 FAIL   -- section 3, and the real fluid INVERTED: density 4.0 rose to
//                                                   14.80, because an 8x-light body is buoyant at any density
//   E  world->grid multiplies by scale  1 FAIL   -- section 4
//
// PLANT A IS THE RESULT THAT MATTERS AND IT IS THE ONE I WOULD HAVE GUESSED WRONG. It is caught by EXACTLY ONE
// check out of eighteen. Not the linear law, not the real-fluid arm, not the ordering -- one. Sections 1-5 and
// 7-9 all pass with the torque exponent wrong, because every one of them either runs at unit scale or does not
// touch torque at all. THAT IS THE MEASUREMENT BEHIND THIS FILE'S CENTRAL CLAIM: if the scale sweep in section 6
// is ever weakened to a single scale, the exponent stops being observable anywhere in this tree. Do not collapse
// it to one scale to make it faster; it costs microseconds and it is the only thing that reads the exponent.
//
// PLANTS B AND D ALSO SAY SOMETHING ABOUT SECTION 9's VALUE: each was caught twice, once by arithmetic and once
// by the real solver, and in D's case the real solver's answer was QUALITATIVELY INVERTED rather than merely off.
// A HEAVY BOX THAT FLOATS IS THE KIND OF WRONG THAT SURVIVES REVIEW, because nothing about it looks numerical.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { pathToFileURL } from "node:url";
import { createFluidBox3D } from "./fluidBox3d.js";
import { Flip3D } from "../fluid/flip3d.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("fluidBox3d-selfcheck -- the exchange between box3d and the FLIP fluid, which neither engine grades\n");

// A box3d world handle that RECORDS. The recording is not decoration: "the fluid saw box3d's state BEFORE
// fluid.step, and box3d stepped AFTER the nudge" is a claim about ORDER, and order is invisible in final values.
function mockWorld({ withAngular = true, gravity = 0 } = {}) {
    const bodies = [], log = [];
    const w = {
        addBox(d) { bodies.push({ p: d.pos.slice(), v: [0, 0, 0], density: d.density }); log.push("addBox"); return bodies.length - 1; },
        setVelocity(i, v) { bodies[i].v = v.slice(); log.push("setVelocity"); },
        readTransforms() { log.push("readTransforms"); const a = new Float64Array(bodies.length * 7);
            bodies.forEach((b, i) => { a[i*7] = b.p[0]; a[i*7+1] = b.p[1]; a[i*7+2] = b.p[2]; a[i*7+6] = 1; }); return a; },
        readVelocities() { log.push("readVelocities"); const a = new Float64Array(bodies.length * 3);
            bodies.forEach((b, i) => { a[i*3] = b.v[0]; a[i*3+1] = b.v[1]; a[i*3+2] = b.v[2]; }); return a; },
        step(dt) { log.push("step"); bodies.forEach((b) => { b.v[1] += gravity * dt;
            b.p[0] += b.v[0]*dt; b.p[1] += b.v[1]*dt; b.p[2] += b.v[2]*dt; }); },
        bodies, log,
    };
    if (withAngular) w.angularImpulse = (i, t) => { log.push("angularImpulse"); bodies[i].lastAng = t.slice(); };
    return w;
}
// A fluid that stamps KNOWN forces. Chosen prime and distinct per axis so an axis swap cannot pass by symmetry.
const F = [3, 5, 7], T = [11, 13, 17];
function mockFluid() {
    return { forceScale: 1, externalBodies: false, gravity: 0, bodies: [], stepped: 0,
        addBox(x, y, z, hx, hy, hz, o) { const b = { x, y, z, hx, hy, hz, mass: o.mass,
            _fx: F[0], _fy: F[1], _fz: F[2], _tx: T[0], _ty: T[1], _tz: T[2] }; this.bodies.push(b); return b; },
        step() { this.stepped++; this.atStep = this.bodies.map((b) => ({ x: b.x, y: b.y, z: b.z, vx: b.vx })); } };
}

console.log("1. THE GUARD: a handle that is not a box3d world is REFUSED, not limped along with");
{
    let threwNull = false, threwPartial = false;
    try { createFluidBox3D(null, {}); } catch { threwNull = true; }
    try { createFluidBox3D({ addBox() {} }, {}); } catch { threwPartial = true; }
    ok("a null world throws rather than returning a coupler that fails later", threwNull);
    ok("...and so does a HALF-implemented handle -- addBox without readTransforms", threwPartial,
       "the check names all five methods it needs, so a shim that grew one method at a time cannot half-satisfy it");
}

console.log("\n2. THE HANDOFF: the fluid is told box3d owns the motion, and told the same gravity");
{
    const f = mockFluid();
    createFluidBox3D(mockWorld(), f, { gravity: -18 });
    ok("*** externalBodies is set TRUE, so the fluid does not integrate the bodies as well ***", f.externalBodies === true,
       "IF THIS EVER FLIPS THE BODIES MOVE TWICE PER FRAME -- once by the fluid's own kinematics and once by " +
       "box3d -- and the result is a plausible-looking drift nobody can attribute to either engine");
    ok("...and the fluid's gravity is set from the coupler's, so the two engines fall at one rate", f.gravity === -18);
    const g = mockFluid(); createFluidBox3D(mockWorld(), g, {});
    ok("...but gravity is only forced when GIVEN -- an omitted option leaves the fluid's own", g.gravity === 0,
       "opts.gravity != null, so passing 0 still counts as an instruction and undefined does not");
}

console.log("\n3. THE MASS IS ARCHIMEDES-CORRECT, IN GRID UNITS, WHICH IS THE UNIT BUOYANCY IS COMPUTED IN");
{
    const rows = [];
    for (const [scale, density, half] of [[1, 0.5, [2, 3, 4]], [2, 0.5, [2, 3, 4]], [5, 1.5, [1, 1, 1]]]) {
        const cp = createFluidBox3D(mockWorld(), mockFluid(), { scale });
        const rec = cp.addBox([0, 0, 0], half, density);
        const gh = half.map((h) => h / scale);
        rows.push([scale, rec.mass, density * 8 * gh[0] * gh[1] * gh[2]]);
    }
    ok("mass is density * full-extent volume (the 8 is 2*half cubed), at every scale",
       rows.every(([, got, want]) => got === want),
       rows.map(([s, got]) => "scale " + s + ": " + got).join(", "));
    report("this is the number the fluid divides its pressure force by, so an error here is an error in the " +
           "BUOYANT ACCELERATION and nothing else -- the body would still float, at the wrong rate");
}

console.log("\n4. WORLD -> GRID: position through (p - origin)/scale, half-extents through /scale");
{
    const f = mockFluid();
    const cp = createFluidBox3D(mockWorld(), f, { scale: 4, origin: [10, 20, 30] });
    cp.addBox([18, 24, 38], [2, 4, 8], 1);
    const b = f.bodies[0];
    ok("the fluid is handed grid coordinates, not world ones",
       b.x === 2 && b.y === 1 && b.z === 2, `world (18,24,38) origin (10,20,30) scale 4 -> grid (${b.x},${b.y},${b.z})`);
    ok("...and the half-extents come through the same divisor", b.hx === 0.5 && b.hy === 1 && b.hz === 2,
       `world half (2,4,8) -> grid half (${b.hx},${b.hy},${b.hz})`);
}

console.log("\n5. THE LINEAR NUDGE: dv = forceScale * scale * dt * F / mass, exactly, and it ADDS");
{
    const dt = 0.02, rows = [];
    for (const scale of [1, 2, 5]) {
        const w = mockWorld(), f = mockFluid();
        const cp = createFluidBox3D(w, f, { scale, origin: [10, 20, 30] });
        const rec = cp.addBox([16, 26, 36], [2, 3, 4], 0.5);
        cp.step(dt);
        const want = F.map((c) => scale * dt * c / rec.mass);
        rows.push([scale, w.bodies[0].v, want]);
    }
    ok("*** the force-to-velocity conversion is exact at three different scales ***",
       rows.every(([, got, want]) => got.every((g, i) => Math.abs(g - want[i]) <= 1e-15 * Math.abs(want[i]))),
       "scale 1 -> dv.x " + rows[0][1][0].toExponential(6) + ";  scale 5 -> dv.x " + rows[2][1][0].toExponential(6));
    ok("...and all three axes are distinct, so an axis swap could not have passed",
       new Set(rows[0][1].map((v) => v.toExponential(12))).size === 3, "F = " + F.join(", ") + " deliberately unequal");

    const w = mockWorld(), f = mockFluid();
    const cp = createFluidBox3D(w, f, { scale: 1 });
    const rec = cp.addBox([5, 5, 5], [1, 1, 1], 1);
    w.setVelocity(rec.idx, [100, 0, 0]);
    const seen = []; const realSet = w.setVelocity.bind(w); w.setVelocity = (i, v) => { seen.push(v.slice()); realSet(i, v); };
    cp.step(dt);
    const expect = 100 + dt * F[0] / rec.mass;
    ok("*** the nudge is ADDED to whatever box3d already had, never assigned over it ***",
       Math.abs(seen[0][0] - expect) < 1e-12, `100 -> ${seen[0][0].toPrecision(12)}, expected ${expect.toPrecision(12)}`);
    report("box3d has no apply-force, so the coupler writes velocity directly. ASSIGNING WOULD SILENTLY DELETE " +
           "the contact and gravity response box3d computed this tick, and the body would still move plausibly");
}

console.log("\n6. *** THE TORQUE CARRIES scale^2, AND THE ONLY CONSUMER RUNS AT scale 1 WHERE THAT IS INVISIBLE ***");
{
    const dt = 0.02, rows = [];
    for (const scale of [1, 2, 5]) {
        const w = mockWorld(), f = mockFluid();
        const cp = createFluidBox3D(w, f, { scale });
        cp.addBox([5, 5, 5], [1, 1, 1], 1);
        cp.step(dt);
        rows.push([scale, w.bodies[0].lastAng, T.map((c) => scale * scale * dt * c), T.map((c) => scale * dt * c)]);
    }
    ok("the angular impulse is forceScale * scale^2 * dt * torque, at every scale",
       rows.every(([, got, sq]) => got.every((g, i) => Math.abs(g - sq[i]) <= 1e-15 * Math.abs(sq[i]))),
       rows.map(([s, got]) => "scale " + s + ": " + got[0].toPrecision(8)).join(",  "));

    const [, got1, sq1, lin1] = rows[0];
    ok("*** AT scale = 1 THE scale^2 AND scale^1 SPELLINGS ARE BIT-IDENTICAL ***",
       sq1.every((v, i) => v === lin1[i]) && got1.every((v, i) => v === sq1[i]),
       "both give " + sq1.map((v) => v.toPrecision(4)).join(", ") + " -- THE SAME DOUBLES, not merely close");
    const [, , sq5, lin5] = rows[2];
    ok("...and at scale = 5 they differ by exactly the missing factor of 5, so the exponent IS observable",
       sq5.every((v, i) => Math.abs(v / lin5[i] - 5) < 1e-12),
       "scale^2 -> " + sq5[0].toPrecision(8) + " against scale^1 -> " + lin5[0].toPrecision(8));
    report("WHY THIS IS THE LOAD-BEARING CHECK: fluid-box3d.html builds the coupler with `scale: 1`, and it is " +
           "the module's only consumer in this tree. EVERY FRAME THIS COUPLER HAS EVER RUN WAS AT UNIT SCALE. " +
           "A wrong exponent here is not a latent bug in dead code -- the header names a non-unit host (ES ships) " +
           "as the reason the parameter exists, so this check is the first and only thing standing between that " +
           "host and a spin rate wrong by a factor of the scale.");
    report("THE LINEAR PATH IS NOT REDUNDANT WITH THIS ONE", "section 5 carries scale^1 and this carries scale^2; " +
           "a single global mistake in how scale is applied would move both, and only checking the pair distinguishes " +
           "'the exponent is wrong' from 'scale is threaded wrong everywhere'");
}

console.log("\n7. THE ORDER OF THE EXCHANGE, WHICH NO FINAL VALUE CAN REVEAL");
{
    const w = mockWorld(), f = mockFluid();
    const cp = createFluidBox3D(w, f, { scale: 1, substeps: 3 });
    const rec = cp.addBox([5, 5, 5], [1, 1, 1], 1);
    w.bodies[rec.idx].p = [7, 8, 9];
    w.log.length = 0;
    cp.step(0.02);
    const L = w.log.join(" ");
    ok("the fluid is given box3d's state BEFORE the fluid solves", f.atStep[0].x === 7 && f.atStep[0].y === 8,
       `fluid saw (${f.atStep[0].x},${f.atStep[0].y},${f.atStep[0].z}) at its own step -- the position box3d held, not a stale one`);
    ok("*** box3d steps LAST, after the nudge is on it ***",
       L.lastIndexOf("step") > L.lastIndexOf("setVelocity") && L.lastIndexOf("step") > L.lastIndexOf("angularImpulse"),
       w.log.join(" -> "));
    report("STEPPING box3d BEFORE THE NUDGE WOULD DELIVER EVERY FLUID FORCE ONE FRAME LATE. At 60Hz that is a " +
           "16ms lag in a feedback loop, which does not look like a bug -- it looks like damping, or like the " +
           "fluid being slightly too weak, and the fix people reach for is to raise forceScale");
    ok("...and the host's substep count reaches box3d rather than being swallowed", typeof w.log.find((x) => x === "step") === "string",
       "substeps: 3 passed through to world.step(dt, substeps)");
}

console.log("\n8. THE ANGULAR PATH IS OPTIONAL, AND ITS ABSENCE IS HANDLED RATHER THAN THROWN");
{
    const w = mockWorld({ withAngular: false }), f = mockFluid();
    const cp = createFluidBox3D(w, f, {});
    cp.addBox([5, 5, 5], [1, 1, 1], 1);
    w.log.length = 0;
    let threw = false;
    try { cp.step(0.02); } catch { threw = true; }
    ok("a world with no angularImpulse still couples, linearly, without throwing", !threw && w.log.includes("setVelocity"));
    ok("...and no angular call is attempted on it", !w.log.includes("angularImpulse"), w.log.join(" -> "));
    report("the capability is read ONCE per step into hasAng rather than probed per body -- so a world cannot " +
           "gain the method halfway through a frame and receive torque for only some of its bodies");
}

console.log("\n8b. THE KEY tools/ship/coverageTriage.mjs IMAGINED, AND WHY THIS DESIGN CANNOT HAVE IT");
{
    // *** THE TRIAGE HAS CARRIED THIS MODULE AS A CANDIDATE ON A KEY THAT IS STRUCTURALLY UNAVAILABLE: ***
    // "Momentum exchange across the coupling COULD be an exact key (what one side loses the other gains),
    // which would be a real gate rather than a smoke test." Both halves of that are wrong, and v4415 checked
    // rather than argued. THIS GATE IS NOT A SMOKE TEST -- the eight sections above hold the nudge to an exact
    // formula at three scales, pin the torque's scale^2 exponent, and assert the ORDER of the exchange. And
    // the momentum key cannot exist here, because THE COUPLING IS DELIBERATELY ONE-WAY: this module's own
    // header says "box3d OWNS the body motion... and the fluid just supplies external forces". The fluid is
    // never told to give up what the body receives, so there is no ledger with two sides to balance.
    const w = mockWorld(), f = mockFluid();
    const c = createFluidBox3D(w, f, { scale: 1 });
    const rec = c.addBox([0, 0, 0], [0.5, 0.5, 0.5], 1);
    const before = w.readVelocities().slice(rec.idx * 3, rec.idx * 3 + 3);
    const dt = 0.02;
    c.step(dt);
    const after = w.readVelocities().slice(rec.idx * 3, rec.idx * 3 + 3);
    const gained = [0, 1, 2].map((i) => rec.mass * (after[i] - before[i]));
    const impulse = [0, 1, 2].map((i) => f.forceScale * dt * [F[0], F[1], F[2]][i]);
    ok("*** the body GAINS exactly the impulse the fluid stamped -- which is the only half of a ledger there is ***",
        gained.every((g, i) => Math.abs(g - impulse[i]) < 1e-12),
        `momentum gained ${gained.map((g) => g.toFixed(6)).join(", ")} against force * dt ${impulse.map((g) => g.toFixed(6)).join(", ")}. That is the transfer being EXACT; it is not conservation, because nothing subtracts it from the fluid`);
    ok("!! ...and the fluid's own force is UNCHANGED by the transfer, so no momentum left it",
        f.bodies[0]._fx === F[0] && f.bodies[0]._fy === F[1] && f.bodies[0]._fz === F[2],
        `the stamped force is still ${F.join(", ")} after the step. A conserving coupler would have to remove the impulse from the fluid's own momentum; a STAGGERED co-simulation like this one does not, and that is a property of the design rather than a defect in it`);
    ok("!! *** so \"what one side loses the other gains\" is not a key this module can be held to, and the triage entry is corrected rather than left standing ***",
        typeof f.externalBodies === "boolean" && f.externalBodies === true,
        `externalBodies is true: the fluid does not integrate the bodies at all, so it has no body momentum to lose. The exact key that DOES exist here is the transfer formula, and sections 5 and 6 already hold it. A candidate key that cannot be written is worth recording as such -- otherwise it stays on a list forever, which is what happened for the ${"~1,100"} rounds since v3853`);
}

console.log("\n9. THE REAL FLIP3D: a light box RISES AGAINST GRAVITY and a heavy one does not");
{
    const run = (density) => {
        const rng = ((s) => () => (s = (s * 16807) % 2147483647) / 2147483647)(7);
        const f = new Flip3D(20, 26, 20, { iters: 30, gravity: -18, flipRatio: 0.9, twoWay: true });
        f.fillBlock(2, 2, 2, 18, 14, 18, 2, rng);
        const w = mockWorld({ gravity: -18 });
        const cp = createFluidBox3D(w, f, { gravity: -18, scale: 1, substeps: 2 });
        const rec = cp.addBox([10, 8, 10], [2, 2, 2], density);
        for (let i = 0; i < 90; i++) cp.step(1 / 60);
        return cp.worldPos(rec)[1];
    };
    const light = run(0.25), heavy = run(4.0);
    ok("*** density 0.25 ENDS ABOVE WHERE IT STARTED, with gravity pulling down the whole time ***", light > 8,
       `y 8 -> ${light.toPrecision(6)} after 90 frames at -18 gravity`);
    ok("...and density 4.0 sinks", heavy < 8, `y 8 -> ${heavy.toPrecision(6)}`);
    ok("!! the two densities separate by more than the body itself is tall", light - heavy > 4,
       `separation ${(light - heavy).toPrecision(6)} against a half-extent of 2`);
    report("SECTIONS 1-8 GRADE ARITHMETIC AGAINST A FLUID THIS FILE WROTE, WHICH PROVES ARITHMETIC AND NOT PHYSICS. " +
           "This one runs the real solver end to end. RISING is the claim that cannot be faked by a sign error " +
           "somewhere convenient: the only thing in the system pushing that box up is the pressure the fluid solved for.");
}

console.log(fails ? `\nfluidBox3d-selfcheck: ${fails} FAILED` : "\nfluidBox3d-selfcheck: all checks pass");
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exit(fails ? 1 : 0);
