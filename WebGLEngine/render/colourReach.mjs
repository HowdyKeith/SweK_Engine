// WebGLEngine/render/colourReach.mjs -- v4424
//
// *** v4421 SAID THE POPULATION WAS SMALL. THAT WAS A CLAIM ABOUT DRAW SITES, AND I GENERALISED IT TO
// COLOURS. KEITH NAMED THREE EFFECTS AND THE DETECTOR COULD NOT SEE ANY OF THEM. ***
//
// v4412 built render/fireColour.mjs to answer "what colour is fire at heat h" and its SOURCES table holds
// NAMED RAMP FUNCTIONS -- {file, symbol, sample}. v4421 added the fifth entry after finding a colour typed
// into a draw call, and asked how many more there were. It answered with this detector:
//
//     files that call gl.blendFunc(..., gl.ONE)      -- 12 in the tree
//
// and concluded, in ev/shipDebris.mjs's own header: "the population is SMALL and it is named rather than
// guessed at". *** THAT SENTENCE IS TRUE OF DRAW SITES AND FALSE OF COLOURS, *** and the difference is a whole
// mechanism: an effect that hands a colour to a SHARED PARTICLE SYSTEM never calls blendFunc at all. Keith
// asked about fireworks, plasma and lightning. All three are exactly that shape:
//
//     world/fireworkShell.mjs     blendFunc calls: 0
//     world/kaijuAttackFx.js      blendFunc calls: 0     8 distinct inline colour literals
//     ui/pageFxOverlay.js         blendFunc calls: 0     and NO GATE OF ANY KIND
//
// ---- THE POPULATION, RE-TAKEN WITH A DETECTOR THAT LOOKS FOR COLOURS RATHER THAN FOR DRAWING ---------------
//
//     KIND                                                        files
//     A  a NAMED ramp function, which fireColour can hold             5   (its whole SOURCES table)
//     B  a literal colour inside an additive DRAW call               13   (v4421's detector)
//     C  a literal colour naming a colour for something else         77
//
//     files in BOTH B and C                                           0
//     of C, files that also talk about HOT effects                   20
//
// *** THOSE NUMBERS ARE THE MODULE'S OWN PREDICATES, NOT MY SHELL SWEEP, AND THE TWO DISAGREED. *** The first
// draft of this header said 12 and 87, measured with grep from a terminal; census() below says 13 and 75
// because it EXCLUDES gates and vendor and the ad-hoc greps did not. A census whose headline numbers come
// from a different reader than its code is two censuses, and the round whose whole subject is a detector's
// reach is the worst possible place to keep one. Every number here is now produced by KINDS above.
//
// The frozen list was worse: it was pasted from a terminal `head -16` and the real count is 29. A LIST
// TRUNCATED BY A PAGER IS NOT A MEASUREMENT, and it would have ratcheted thirteen real files into invisibility.
//
// *** ZERO OVERLAP. *** The two mechanisms do not share a single file, which is why one detector reported the
// other's population as absent rather than as small. This is v4413's substring rule that could not see a path
// built by path.join, one more time -- and it is the third round running in which the instrument's REACH, not
// its arithmetic, was the thing that was wrong.
//
// ---- WHAT THIS ROUND DOES AND DOES NOT DO -------------------------------------------------------------------
//
// IT DOES NOT REGISTER 87 FILES. A colour literal is not a fire: most of those 87 are weather, water, chess
// pieces, biome tints and UI. Registering them would turn a census with a question into a list with none.
//
// What it does is make the REACH itself measurable and ratcheted: HOT_UNREGISTERED below is the frozen list of
// files that both name a literal colour AND talk about fire, plasma, lightning, fireworks, sparks, embers or
// explosions -- the ones a fire census would want and does not have. The gate re-derives that list every run
// and refuses to let it grow silently. A NUMBER THAT ONLY MOVES WHEN SOMEBODY EDITS THIS FILE IS THE ONLY KIND
// THAT MEANS ANYTHING, which is v4399's rule about count ratchets and v4413's about naming the arriving file.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SOURCES } from "./fireColour.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Directories a colour census has no business walking. vendor is somebody else's palette. */
const SKIP = new Set(["node_modules", ".git", "vendor", "GPU_Assets"]);
const CODE = /\.(js|mjs|html)$/;

export function walk(dir = ENG, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP.has(e.name)) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, out);
        else if (CODE.test(e.name)) out.push(full);
    }
    return out;
}

/**
 * *** THE THREE KINDS, AS PREDICATES OVER SOURCE, EACH NAMED AND EACH SEPARATELY WRONG IN A STATED WAY. ***
 *
 * `drawSite` is v4421's detector, KEPT rather than replaced: it is not a bad detector, it answers a different
 * question, and deleting it would lose the ability to show that the two populations do not overlap.
 */
