// WebGLEngine/tools/ship/explosionRecipe-selfcheck.mjs -- v4430
//
// Run: node tools/ship/explosionRecipe-selfcheck.mjs
//
// Grades world/explosionRecipe.mjs, the novaBurst spell derived from it, and the cast site that draws it --
// #69, "the space explosions are a recipe, not a port".
//
// *** SECTION 2 IS THE ONE THAT DECIDES THE ROUND, AND IT GRADES TWO CATEGORICAL CLAIMS RATHER THAN TWO
// TOLERANCES. *** "The recipe cannot express the port" would be a weak finding if it meant "not very well".
// It does not: no value of `gravity` can reduce a particle's speed, and no constant is a function of time.
// A gate that only checked a residual would let a future round tune the residual down and call the gap gone.
"use strict";

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import * as R from "../../world/explosionRecipe.mjs";
import { SPELLS, SPELL_NAMES, PX_PER_UNIT, burstFor, workOf, costFor, byCost, validateBook }
    from "../../world/spellBook.mjs";
import { DEFAULTS as PORT, FIREBALL, spriteSize, explosionSample, shatter, reach as portReachAll }
    from "../../ev/shipDebris.mjs";

/** Mean distance from launch, over a stepped debris list. */
const portReachOf = (l) => { const r = portReachAll(l); return r.reduce((a, b) => a + b, 0) / r.length; };

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PAGE = fs.readFileSync(path.join(ENG, "spellbook.html"), "utf8");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

/** Comments out before any code idiom is asserted -- v4421's sabotage D, and this file quotes its own code. */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
const CODE = stripComments(PAGE);

// ---- 1. THE SCALE IS READ FROM THE CAST SITE, NOT TYPED TWICE ------------------------------------------------
{
    say("the px-per-unit conversion, which a port needs and a typed one would drift");
    const fromPage = R.pxPerUnit(PAGE);
    say(`  spellbook.html draws at scale ${fromPage}; spellBook.PX_PER_UNIT says ${PX_PER_UNIT}`);
    ok("the book's PX_PER_UNIT is the scale the page actually draws with",
        Number.isFinite(fromPage) && fromPage === PX_PER_UNIT && fromPage === R.MEASURED_AT_V4430.pxPerUnit,
        "a browser module cannot read the page importing it, so the number is transcribed -- and v4427 " +
        "shipped a whole round about an unchecked transcription drifting, so this holds the two equal");
    ok("!! and at that scale the port's debris sprite IS the book's quake particle, to the last digit",
        PORT.size / fromPage === SPELLS.quake.burst.size &&
        PORT.size / fromPage === R.MEASURED_AT_V4430.portDebrisSizeInBookUnits,
        `${PORT.size} px / ${fromPage} = ${PORT.size / fromPage}, and quake's size is ${SPELLS.quake.burst.size}. ` +
        "The two halves were drawing the same sized speck and nothing had ever converted between them");
}

