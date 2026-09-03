// WebGLEngine/physics/backendLimits-selfcheck.mjs -- v4397
//
// *** v4396 MEASURED box3d ALONE AND SAID, IN ITS OWN FOOTER, THAT IT COULD NOT TELL WHETHER ITS FINDINGS WERE
//     ABOUT DISCRETE PHYSICS OR ABOUT BOX3D. THIS RUNS THE SAME EXPERIMENTS ON JOLT AND SEPARATES THEM. ***
//
// Every number below is re-measured on both engines in this run. The record in physics/backendLimits.mjs is
// checked against the measurement, never the other way round -- a divergence table that is not re-derived is
// how physics/backend.js came to call two engines interchangeable for two thousand versions.
//
// *** AND THIS FILE WAS ALMOST WRITTEN OVER physics/backendDivergence.mjs, WHICH HAS EXISTED SINCE v3845 AND
// DOES THE OTHER HALF OF THIS COMPARISON. *** `cat >` overwrote it, render/perceptual-selfcheck went red inside
// one verify, and the module is now called backendLimits because that is what it measures: LIMITS and API
// shape, where the older one measures hash TRAJECTORIES. The tree caught the clobber in a single sweep, which
// is the system working; it happened because a file was written without asking whether the name was taken.
// Section 7 is what reading the module it nearly replaced turned up, and it is the best finding in the round.
//
// AND JOLT NEEDED NO REBUILD. box3d's half of this took C, a native build, and a PENDING_REBUILD entry that is
// still outstanding for the browser. Jolt is a vendored wasm with JS bindings: mIsSensor, SetIsSensor,
// EMotionQuality_LinearCast and the cap are all reachable from a page today. That asymmetry is the reason this
// round was cheap and it is worth stating rather than enjoying quietly.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BACKENDS, SPEED_CAP, effectiveSpeed, speedDivergesAcrossBackends, TUNNEL_GRID, TUNNEL_PROFILE,
         hasInversion, ccdIsAbsolute, SENSOR_API, needsSensorDiscriminator, divergences,
         shared } from "./backendLimits.mjs";
import { initNode, mod } from "./box3d/box3dNode.mjs";
import { createJoltBackend } from "./jolt/joltLoader.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

// ---- THE TWO RIGS, BUILT TO BE THE SAME EXPERIMENT ---------------------------------------------------------
//
// A 0.2 m cube driven downward at v at a 0.1 m-thick static wall, no gravity so speed is the only variable,
// 60 Hz with 4 substeps, 120 steps, damping 0.05 on BOTH. The damping match is the whole reason this comparison
// is worth anything -- see TUNNEL_GRID's docstring and v2468.
const DT = 1 / 60, SUB = 4, STEPS = 120;

let B3 = null;
async function box3dRig() {
    if (B3) return B3;
    await initNode();
    const m = mod();
    const buf = m._malloc(4 * 7 * 4);
    B3 = {
        wall(v) {
            m._swk_world_create(0, 0, 0);
            m._swk_body_box(0, 0, 0, 0, 5, 0.05, 5, 1000);
            const b = m._swk_body_box(1, 0, 3, 0, 0.1, 0.1, 0.1, 1000);
            m._swk_body_set_velocity(b, 0, -v, 0);
            for (let s = 0; s < STEPS; s++) m._swk_world_step(DT, SUB);
            m._swk_transforms(buf);
            const y = m.HEAPF32[(buf >> 2) + b * 7 + 1];
            m._swk_world_destroy();
            return y < -0.5;
        },
        cap(v) {
            m._swk_world_create(0, 0, 0);
            const b = m._swk_body_box(1, 0, 0, 0, 0.1, 0.1, 0.1, 1000);
            m._swk_body_set_velocity(b, 0, -v, 0);
            m._swk_world_step(DT, SUB);
            m._swk_velocities(buf);
            const vy = m.HEAPF32[(buf >> 2) + b * 3 + 1];
            m._swk_world_destroy();
            return Math.abs(vy);
        },
    };
    return B3;
}

