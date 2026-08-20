// tools/roundhouse/box3dBind-selfcheck.mjs
//
// Run: node tools/roundhouse/box3dBind-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Device #3 is the first WASM device through the seam, and the first whose observables split cleanly into three
// kinds of truth: closed-form kinematics the integrator only APPROXIMATES (drop/toss -- so the error fraction is
// the honest observable, and the claim carries a tolerance the discretization has earned), bookkeeping the engine
// gets EXACT (impulse -> momentum), and a property about the engine ITSELF (determinism hash -- the lockstep
// question as a claim). Then the registry and the CLI runner, because a lab you cannot start from the command
// line is a lab only its author runs. Skips honestly if the wasm is not built -- same rule as the conformance
// check: a SKIP is not a PASS.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildB3D, b3dDefaults, box3dDevice, __resetBox3D } from "./box3dBind.mjs";
import { roundhouseDevice } from "./deviceBind.mjs";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";
import { runDevice, parseArgs, DEMO_HYPS } from "./run-device.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const WASM = path.join(here, "..", "..", "vendor", "box3d", "box3d.wasm");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

if (!fs.existsSync(WASM)) {
    console.log("box3dBind-selfcheck: SKIPPED -- vendor/box3d/box3d.wasm not present.");
    console.log("  This is NOT a pass. Run physics/box3d/build-box3d-wasm-clang.sh.");
    process.exit(0);
}

// ---- 1. CLOSED-FORM KINEMATICS: the integrator vs 0.5*g*t^2 and v^2/2g -----------------------------------------
{
    const drop = await buildB3D({ mode: "drop" });
    ok("!! free fall lands within 2% of the closed form", drop.fallErrFrac < 0.02,
        "fell " + drop.fallDistance.toFixed(3) + " vs ideal " + drop.fallIdeal.toFixed(3) +
        " (" + (drop.fallErrFrac * 100).toFixed(2) + "%) -- the gap is the fixed-step discretization, measured, not hidden");
    const toss = await buildB3D({ mode: "toss" });
    ok("!! projectile apex lands within 4% of v0^2/2g", toss.apexErrFrac < 0.04,
        "apex " + toss.apexHeight.toFixed(3) + " vs ideal " + toss.apexIdeal.toFixed(3) +
        " -- coarser than the drop because the apex is sampled at step resolution");
}

// ---- 2. EXACT BOOKKEEPING: momentum ----------------------------------------------------------------------------
{
    const imp = await buildB3D({ mode: "impulse" });
    ok("!! impulse / mass gives the speed EXACTLY", imp.momentumErrFrac === 0,
        "j=5 on m=1 -> speed " + imp.speedAfter + " -- momentum accounting has no discretization to hide behind");
    const heavy = await buildB3D({ mode: "impulse", config: { density: 4, half: 0.5 } });
    ok("and mass scales with density", Math.abs(heavy.massImplied - 4) < 1e-4,
        "implied mass " + heavy.massImplied.toFixed(4) + " for density 4");
}

