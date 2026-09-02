// FILE: world/orreryFleet.mjs -- v4328
//
// *** THE THINGS THAT MOVE AROUND A VENDORED BODY, AND WHAT THEY ACTUALLY ARE. ***
//
// Backlog #68, Keith: "put the ES satellites / asteroids / planets into the github demos, driven by the git
// log, so two runs match unless the repo changed." The PLANETS half landed at v4189 -- world/orrerySeed.mjs
// turns the commit that first added a body into that body's planet seed. This file is the other two, and the
// whole difficulty is that a satellite has to BE something. The orrery's rule since v4185 is that every drawn
// quantity comes from a fact already in the tree; a ring of pretty dots around a planet would be the
// screensaver world/orrery.mjs's own header refuses to become.
//
// ---- *** THE OBVIOUS READING OF "DRIVEN BY THE GIT LOG" IS DEAD, AND IT WAS KILLED BY MEASUREMENT. *** -----
//
// The obvious asteroid belt is "one rock per commit that touched this body". Counted, at v4328, over 858
// commits of history:
//
//     three 2    htmx 2    box3d 2    and ONE each for the other twelve
//
// Twelve of the fifteen vendored bodies have been touched by exactly one commit in the repository's life:
// the one that dropped them in. A belt built that way is one or two rocks and says nothing, and drawing it
// would have implied a busyness that is not there. *** VENDORED CODE DOES NOT CHANGE; THE CODE THAT USES IT
// DOES. *** That is where the log actually moves, and it is already measured.
//
// ---- *** SO A SATELLITE IS AN IMPORTER. *** -----------------------------------------------------------------
//
// world/orreryEjecta.mjs (v4266) counts, per body, the engine files whose source contains `vendor/<name>/`
// in an import specifier -- three 70, box3d 21, krbn 8, three-webgpu 7, htmx 5, and three bodies at zero
// because they contain no code at all. That count is already gated against a frozen baseline. It is also
// exactly the population the metaphor wants: each file that reaches into a dependency is a craft in orbit
// around it, and a body nothing imports has an empty sky.
//
// So the fleet's SIZE is not a number chosen here. It is the ejecta measurement, handed in.
//
// ---- *** AND EACH SATELLITE CARRIES THE COMMIT THAT LAST TOUCHED IT, WHICH IS NOT THE BODY'S COMMIT. *** ----
//
// Two different questions want two different commits, and conflating them would have made the item's own
// promise false:
//
//     THE BODY  is seeded by the commit that FIRST added it -- when this dependency arrived. It never
//               changes again, which is why the planets are stable between rounds.
//     A SATELLITE is seeded by the commit that LAST touched its file -- what state that consumer is in now.
//
// #68 promises "re-run with no new commits -> identical universe; one new commit -> exactly one thing
// changes". With first-commit seeds that second half would be simply false: editing an importer would move
// nothing. With last-commit seeds it is true and the gate MEASURES it -- change one importer's SHA and
// exactly one satellite's orbit differs.
//
// ---- WHAT IS DERIVED AND WHAT IS REFUSED ---------------------------------------------------------------------
//
//   ALTITUDE   from the importer's own byte count, through log1p -- world/repoHeightfield.js's rule, whose
//              header calls bytes "the size that becomes both area and height". A bigger consumer sits wider.
//   PERIOD     from the altitude, through physics/orbits/kepler.js, IMPORTED and not restated. v4185 wrote
//              its own sqrt(a^3) beside kepler's and the two disagreed by a factor of 2*PI; world/orrery.mjs
//              records that at length. One law, one owner.
//   PHASE      from the seed, so a fleet does not open as a straight line -- world/orreryView.mjs's reason
//              for phaseFor, and the same fnv1a it and world/orrerySeed.mjs already share.
//   ECCENTRICITY and INCLINATION are REFUSED. Nothing about a source file IS either one, and orreryView
//              refused eccentricity for the bodies in exactly these words: "it would be a number invented to
//              be drawn". Circles, in the body's own plane, until a real quantity turns up.
//
// ---- THE BELT, WHICH IS THE PAPERWORK ------------------------------------------------------------------------
//
// Keith asked for asteroids and the commit belt is dead, but there IS a second real population per body:
// the files inside it that are paperwork rather than payload. world/orreryEjecta.mjs already separates them
// (isPaperFile, substance) in order to discount them from a body's mass, and it found that grass, keyhunt and
// slug are ENTIRELY paperwork -- "three planets made entirely of paperwork, 21% of its bodies". Those three
// draw as a debris ring around nothing, which is what that finding LOOKS like. The measurement existed; the
// picture could not show it.
//
// ---- PURITY, AND WHY IT IS THE POINT RATHER THAN A STYLE NOTE ------------------------------------------------
//
// No Math.random, no Date.now, no performance.now, no DOM, no fs. #68's own caution: "a decorative ship path
// still has to be seeded, or it is an animator that never goes quiet -- which lands on #60 (the frameDirty
// census). A path that is a pure function of (sha, t) is deterministic AND something the dirty flag can
// reason about." Every position here is a pure function of (seed, t), so a caller that has not advanced t
// knows nothing moved without asking the fleet.
"use strict";