let JB = null;
async function joltRig() {
    if (JB) return JB;
    const be = await createJoltBackend();
    const J = be._Jolt;
    const dynBox = (w, pos, half, linearCast, damping) => {
        const { Jolt, bi } = w.raw();
        const sh = new Jolt.BoxShapeSettings(new Jolt.Vec3(half, half, half)).Create().Get();
        const cs = new Jolt.BodyCreationSettings(sh, new Jolt.RVec3(pos[0], pos[1], pos[2]),
                                                 new Jolt.Quat(0, 0, 0, 1), Jolt.EMotionType_Dynamic, 1);
        cs.mOverrideMassProperties = Jolt.EOverrideMassProperties_CalculateInertia;
        cs.mMassPropertiesOverride.mMass = 1000 * 8 * half * half * half;
        cs.mLinearDamping = damping;
        cs.mAngularDamping = damping === 0 ? 0 : 0.05;
        if (linearCast != null) cs.mMotionQuality = linearCast ? Jolt.EMotionQuality_LinearCast
                                                              : Jolt.EMotionQuality_Discrete;
        const b = bi.CreateBody(cs); Jolt.destroy(cs);
        bi.AddBody(b.GetID(), Jolt.EActivation_Activate);
        w.bodies.push({ body: b, id: b.GetID(), dynamic: true });
        return w.bodies.length - 1;
    };
    JB = {
        Jolt: J, be,
        wall(v, linearCast) {
            const w = be.createWorld({ gravity: [0, 0, 0] });
            w.addBox({ type: "static", pos: [0, 0, 0], half: [5, 0.05, 5], density: 1000, damping: TUNNEL_GRID.damping });
            const idx = dynBox(w, [0, 3, 0], 0.1, linearCast, TUNNEL_GRID.damping);
            w.setVelocity(idx, [0, -v, 0]);
            for (let s = 0; s < STEPS; s++) w.step(DT, SUB);
            const y = w.readTransforms()[idx * 7 + 1];
            w.destroy();
            return y < -0.5;
        },
        cap(v) {
            const w = be.createWorld({ gravity: [0, 0, 0] });
            const idx = dynBox(w, [0, 0, 0], 0.1, null, 0);
            w.setVelocity(idx, [0, -v, 0]);
            w.step(DT, SUB);
            const vy = w.readVelocities()[idx * 3 + 1];
            w.destroy();
            return Math.abs(vy);
        },
    };
    return JB;
}

/** The scan, identical for both: count pass-throughs and find whether an inversion exists. */
function scan(wallFn) {
    let tunnelled = 0, lowestTunnel = -1, highestStop = -1;
    for (let v = TUNNEL_GRID.from; v <= TUNNEL_GRID.to; v += TUNNEL_GRID.step) {
        if (wallFn(v)) { tunnelled++; if (lowestTunnel < 0) lowestTunnel = v; }
        else highestStop = v;
    }
    return { tunnelled, lowestTunnel, highestStop };
}

// =============================================================================================================
console.log("1. BOTH ENGINES SILENTLY CAP LINEAR SPEED, AND THE TWO CAPS ARE NOT THE SAME NUMBER");
{
    const b3 = await box3dRig(), jl = await joltRig();
    const measured = { box3d: {}, jolt: {} };
    for (const v of [100, 390, 430, 490, 2000]) {
        measured.box3d[v] = b3.cap(v);
        measured.jolt[v] = jl.cap(v);
    }
    console.log("        asked   box3d      jolt");
    for (const v of [100, 390, 430, 490, 2000]) {
        console.log(`        ${String(v).padStart(5)}   ${measured.box3d[v].toFixed(2).padStart(8)}   ` +
                    measured.jolt[v].toFixed(2).padStart(8));
    }
    // A cap is present iff a large request comes back smaller than asked. Derived, not assumed.
    for (const b of BACKENDS) {
        ok(`${b} clamps a 2000 m/s request, so it has a cap at all`,
           measured[b][2000] < 1999, `2000 -> ${measured[b][2000].toFixed(2)}`);
        ok(`...and the clamp matches the recorded ${SPEED_CAP[b]} m/s for ${b}`,
           Math.abs(measured[b][2000] - SPEED_CAP[b]) < 1,
           `recorded ${SPEED_CAP[b]}, measured ${measured[b][2000].toFixed(2)}`);
    }
    ok("*** AND THE TWO CAPS DIFFER, SO A SHIP'S TOP SPEED DEPENDS ON WHICH BACKEND THE ROUTER PICKED ***",
       SPEED_CAP.box3d !== SPEED_CAP.jolt &&
       Math.abs(measured.box3d[430] - measured.jolt[430]) > 1,
       `430 m/s -> box3d ${measured.box3d[430].toFixed(2)}, jolt ${measured.jolt[430].toFixed(2)}: a ` +
       `${(measured.jolt[430] - measured.box3d[430]).toFixed(2)} m/s divergence on the same request`);
    ok("...and the predictor agrees with both engines rather than with one of them",
       BACKENDS.every((b) => Math.abs(effectiveSpeed(430, b) - measured[b][430]) < 1) &&
       speedDivergesAcrossBackends(430) && !speedDivergesAcrossBackends(390),
       "effectiveSpeed(430, ...) = " + BACKENDS.map((b) => b + " " + effectiveSpeed(430, b)).join(", "));
    report("This is v2468's finding in a second place. That round found box3d carrying no drag while Jolt " +
           "carried 5%/s, and said the ENGINE had never chosen. It still has not: ev/tools/es-arena.mjs's " +
           "Fighter asks for 430 and gets 400 or 430 depending on a router decision nothing surfaces. Neither " +
           "cap is documented -- box3d's default is assigned in its own .c, and Jolt's PhysicsSettings in this " +
           "build does not expose the field at all, so both numbers above are measurements and cannot be " +
           "anything else.");
}