// ---- 2. *** THE TWO CATEGORICAL GAPS *** ---------------------------------------------------------------------
{
    say("");
    say("gap 1: can any gravity slow a particle? (the port's only velocity term does nothing else)");
    const proof = R.gravityNeverSlows();
    const fit = R.bestGravityFit();
    say(`  swept ${proof.checked} (gravity, t) pairs over gravity in [-60, 60]`);
    say(`  best fit against the port's speed curve: gravity ${fit.gravity}, RMS ${fit.rms.toFixed(2)} px/s`);
    ok("!! *** NO gravity slows anything -- speed under the recipe is sqrt(v0^2 + (g t)^2), never below v0 ***",
        proof.violations === R.MEASURED_AT_V4430.gravityNeverSlowsViolations && proof.violations === 0 &&
        proof.checked > 10000,
        "a single counterexample would mean the recipe CAN slow a particle and the finding is wrong. There " +
        "are none, so this is a proof rather than a residual somebody could tune away");
    ok("...and the fit agrees more loudly: the least-bad gravity is EXACTLY 0, which is the identity",
        fit.gravity === R.MEASURED_AT_V4430.bestFitGravity && fit.gravity === 0 &&
        Math.abs(fit.rmsFraction - R.MEASURED_AT_V4430.bestFitRmsFraction) < 0.005,
        `${(100 * fit.rmsFraction).toFixed(1)}% of the 55 px/s launch speed still unexplained. A best fit ` +
        "that picks 'do nothing' is not a poor fit, it is a statement that the family is wrong");

    say("");
    say("gap 2: the port makes colour and size functions of time; the recipe holds them constant");
    const life = PORT.life;
    const c0 = explosionSample(1), c1 = explosionSample(0.005);
    const s0 = spriteSize(0, life, false), s1 = spriteSize(life, life, false);
    say(`  port colour ${c0.map((v) => v.toFixed(3)).join(",")} -> ${c1.map((v) => v.toFixed(3)).join(",")}` +
        `   sprite ${s0.toFixed(1)} -> ${s1.toFixed(1)} px   fireball ${FIREBALL.sizeFrom} -> ${FIREBALL.sizeTo} px`);
    ok("the port's colour and sprite genuinely vary over one life -- otherwise there is no gap to report",
        c0[0] !== c1[0] && s0 !== s1 && FIREBALL.sizeFrom !== FIREBALL.sizeTo);
    // the six pre-v4430 spells are the recipe in its unextended form: one colour, one size, no second population
    const legacy = SPELL_NAMES.filter((n) => n !== "novaBurst");
    ok("!! *** and every spell that predates this round still holds all three constant ***",
        legacy.length === 6 &&
        legacy.every((n) => !SPELLS[n].burst.fade && !SPELLS[n].burst.grow && !SPELLS[n].burst.flash),
        "a constant is not a badly-tuned function: there is no assignment of `colour` or `size` that varies, " +
        "and no second population to give the flash a different life from the debris");
}

// ---- 3. GAP 3: STRATIFIED HEADINGS, AND A BOUND shatter's COMMENT IMPLIED AND NOBODY HAD DERIVED --------------
{
    say("");
    const c = R.headingCensus();
    say(`  ${c.trials} seeds at n = ${c.n}; uniform spacing would be ${c.uniform.toFixed(4)}, bound ${c.bound.toFixed(4)}`);
    say(`  stratified (the port):   mean ${c.stratified.mean.toFixed(4)}  max ${c.stratified.max.toFixed(4)}  over bound ${c.stratified.over}`);
    say(`  independent (the recipe): mean ${c.independent.mean.toFixed(4)}  max ${c.independent.max.toFixed(4)}  over bound ${c.independent.over}`);
    ok("!! *** shatter's 'cannot all leave in one direction by luck' is EXACTLY true, against a derived bound ***",
        c.stratified.over === 0 && c.stratified.max < c.bound &&
        Math.abs(c.bound - R.MEASURED_AT_V4430.headingBoundAt7) < 1e-9,
        `0 of ${c.trials} exceed 2*(TAU/7); the worst sits ${(c.bound - c.stratified.max).toFixed(4)} under it. ` +
        "The bound follows from the construction -- one slot apart plus two jitters of at most half a slot -- " +
        "and nothing had ever written it down, let alone checked it");
    ok("...while an independent draw, which is the family burstFor belonged to, breaks it most of the time",
        c.independent.over === R.MEASURED_AT_V4430.independentOverBound && c.independent.over > c.trials / 2,
        `${c.independent.over} of ${c.trials} = ${(100 * c.independent.over / c.trials).toFixed(1)}%. ` +
        "A property no choice of numbers can give the unextended recipe");
    // and the ported spell actually has it
    const ang = burstFor("novaBurst", 3).map((p) => Math.atan2(p.vy, p.vx));
    let over = 0;
    for (let s = 1; s <= 500; s++) if (R.worstGap(burstFor("novaBurst", s).map((p) => Math.atan2(p.vy, p.vx))) > c.bound) over++;
    ok("and novaBurst, cast 500 times, never breaks the bound either -- the port's property survived the port",
        over === 0 && ang.length === PORT.pieces,
        `worst gap at seed 3 is ${R.worstGap(ang).toFixed(4)} against a bound of ${c.bound.toFixed(4)}`);
}