import { period as keplerPeriod } from "../physics/orbits/kepler.js";
import { fnv1a, SEP } from "./orrerySeed.mjs";        // the SAME hash the bodies are seeded with, imported not retyped
import { isPaperFile } from "./orreryEjecta.mjs";     // the SAME paper/payload split that discounts a body's mass

/** What a thing in orbit around a body is. Frozen so a caller compares against these rather than retyping them. */
export const SATELLITE = "satellite";   // an engine file that imports this body
export const DEBRIS = "debris";         // a paperwork file inside this body

/**
 * A satellite's seed: the commit that LAST touched the importing file, folded with that file's path.
 *
 * The path is folded in for world/orrerySeed.mjs's reason, met here in a sharper form: ONE commit routinely
 * touches many importers at once (a round that renames an export edits every caller), so seeding on the SHA
 * alone would drop a dozen satellites onto one orbit and the picture would claim they were the same craft.
 * The separator is orrerySeed's own, so "ab"+"c" and "a"+"bc" cannot collide here either.
 *
 * @param sha  the full commit hash that last touched the file, or null when git cannot say
 * @param path the importer's path, relative to the engine root
 */
export function satSeed(sha, path) {
    return fnv1a(String(sha || "") + SEP + String(path || "")) >>> 0;
}

/** Whether a satellite's seed really came from the log, so a view can say so rather than implying it. */
export function satSourced(sha) {
    return !!(sha && /^[0-9a-f]{40}$/i.test(sha));
}

/**
 * Orbital altitude above the body's surface, from the importer's byte count.
 *
 * log1p, because world/repoHeightfield.js takes log1p of exactly this quantity and calling it a size in one
 * module and a length in another is how two views of one tree stop agreeing. The floor is not cosmetic: a
 * zero-byte importer would otherwise sit ON the body and be indistinguishable from its surface.
 */
export function altitudeFor(bytes, opts = {}) {
    const gain = opts.altGain ?? 0.12;
    const floor = opts.altFloor ?? 0.35;
    return floor + Math.log1p(Math.max(0, Number(bytes) || 0)) * gain;
}

/**
 * One satellite, fully determined.
 *
 * @param body      a body from buildOrrery: needs { name, radius }
 * @param importer  { path, bytes, sha } -- sha is the commit that LAST touched it
 */
export function satelliteFor(body, importer, opts = {}) {
    const path = String((importer && importer.path) || "");
    const sha = (importer && importer.sha) || null;
    const seed = satSeed(sha, path);
    const alt = altitudeFor(importer && importer.bytes, opts);
    // The orbit is measured from the body's CENTRE, so a satellite of a large planet is genuinely further out
    // than one of a small planet carrying the same file. radius is a radius; altitude is above the surface.
    const a = (Number(body && body.radius) || 0) + alt;
    return {
        kind: SATELLITE,
        path, sha, seed,
        sourced: satSourced(sha),
        bytes: Math.max(0, Number(importer && importer.bytes) || 0),
        alt, a,
        period: keplerPeriod(a),
        // [0, 2*PI) from the seed. The seed is already a well-mixed uint32, so this needs no second hash.
        phase: (seed / 4294967296) * 2 * Math.PI,
        body: (body && body.name) || null,
    };
}

/**
 * A body's whole fleet, in a fixed order so two runs and two machines produce the same list.
 *
 * *** SORTED BY PATH, NOT BY THE ORDER THE SCANNER HAPPENED TO WALK. *** A directory walk's order is a
 * property of the filesystem, and world/orrery.mjs sorts its bodies for the same reason: so a diff between
 * rounds is readable and a digest of the fleet means something.
 *
 * @param importers [{ path, bytes, sha }] -- the ejecta measurement for THIS body, with git and size attached
 */
export function fleetFor(body, importers = [], opts = {}) {
    return (importers || [])
        .filter((f) => f && f.path)
        .slice()
        .sort((x, y) => String(x.path).localeCompare(String(y.path)))
        .map((f) => satelliteFor(body, f, opts));
}

/**
 * A body's debris ring: the paperwork inside it.
 *
 * Seeded on the body's own commit and the file's path, because a licence file has no separate history worth
 * drawing -- it arrived with the body and has not moved since, which is the same measurement that killed the
 * commit belt above. Its altitude comes from its bytes, the same rule the satellites use.
 */