// =============================================================================================================
console.log("\n2. THE TUNNELLING PROFILE, SAME EXPERIMENT ON BOTH, DAMPING MATCHED");
const MEASURED = { box3d: {}, jolt: {} };
{
    const b3 = await box3dRig(), jl = await joltRig();
    MEASURED.box3d.ccdOn = scan((v) => b3.wall(v));            // box3d's continuous switch defaults ON
    MEASURED.jolt.ccdOff = scan((v) => jl.wall(v, false));
    MEASURED.jolt.ccdOn = scan((v) => jl.wall(v, true));

    console.log(`        grid: ${TUNNEL_GRID.from}..${TUNNEL_GRID.to} m/s step ${TUNNEL_GRID.step} ` +
                `(${TUNNEL_GRID.samples} speeds), ${TUNNEL_GRID.hz} Hz, damping ${TUNNEL_GRID.damping} both`);
    const row = (n, r) => console.log(`        ${n.padEnd(22)} through ${String(r.tunnelled).padStart(2)}/` +
                                      `${TUNNEL_GRID.samples}   lowest through ${String(r.lowestTunnel).padStart(3)}` +
                                      `   highest stopped ${r.highestStop}`);
    row("box3d, CCD on", MEASURED.box3d.ccdOn);
    row("jolt, CCD off", MEASURED.jolt.ccdOff);
    row("jolt, CCD on", MEASURED.jolt.ccdOn);
    report("box3d with CCD OFF is not re-measured here and the record says why: it needs " +
           "swk_world_enable_continuous, which is in the shim and NOT in the shipped wasm. Its 64/96 came from " +
           "the native build at v4396. The row above it, box3d with CCD on, IS the shipped wasm -- and it " +
           "reproduces the hole, so the two builds agree where they can both be asked.");

    ok("the recorded Jolt profile is the profile just measured, both settings",
       MEASURED.jolt.ccdOff.tunnelled === TUNNEL_PROFILE.jolt.ccdOff.tunnelled &&
       MEASURED.jolt.ccdOff.lowestTunnel === TUNNEL_PROFILE.jolt.ccdOff.lowestTunnel &&
       MEASURED.jolt.ccdOn.tunnelled === TUNNEL_PROFILE.jolt.ccdOn.tunnelled,
       `off ${MEASURED.jolt.ccdOff.tunnelled}/${TUNNEL_GRID.samples} onset ${MEASURED.jolt.ccdOff.lowestTunnel}, ` +
       `on ${MEASURED.jolt.ccdOn.tunnelled}/${TUNNEL_GRID.samples}`);
    ok("the recorded box3d CCD-on profile is the profile just measured, in the SHIPPED wasm",
       MEASURED.box3d.ccdOn.tunnelled === TUNNEL_PROFILE.box3d.ccdOn.tunnelled &&
       MEASURED.box3d.ccdOn.lowestTunnel === TUNNEL_PROFILE.box3d.ccdOn.lowestTunnel,
       `${MEASURED.box3d.ccdOn.tunnelled}/${TUNNEL_GRID.samples}, the one pass-through at ` +
       `${MEASURED.box3d.ccdOn.lowestTunnel} m/s`);
}

