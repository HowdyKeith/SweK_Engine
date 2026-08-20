// WebGLEngine/tools/ship/composeValidate-selfcheck.mjs -- v3701
//
// Run: node tools/ship/composeValidate-selfcheck.mjs   (<1s)
//
// *** THE FIRST CHECK IS THE BOUNDARY, NOT A DEFECT. *** This validator exists to be the gate a small local
// model's composition must clear, and the failure it is guarding against is the one this tree already named
// against Voyager: OUTPUT ACCEPTED BECAUSE IT PARSED. So the thing worth asserting first is that a buildable
// layout is not being called a GOOD one -- there is no answer key for a diorama, and a validator that grew an
// opinion about taste would be inventing the very judgement it cannot make.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateComposition, reportLines, STYLES, SCENES, VITALS } from "./composeValidate.mjs";
import { codeOnly } from "./sourceScan.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (l) => console.log("  ----  " + l);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");

const OPTS = { avatars: ["Xbot", "Soldier", "Michelle"], meshes: ["chair", "lamp", "mug"], maxProps: 3 };
const goodGauges = () => VITALS.map(() => ({ show: true, style: "ring", color: [1, 0.5, 0], pos: { x: 0.5, y: 0.5 } }));
const GOOD = { avatar: "Xbot", scene: "diorama", pet: true, room: true, gauges: goodGauges(), props: [{ glb: "chair" }] };

console.log("composeValidate-selfcheck -- can the stage build it, and nothing more\n");

// ---- 1. THE BOUNDARY ------------------------------------------------------------------------------------------
{
    ok("!! *** a buildable layout is called BUILDABLE, never good ***",
        /BUILDABLE/.test(reportLines(GOOD, OPTS)[0]) && /NOT that it looks right|no answer key/.test(reportLines(GOOD, OPTS)[0]),
        "the report says what it is not claiming on the passing path, where nobody is looking for caveats. " +
        "A DIORAMA IS TASTE and there is no key for it -- a validator that passed something ugly is WORKING " +
        "CORRECTLY, and one that started ranking layouts would be inventing the judgement it cannot make.");

    const src = codeOnly(fs.readFileSync(path.join(HERE, "composeValidate.mjs"), "utf8"));
    ok("!! ...and the option lists are PASSED IN, not carried here",
        !/"Xbot"|"Soldier"|"Michelle"/.test(src),
        "the composer fills its selects from /avatar/imported and /assets/list AT RUNTIME, so the allowed sets " +
        "are a property of THE BOX. A copy in this file would drift the first time somebody imported a mesh and " +
        "would then REJECT A PERFECTLY BUILDABLE LAYOUT -- worse than not checking at all.");
}

// ---- 2. EVERY CLASS OF BREAKAGE, AND ALL AT ONCE ---------------------------------------------------------------
{
    ok("!! a correct layout passes", validateComposition(GOOD, OPTS).ok, "if this fails, the checks below are noise");

    const cases = [
        ["unknown avatar", { ...GOOD, avatar: "Xbo" }, "avatar"],
        ["unknown scene", { ...GOOD, scene: "nope" }, "scene"],
        ["non-boolean pet", { ...GOOD, pet: "yes" }, "pet"],
        ["unknown gauge style", { ...GOOD, gauges: goodGauges().map((g, i) => i ? g : { ...g, style: "swirl" }) }, "gauges[0].style"],
        ["colour in 0-255", { ...GOOD, gauges: goodGauges().map((g, i) => i ? g : { ...g, color: [255, 0, 0] }) }, "gauges[0].color"],
        ["gauge off the pad", { ...GOOD, gauges: goodGauges().map((g, i) => i ? g : { ...g, pos: { x: 2, y: 0 } }) }, "gauges[0].pos"],
        ["too many props", { ...GOOD, props: [{ glb: "chair" }, { glb: "lamp" }, { glb: "mug" }, { glb: "chair" }] }, "props"],
        ["duplicate prop", { ...GOOD, props: [{ glb: "chair" }, { glb: "chair" }] }, "props[1]"],
        ["unknown mesh", { ...GOOD, props: [{ glb: "ghost" }] }, "props[0]"],
        ["not an object", [], "(root)"],
    ];
    for (const [name, comp, field] of cases) {
        const r = validateComposition(comp, OPTS);
        ok("!! catches: " + name, !r.ok && r.problems.some((p) => p.field === field),
            (r.problems.find((p) => p.field === field) || { why: "NOT CAUGHT" }).why.slice(0, 90));
    }

    // *** THE SHORT GAUGE ARRAY IS THE QUIET ONE. *** The saved layout is POSITIONAL, so dropping an entry does
    // not throw -- it silently re-assigns every gauge after the gap, and the only symptom is colours moving.
    const short = validateComposition({ ...GOOD, gauges: goodGauges().slice(0, 3) }, OPTS);
    ok("!! *** and the POSITIONAL short-array shift, which throws nothing and moves every gauge after it ***",
        !short.ok && short.problems.some((p) => p.field === "gauges" && /POSITIONAL/.test(p.why)),
        "index i IS vital i -- there is no name on a gauge entry, so a missing one is not a missing gauge, it is " +
        "FIVE WRONG ONES. Nothing in the stage would report it.");

    const many = validateComposition({ avatar: "Xbo", scene: "nope", props: [{ glb: "ghost" }] }, OPTS);
    ok("!! it returns EVERY problem, not the first",
        many.problems.length >= 3,
        many.problems.length + " problems in one pass. A producer -- a model especially -- needs the whole list " +
        "to fix in one go; a trickle of one-at-a-time failures looks like progress and is not.");
    say("problem classes covered: " + cases.length + " plus the positional shift");
}

// ---- 3. WHAT AN EMPTY OPTION LIST MEANS ------------------------------------------------------------------------
{
    // A box that has not answered /assets/list yet reports NO meshes. Treating that as "every prop is unknown"
    // would fail every layout on a slow boot -- an ABSENT list is not an EMPTY one, and this file must not
    // collapse them. UNKNOWN IS NOT ABSENT, again.
    const noLists = validateComposition(GOOD, { maxProps: 3 });
    ok("!! *** no option lists means membership is UNCHECKED, not FAILED ***", noLists.ok,
        "a box that has not answered /assets/list yet reports nothing, and failing every layout on a slow boot " +
        "would teach somebody to ignore this check. Shape and range are still enforced -- only membership is " +
        "skipped, and the caller that has the lists is the one that gets the stronger answer.");

    const stillShape = validateComposition({ ...GOOD, gauges: goodGauges().map((g, i) => i ? g : { ...g, style: "swirl" }) }, { maxProps: 3 });
    ok("...and shape is still enforced with no lists", !stillShape.ok,
        "an unknown STYLE is wrong on every box -- STYLES is the composer's own array, not a property of this one");
}

if (fails) { console.log("\ncomposeValidate-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("\ncomposeValidate-selfcheck: all checks pass");