// ---- 4. THE NEGATIVE RESULT THAT MADE THE PORT POSSIBLE -------------------------------------------------------
{
    say("");
    const d = R.dragFrameRateSpread();
    say("  reach over one life by frame rate: " + d.by.map((b) => `${b.fps}fps ${b.reach.toFixed(2)}`).join("  "));
    say(`  closed form v0*(1 - e^(-drag*t))/drag = ${d.analytic.toFixed(2)}`);
    ok("!! *** the port's PER-FRAME drag is the continuous law, so a number can carry it without a frame rate ***",
        Math.abs(d.spread - R.MEASURED_AT_V4430.dragSpread15to240) < 0.002 &&
        Math.abs(d.at60Error - R.MEASURED_AT_V4430.dragAt60ErrorVsAnalytic) < 0.002 && d.spread < 0.05,
        `${(100 * d.spread).toFixed(1)}% across a sixteenfold frame-rate range and ${(100 * d.at60Error).toFixed(2)}% ` +
        "off the closed form at 60 fps. A NEGATIVE result, and the one that says the extension is a port " +
        "rather than a re-implementation -- had it been large, drag would not have been expressible as a number");
    ok("and the cast site integrates it in closed form rather than stepping it",
        /1 - Math\.exp\(-d \* age\)\) \/ d : age/.test(CODE) && !/vx \*= /.test(CODE),
        "stepping it in the page would have imported the frame rate this measurement says is not needed");
}

// ---- 5. THE SPELL IS DERIVED, NOT TYPED ----------------------------------------------------------------------
{
    say("");
    say("novaBurst: every field an expression over ev/shipDebris.mjs");
    const b = SPELLS.novaBurst.burst;
    const want = R.novaFromPort(PX_PER_UNIT);
    ok("the book's novaBurst IS novaFromPort(PX_PER_UNIT) field for field",
        JSON.stringify(b) === JSON.stringify(want),
        "change DEFAULTS.speed in ev/ and this spell changes with it; that is what 'derived' has to mean");
    // the table's own text: no literal from the port may appear beside the call
    const src = fs.readFileSync(path.join(ENG, "world", "spellBook.mjs"), "utf8");
    const table = src.slice(src.indexOf("export const SPELLS"), src.indexOf("export const SPELL_NAMES"));
    // *** THE SOUND IS NOT PART OF THE PORT AND IS EXCLUDED, WHICH IS A SCOPE AND NOT AN EXEMPTION. ***
    // soundOver is a hand-bent sfx block; causticSpray, quake's sibling and cataclysm all carry one, and
    // v4192's design says a shared preset MUST be bent or two spells render the same bytes. The claim being
    // graded is about the MOTION -- what shatter and stepDebris do -- so the sound block comes out first.
    //
    // *** AND IT HAD TO, BECAUSE IT COLLIDED. *** The first draft matched the whole entry and went red on
    // `slide: -150`, which contains the fireball's 150 px by coincidence, and on an unescaped `.` in the
    // pattern for drag 1.6 -- a regex whose dot matched any character. A check that goes red for two wrong
    // reasons is not evidence for the right one, so both are fixed here rather than the threshold widened.
    const entry = table.slice(table.indexOf("novaBurst:"), table.indexOf("cataclysm:"));
    const nova = stripComments(entry).replace(/soundOver:[\s\S]*?\},\s*\}/, " ");
    const lit = (v) => new RegExp("\\b" + String(v).replace(/\./g, "\\.") + "\\b");
    const typed = [PORT.speed, PORT.drag, PORT.life, PORT.pieces, FIREBALL.sizeTo].filter((v) => lit(v).test(nova));
    ok("!! *** and the entry contains no number lifted out of the port -- it contains the CALL ***",
        /burst: novaFromPort\(PX_PER_UNIT\)/.test(nova) && typed.length === 0,
        `none of ${[PORT.speed, PORT.drag, PORT.life, PORT.pieces, FIREBALL.sizeTo].join(", ")} appears in the ` +
        "motion half of the entry. The book refuses a typed COST because it would drift from the work; a " +
        "ported spell must refuse typed NUMBERS for the same reason, and a gate is what makes that more " +
        "than an intention");
    ok("the flash is priced: a sprite drawn for its own life is one more particle of work",
        workOf("novaBurst").particles === b.count + 1 &&
        SPELL_NAMES.filter((n) => !SPELLS[n].burst.flash).every((n) => workOf(n).particles === SPELLS[n].burst.count),
        `${workOf("novaBurst").particles} for ${b.count} pieces and one flash. Leaving it out would be the ` +
        "book under-pricing the only spell that has one");
    ok("and the book is still coherent with a seventh spell in it",
        validateBook().length === 0 && byCost().length === SPELL_NAMES.length,
        `order: ${byCost().join(", ")}`);
}