// ---- 3. THE ENGINE AS ITS OWN OBSERVABLE: the determinism hash --------------------------------------------------
{
    const h = await buildB3D({ mode: "hash" });
    ok("!! the scripted 600-tick pile hashes identically on a rerun", h.deterministic === true,
        "hash " + h.stateHash + " twice -- the lockstep-safety question, answered as a measurement");

    // *** THIS CHECK USED TO PRINT A CLAIM IT BUILT OUT OF ITS OWN ANSWER. The old detail line read
    // "claim {observable:'stateHash', equals:'" + h.stateHash + "'}" -- THE REFERENCE VALUE WAS THE MEASURED
    // VALUE, so it agreed with itself whatever came back, and calling it "a cross-machine experiment" was
    // prose. v3725's plant walked straight through it: with FULL extents passed where the API wants HALF the
    // gate printed "hash 682fe802 twice" AND PASSED, because h1 === h2 compares a run against ITSELF and
    // A WRONG WORLD IS STILL A DETERMINISTIC WORLD. A DEMO IS PROSE UNLESS SOMETHING READS IT (v3710). ***
    //
    // The reference is DERIVED from the baseline the tree already ships -- never typed here, because a
    // second copy of a frozen number is the thing this tree finds most often. Until now the ONLY reader of
    // that pin was labResults-selfcheck, which takes ~9 MINUTES and which verify does not drive, so the
    // scene's hash was effectively unwatched on every ordinary ship.
    const BASE = path.join(here, "lab-results-baseline.json");
    const pinned = JSON.parse(fs.readFileSync(BASE, "utf8"))?.pairs?.["box3d/hash"]?.outputs?.stateHash;
    ok("!! ...and the hash MATCHES THE FROZEN BASELINE, which is a reference this file does not own",
        typeof pinned === "string" && pinned.length > 0 && h.stateHash === pinned,
        "measured " + h.stateHash + " against the frozen " + String(pinned) + ". *** WHEN THIS GOES RED IT IS " +
        "NOT A CHECK TO WEAKEN. Either the scene changed on purpose -- RE-FREEZE with SWEK_FREEZE_LAB_RESULTS=1 " +
        "and name the round -- or the same scene hashed differently on different hardware, WHICH IS THE KILL " +
        "CONDITION OF AN OPEN CLAIM (okf/claims/box3d-is-deterministic-across-architectures.md, open since " +
        "v2500, predicting an x86_64 recording replays on arm64 with every embedded hash matching). That claim " +
        "has never been tested automatically; this line is the first thing in the tree that can falsify it, and " +
        "a mismatch on Keith's rig is a REAL UPSTREAM FINDING rather than a nuisance. ***");
}

// ---- 3b. *** THE PLANT, AND WHICH MODES CAN SEE IT -- THE POINT IS WHICH ONES CANNOT (v3725) *** ----------------
// _swk_body_box takes THREE HALF-EXTENTS and the plant passes FULL ones: 8x the volume, 8x the mass. It is a
// plant ON THE PHYSICS -- the wasm simulates faithfully and the body it was handed is wrong -- which is the only
// kind available here, since nothing in this sandbox can recompile the solver.
// WHEN A MODE MOVES FROM THIS LIST the census below goes red and MUST BE RE-DERIVED rather than relaxed: a mode
// that starts seeing the plant is a NEW OBSERVABLE, and one that stops seeing it is a LOST KEY.
{
    const pairs = [];
    for (const mode of ["drop", "toss", "impulse", "hash"]) {
        const a = await buildB3D({ mode });
        const b = await buildB3D({ mode, config: { planted: true } });
        const moved = Object.keys(a).filter((k) => k !== "kind" && JSON.stringify(a[k]) !== JSON.stringify(b[k]));
        pairs.push({ mode, a, b, moved });
    }
    const by = Object.fromEntries(pairs.map((p) => [p.mode, p]));

    ok("!! the plant FIRES on the impulse keys, by exactly the volume ratio",
        by.impulse.moved.includes("massImplied") && Math.abs(by.impulse.b.massImplied / by.impulse.a.massImplied - 8) < 1e-9 &&
        by.impulse.a.momentumErrFrac === 0 && by.impulse.b.momentumErrFrac > 0.8,
        "implied mass " + by.impulse.a.massImplied + " -> " + by.impulse.b.massImplied + " (2x per axis is 8x the " +
        "volume, and the ratio is asserted rather than a threshold), momentumErrFrac " + by.impulse.a.momentumErrFrac +
        " -> " + by.impulse.b.momentumErrFrac);

    // *** A DECLARED BLINDNESS, NOT A GAP (v3715): free fall never claimed to see the body's size, and it is
    // right not to -- a mass-dependent fall would be the alarming result. BIT-IDENTICAL is asserted rather than
    // "small", because the equivalence principle does not hold approximately here, it holds exactly.
    // AND THIS ONE MUST BE READ BESIDE THE CHECK ABOVE, NEVER ALONE: measured at v3725 by neutering the knob so
    // both arms are identical -- THIS LINE STAYS GREEN, because a knob that does nothing makes every mode
    // bit-identical too. It cannot tell "blind for the right reason" from "the plant never fired" (v3715's
    // shape). The fire-check above is what establishes the knob works; only together do they say anything.
    ok("!! drop and toss are BIT-IDENTICAL under the plant, and that is the physics rather than a hole",
        by.drop.moved.length === 0 && by.toss.moved.length === 0,
        "fall " + by.drop.a.fallDistance + " and apex " + by.toss.a.apexHeight + " unchanged to the last bit -- " +
        "free fall is MASS-INDEPENDENT, so an 8x body must not move them. A key that fired here would be wrong");

    // *** THE SPLIT THAT IS THE ROUND: the observable saw it and the verdict did not. ***
    ok("!! the hash OBSERVABLE moves while the determinism VERDICT does not",
        by.hash.moved.includes("stateHash") && by.hash.a.deterministic === true && by.hash.b.deterministic === true,
        "stateHash " + by.hash.a.stateHash + " -> " + by.hash.b.stateHash + " while `deterministic` stays true " +
        "in BOTH arms. A SELF-COMPARISON CANNOT SEE A COHERENT CHANGE TO THE WORLD IT COMPARES -- which is why " +
        "the baseline pin above exists and why this mode's verdict alone was never enough");
}

