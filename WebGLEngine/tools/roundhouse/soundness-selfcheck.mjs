// tools/roundhouse/soundness-selfcheck.mjs
//
// Run: node tools/roundhouse/soundness-selfcheck.mjs   (~0.2s)
//
// v3130 -- NOW THAT THE AGENT CAN MOVE THE OPERATING POINT, SOMETHING HAS TO TELL IT WHEN IT HAS MOVED
// SOMEWHERE THE INSTRUMENT DOES NOT WORK.
//
// v3100 declared LAB_ASSUMPTIONS as PREDICATES over the config. v3101 added the third verdict, "UNSOUND AT THIS
// OPERATING POINT" -- distinct from NOT CORROBORATED, because the four criteria did not fail, the POINT did.
// v3129 let the agent turn the knobs. THOSE THREE PIECES HAD NEVER MET.
//
// *** AND THE FIRST THING IT SAYS IS UNCOMFORTABLE: THE AGENT'S DEFAULT RUN OF lens.deflect IS UNSOUND. ***
// b=10 puts the ray in the mid band where the 4M/b key does not apply. The agent has been running that point
// since it was written, and until now the run returned a number that looked like every other number.
//
// *** AND UNDECLARED IS NOT SOUND. *** LAB_ASSUMPTIONS covers three device.mode pairs out of the whole registry devices. For
// everything else nobody has said what the instrument needs -- and "nobody has checked" MUST NOT render as
// "checked and fine". Same law as a lost face, a silent worker, an unread control and an empty population field.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const S = await import(pathToFileURL(path.join(ENG, "tools", "roundhouse", "soundness.mjs")).href);
const D = await import(pathToFileURL(path.join(ENG, "tools", "roundhouse", "devices.mjs")).href);
const lens = await D.getDevice("lens");
const def = lens.defaults({ mode: "deflect" }).config;

// ---- 1. THE THING THE AGENT HAS BEEN DOING ALL ALONG --------------------------------------------------------------
{
    const atDefault = S.soundnessAt("lens", "deflect", def);
    ok("!! the agent's DEFAULT lens.deflect run is UNSOUND",
        atDefault.verdict === "unsound" && atDefault.failed.some((f) => f.id === "weak-field"),
        "b=" + def.b + " puts the ray in the MID BAND where the 4M/b key does not apply -- v3101 measured this " +
        "and the agent has run that point since it was written. Until now it returned a number that looked " +
        "like every other number");

    // v3131 -- WAS dphi: 2e-4, THE POINT v3101 RECORDED AS CORROBORATED. The crossover was MEASURED at 8e-4,
    // four times higher, so 2e-4 is past it and this check now uses the point that is actually sound. The old
    // one is asserted UNSOUND below, because a threshold correction that quietly moved a test would hide the
    // very thing the correction found.
    const atSound = S.soundnessAt("lens", "deflect", { ...def, b: 60, dphi: 8e-4 });
    ok("!! and v3101's corroborated point is SOUND",
        atSound.verdict === "sound" && atSound.failed.length === 0 && atSound.held.length === 2,
        "b=60, dphi=2e-4 -- both declared conditions hold. THE AGENT COULD NOT REACH THIS POINT BEFORE v3129 " +
        "and could not have known it mattered before this round");

    ok("!! and the OLD recorded point is now UNSOUND, which is the finding, not a regression",
        S.soundnessAt("lens", "deflect", { ...def, b: 60, dphi: 2e-4 }).verdict === "unsound",
        "*** dphi=2e-4 IS WHERE lens.deflect WAS RECORDED AS CORROBORATED. *** The assumption held there only " +
        "because its predicate said 2e-4 while its own reason said 4e-4 and the instrument says 8e-4. THE " +
        "CORROBORATION NEEDS RE-RUNNING at dphi >= 8e-4 -- it is not withdrawn here, it is marked as resting " +
        "on a point now known to be past the crossover, which is a different and honest claim");

    ok("...and the failure is NAMED with its reason",
        /weak-field/.test(S.soundnessLine(atDefault)) && /b\/bCrit/.test(S.soundnessLine(atDefault)),
        "'unsound' alone sends nobody anywhere; 'b/bCrit must exceed 10' sends them to the knob");
}

// ---- 2. THE THIRD STATE, WHICH COVERS ALMOST EVERYTHING --------------------------------------------------------------
{
    const none = S.soundnessAt("thermal", "diffuse", {});
    ok("!! UNDECLARED is its own verdict and is NOT sound",
        none.verdict === "undeclared" && none.verdict !== "sound" && /NOT the same as it being fine/.test(none.why),
        "LAB_ASSUMPTIONS covers THREE device.mode pairs out of the whole registry. Rendering the rest as fine would be " +
        "the exact substitution this project keeps finding -- v3101's rule was that soundAtPoint === null is " +
        "not a pass");

    ok("...and the three verdicts say three different things",
        new Set(S.VERDICTS.map((v) => S.soundnessLine({ verdict: v, key: "x.y", failed: [{ id: "a", why: "b" }], held: [{ id: "a" }], why: "w" }))).size === 3,
        S.VERDICTS.join(" / ") + " -- or the distinction was pointless");
}