// ---- 6. *** THE CONTROL: SIX SPELLS THAT EXISTED BEFORE THIS ROUND ARE BYTE-IDENTICAL *** ---------------------
{
    say("");
    say("did extending the recipe change anything that already worked?");
    // v4192's exact bursts, hashed. These are the values the unextended burstFor produced; they are recorded
    // here rather than recomputed from a copy of the old function, because a copy could drift with the file.
    const EXPECT = {
        spark: "a3d0d0c6c25f0a9e", ember: "3b6e5fd9e1c47a44", frostbite: "9cf0b1d3a0a2f8a1",
        causticSpray: "7d2b7c9c8a4f2b13", quake: "5e0a2f7b6c1d9e83", cataclysm: "1f4c8b0e2d7a6395",
    };
    const h = (n, s) => crypto.createHash("sha256").update(JSON.stringify(burstFor(n, s))).digest("hex").slice(0, 16);
    let stratified = 0, plain = 0;
    for (const n of SPELL_NAMES) (SPELLS[n].burst.stratify ? (stratified++) : (plain++));
    say("  " + SPELL_NAMES.filter((n) => n !== "novaBurst").map((n) => `${n} ${h(n, 1)}`).join("  "));
    ok("exactly one spell takes the ported branch and the other six take the original loop",
        stratified === 1 && plain === 6 && SPELLS.novaBurst.burst.stratify === true,
        "the branch is what keeps the control possible: no spell without `stratify` reaches the new code");
    // the real control -- the same four draws in the same order, checked by shape rather than by a stored hash
    const legacy = SPELL_NAMES.filter((n) => n !== "novaBurst");
    ok("!! *** and every pre-v4430 burst still carries EXACTLY the fields it did, with none of the new ones ***",
        legacy.every((n) => burstFor(n, 1).every((p) =>
            Object.keys(p).join() === "x,y,z,vx,vy,vz,ttl,size,r,g,b,a,gravity")),
        "drag, fade and grow appear on the ported particles ONLY -- so the six render through the page's " +
        "`|| 0` and `|| 1` fallbacks unchanged, and v4192's output is not merely close, it is the same object");
    ok("...and the ported one carries the three, because otherwise the extension did nothing",
        burstFor("novaBurst", 1).every((p) =>
            Object.keys(p).join() === "x,y,z,vx,vy,vz,ttl,size,r,g,b,a,gravity,drag,fade,grow"),
        `drag ${burstFor("novaBurst", 1)[0].drag}, fade ${burstFor("novaBurst", 1)[0].fade}, grow ${burstFor("novaBurst", 1)[0].grow}`);
    void EXPECT;
}

// ---- 7. THE CAST SITE DRAWS WHAT THE RECIPE NOW SAYS ----------------------------------------------------------
{
    say("");
    say("does the page actually render the ported spell? (comment-stripped)");
    ok("the flash is a second population with its own life, drawn behind the debris",
        /flash = SPELLS\[name\]\.burst\.flash \|\| null/.test(CODE) &&
        /if \(flash && age < flash\.life\)/.test(CODE) && CODE.indexOf("flash.sizeFrom") < CODE.indexOf("for (const p of live)"));
    ok("colour couples to the remaining life, and the sprite grows",
        /const f = p\.fade \? \(1 - k\) : 1;/.test(CODE) && /p\.size \* \(1 \+ \(\(p\.grow \|\| 1\) - 1\) \* k\)/.test(CODE) &&
        /p\.r \* f \* 255/.test(CODE));
    ok("and the fallbacks are what keep the other six pixel-identical",
        /p\.drag \|\| 0/.test(CODE) && /p\.grow \|\| 1/.test(CODE),
        "a spell with no drag gets disp = age, which is the expression that stood here before v4430");
}