// ---- 4. SLOPPY HYPOTHESES + MISSING WASM degrade, never crash ---------------------------------------------------
{
    const h = b3dDefaults({ mode: "warp-drive", config: { g: 1e9, seconds: -3, hashTicks: 1e9 } });
    ok("!! defaults clamp nonsense into a bounded physical run",
        h.mode === "drop" && h.config.g <= 100 && h.config.seconds >= 0.1 && h.config.hashTicks <= 5000);
    __resetBox3D();
    const missing = await buildB3D({ mode: "drop" }, { wasmPath: "/nonexistent/box3d.wasm" });
    ok("!! a missing wasm becomes an error OBSERVATION the verdict refuses, not a crash",
        typeof missing.error === "string" && missing.error.startsWith("box3d-wasm-missing"),
        "the loop keeps turning and the history says why");
    __resetBox3D();   // restore the real module for what follows
}

// ---- 5. THE LOOP over real box3d + the registry + the CLI runner ------------------------------------------------
{
    const dev = await getDevice("box3d");
    ok("the registry knows all three labs", DEVICE_NAMES.includes("blackhole") && DEVICE_NAMES.includes("box3d") && DEVICE_NAMES.includes("lbm"),
        DEVICE_NAMES.join(", "));
    const caller = async (role) => role === "proposer"
        ? { mode: "impulse", claim: { observable: "momentumErrFrac", max: 1e-9 } }
        : { reading: "exact is exact" };
    const out = await roundhouseDevice({ callModel: caller, device: dev, question: "is momentum exact?", maxRounds: 2 });
    ok("!! a claim about exact momentum crystallizes through the loop", out.crystallized === true && out.rounds === 1,
        "measured errFrac " + out.verdict.measured);

    // CLI runner end to end (mock caller, captured log)
    const lines = [];
    const cli = await runDevice(parseArgs(["box3d", "mock"]), (s) => lines.push(s));
    ok("!! the CLI runner crystallizes the demo claim and logs the trace", cli.crystallized === true &&
        lines.some((l) => l.includes("CRYSTALLIZED")) && lines.some((l) => l.includes("box3d-rigid-body")));
    const bh = await runDevice(parseArgs(["blackhole", "mock"]), (s) => lines.push(s));
    ok("...and drives the black hole from the same front door", bh.crystallized === true,
        "measured onset " + bh.verdict.measured.toFixed(3));
    ok("the demo table refuses to pretend LBM is quick", DEMO_HYPS.lbm === null,
        "lbm requires an explicit --hyp; a demo that takes minutes is a trap, not a demo");
}

console.log();
if (fails) { console.log("box3dBind-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("box3dBind-selfcheck: all checks pass");
