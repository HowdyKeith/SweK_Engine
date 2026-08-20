// tools/roundhouse/knobGate-selfcheck.mjs
//
// Run: node tools/roundhouse/knobGate-selfcheck.mjs   (~5s)
//
// v3129 -- THE AGENT COULD ALWAYS TURN THE KNOBS. NOTHING EVER TOLD IT THEY EXISTED.
//
// deviceBind has always done `hyp = device.defaults(hyp)` then `device.build(hyp, base)`, so a hypothesis
// carrying config REACHES THE SIMULATION. THE PIPE WAS THERE THE WHOLE TIME. But every DEMO_HYP is
// { mode, claim } with no config, and the proposer's prompt is built from `observables` -- the list of things
// it may CLAIM ABOUT, never the list of things it may CHANGE. The roundhouse physics agent has run every
// instrument at factory defaults since it was written, not because it was blocked but because NOBODY MENTIONED
// THE DIAL.
//
// I GOT THIS WRONG FIRST. I grepped ai-bridge/deviceBridge.js for "config", found none, and concluded the agent
// COULD NOT set a knob. The clamp and the build live in deviceBind.mjs, one file over. "Cannot" and "was never
// told" are different diagnoses with different fixes, and only one of them was true. EIGHTH TIME THIS SESSION
// MY OWN FIRST MEASUREMENT NEEDED THE AUDIT.
//
// *** AND IT COLLIDES WITH THE WHOLE CORROBORATION ARC. *** v3081-v3105 built knob registers and attached
// assumptions to OPERATING POINTS, and v3101 measured that lens.deflect's DEFAULT is precisely where its answer
// key does NOT apply -- b=10 is the mid band; the 4M/b key needs b=60. THE AGENT COULD ONLY EVER RUN THE ONE
// PLACE THE INSTRUMENT IS UNSOUND.

import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const K = await import(pathToFileURL(path.join(ENG, "tools", "roundhouse", "knobGate.mjs")).href);
const D = await import(pathToFileURL(path.join(ENG, "tools", "roundhouse", "devices.mjs")).href);
const lens = await D.getDevice("lens");

// ---- 1. THE REGISTER IS DERIVED, NEVER TYPED --------------------------------------------------------------------
{
    const reg = K.declaredKnobs(lens, "deflect");
    ok("!! the knob register comes from the DEVICE, not from a list here",
        reg.knobs.length === 13 && reg.knobs.includes("b") && reg.knobs.includes("dphi") &&
        !fs.readFileSync(path.join(ENG, "tools", "roundhouse", "knobGate.mjs"), "utf8").includes('"rObs"'),
        reg.knobs.length + " knobs read out of device.defaults({}). A TYPED LIST IS A SECOND DEFINITION that " +
        "drifts the first time somebody adds a knob, and this tree has paid for that shape enough times");

    ok("...and a device with no defaults() declares nothing rather than throwing",
        K.declaredKnobs({ name: "bare" }, null) === null && K.checkKnobs({ name: "bare" }, { config: { x: 1 } }).ok === true,
        "not every device has to have knobs, and refusing one that never claimed to would block a working run");
}

// ---- 2. AN UNDECLARED KNOB IS AN ERROR, NOT A NO-OP -----------------------------------------------------------------
{
    const bogus = K.checkKnobs(lens, { mode: "deflect", config: { b: 60, wibble: 999 } });
    ok("!! an undeclared knob is REFUSED and NAMED",
        bogus.ok === false && bogus.unknown.includes("wibble") && /does not declare: wibble/.test(bogus.why) &&
        /It declares:/.test(bogus.why),
        "MEASURED before this existed: defaults() KEPT wibble, the sim never read it, and nothing raised. A " +
        "model that invents a knob got a clean run and a number AND ATTRIBUTED THAT NUMBER TO A CHANGE THAT " +
        "NEVER HAPPENED. Dropping it silently would be no better -- the fault is the agent never learning its " +
        "instruction did nothing. The message also lists what the device DOES declare, so the next attempt can " +
        "be right rather than merely different");

    ok("...and a real knob passes",
        K.checkKnobs(lens, { mode: "deflect", config: { b: 60, dphi: 2e-4 } }).ok === true);
}

// ---- 3. MOVED IS NOT THE SAME AS SET -------------------------------------------------------------------------------
{
    const moved = K.checkKnobs(lens, { mode: "deflect", config: { b: 60 } });
    const noop = K.checkKnobs(lens, { mode: "deflect", config: { b: 10 } });
    ok("!! a knob set to its OWN DEFAULT has not moved",
        moved.moved.length === 1 && moved.moved[0].from === 10 && moved.moved[0].to === 60 && noop.moved.length === 0,
        "counting it as movement would make every hypothesis look like an experiment, and 'did the agent change " +
        "the operating point' would stop being answerable");

    ok("!! and this is exactly v3101's walk off the unsound default",
        moved.moved[0].from === 10 && moved.moved[0].to === 60,
        "b=10 is the mid band where the 4M/b key does NOT apply; b=60 is where lens.deflect is CORROBORATED. " +
        "The agent has been pinned at the first for its whole existence");
}

