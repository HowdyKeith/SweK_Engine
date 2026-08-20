// WebGLEngine/tools/ship/composePropose-selfcheck.mjs -- v3703
//
// Run: node tools/ship/composePropose-selfcheck.mjs   (<1s)
//
// *** THIS GATE NEEDS NO MODEL, AND THAT IS THE DESIGN RATHER THAN A COMPROMISE. *** callModel is INJECTED, so
// every reply a small local model actually produces -- fenced JSON, JSON with an apology in front of it, a
// hallucinated mesh name, an essay about cosy rooms -- can be handed to it as a fixture. A producer that could
// only be checked against a live ollama would never be checked here at all, and the one thing this file must
// prove is that A REPLY IS NOT ACCEPTED BECAUSE IT PARSED.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { proposeComposition, parseReply, buildPrompt, reportLines } from "./composePropose.mjs";
import { VITALS, STYLES, SCENES } from "./composeValidate.mjs";
import { codeOnly } from "./sourceScan.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (l) => console.log("  ----  " + l);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");

const OPTS = { avatars: ["Xbot", "Soldier"], meshes: ["chair", "lamp"], maxProps: 3 };
const GOOD = JSON.stringify({
    avatar: "Xbot", scene: "diorama", pet: true, room: true,
    gauges: VITALS.map(() => ({ show: true, style: "ring", color: [1, 0.5, 0] })), props: [{ glb: "chair" }],
});
const say_ = (t) => async () => t;

console.log("composePropose-selfcheck -- a reply is not accepted because it parsed\n");

// ---- 1. FOUR STATES, BECAUSE THEY ARE FOUR DIFFERENT THINGS TO DO NEXT ----------------------------------------
{
    const cases = [
        ["bare JSON", say_(GOOD), "proposed"],
        ["fenced JSON", say_("```json\n" + GOOD + "\n```"), "proposed"],
        ["JSON with an apology in front", say_("Sure! Here you go: " + GOOD), "proposed"],
        ["an essay instead of a layout", say_("I think a cosy room would be nice."), "unreadable"],
        ["valid JSON that is not an object", say_("[1,2,3]"), "unreadable"],
        ["empty reply", say_("   "), "unreadable"],
        ["a hallucinated mesh", say_(GOOD.replace("chair", "sofa")), "unbuildable"],
        ["a hallucinated avatar", say_(GOOD.replace("Xbot", "Xbo")), "unbuildable"],
        ["colours in 0-255", say_(GOOD.replace("[1,0.5,0]", "[255,128,0]")), "unbuildable"],
        ["no model at all", null, "no-model"],
        ["the model call throws", async () => { throw new Error("connection refused"); }, "no-model"],
    ];
    for (const [name, fn, want] of cases) {
        const r = await proposeComposition(fn, OPTS);
        ok("!! " + name + " -> " + want, r.state === want, "got " + r.state + (r.error ? " (" + r.error.slice(0, 60) + ")" : ""));
    }
    say("states exercised: proposed / unbuildable / unreadable / no-model");
}

// ---- 2. *** NO MODEL IS NOT AN EMPTY PROPOSAL. *** -------------------------------------------------------------
{
    const none = await proposeComposition(null, OPTS);
    ok("!! *** 'there was no model' is its own state, not 'the model suggested nothing' ***",
        none.state === "no-model" && !none.composition,
        "a caller that cannot tell those apart will read the second as the first, and a box with ollama switched " +
        "off would look like a model that had no ideas. THE SAME DISTINCTION THE CURRICULUM DRAWS between " +
        "UNMEASURED and an empty frontier, and the LAPACK grader between ABSENT and agreement.");
}

// ---- 3. *** THE REPLY IS NEVER REPAIRED. *** -------------------------------------------------------------------
{
    const r = await proposeComposition(say_(GOOD.replace("Xbot", "Xbo")), OPTS);
    ok("!! an unknown avatar is REPORTED, never snapped to the nearest real name",
        r.state === "unbuildable" && r.composition.avatar === "Xbo",
        "the composition comes back UNTOUCHED -- 'Xbo' is still 'Xbo'. Coercing it to 'Xbot' would be the " +
        "producer being graded by something that had already decided to agree with it, and it would HIDE THE " +
        "EXACT FAILURE the validator exists to show.");

    const missing = await proposeComposition(say_('{"avatar":"Xbot"}'), OPTS);
    ok("...and a missing slot is not filled in with a default",
        missing.state === "unbuildable" && missing.composition.scene === undefined,
        "supplying scene/gauges/props would make every reply buildable and the validator decorative");

    ok("!! the composition comes back even when unbuildable, so a person can see what it tried",
        !!r.composition && !!r.validation && r.validation.problems.length > 0,
        "hiding it would leave 'the model failed' with nothing to look at, which teaches nobody anything");
}

// ---- 4. IT PROPOSES AND WRITES NOTHING ------------------------------------------------------------------------
{
    const src = codeOnly(fs.readFileSync(path.join(HERE, "composePropose.mjs"), "utf8"));
    ok("!! *** the proposer has NO WRITE PATH ***",
        !/writeFileSync|appendFileSync|savePreset/.test(src),
        "checked through codeOnly so the header saying it must not write cannot satisfy the check. It never " +
        "touches diorama.json and never saves a preset -- THE PERSON STILL HAS TO PRESS APPLY, which is the " +
        "whole difference between a proposal and a decision.");

    // THE ROUTE MARKER IS A STRING LITERAL, SO IT IS FOUND IN THE RAW SOURCE AND THE WINDOW IS THEN STRIPPED.
    // My first version searched codeOnly for "/diorama/propose" -- WHICH codeOnly BLANKS, being a string -- so
    // the index was -1 and the check failed for a reason that had nothing to do with the route. codeOnly for an
    // IDIOM, raw for a STRING: the same distinction that has bitten this tree twenty times.
    const rawSrv = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
    const i = rawSrv.indexOf('"/diorama/propose"');
    const srv = codeOnly(rawSrv.slice(Math.max(0, i), i + 1400));
    ok("...and its route does not write either",
        i >= 0 && !/writeFileSync/.test(srv),
        "a route that applied the reply would make the model the last word on a thing it cannot judge");

    ok("!! the passing report still says what it is NOT claiming",
        reportLines(await proposeComposition(say_(GOOD), OPTS)).join(" ").includes("no answer key"),
        "on the green path, where nobody is looking for caveats -- BUILDABLE is all it means");
}

// ---- 5. THE PROMPT IS BUILT FROM THE BOX'S OWN LISTS -----------------------------------------------------------
{
    const p = buildPrompt(OPTS);
    ok("!! the prompt names the real options rather than asking the model to invent them",
        p.includes("Xbot") && p.includes("chair") && STYLES.every((s) => p.includes(s)) && SCENES.every((s) => p.includes(s)),
        "it removes the failures that are the PROMPT'S fault. IT IS NOT A SUBSTITUTE FOR VALIDATION -- a small " +
        "model returns an unoffered mesh anyway, which is why case 'a hallucinated mesh' above is unbuildable " +
        "and not merely unlikely.");
    ok("...and it says the gauge array is POSITIONAL, since that failure is silent",
        /positional/i.test(p) && p.includes(VITALS.join(", ")),
        "a short array does not throw, it re-assigns every gauge after the gap");
}

if (fails) { console.log("\ncomposePropose-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("\ncomposePropose-selfcheck: all checks pass");