// =============================================================================================================
console.log("\n3. *** SHARED: THERE IS NO TUNNELLING THRESHOLD IN EITHER ENGINE ***");
{
    // v4396 found box3d non-monotonic and could not say whether that was box3d or discrete physics. Jolt says.
    ok("Jolt is non-monotonic too: a speed passes through BELOW a speed that stops",
       hasInversion(MEASURED.jolt.ccdOff),
       `${MEASURED.jolt.ccdOff.lowestTunnel} m/s goes through while ${MEASURED.jolt.ccdOff.highestStop} m/s ` +
       `is stopped -- the same inversion box3d showed at 13 and 90`);
    ok("...so the recorded box3d profile and the measured Jolt one both carry an inversion",
       hasInversion(TUNNEL_PROFILE.box3d.ccdOff) && hasInversion(MEASURED.jolt.ccdOff) &&
       shared().noTunnellingThreshold,
       "aliasing is a property of stepping a solver, not of box3d");
    report("*** SO v4396's CORRECTION GENERALISES AND ITS BISECTION WOULD HAVE FAILED THE SAME WAY HERE. *** " +
           "A bisection for a tunnelling threshold returns a property of its own bracket on either engine. " +
           "That is the half of v4396's footer this round could confirm.");
}

// =============================================================================================================
console.log("\n4. *** BOX3D'S ALONE: THE HOLE IN CONTINUOUS COLLISION ***");
{
    ok("Jolt's LinearCast stops every sampled speed, with no hole anywhere in the grid",
       MEASURED.jolt.ccdOn.tunnelled === 0 && ccdIsAbsolute("jolt"),
       `0 of ${TUNNEL_GRID.samples} pass through with EMotionQuality_LinearCast`);
    ok("*** ...while box3d, in the artifact that ships, still passes one through ***",
       MEASURED.box3d.ccdOn.tunnelled === 1 && !ccdIsAbsolute("box3d"),
       `box3d passes at ${MEASURED.box3d.ccdOn.lowestTunnel} m/s with continuous enabled; Jolt passes at none`);
    ok("...so this one does NOT generalise, and v4396 was right to ship a counterexample and not a law",
       ccdIsAbsolute("jolt") !== ccdIsAbsolute("box3d"),
       "`continuous collision is necessary and not sufficient` is a statement about box3d");
    report("The mechanism is visible in the two libraries' knobs. Jolt exposes mLinearCastThreshold (0.75 in " +
           "this build) -- the fraction of a body's own extent it must exceed in a step before the sweep runs. " +
           "box3d exposes no such number, so its hole cannot be predicted from anything readable, only found. " +
           "This gate does not model either; it reports that one engine has the hole and the other does not.");
}