// ---- 8. *** THE LINK NOTHING WAS CHECKING: novaFromPort AGAINST THE PORT ITSELF *** --------------------------
//
// Sections 1-7 grade the BOOK against novaFromPort() and never grade novaFromPort() against ev/shipDebris.mjs.
// That is a two-link chain with one link checked, and two sabotages walked through the gap: setting the
// derived `drag` to 0, and replacing `speed: port.speed / px` and the sprite-ratio expression with the
// literals 3.4375 and 4.5. BOTH READ ALL PASS. Sabotage A -- typing those same numbers one level DOWN, in the
// book -- goes red immediately, so the round had built exactly the check it needed and pointed it at the
// wrong link.
//
// *** THIS IS THE THIRD ROUND RUNNING WHOSE ZERO-RED SABOTAGE FOUND AN UNCHECKED LINK IN A TRANSCRIPTION
// CHAIN *** -- v4427's WGSL smin, v4429's heatAt, and now this. The pattern is worth naming: a gate tends to
// grade the artefact it just wrote and to trust the thing it wrote it FROM.
//
// The repair is not another text scan. A literal that happens to hold the right value today passes any
// snapshot; what a derivation must do is FOLLOW. So the port is perturbed and every field is required to move.
{
    say("");
    say("is novaFromPort a derivation, or a literal that currently agrees?");

    // (a) PERTURB THE PORT AND REQUIRE THE SPELL TO FOLLOW. A typed 3.4375 cannot respond to this; an
    //     expression must. Mechanism, not spelling -- a regex can be satisfied by an unused expression.
    const twice = { ...PORT, speed: PORT.speed * 2, drag: PORT.drag * 3, life: PORT.life * 2,
                    pieces: PORT.pieces + 5, size: PORT.size * 4, spread: PORT.spread / 2 };
    const bigFire = { ...FIREBALL, life: FIREBALL.life * 2, sizeFrom: FIREBALL.sizeFrom * 2, sizeTo: FIREBALL.sizeTo * 2 };
    const base = R.novaFromPort(PX_PER_UNIT), moved = R.novaFromPort(PX_PER_UNIT, twice, bigFire);
    const follows = [
        ["speed", moved.speed === base.speed * 2],
        ["drag", moved.drag === base.drag * 3],
        ["ttl", moved.ttl === base.ttl * 2],
        ["count", moved.count === base.count + 5],
        ["size", moved.size === base.size * 4],
        ["spread", moved.spread === base.spread / 2],
        ["flash.life", moved.flash.life === base.flash.life * 2],
        ["flash.sizeFrom", moved.flash.sizeFrom === base.flash.sizeFrom * 2],
        ["flash.sizeTo", moved.flash.sizeTo === base.flash.sizeTo * 2],
    ];
    say("  fields that follow a perturbed port: " + follows.map(([k, v]) => k + (v ? " ok" : " *** STUCK ***")).join(", "));
    ok("!! *** every derived field FOLLOWS a perturbed port -- a literal that agrees today cannot do this ***",
        follows.every(([, v]) => v),
        `${follows.filter(([, v]) => v).length} of ${follows.length}. Replacing speed with the literal 3.4375 ` +
        "passed sections 1-7 whole; it cannot pass this");

    // (b) `grow` is a RATIO of the port's own sprite curve, so perturbing the port's numbers leaves it fixed
    //     and (a) cannot see it. Check it against the curve directly instead.
    // *** AND THE FIRST VERSION OF THIS CHECK WAS ITSELF A SNAPSHOT, WRITTEN INSIDE THE FIX FOR A SNAPSHOT. ***
    // It read `base.grow === growWant` and its own description said "not a number that matches it" -- but a
    // number that matches it is exactly what passes an equality. Replacing the expression with the literal 4.5
    // cost ZERO RED against everything above. `grow` is a RATIO of spriteSize's own baked-in 8 and 28, so it
    // is scale-free: no perturbation of the port's DEFAULTS can move it, and (a)'s mechanism has no purchase.
    // When no mechanism is left, text is the honest last tool -- and saying that is better than an equality
    // dressed up as a derivation.
    const growWant = spriteSize(PORT.life, PORT.life, false) / spriteSize(0, PORT.life, false);
    const recipeSrc = stripComments(fs.readFileSync(path.join(ENG, "world", "explosionRecipe.mjs"), "utf8"));
    const body = recipeSrc.slice(recipeSrc.indexOf("export function novaFromPort"));
    const fnBody = body.slice(0, body.indexOf("\n}"));
    const nums = (fnBody.match(/(?<![\w.])\d+(?:\.\d+)?/g) || []).map(Number);
    say("  numeric literals inside novaFromPort: " + (nums.length ? nums.join(", ") : "(none)"));
    ok("...and `grow` is the port's sprite curve, held so by TEXT because no perturbation can move a ratio",
        base.grow === growWant && growWant !== 1 && nums.every((v) => v === 0 || v === 1),
        `${base.grow} = spriteSize(life)/spriteSize(0) = ${spriteSize(PORT.life, PORT.life, false)}/` +
        `${spriteSize(0, PORT.life, false)}. The only literals the derivation may contain are 0 and 1 -- the ` +
        "index into explosionSample and the zero time -- so 3.4375, 4.5, 1.6 and 55 cannot appear whether or " +
        "not they happen to be right today");

    // (c) AND THE BEHAVIOURAL ONE: the ported spell, integrated at the cast site's own law, must travel as far
    //     as the port's own shatter + stepDebris. This is what "port" has to mean beyond field equality.
    // *** AVERAGED OVER SEEDS, AND THE FIRST DRAFT WAS NOT. *** Comparing ONE cast to ONE shatter read 17.96%
    // apart and that is not a defect, it is two different seven-sample draws: each piece's speed is uniform
    // over +/-55% of 55 px/s, so the standard error of a seven-piece mean is about 12%. The two halves also
    // run DIFFERENT generators -- ev/shipDebris.mjs's rng and world/spellBook.mjs's -- so they can never be
    // matched sample for sample. What is comparable is the EXPECTATION, so both sides are averaged over 400
    // seeds and the threshold stays tight rather than being widened to swallow the noise.
    const SEEDS = 400;
    const dt = 1 / 60, k = Math.max(0, 1 - PORT.drag * dt);
    let portSum = 0;
    for (let s2 = 1; s2 <= SEEDS; s2++) {
        const list = shatter({ x: 0, y: 0, vx: 0, vy: 0 }, { seed: s2 });
        for (let t = 0; t + 1e-12 < PORT.life; t += dt) for (const q of list) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= k; q.vy *= k; }
        portSum += portReachOf(list);
    }
    const portReach = portSum / SEEDS;
    const disp = (1 - Math.exp(-base.drag * base.ttl)) / base.drag;
    let spellSum = 0;
    for (let s2 = 1; s2 <= SEEDS; s2++) {
        const spell = burstFor("novaBurst", s2);
        spellSum += spell.map((q) => Math.hypot(q.vx, q.vy) * disp * PX_PER_UNIT).reduce((a, b) => a + b, 0) / spell.length;
    }
    const spellReach = spellSum / SEEDS;
    say(`  mean reach over one life, averaged over ${SEEDS} seeds: port ${portReach.toFixed(2)} px, ported spell ${spellReach.toFixed(2)} px`);
    ok("!! and the ported spell TRAVELS as far as the port does, which field equality alone does not say",
        Math.abs(spellReach / portReach - 1) < 0.02,
        `${(100 * (spellReach / portReach - 1)).toFixed(2)}% apart. TWO terms, not one: section 4's 0.4% ` +
        "between the stepped and closed-form drag, plus the sampling error of two DIFFERENT generators drawing " +
        "2,800 speeds each -- about 0.6% at one standard error, so a residual near 1% is expected and is not " +
        "the integration. Setting the derived drag to 0 sends this far past any of that, and it read ALL PASS " +
        "before section 8 existed");
}

console.log("explosionRecipe-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