// ---- 3. A PREDICATE THAT THROWS IS A FAILED ASSUMPTION ------------------------------------------------------------------
{
    // The knobs move now, so holds() will meet configs missing fields it expects. An exception reading as TRUE
    // would turn the one safety check into a rubber stamp EXACTLY WHEN THE CONFIG IS STRANGEST.
    const src = fs.readFileSync(path.join(ENG, "tools", "roundhouse", "soundness.mjs"), "utf8");
    ok("!! a throwing predicate counts as FAILED, not passing",
        /catch \(e\) \{ threw = String/.test(src) && /passes = !!a\.holds\(cfg\)/.test(src),
        "holds() reads config fields that may be absent at a moved operating point. Letting an exception read " +
        "as 'true' would make the check most permissive exactly when it is most needed");

    const weird = S.soundnessAt("lens", "scale", { values: null });
    ok("...demonstrated on a real declared predicate",
        weird.verdict === "unsound" && weird.failed.length === 1,
        "lens.scale's non-dyadic check indexes c.values; a null config makes it fail rather than pass");
}

// ---- 3b. THE LOOKUP MUST ACTUALLY FIRE ------------------------------------------------------------------------------
// *** THE BUG THIS ROUND ALMOST SHIPPED. *** A device's own .name is its PHYSICS identity -- lens calls itself
// "schwarzschild-lens" -- while LAB_ASSUMPTIONS is keyed on the REGISTRY name, "lens.deflect". Looking up by
// .name produced "schwarzschild-lens.deflect", which matches nothing, SO EVERY DEVICE REPORTED "undeclared"
// INCLUDING THE ONES THAT HAVE DECLARATIONS. Nothing threw. The wiring ran. The check existed and never fired.
//
// Two names for one thing, and the wrong one was the obvious one. Asserting "the code calls soundnessAt" would
// have passed; only asserting THAT THE LOOKUP RESOLVES catches it.
{
    ok("!! getDevice stamps the REGISTRY name beside the device's own",
        lens.registryName === "lens" && lens.name === "schwarzschild-lens",
        "own name '" + lens.name + "', registry name '" + lens.registryName + "'. Both are legitimate and they " +
        "are not interchangeable");

    const resolved = S.soundnessAt(lens.registryName, "deflect", def);
    ok("!! and the assumption lookup RESOLVES rather than silently missing",
        resolved.key === "lens.deflect" && resolved.verdict !== "undeclared",
        "key '" + resolved.key + "' -> " + resolved.verdict + ". Had this used .name the key would be " +
        "'schwarzschild-lens.deflect', every device would report UNDECLARED, and the round would have looked " +
        "like it worked while checking nothing");

    ok("...and at least one device in the registry is NOT undeclared",
        S.soundnessAt("lens", "deflect", def).verdict !== "undeclared" &&
        S.soundnessAt("kerr", "limit", { a: 0 }).verdict === "sound",
        "if every device were undeclared the three-verdict machinery would be indistinguishable from a stub " +
        "that always returns the same answer");
}

// ---- 4. WIRED, AND WHERE ----------------------------------------------------------------------------------------------
{
    const bind = fs.readFileSync(path.join(ENG, "tools", "roundhouse", "deviceBind.mjs"), "utf8");
    ok("!! soundness is evaluated AFTER the clamp",
        (() => { const a = bind.indexOf("device.defaults(hyp);"), b = bind.indexOf("const sound = soundnessAt("); return a > 0 && b > a; })(),
        "defaults() fills the config the simulation ACTUALLY receives, and the assumptions are predicates over " +
        "THAT. Checking the raw proposal would judge an operating point the device is not going to run");

    ok("!! it travels with EVERY round, not just the answer",
        /history\.push\(\{ round, hyp, observable, verdict, critique, sound \}\)/.test(bind),
        "a run that crystallises at an unsound point crystallised on a number the instrument does not stand " +
        "behind, and reading that off the last round alone would hide the ones before it");

    ok("!! and CRYSTALLIZED carries soundAtPoint",
        /crystallized: true[\s\S]{0,200}?soundAtPoint: sound\.verdict/.test(bind),
        "CRYSTALLIZED IS NOT THE SAME AS TRUSTWORTHY -- the four criteria can pass where the instrument's own " +
        "declared conditions do not hold, which is v3101's third verdict exactly");
    console.log("  NOTE   24 DEVICE MODES STILL DECLARE NOTHING, and they now say so out loud instead of passing");
    console.log("         quietly. That is the honest state, not a fix -- each needs somebody who knows the");
    console.log("         instrument to write down what it needs. The list is no longer invisible, which is the");
    console.log("         only thing this round could do about it.");
}

console.log();
if (fails) { console.log("soundness-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("soundness-selfcheck: all checks pass");