export const KINDS = Object.freeze({
    // A file that blends additively itself -- it owns its draw call.
    drawSite: (src) => /blendFunc\([^)]*gl\.ONE\)/.test(src),
    // A file that names a literal colour for something else to draw. Both spellings the tree actually uses.
    literalColour: (src) => /color: \[[0-9]/.test(src) || /[^a-zA-Z]r: [0-9.]+, ?g: [0-9.]+, ?b: [0-9.]+/.test(src),
    // A file that talks about a HOT effect. Crude and says so: it reads words, not behaviour, so it counts a
    // file that merely mentions fire and misses one that draws a flame without naming it.
    hot: (src) => (src.match(/fire|plasma|lightning|firework|spark|ember|explosion|flame/gi) || []).length >= 4,
});

/** Every file, tagged by kind. The census this file is about, taken from the tree rather than recorded. */
/**
 * *** COMMENTS ARE STRIPPED BEFORE ANY PREDICATE RUNS, AND THIS ROUND IS WHY. ***
 *
 * The first draft read raw source. It measured 13 draw sites -- and then WRITING THIS ROUND changed the
 * answer to 17, because main.js's version comment, brain/brain.js's, tools/ship/gateSweep.mjs's ledger entry
 * and this file's own header all QUOTE the string `gl.blendFunc(..., gl.ONE)` while explaining the detector.
 * The census counted prose ABOUT the detector as instances OF it, and two of those files then showed up in
 * the "both kinds" overlap that the whole finding rests on being empty.
 *
 * *** A CENSUS THAT READS PROSE MEASURES ITS OWN CHANGELOG. *** This is commentFalsePass a third time in one
 * session -- v4421's gate was satisfied by the comment above the line it was checking, and here the
 * instrument was contaminated by the round that built it. The numbers below the fix are the ones that mean
 * anything; the 13/77 recorded before it were taken before the prose existed and would have drifted the
 * moment anybody described this file.
 */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/** The census's own reading of a source: predicates applied to CODE, never to prose. Exported so the gate
 *  can show that the two differ on a file whose only mention of the pattern is a comment. */
export const countsAsDrawSite = (raw) => KINDS.drawSite(stripComments(raw));

export function census(root = ENG) {
    const rows = [];
    for (const f of walk(root)) {
        let raw = "";
        try { raw = fs.readFileSync(f, "utf8"); } catch { continue; }
        const src = stripComments(raw);
        const rel = path.relative(root, f).replace(/\\/g, "/");
        if (/-selfcheck\.mjs$/.test(rel)) continue;   // a gate that mentions a colour is not an effect
        const draw = KINDS.drawSite(src), lit = KINDS.literalColour(src), hot = KINDS.hot(src);
        if (draw || lit) rows.push({ file: rel, draw, literal: lit, hot });
    }
    return rows;
}

/** The files a FIRE colour census would want: they name a literal colour and they talk about hot things. */
export const hotUnregistered = (rows = census()) => {
    const named = new Set(SOURCES.map((s) => s.file));
    return rows.filter((r) => r.literal && r.hot && !named.has(r.file)).map((r) => r.file).sort();
};

/**
 * *** THE RATCHET IS A LIST OF NAMES, NOT A COUNT. *** v4399's rule: a count drifts with the tree and cannot
 * say which entry moved, and v4413 spent two rounds working out by hand which file had arrived before
 * replacing its own count baseline with names. Frozen at v4424.
 */
export const HOT_UNREGISTERED = Object.freeze([
    "demos_code/aquarium.js",
    "demos_code/testfire_skirmish.js",
    "flight-gpu.html",
    "main.js",
    "phone.html",
    "render/particleEmitters.js",
    "simulation/AsteroidsDemo.js",
    "simulation/BotManager.js",
    "simulation/CivilizationManager.js",
    "simulation/DungeonDemo.js",
    "simulation/FPSShooter.js",
    "simulation/KaijuManager.js",
    "simulation/KaijuSandbox.js",
    "simulation/MissileCommandDemo.js",
    "simulation/OgreScenario.js",
    "simulation/ProjectileManager.js",
    "simulation/RagdollDismember.js",
    "simulation/WeaponSystem.js",
    "world/biomeAmbience.js",
    "world/kaijuAttackFx.js",
]);

/**
 * What v4424 measured. Re-take with: node render/colourReach-selfcheck.mjs
 * v4464: literalColourFiles 75 -> 76. The arrival is slug-device.html (v4460), whose legend names five hex colours
 * for the two backends' pictures; it draws nothing additively, so the overlap stays 0 and section 2 is untouched.
 */
export const MEASURED_AT_V4424 = Object.freeze({
    namedRamps: 5,
    drawSiteFiles: 13,
    literalColourFiles: 76,
    overlapDrawAndLiteral: 0,
    hotUnregistered: 20,
    // The three Keith named, and what the old detector saw of them.
    keithsThree: Object.freeze({
        "world/fireworkShell.mjs": Object.freeze({ blendFunc: 0, gate: "tools/ship/fireworkShell-selfcheck.mjs" }),
        "world/kaijuAttackFx.js": Object.freeze({ blendFunc: 0, distinctColourLiterals: 8, gate: null }),
        "ui/pageFxOverlay.js": Object.freeze({ blendFunc: 0, gate: null }),
    }),
});