// ---- 4. THE PROMPT, AND THE WIRING ----------------------------------------------------------------------------------
{
    const line = K.knobPromptLine(lens, "deflect");
    ok("!! the proposer is told the knobs exist, WITH their defaults",
        // The "does not declare" clause I first put here asserted the prompt must NOT contain that phrase --
        // while the prompt deliberately WARNS with it. A negative that contradicts the thing it guards is worse
        // than no check: it fails on correct code and teaches nobody anything.
        /b=10/.test(line) && /M=1/.test(line) && /IS AN ERROR, NOT A NO-OP/.test(line),
        "'you may set b' is useless; 'b=10 by default' says what to change AND what it is changing FROM, which " +
        "is the difference between an experiment and a guess");

    const bind = fs.readFileSync(path.join(ENG, "tools", "roundhouse", "deviceBind.mjs"), "utf8");
    ok("!! deviceBind refuses BEFORE it clamps and builds",
        /const knobCheck = checkKnobs\(device, hyp\);[\s\S]{0,220}?if \(device\.defaults\) hyp = device\.defaults\(hyp\)/.test(bind),
        "checking after defaults() would check the CLAMPED hypothesis, by which point an unknown knob has " +
        "already been folded in and the evidence is gone");

    const bridge = fs.readFileSync(path.join(ENG, "ai-bridge", "deviceBridge.js"), "utf8");
    ok("!! and the device list publishes knobs alongside observables",
        /observables: d\.observables \|\| \[\], knobs: knobs \|\| \[\]/.test(bridge),
        "the list told a caller what each device MEASURES and never what it can CHANGE -- which is why the " +
        "agent proposed claims about a fixed operating point forever");
    console.log("  NOTE   NOT DONE HERE: surfacing LAB_ASSUMPTIONS at the CHOSEN operating point. v3100 declared");
    console.log("         them and v3101 added the 'UNSOUND AT THIS OPERATING POINT' verdict -- now that the agent");
    console.log("         can actually MOVE the point, those two need to meet. That is the next round and it is");
    console.log("         the one that makes moving the dial safe rather than merely possible.");
}

// ---- 5. v3144: AN UNDECLARED MODE RAN DIFFERENT PHYSICS UNDER THE REQUESTED NAME ---------------------------------
// MEASURED: 26 OF 26 DEVICES silently default an unknown mode. thermal.build({mode:"xyzzy"}) returns
// BIT-IDENTICAL results to "diffuse", and so does every other device in the registry -- zero throw, zero warn,
// and nothing in the output names the mode that actually ran.
//
// *** WORSE THAN THE UNDECLARED KNOB v3129 FIXED, because A MODE SELECTS WHICH PHYSICS RUNS. *** A wrong knob
// perturbs an experiment; a wrong mode runs a DIFFERENT experiment under the requested name. An agent asking
// thermal for a Rayleigh-Benard run got pure diffusion and had no way to know.
{
    const thermal = await D.getDevice("thermal");

    ok("!! an unknown mode used to be BIT-IDENTICAL to the default, and still is at the device",
        JSON.stringify(await thermal.build({ mode: "xyzzyNotAMode" })) === JSON.stringify(await thermal.build({ mode: "diffuse" })),
        "asserted as PASSING because it is the DEVICE's behaviour and this round does not change it -- the " +
        "refusal lives at the agent's door in deviceBind. Stating it green stops the guard being read as " +
        "redundant by somebody who tests the device directly and sees no error");

    // v3145 -- THIS NAMED "rayleigh" AS THE UNDECLARED EXAMPLE AND WENT RED WHEN v3145 DECLARED IT. A gate
    // pinned to a mode that was undeclared ON THE DAY IT WAS WRITTEN cannot survive the mode being added --
    // seventeenth mechanism-pin, mine, one round after the guard shipped. The example is now a string no device
    // will ever declare, which is a PROPERTY (nothing declares nonsense) rather than a fact about today's list.
    ok("!! checkMode REFUSES an undeclared mode and NAMES what actually ran",
        K.checkMode(thermal, "xyzzyNotAMode").ok === false &&
        K.checkMode(thermal, "xyzzyNotAMode").declared === "diffuse" &&
        /A MODE SELECTS WHICH PHYSICS RUNS/.test(K.checkMode(thermal, "xyzzyNotAMode").why),
        "'does not declare xyzzyNotAMode -- it silently ran diffuse instead'. Naming the substitute is the whole " +
        "value: 'unknown mode' sends somebody to the spelling, 'it ran diffuse' sends them to the result they " +
        "have already written down");

    ok("...and accepts every mode the device does declare",
        K.checkMode(thermal, "diffuse").ok && K.checkMode(thermal, "convect").ok && K.checkMode(thermal, "rayleigh").ok &&
        K.checkMode(await D.getDevice("lens"), "deflect").ok,
        "DERIVED from defaults(), which CLAMPS a sloppy proposal -- a mode handed back unchanged is declared, " +
        "one that is replaced is not. The device is the authority on its own vocabulary and no list here can " +
        "drift from it");

    ok("...and an ABSENT mode is not an undeclared one",
        K.checkMode(thermal, undefined).ok === true && K.checkMode(thermal, null).ok === true,
        "not asking is the caller leaving the choice to the device, which is legitimate. Refusing it would " +
        "break every hypothesis that only states a claim");

    const bind = fs.readFileSync(path.join(ENG, "tools", "roundhouse", "deviceBind.mjs"), "utf8");
    ok("!! and the mode is checked BEFORE the knobs",
        (() => { const a = bind.indexOf("checkMode(device"), b = bind.indexOf("checkKnobs(device"); return a > 0 && b > a; })(),
        "an undeclared mode means DIFFERENT PHYSICS RAN, which makes every knob question downstream " +
        "meaningless -- there is no point asking whether a knob was declared for an experiment that never " +
        "happened");
}

console.log();
if (fails) { console.log("knobGate-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("knobGate-selfcheck: all checks pass");