// =============================================================================================================
console.log("\n5. THE SENSOR APIS ARE SHAPED DIFFERENTLY, AND THE NAIVE NORMALISATION IS WRONG");
{
    const jl = await joltRig();
    const { Jolt } = jl;
    // A SENSOR above a SOLID floor. Both overlaps arrive through the same listener, so the reader must ask.
    const w = jl.be.createWorld({ gravity: [0, -10, 0] });
    const { ps, bi } = w.raw();
    const plate = (sensor, y) => {
        const sh = new Jolt.BoxShapeSettings(new Jolt.Vec3(2, 0.2, 2)).Create().Get();
        const cs = new Jolt.BodyCreationSettings(sh, new Jolt.RVec3(0, y, 0), new Jolt.Quat(0, 0, 0, 1),
                                                 Jolt.EMotionType_Static, 0);
        if (sensor) cs.mIsSensor = true;
        const b = bi.CreateBody(cs); Jolt.destroy(cs);
        bi.AddBody(b.GetID(), Jolt.EActivation_DontActivate);
        w.bodies.push({ body: b, id: b.GetID(), dynamic: false });
    };
    plate(true, 2); plate(false, 0);
    const box = w.addBox({ type: "dynamic", pos: [0, 5, 0], half: [0.2, 0.2, 0.2], density: 1000, damping: 0 });
    const events = [];
    const cl = new Jolt.ContactListenerJS();
    cl.OnContactValidate = () => Jolt.ValidateResult_AcceptAllContactsForThisBodyPair;
    cl.OnContactAdded = (b1, b2) => {
        const A = Jolt.wrapPointer(b1, Jolt.Body), B = Jolt.wrapPointer(b2, Jolt.Body);
        events.push(A.IsSensor() || B.IsSensor());
    };
    cl.OnContactPersisted = () => {};
    cl.OnContactRemoved = () => {};
    ps.SetContactListener(cl);
    for (let s = 0; s < 240; s++) w.step(DT, SUB);
    const restY = w.readTransforms()[box * 7 + 1];
    w.destroy();

    const triggers = events.filter(Boolean).length, collisions = events.filter((e) => !e).length;
    ok("Jolt delivers a sensor overlap and a solid collision through the SAME contact listener",
       events.length === 2 && triggers === 1 && collisions === 1,
       `${events.length} contact events: ${triggers} where a side is a sensor, ${collisions} where neither is`);
    ok("*** SO COUNTING CONTACT EVENTS WOULD REPORT THE FLOOR AS A TRIGGER -- the discriminator is required ***",
       events.length !== triggers && SENSOR_API.jolt.discriminator === "Body.IsSensor()",
       `a naive normaliser reads ${events.length} triggers where there is ${triggers}`);
    ok("...and the box crossed the sensor and then landed on the floor, so the rig is a real rig",
       restY > -1 && restY < 1, `final y ${restY.toFixed(6)} -- resting on the solid plate, not fallen through`);
    ok("box3d needs no discriminator, because its sensor events arrive in a buffer of their own",
       needsSensorDiscriminator().join(",") === "jolt" && SENSOR_API.box3d.discriminator === null,
       "b3World_GetSensorEvents holds sensor overlaps and nothing else");
    ok("and the asymmetry runs the OTHER way for creation: Jolt can make a body a sensor after the fact",
       SENSOR_API.jolt.settableAfterCreation && !SENSOR_API.box3d.settableAfterCreation &&
       typeof Jolt.Body.prototype.SetIsSensor === "function",
       "Body.SetIsSensor exists; box3d's b3Shape_IsSensor is a getter with no setter, which is why v4396's " +
       "shim needed a second creation entry point");
}

// =============================================================================================================
console.log("\n6. THE DIVERGENCE TABLE, DERIVED FROM THE MEASUREMENTS RATHER THAN LISTED BESIDE THEM");
{
    const d = divergences();
    for (const r of d) console.log(`        ${r.what.padEnd(38)} box3d ${String(r.box3d).padEnd(20)} jolt ${r.jolt}`);
    ok("every divergence is derived from a measured field, so the list cannot outlive the measurement",
       d.length === 5 && d.every((r) => r.what && r.consequence),
       `${d.length} capabilities where the two backends measurably disagree`);
    const sh = shared();
    ok("...and so is the SHARED half, which is what a single-engine round could not establish at all",
       sh.cappedSilently && sh.noTunnellingThreshold,
       "both cap silently and neither has a tunnelling threshold");
    report("physics/backend.js's facade comment says the two engines 'implement the SAME world-handle' and " +
           "v2468 already had to qualify that once, for damping. This is four more qualifications and one " +
           "confirmed shared property. None of them makes the facade wrong -- what they make it is a claim " +
           "with a measured error bar instead of a promise.");
}

