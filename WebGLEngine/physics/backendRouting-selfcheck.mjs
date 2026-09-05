// WebGLEngine/physics/backendRouting-selfcheck.mjs -- v4400
//
// *** ONE PATH BUG BEHIND THREE FINDINGS, AND EVERY ONE OF THEM HAD BEEN READABLE FOR HUNDREDS OF VERSIONS. ***
//
// physics/box3d/box3dLoader.js loads its artifact with `import("/vendor/box3d/box3d.js")` -- a BROWSER-ABSOLUTE
// URL. In Node that is a path from the filesystem root, so it cannot resolve, and the catch reported the
// failure as "Box3D WASM not built yet -- run build-box3d-wasm-clang.sh". Both halves were false:
// vendor/box3d/box3d.js and box3d.wasm are committed and present, and physics/box3d/box3dNode.mjs has been
// loading that same wasm headless for hundreds of versions, 45 swk_ functions, under every physics gate here.
//
// What that one line cost:
//
//   1. THE FACADE. physics/backend.js's selectBackend() catches a non-ready box3d and falls through to Jolt.
//      In Node that meant EVERY caller got Jolt -- including `prefer: "box3d"`, silently, while the comment
//      beside it said "auto: try the lighter engine first".
//   2. THE CROSS-BACKEND ENVELOPE. physics/backend-qa-check.mjs printed "(box3d WASM absent -> Jolt baseline
//      only)" and recorded a two-engine divergence envelope containing one engine. Its own header warned about
//      this shape -- "a control that cannot fail" -- and it had become one. It also called createWorld without
//      init(), so it would have failed even with the loader fixed.
//   3. THE CAPABILITY TABLE, which is a separate defect and was found by pulling on the same thread: CAPS said
//      box3d had no constraints and JOLT_ONLY listed them, so a caller needing constraints was routed to Jolt,
//      whose portable joint interface answers -1 to every joint call, while box3d -- which has had joints
//      since v2515 -- was excluded.
//
// v4229 fixed one branch of the loader's misreporting and called it "the third instance of the same defect".
// This is the fourth, by a road explainWasmFailure cannot see: it asks whether WebAssembly is usable, and here
// WebAssembly was fine and the PATH was not.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { selectBackend, box3dStatus } from "./backendNode.mjs";
import { box3d, Box3DLoader } from "./box3d/box3dLoader.js";
import { gateReport } from "../tools/ship/gateReport.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

// *** AND THE TABLES BELOW LEAVE THE TERMINAL, BECAUSE v4399's RATCHET SAID SO AND WAS RIGHT. ***
// tools/ship/gateReport-selfcheck.mjs went RED on this file the moment the two branches met: "no gate written
// SINCE may argue in numbers and emit nothing -- ARRIVALS: physics/backendRouting-selfcheck.mjs". That is the
// arrivals ratchet from the other branch's v4399 doing exactly what its author built it to do, one round after
// installing it, on a gate written in ignorance of it. Both tables are emitted from the SAME objects the checks
// above assert on, which is the whole discipline: a caption can be wrong about a number, a number rendered
// from the number cannot be. Nothing is written unless SWEK_GATE_REPORT=1.
const GR = gateReport("physics/backendRouting-selfcheck.mjs");