export function beltFor(body, opts = {}) {
    const files = (body && body.files) || [];
    return files
        .filter((f) => f && isPaperFile(f.path))
        .slice()
        .sort((x, y) => String(x.path).localeCompare(String(y.path)))
        .map((f) => {
            const seed = satSeed(body.sha, String(f.path));
            const alt = altitudeFor(f.bytes, opts) * (opts.beltScale ?? 0.5);
            const a = (Number(body.radius) || 0) + alt;
            return {
                kind: DEBRIS,
                path: String(f.path), sha: body.sha || null, seed,
                sourced: satSourced(body.sha),
                bytes: Math.max(0, Number(f.bytes) || 0),
                alt, a, period: keplerPeriod(a),
                phase: (seed / 4294967296) * 2 * Math.PI,
                body: body.name || null,
            };
        });
}

/**
 * Where a satellite is at time t, RELATIVE TO ITS BODY'S CENTRE.
 *
 * Relative, so a caller composes it with world/orreryView.mjs's positionAt for the body rather than this file
 * growing a second copy of the body's own orbit. Two modules computing the same position from the same inputs
 * is the drift world/orrery.mjs's kepler note is about.
 *
 * The angular rate is 2*PI / period and nothing else, for orreryView's stated reason: a satellite further out
 * is drawn slower because it IS slower.
 */
export function satelliteAt(sat, tDays = 0) {
    const a = Number(sat && sat.a) || 0;
    const period = Number(sat && sat.period) || 0;
    const t = Number.isFinite(tDays) ? tDays : 0;
    // A zero period cannot happen for a real satellite -- kepler's period is positive for every positive axis
    // -- so this holds it still rather than inventing a rate, exactly as positionAt does.
    const angle = (Number(sat && sat.phase) || 0) + (period > 0 ? (2 * Math.PI * t) / period : 0);
    return { x: a * Math.cos(angle), y: a * Math.sin(angle), angle, a };
}

/**
 * The whole system's fleets, keyed by body name.
 *
 * @param system   from buildOrrery
 * @param ejecta   { [bodyName]: [{ path, bytes, sha }] } -- the importers, with git and size attached
 */
export function fleetsFor(system, ejecta = {}, opts = {}) {
    const out = new Map();
    for (const b of ((system && system.bodies) || [])) {
        out.set(b.name, {
            satellites: fleetFor(b, ejecta[b.name] || [], opts),
            debris: beltFor(b, opts),
        });
    }
    return out;
}

/**
 * A body's fleet as one string, for comparing two runs.
 *
 * *** THIS IS WHAT MAKES "TWO RUNS MATCH UNLESS THE REPO CHANGED" A CHECK RATHER THAN A CLAIM. *** It samples
 * POSITIONS over a time sweep rather than hashing the descriptors: a bug that got the period wrong while
 * leaving every seed intact would leave a descriptor digest identical and the picture different. Numbers are
 * fixed to 6 places so the digest cannot depend on how a platform prints a float.
 */
export function fleetDigest(fleet, opts = {}) {
    const steps = opts.steps ?? 8;
    const span = opts.span ?? 100;
    const parts = [];
    for (const sat of ((fleet && fleet.satellites) || []).concat((fleet && fleet.debris) || [])) {
        parts.push(sat.kind + " " + sat.path + " " + sat.seed);
        for (let i = 0; i < steps; i++) {
            const p = satelliteAt(sat, (i * span) / steps);
            parts.push(p.x.toFixed(6) + "," + p.y.toFixed(6));
        }
    }
    return parts.join("\n");
}

/** Every fleet in a system as one string, in body order. */
export function systemDigest(fleets, opts = {}) {
    const names = [...fleets.keys()].sort();
    return names.map((n) => n + "\n" + fleetDigest(fleets.get(n), opts)).join("\n--\n");
}

/**
 * *** THE COMMIT BELT, MEASURED AND REFUSED. *** Recorded here rather than in prose alone so the gate can
 * check that the numbers a future round reads are the numbers this round measured, and so that a body which
 * suddenly starts being edited shows up as a change to this record instead of going unnoticed.
 */
export const COMMIT_BELT_V4328 = Object.freeze({
    at: "v4328",
    repoCommits: 858,
    perBody: Object.freeze({ three: 2, htmx: 2, box3d: 2, "three-webgpu": 1, wasm: 1, "taichi-js": 1, slug: 1,
                             krbn: 1, keyhunt: 1, jolt: 1, heerich: 1, grass: 1, gifenc: 1, fonts: 1, draco: 1 }),
    why: "twelve of fifteen vendored bodies have been touched by exactly one commit in the repository's life -- " +
         "the one that added them. A belt of one rock is not a belt, and drawing it would imply a busyness " +
         "that is not there. The importers move instead, and they are what the satellites are.",
});