// =============================================================================================================
console.log("\n7. *** THE TREE ALREADY HAD A CROSS-BACKEND HARNESS, AND IT HAS ONLY EVER MEASURED ONE ENGINE ***");
{
    // Found by nearly destroying it. This round's module was first written to physics/backendDivergence.mjs --
    // a file that has existed since v3845 and does the OTHER half of this comparison, hash trajectories rather
    // than capability limits. `cat >` overwrote it, render/perceptual-selfcheck went red inside one verify, and
    // the name is now backendLimits.mjs. The tree caught it in a single sweep, which is the system working; the
    // reason it happened is that a new file was written without asking whether the name was taken.
    //
    // And reading the module it nearly replaced turned up something worth more than the near-miss.
    const qa = fs.readFileSync(path.join(ENG, "physics/backend-qa-check.mjs"), "utf8");
    const reachesForBrowserLoader = /import\("\.\/box3d\/box3dLoader\.js"\)/.test(qa);
    const callsItWasmAbsent = /box3d WASM absent/.test(qa);
    ok("physics/backend-qa-check.mjs reaches for the BROWSER loader and calls the failure `WASM absent`",
       reachesForBrowserLoader && callsItWasmAbsent,
       "one try/catch around box3dLoader.createWorld, and the catch prints a capability claim");

    // The wasm is not absent. This gate drove it in section 2. What box3dLoader actually says is different.
    let loaderErr = null;
    try {
        const m = await import("./box3d/box3dLoader.js");
        m.box3d.createWorld({ gravity: [0, -9.8, 0] });
    } catch (e) { loaderErr = String(e.message); }
    ok("*** AND THE ERROR IT SWALLOWS IS A USAGE ERROR, NOT A MISSING ARTIFACT ***",
       loaderErr != null && /init\(\) first/.test(loaderErr),
       `box3dLoader in Node says "${loaderErr}" -- the caller skipped init(), and the catch reports that as ` +
       `the wasm being unbuilt`);
    ok("...while box3dNode.mjs loads the same artifact headless, which is what every physics gate uses",
       mod() && Object.keys(mod()).some((k) => k === "_swk_world_create"),
       "45 swk_ functions, and sections 1, 2 and 4 above are box3d numbers taken through it in this run");
    report("So the envelope that harness exists to record -- how far box3d and Jolt drift apart on one scene -- " +
           "has never been recorded. Its own header worries about exactly this: line 87 warns that a run " +
           "`where box3d finally loads would go GREEN while measuring nothing -- a control that cannot fail`. " +
           "That is what it became, and not because box3d was unavailable.");
    report("NOT FIXED HERE, deliberately. The repair is a line, but it makes that gate start comparing two " +
           "engines against a baseline recorded from one, which is its own round with its own red. Filed " +
           "beside the capability-table mismatch, which is the same species: a record that stopped matching " +
           "the tree and had no check asking whether it still did.");
}

// ---- v4397 SABOTAGES, grep-CONFIRMED APPLIED BEFORE READING, RESTORED md5-IDENTICAL -------------------------
//
// backendLimits.mjs da67a4e1e3e3d2e7387dd796ef05b058 -- before and after all five, md5-identical. This gate is not in that list on
// purpose: it was 6bee392aa49a53d50f278fc24b896149 while the five ran, and writing this paragraph changed it.
//
//   A  the record claims the two caps AGREE (jolt 500 -> 400). -> 4 RED, and the cascade is the point: the
//      clamp check, the divergence check, the predictor check and the derived table all move together,
//      because they all read the same field. One edit, four places that noticed.
//
//   B  the damping match is dropped (TUNNEL_GRID.damping 0.05 -> 0). -> 1 RED, and its detail line reads
//      "off 25/96 onset 45" against the recorded 19/96 onset 52. *** THIS IS v2468's MISTAKE REPRODUCED ON
//      DEMAND: *** an unmatched comparison between two engines reports a difference between two damping
//      settings as a difference between two solvers. The sabotage that matters most here, because the first
//      Jolt scan of this round really did read 25/96 before the match was made.
//
//   C  the gate drops Body.IsSensor() and counts every contact event as a trigger. -> 2 RED, the second
//      reading "a naive normaliser reads 2 triggers where there is 2". That is the failure a portable sensor
//      layer over both engines would ship by default, demonstrated rather than warned about.
//
//   D  ccdIsAbsolute() always returns true, so box3d's hole vanishes from the record. -> 3 RED, including the
//      derived divergence count dropping from 5 to 4. A finding that can be edited out of the table without
//      the table noticing would not be worth recording.
//
//   E  the recorded box3d hole moves from 34 to 35 m/s. -> 1 RED. The hole is a specific speed in the SHIPPED
//      wasm, and a check that tolerated a neighbouring value would not be pinning anything.
//
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: box3d WITH CCD OFF is not re-measured, because swk_world_enable_continuous is not " +
    "in the shipped wasm -- its 64/96 is v4396's native number, carried in the record and labelled with its " +
    "source rather than silently mixed in with rows this run produced. Also unchecked: everything is a BOX " +
    "against a BOX, at one thickness, one timestep and one substep count, so the profile is a slice and not a " +
    "surface; whether the caps or the CCD hole move with substeps is a whole grid nobody has run. And the " +
    "sensor comparison is about DELIVERY, not about agreement: no check here asks whether the two engines " +
    "report the same overlap at the same step, which is what a lockstep peer swapping backends would need.");
process.exit(fails ? 1 : 0);