// =============================================================================================================
console.log("1. *** box3d LOADS IN NODE, WHICH IT COULD NOT DO BEFORE THIS ROUND ***");
const status = await box3dStatus();
{
    ok("box3d is reachable from Node, through the seam rather than through the browser URL",
       status && status.ready === true, JSON.stringify(status));
    // *** AND box3dLoader ITSELF MUST STAY BROWSER-PURE, WHICH IS WHY THE SEAM EXISTS. ***
    const loaderSrc = fs.readFileSync(path.join(ENG, "physics/box3d/box3dLoader.js"), "utf8");
    // Tested as an IMPORT, not as a mention. The loader's new failure message NAMES box3dNode.mjs in prose so
    // a reader knows where to go, and the first draft of this check grepped for the bare name and went red on
    // its own advice -- a file naming its subject becomes its subject, the same trap as v4387 and v4398.
    const importsNodeLoader = /import\s*\(\s*["'][^"']*box3dNode\.mjs["']\s*\)/.test(loaderSrc) ||
                              /from\s*["'][^"']*box3dNode\.mjs["']/.test(loaderSrc);
    ok("...and box3dLoader imports NO Node module, so no page inherits one through it",
       !importsNodeLoader && /adopt\(mod, via/.test(loaderSrc),
       "v4400's first fix put the fallback IN the loader; browserNodeGuard went red inside one verify with " +
       "`physics/box3d/box3dNode.mjs (reached from backend-physics-check.html)`, so the direction was inverted");
    // *** MEASURED, NOT GREPPED, AND A SABOTAGE IS WHY. *** The first draft tested this with
    // /pathFailure/.test(source) -- which still matched after the field was deleted, because the local
    // variable of that name survived. It read 0 RED on a sabotage that removed the thing it was about. A
    // FRESH loader takes the browser path here and fails, so the reason can be read instead of guessed at.
    const fresh = await new Box3DLoader().init();
    ok("...and the loader reports a PATH failure as itself, not as a missing build",
       fresh.ready === false && fresh.pathFailure === true &&
       /Nothing needs rebuilding/.test(fresh.reason) && !/not built yet/.test(fresh.reason),
       `a fresh loader in Node says: ${String(fresh.reason).slice(0, 120)}`);
    // *** THIS CHECK PASSED VACUOUSLY UNDER ITS OWN SABOTAGE and the sabotage is what showed it. *** With the
    // fallback disabled, status.via is undefined -- which the first draft accepted as "via the browser path",
    // reporting a route that had in fact just failed. `via` is only meaningful when something loaded.
    ok("...and it says HOW, so a reader can tell which path served it",
       status.ready === true && (status.via === "box3dNode" || status.via === undefined),
       status.ready ? (status.via ? `via ${status.via} -- the module-relative Node loader` : "via the browser path")
                    : "nothing loaded, so there is no route to name");
    ok("...and that route is the Node one, which is the only route that can work here",
       status.ready && status.via === "box3dNode", `via ${status.via}`);
    // The artifacts the old message claimed were unbuilt.
    for (const f of ["vendor/box3d/box3d.js", "vendor/box3d/box3d.wasm"]) {
        ok(`...and ${f} was present the whole time, committed`,
           fs.existsSync(path.join(ENG, f)),
           `${(fs.statSync(path.join(ENG, f)).size / 1024).toFixed(0)} KB on disk`);
    }
    // The resting height is DERIVED from the geometry rather than banded by eye. The first draft guessed
    // 0.9..1.2 and read 0.4999, which is exactly right: the plate sits at -0.5 with a 0.5 half-height, so its
    // top is at 0, and a box with a 0.5 half-extent rests with its centre at 0.5. The arithmetic was mine.
    const PLATE_Y = -0.5, PLATE_HALF = 0.5, BOX_HALF = 0.5;
    const expected = PLATE_Y + PLATE_HALF + BOX_HALF;
    // Guarded, because a gate that THROWS reports one stack trace instead of five named failures -- which is
    // exactly what the first draft did under sabotage A, dying here and never reaching sections 2 to 5.
    let y = NaN;
    if (status.ready) {
        const w = box3d.createWorld({ gravity: [0, -9.8, 0] });
        w.addBox({ type: "static", pos: [0, PLATE_Y, 0], half: [20, PLATE_HALF, 20], density: 1000 });
        const b = w.addBox({ type: "dynamic", pos: [0, 5, 0], half: [BOX_HALF, BOX_HALF, BOX_HALF], density: 1000 });
        for (let i = 0; i < 240; i++) w.step(1 / 60, 4);
        y = w.readTransforms()[b * 7 + 1];
        w.destroy && w.destroy();
    }
    ok("*** and the world it hands back actually simulates: a box falls and LANDS where the geometry says ***",
       Math.abs(y - expected) < 0.01,
       `dropped from y=5, resting at y=${y.toFixed(4)} against a derived ${expected.toFixed(4)}` +
       ` (plate top ${(PLATE_Y + PLATE_HALF).toFixed(1)} plus the box's ${BOX_HALF} half-extent)`);
    report("The old failure message sent a reader off to install clang and wasi-libc for an artifact that was " +
           "already committed. A catch that turns every failure into one diagnosis is worse than no diagnosis, " +
           "because it is confidently wrong in a direction that costs somebody an afternoon.");
}

// =============================================================================================================
console.log("\n2. THE ROUTER NOW ROUTES WHERE ITS OWN COMMENTS SAY IT DOES");
{
    const rows = [];
    for (const o of [{}, { prefer: "box3d" }, { prefer: "jolt" }, { need: ["constraints"] }, { need: ["ragdolls"] }]) {
        const be = await selectBackend(o);
        const w = be.createWorld({ gravity: [0, -9.8, 0] });
        rows.push({ opts: o, name: be.name, caps: be.caps, joints: w.supportsJoints() });
        w.destroy && w.destroy();
    }
    for (const r of rows) {
        console.log(`        ${JSON.stringify(r.opts).padEnd(26)} -> ${r.name.padEnd(6)}` +
                    `  caps.constraints ${String(r.caps.constraints).padEnd(5)}  supportsJoints() ${r.joints}`);
    }
    // The first column is TEXT on purpose: these are five REQUESTS, not five points on an axis, and the plot
    // in instruments.html names a non-numeric table rather than drawing a line through categories.
    GR.table("which backend each request reaches, and what that engine's own world says",
             ["request", "backend", "caps.constraints", "world.supportsJoints()"],
             rows.map((r) => [JSON.stringify(r.opts), r.name, String(r.caps.constraints), String(r.joints)]),
             "before this round every one of these five said jolt in Node, because box3dLoader's " +
             "browser-absolute import could not resolve and selectBackend fell through");

    const auto = rows.find((r) => Object.keys(r.opts).length === 0);
    ok("*** auto prefers the LIGHTER engine, which is what the comment beside the order has always said ***",
       auto.name === "box3d", "before this round auto returned jolt in Node, silently, because box3d never loaded");
    ok("...and an explicit prefer is honoured in both directions",
       rows.find((r) => r.opts.prefer === "box3d").name === "box3d" &&
       rows.find((r) => r.opts.prefer === "jolt").name === "jolt",
       "prefer box3d -> box3d, prefer jolt -> jolt");
    ok("*** need:['constraints'] now reaches the backend that HAS them ***",
       rows.find((r) => r.opts.need && r.opts.need[0] === "constraints").name === "box3d",
       "it returned jolt before, whose portable joint interface answers -1 to every joint call");
    ok("...and need:['ragdolls'] still reaches Jolt, because the FACADE's only ragdoll factory is Jolt's",
       rows.find((r) => r.opts.need && r.opts.need[0] === "ragdolls").name === "jolt",
       "which is a statement about this file, not about what box3d can do -- see the note over CAPS");
}

// =============================================================================================================
console.log("\n3. *** THE CAPABILITY TABLE IS NOW CHECKABLE, AND CHECKED AGAINST BOTH ENGINES ***");
{
    const disagree = [];
    for (const prefer of ["box3d", "jolt"]) {
        const be = await selectBackend({ prefer });
        const w = be.createWorld({ gravity: [0, -9.8, 0] });
        if (be.caps.constraints !== w.supportsJoints()) {
            disagree.push(`${be.name}: caps says ${be.caps.constraints}, world says ${w.supportsJoints()}`);
        }
        w.destroy && w.destroy();
    }
    ok("for EVERY backend, caps.constraints equals what that backend's own world reports",
       disagree.length === 0, disagree.length ? disagree.join("; ") : "box3d true/true, jolt false/false");
    const src = fs.readFileSync(path.join(ENG, "physics/backend.js"), "utf8");
    ok("...and `constraints` is no longer in JOLT_ONLY, because box3d serves it",
       /const JOLT_ONLY = \["ragdolls", "vehicles", "destructible"\]/.test(src),
       "ragdolls, vehicles and destructible remain, and the note says they are facade limits not engine limits");
    report("The field had to be GIVEN A MEANING before it could be checked. `constraints` now means 'the " +
           "portable joint interface works', which is the thing a caller reading the table goes on to call -- " +
           "so box3d's row went true and JOLT'S WENT FALSE. Jolt's constraints are still reachable through " +
           "createRagdoll and raw(); that is what ragdolls:true is for. A table nobody can check against the " +
           "thing it describes is a comment with punctuation.");
}

// =============================================================================================================
console.log("\n4. *** THE CROSS-BACKEND ENVELOPE, RECORDED AT LAST -- AND box3d IS DETERMINISTIC ***");
{
    const bl = JSON.parse(fs.readFileSync(path.join(ENG, "tools/render-qa/backend-baseline.json"), "utf8"));
    const pairs = Object.keys(bl.pairs || {});
    ok("the baseline holds a PAIR, which it never has before",
       pairs.length === 1 && pairs[0] === "Jolt|box3d", `pairs: ${pairs.join(", ") || "(none)"}`);
    ok("*** and box3d is on record as internally deterministic, which is what lockstep needs ***",
       bl.determinism && bl.determinism.box3d && bl.determinism.box3d.trajectory === true &&
       bl.determinism.box3d.renderDiff === 0,
       `box3d: ${JSON.stringify(bl.determinism.box3d)} -- the same scene twice, identical trajectory`);
    const p = bl.pairs["Jolt|box3d"];
    console.log(`        drift     ${p.measured.maxDrift}u        envelope ${p.driftEnvelope.map((v) => v.toFixed(2)).join(" .. ")}`);
    console.log(`        visual    ${(p.measured.visual * 100).toFixed(1)}%        envelope ` +
                p.visualEnvelope.map((v) => (v * 100).toFixed(1) + "%").join(" .. "));
    console.log(`        IoU       ${p.perceptual.measured.iou}      SSIM ${p.perceptual.measured.ssim}` +
                `   edge ${p.perceptual.measured.edgeOverlap}   pHash ${p.perceptual.measured.phashBits} bits`);
    // TWO tables, because the metrics do not all have the same SHAPE of bound: six are bracketed both ways and
    // pHash carries a ceiling only. One table with an empty cell where a lower bound is not recorded would be
    // a blank pretending to be a measurement.
    GR.table("Jolt against box3d after 180 ticks on one identical scene: the two-sided bands",
             ["metric", "measured", "envelope lo", "envelope hi"],
             [["drift (units)", p.measured.maxDrift, p.driftEnvelope[0], p.driftEnvelope[1]],
              ["visual (fraction of pixels)", p.measured.visual, p.visualEnvelope[0], p.visualEnvelope[1]],
              ["silhouette IoU", p.perceptual.measured.iou,
               p.perceptual.iouEnvelope[0], p.perceptual.iouEnvelope[1]],
              ["silhouette scale delta", p.perceptual.measured.scaleDelta,
               p.perceptual.scaleEnvelope[0], p.perceptual.scaleEnvelope[1]],
              ["SSIM", p.perceptual.measured.ssim,
               p.perceptual.ssimEnvelope[0], p.perceptual.ssimEnvelope[1]],
              ["edge overlap", p.perceptual.measured.edgeOverlap,
               p.perceptual.edgeEnvelope[0], p.perceptual.edgeEnvelope[1]]],
             "the first cross-backend numbers this tree has ever held. Read the columns, not a curve: these " +
             "are six different metrics, so the row order is not an axis. Bounded BOTH ways on purpose -- " +
             "v3337's rule is that two different solvers agreeing perfectly is a finding, not a success");
    GR.table("...and the one metric bounded on one side only",
             ["metric", "measured", "ceiling"],
             [["pHash (bits differing)", p.perceptual.measured.phashBits, p.perceptual.phashCeiling]],
             "a perceptual hash distance has no meaningful floor between two DIFFERENT solvers, so only the " +
             "ceiling is recorded");

    ok("the two solvers DIVERGE, which is the expected answer and the reason mixed-backend lockstep is refused",
       p.measured.maxDrift > 0.5 && p.perceptual.measured.iou < 0.95,
       `${p.measured.maxDrift}u apart after 180 ticks on an identical scene`);
    ok("...and every envelope is bounded BOTH ways, so two solvers becoming identical would also fail",
       p.driftEnvelope[0] > 0 && p.perceptual.iouEnvelope[1] <= 1 && p.perceptual.iouEnvelope[0] > 0,
       "v3337's rule: two different solvers agreeing perfectly is a finding, not a success");
    report("The bands are multiplicative and generous by construction -- drift 0.6x-1 to 1.5x+2, IoU 0.75x to " +
           "1.15x -- which is the author building in the portability this recording needs. It was taken in " +
           "THIS container against the vendored clang wasm and the vendored Jolt, and whether the envelope " +
           "holds on other hardware is the one thing about it nobody can check from here.");
}

// =============================================================================================================
console.log("\n5. WHAT THE HARNESS SAYS WHEN IT CANNOT LOAD A BACKEND, WHICH IS NOW A REASON AND NOT A GUESS");
{
    const qa = fs.readFileSync(path.join(ENG, "physics/backend-qa-check.mjs"), "utf8");
    ok("the harness ASKS something that can answer before it uses the answer, which it never did",
       /adoptBox3dInNode\(\)/.test(qa),
       "it called createWorld first, so box3dLoader threw `call init() first` -- a USAGE error read as a " +
       "missing artifact; it now goes through the Node door");
    ok("*** and it no longer prints a capability claim in place of the loader's own words ***",
       !/box3d WASM absent/.test(qa) && /The loader said: /.test(qa),
       "the message now carries st.reason or the thrown message, whichever actually happened");
    const doors = fs.readFileSync(path.join(ENG, "tools/ship/doorKinds.mjs"), "utf8");
    ok("...and doorKinds still records this file as owing a rig, which is now the stale record",
       /physics\/backend-qa-check\.mjs/.test(doors) && /needs a rig where box3d's WASM builds/.test(doors),
       "REPORTED, NOT EDITED: that register is another round's subject and changing it here would be the " +
       "same conflation this round exists to undo");
    report("Three records disagreed about one fact -- CAPS said box3d had no constraints, the loader said the " +
           "wasm was unbuilt, doorKinds said the file needed a rig -- and all three were downstream of a " +
           "path that does not resolve in Node. Two are fixed here on evidence. The third is named and left, " +
           "because a register that describes work owed is not something to quietly rewrite while fixing the " +
           "work.");
}

// ---- v4400 SABOTAGES, grep-CONFIRMED APPLIED BEFORE READING, RESTORED md5-IDENTICAL -------------------------
//
// The SUBJECT files, before and after all five -- md5-identical:
//    physics/box3d/box3dLoader.js         404a2be9df36a0eba7fddaf56044cfe0
//    physics/backend.js                   145143c28a89a78e92f789dffee0b73c
//    physics/backend-qa-check.mjs         2ef193c47b1d9ff7e6eee34490ccffac
//    physics/backendNode.mjs              2d78fc7c430a225bd1cb1949fc221e5b
//    tools/render-qa/backend-baseline.json c0c3952b8f1a31e98c77054887d38b6b
//
//   A  backendNode stops adopting, so box3d is unreachable again. -> 7 RED, cascading through every section
//      that needs it, which is the right shape: one seam is behind all of them.
//      *** AND THIS SABOTAGE FOUND TWO DEFECTS IN THE GATE ITSELF, in its first form. *** It THREW instead of
//      reporting, dying in section 1 at createWorld and never reaching sections 2 to 5, so a reader got one
//      stack trace where seven named failures belonged. And the "it says HOW" check PASSED VACUOUSLY: with
//      nothing loaded, status.via is undefined, which the draft read as "via the browser path" -- naming a
//      route that had just failed. Neither would have been found by reading.
//
//   B  "constraints" goes back into JOLT_ONLY. -> 2 RED: the need routes to Jolt again, and the JOLT_ONLY
//      assertion names the list it should not be in.
//
//   C  jolt's caps.constraints goes back to true. -> 1 RED, naming both sides: "jolt: caps says true, world
//      says false". Giving the field a meaning is what made the two comparable at all.
//
//   D  the loader's pathFailure flag is deleted. -> 1 RED, and *** THIS ONE READ 0 RED IN ITS FIRST FORM. ***
//      The check was /pathFailure/.test(source), which still matched after the field was gone because the
//      local variable of that name survived -- a grep passing over the removal of the thing it was about. It
//      now inits a FRESH Box3DLoader, takes the browser path, and reads the reason it actually gets.
//
//   E  the harness stops going through the Node door. -> 1 RED. The original bug, and the reason the envelope
//      held one backend for as long as the file existed.
//
//
// ---- AND TWO MORE AT THE MERGE, BECAUSE THE OTHER BRANCH'S v4399 RATCHET FIRED ON THIS GATE ---------------
//
// tools/ship/gateReport-selfcheck.mjs arrived from main with an arrivals ratchet on the named set of gates
// that print tables and emit nothing, and it went RED on THIS FILE by path the moment the branches met. That
// is somebody else's check catching a gate written in ignorance of it, one round after they installed it. So
// this gate emits, and wiring it found a defect in THEIR page:
//
//   F  the report table's title attribute goes back to raw interpolation, as it was before this round
//      -> 1 RED: "EVERY value in every report reaches the DOM to the digit -- 153 values, 4 MISSING".
//      Exactly the four routing requests containing a double quote -- {"prefer":"box3d"} and three more --
//      and not the fifth, which is a bare {}. A quote CLOSED the attribute. The check was right and
//      instruments.html was wrong, the same way round as when the page rounded a 17-digit float away.
//      instruments.html restored 6755dc5b60f9a4d722d5692dc09bc1e1.
//   G  gate-reports/backendRouting-selfcheck.json removed from disk, as if this gate still argued in numbers
//      and emitted nothing -> 6 RED, the arrivals ratchet FIRST and by path: "ARRIVALS:
//      physics/backendRouting-selfcheck.mjs". The other five are the page checks reading a stale index, which
//      is the same finding from five angles rather than five findings.
//
// THE DETECTOR IS BEHAVIOURAL, WHICH IS WHY G IS THE HONEST SABOTAGE: emits is read from the reports ON DISK,
// not from a call to gateReport() in the source, so deleting the GR calls while leaving the artefact would
// have proved nothing. That is the same choice v3609 forced on artefactWriters.
//
// *** THE TABLES LEAVE THE TERMINAL, AND WHAT WAS NOT MEASURED LEAVES WITH THEM. ***
GR.skip("the same envelope on any other machine",
        "recorded in this container against the vendored clang wasm and the vendored Jolt. The bands are " +
        "multiplicative and generous by construction, but no second box has been near them");
GR.skip("the BROWSER path of box3dLoader",
        "the absolute-URL import is still the only path the loader itself takes, and nothing here runs a page");
GR.note("Every number in both tables is read from the object the checks above assert on -- the routing rows " +
        "from the worlds actually created, the envelope from tools/render-qa/backend-baseline.json.");
{
    const w = GR.write();
    console.log("\n  ----  gate report: " + (w.written ? "written to " + w.file : w.why) +
                ` -- ${w.doc.tables.length} tables, ` +
                `${w.doc.tables.reduce((n, t) => n + t.rows.length * t.columns.length, 0)} cells`);
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: WHETHER THE ENVELOPE HOLDS ANYWHERE ELSE. It was recorded in this container and " +
    "the bands are wide by design, but no second machine has been near it, so 'the two solvers stay this far " +
    "apart' is one sample dressed as a floor. Also unchecked: the BROWSER path. box3dLoader's absolute-URL " +
    "import is still the only path the loader itself takes and is still untested from here -- what this round " +
    "added beside it is an adopt() seam that only a Node caller reaches, so a page's behaviour is unchanged " +
    "and if that URL is also wrong in a browser this gate would not know. And the " +
    "facade's ragdoll asymmetry is reported, not repaired: physics/ragdollFromSkeleton.mjs derives a ragdoll " +
    "box3d can step, and selectBackend still has no box3d factory to hand a caller who asks for one.");
process.exit(fails ? 1 : 0);
